// Chat view — renders parsed .jsonl session data as a readable chat conversation.
// Toggles with the terminal view in the terminal area.
//
// ── Manual cross-mode testing notes ──────────────────────────────────
// The chat view runs in both Electron (IPC) and web (fetch/WS) modes.
// Verify the following manually in each mode:
//   - readSessionJsonl loads entries (preload.ts vs web-shim.ts)
//   - tail-session-jsonl pushes new lines in real time via WS or IPC
//   - stop-tail-session-jsonl stops the tail watcher
//   - Block rendering: all block types render correctly (tool-use, thinking, etc.)
//   - Keyboard navigation: Tab/Enter/Escape work on collapsible headers
//   - Chat ↔ Terminal toggle works and re-shows the correct view
//   - Auto-scroll sticks to bottom during tailing, unsticks on manual scroll
// The API shim (web-shim.ts) mirrors the Electron preload API surface,
// so if it works in one mode it should work in the other — but always
// spot-check after IPC channel changes.

import type { SwitchboardApi } from '../api/types';
import type { ChatBlock } from '../chat/types';
import type { JsonlEntry } from '@shared/types';
import { renderBlock as importedRenderBlock, renderBlocks as importedRenderBlocks, groupBlocksIntoTurns, renderTurn, renderCostFooter } from '../chat/renderer';
import { parseSession as importedParseSession } from '../chat/parser';
import { activeSessionId, activePtyIds, openSessions } from '../state';
import { initChatKeyboard } from '../chat/keyboard';
import { attachFileLinkHandler } from '../chat/file-link-handler';
import {
  createStickyPrompt,
  updatePromptState,
  bindScrollContainer,
  notifyNewBlocks,
  focusPrompt,
} from '../chat/sticky-prompt';
import { startTailing, stopTailing, appendBlocks, initAutoScroll } from '../chat/tail';

// ── Cross-view callbacks ──────────────────────────────────────────────

export interface ChatCallbacks {
  refreshSidebar: (opts?: { resort?: boolean }) => void;
}

let callbacks: ChatCallbacks;

// ── State ─────────────────────────────────────────────────────────────

let chatViewEl: HTMLElement | null = null;
let chatActive = false;
let currentChatSessionId: string | null = null;
let toggleEl: HTMLElement | null = null;
let stickyPromptEl: HTMLElement | null = null;

const api = (): SwitchboardApi => window.api;

// ── Toggle element ────────────────────────────────────────────────────

const createToggle = (): HTMLElement => {
  const wrap = document.createElement('div');
  wrap.className = 'chat-toggle';

  const termBtn = document.createElement('button');
  termBtn.className = 'chat-toggle-btn active';
  termBtn.textContent = 'Terminal';
  termBtn.dataset['view'] = 'terminal';

  const chatBtn = document.createElement('button');
  chatBtn.className = 'chat-toggle-btn';
  chatBtn.textContent = 'Chat';
  chatBtn.dataset['view'] = 'chat';

  wrap.appendChild(termBtn);
  wrap.appendChild(chatBtn);

  wrap.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.chat-toggle-btn') as HTMLElement | null;
    if (!btn) return;
    const view = btn.dataset['view'];
    if (view === 'chat' && !chatActive) {
      activateChat();
    } else if (view === 'terminal' && chatActive) {
      activateTerminal();
    }
  });

  return wrap;
};

const updateToggleState = (): void => {
  if (!toggleEl) return;
  const buttons = toggleEl.querySelectorAll('.chat-toggle-btn');
  buttons.forEach((btn) => {
    const el = btn as HTMLElement;
    el.classList.toggle('active', el.dataset['view'] === (chatActive ? 'chat' : 'terminal'));
  });
};

// ── Chat container ────────────────────────────────────────────────────

const ensureChatView = (): HTMLElement => {
  if (chatViewEl) return chatViewEl;
  chatViewEl = document.createElement('div');
  chatViewEl.id = 'chat-view';
  const terminalsEl = document.getElementById('terminals')!;
  terminalsEl.parentElement!.appendChild(chatViewEl);
  initChatKeyboard(chatViewEl);
  attachFileLinkHandler(chatViewEl);
  stickyPromptEl = createStickyPrompt();
  chatViewEl.appendChild(stickyPromptEl);
  return chatViewEl;
};

const reattachPrompt = (): void => {
  if (stickyPromptEl && chatViewEl) {
    chatViewEl.appendChild(stickyPromptEl);
  }
};

const syncPromptState = (): void => {
  const sessionId = chatActive ? activeSessionId : null;
  const isRunning = sessionId ? activePtyIds.has(sessionId) : false;
  updatePromptState(sessionId, isRunning);
};

const getBlockRenderer = (): ((block: ChatBlock) => HTMLElement) => {
  return renderBlockFn;
};

// ── Activate / deactivate ─────────────────────────────────────────────

const activateChat = (): void => {
  chatActive = true;
  updateToggleState();

  // Hide terminal containers
  document.querySelectorAll('.terminal-container').forEach((el) => el.classList.remove('visible'));

  const view = ensureChatView();
  view.classList.add('visible');

  if (activeSessionId && currentChatSessionId !== activeSessionId) {
    loadAndRenderChat(activeSessionId);
  } else {
    syncPromptState();
  }
};

const activateTerminal = (): void => {
  chatActive = false;
  updateToggleState();
  stopTailing();

  const view = ensureChatView();
  view.classList.remove('visible');

  // Re-show active terminal container
  if (activeSessionId && openSessions.has(activeSessionId)) {
    const entry = openSessions.get(activeSessionId)!;
    entry.element.classList.add('visible');
    requestAnimationFrame(() => {
      entry.fitAddon.fit();
      entry.terminal.focus();
    });
  }
};

// ── Load and render ───────────────────────────────────────────────────

const loadAndRenderChat = async (sessionId: string): Promise<void> => {
  currentChatSessionId = sessionId;
  stopTailing();
  const view = ensureChatView();

  // Show loading (reattach prompt after clearing)
  view.innerHTML = '<div class="chat-loading"><div class="chat-loading-spinner"></div>Loading conversation...</div>';
  reattachPrompt();
  syncPromptState();

  try {
    const result = await api().readSessionJsonl(sessionId);

    // Session may have changed while loading
    if (currentChatSessionId !== sessionId) return;

    if (result.error || !result.entries) {
      view.innerHTML = `<div class="chat-error">${escapeHtml(result.error || 'No entries found')}</div>`;
      reattachPrompt();
      return;
    }

    const blocks = parseEntries(result.entries);

    if (blocks.length === 0) {
      view.innerHTML = '<div class="chat-empty">Empty session</div>';
      reattachPrompt();
      syncPromptState();
      return;
    }

    renderChatBlocks(view, blocks);

    // Start tailing for live updates on running sessions
    if (activePtyIds.has(sessionId)) {
      startTailing(sessionId, (newBlocks) => {
        if (currentChatSessionId !== sessionId) return;
        const messages = view.querySelector('.chat-messages');
        if (!messages) return;
        appendBlocks(messages as HTMLElement, newBlocks, getBlockRenderer());
        notifyNewBlocks();
      });
    }
  } catch (err) {
    if (currentChatSessionId !== sessionId) return;
    view.innerHTML = `<div class="chat-error">Failed to load conversation: ${escapeHtml(String(err))}</div>`;
    reattachPrompt();
  }
};

// ── Parser: JsonlEntry[] -> ChatBlock[] ───────────────────────────────
// Tries to import the parser module; falls back to a minimal inline parser.

const parseEntries = (entries: JsonlEntry[]): ChatBlock[] => {
  return importedParseSession(entries);
};

const fallbackParse = (entries: JsonlEntry[]): ChatBlock[] => {
  const blocks: ChatBlock[] = [];
  let blockId = 0;
  for (const entry of entries) {
    const id = String(blockId++);
    if (entry.type === 'user') {
      const e = entry as JsonlEntry & { message?: { content?: unknown }; content?: unknown };
      const content = e.message?.content ?? e.content;
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? (content as Array<{ type: string; text?: string }>).filter(b => b.type === 'text').map(b => b.text || '').join('\n')
          : '';
      blocks.push({ type: 'user-message', id, text, images: [] });
    } else if (entry.type === 'assistant') {
      const e = entry as JsonlEntry & { message?: { content?: unknown }; costUSD?: number };
      const content = e.message?.content;
      const parts = Array.isArray(content) ? content as Array<{ type: string; text?: string }> : [];
      const text = parts.filter(b => b.type === 'text').map(b => b.text || '').join('\n');
      blocks.push({ type: 'assistant-text', id, text, costUSD: e.costUSD });
    }
  }
  return blocks;
};

// ── Renderer: ChatBlock[] -> DOM ──────────────────────────────────────
// Tries to import block renderers; falls back to inline rendering.

const renderBlockFn = importedRenderBlock;

// ── Turn grouping ────────────────────────────────────────────────────

interface ChatTurnGroup {
  kind: 'system' | 'user';
  blocks: ChatBlock[];
}

const groupIntoTurns = (blocks: ChatBlock[]): { turns: ChatTurnGroup[]; costSummary: ChatBlock | null } => {
  const turns: ChatTurnGroup[] = [];
  let costSummary: ChatBlock | null = null;
  let current: ChatTurnGroup | null = null;

  for (const block of blocks) {
    if (block.type === 'cost-summary') { costSummary = block; continue; }
    if (block.type === 'tool-result') continue;

    if (block.type === 'user-message') {
      current = { kind: 'user', blocks: [block] };
      turns.push(current);
    } else if (current) {
      current.blocks.push(block);
    } else {
      const last = turns[turns.length - 1];
      if (last?.kind === 'system') {
        last.blocks.push(block);
      } else {
        turns.push({ kind: 'system', blocks: [block] });
      }
    }
  }

  return { turns, costSummary };
};

// ── Render blocks into DOM ───────────────────────────────────────────

const renderChatBlocks = (container: HTMLElement, blocks: ChatBlock[]): void => {
  const scroll = document.createElement('div');
  scroll.className = 'chat-scroll';

  const messages = document.createElement('div');
  messages.className = 'chat-messages';

  const { turns, costSummary } = groupBlocksIntoTurns(blocks);

  for (const turn of turns) {
    const el = renderTurn(turn);
    if (el) messages.appendChild(el);
  }

  if (costSummary) {
    messages.appendChild(renderCostFooter(costSummary));
  }

  scroll.appendChild(messages);
  container.innerHTML = '';
  container.appendChild(scroll);
  reattachPrompt();
  syncPromptState();

  initAutoScroll(scroll);
  bindScrollContainer(scroll);

  requestAnimationFrame(() => {
    scroll.scrollTop = scroll.scrollHeight;
  });
};

const fallbackRenderBlock = (block: ChatBlock): HTMLElement => {
  const div = document.createElement('div');
  div.className = `chat-block-${block.type}`;

  switch (block.type) {
    case 'user-message': {
      const label = document.createElement('div');
      label.className = 'chat-role-label';
      label.textContent = 'You';
      div.appendChild(label);
      const text = document.createElement('div');
      text.className = 'chat-text';
      text.textContent = block.text;
      div.appendChild(text);
      break;
    }
    case 'assistant-text': {
      const text = document.createElement('div');
      text.className = 'chat-text';
      text.textContent = block.text;
      div.appendChild(text);
      break;
    }
    case 'tool-use': {
      const header = document.createElement('div');
      header.className = 'chat-tool-header';
      header.setAttribute('tabindex', '0');
      header.textContent = block.toolName;
      const body = document.createElement('div');
      body.className = 'chat-tool-body';
      body.textContent = JSON.stringify(block.input, null, 2);
      header.addEventListener('click', () => {
        header.classList.toggle('expanded');
        body.classList.toggle('visible');
      });
      div.appendChild(header);
      div.appendChild(body);
      break;
    }
    case 'tool-result': {
      const header = document.createElement('div');
      header.className = 'chat-tool-header';
      header.setAttribute('tabindex', '0');
      header.textContent = `Result: ${block.toolName}${block.isError ? ' (error)' : ''}`;
      if (block.isError) div.classList.add('is-error');
      const body = document.createElement('div');
      body.className = 'chat-tool-body';
      body.textContent = block.content;
      header.addEventListener('click', () => {
        header.classList.toggle('expanded');
        body.classList.toggle('visible');
      });
      div.appendChild(header);
      div.appendChild(body);
      break;
    }
    case 'thinking': {
      const header = document.createElement('div');
      header.className = 'chat-tool-header';
      header.setAttribute('tabindex', '0');
      header.textContent = 'Thinking...';
      const body = document.createElement('div');
      body.className = 'chat-tool-body';
      body.textContent = block.text;
      header.addEventListener('click', () => {
        header.classList.toggle('expanded');
        body.classList.toggle('visible');
      });
      div.appendChild(header);
      div.appendChild(body);
      break;
    }
    case 'error': {
      div.textContent = block.message;
      break;
    }
    case 'image': {
      const img = document.createElement('img');
      img.src = `data:${block.mediaType};base64,${block.base64}`;
      div.appendChild(img);
      break;
    }
    case 'system': {
      div.textContent = block.text;
      break;
    }
    case 'cost-summary': {
      div.innerHTML = [
        `<span>Cost: $${block.totalCostUSD.toFixed(4)}</span>`,
        `<span>In: ${(block.totalInputTokens / 1000).toFixed(1)}k</span>`,
        `<span>Out: ${(block.totalOutputTokens / 1000).toFixed(1)}k</span>`,
        `<span>Messages: ${block.messageCount}</span>`,
      ].join('');
      break;
    }
  }
  return div;
};

// ── Utility ───────────────────────────────────────────────────────────

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Public API ────────────────────────────────────────────────────────

export const initChat = (cb: ChatCallbacks): void => {
  callbacks = cb;
};

/**
 * Show the chat view for a session. Called when user clicks "Chat" toggle
 * or when opening a completed session.
 */
export const showChatView = (sessionId: string): void => {
  chatActive = true;
  updateToggleState();

  // Hide terminal containers
  document.querySelectorAll('.terminal-container').forEach((el) => el.classList.remove('visible'));

  const view = ensureChatView();
  view.classList.add('visible');

  loadAndRenderChat(sessionId);
};

export const hideChatView = (): void => {
  chatActive = false;
  currentChatSessionId = null;
  stopTailing();
  updateToggleState();
  syncPromptState();
  if (chatViewEl) chatViewEl.classList.remove('visible');
};

/** Update the prompt placeholder/disabled state (call when PTY state changes). */
export const updateChatPromptState = (): void => {
  if (chatActive) syncPromptState();
};

export { focusPrompt } from '../chat/sticky-prompt';

export const isChatViewActive = (): boolean => chatActive;

/**
 * Returns the toggle element to insert into the terminal header.
 * Call once during init.
 */
export const getChatToggle = (): HTMLElement => {
  if (!toggleEl) toggleEl = createToggle();
  return toggleEl;
};

/**
 * Choose default view based on session state:
 * - Running PTY -> terminal
 * - Completed (no active PTY) -> chat
 */
export const shouldDefaultToChat = (sessionId: string): boolean => {
  return !activePtyIds.has(sessionId);
};
