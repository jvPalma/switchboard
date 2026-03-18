import type { ChatBlock, ToolUseBlockData, ImageData } from './types';

// ── State ─────────────────────────────────────────────────────────────

let currentSessionId: string | null = null;
let currentCallback: ((blocks: ChatBlock[]) => void) | null = null;
let listenerRegistered = false;

// ── Auto-scroll state ─────────────────────────────────────────────────

let scrollContainer: HTMLElement | null = null;
let atBottom = true;
const SCROLL_THRESHOLD = 50;

// ── Spinner state ─────────────────────────────────────────────────────

let pendingToolUseId: string | null = null;
const SPINNER_CLASS = 'chat-spinner';

// ── Helpers ───────────────────────────────────────────────────────────

let idSeq = 0;
const genId = (): string => `tail-${++idSeq}`;

// ── Line parsing ──────────────────────────────────────────────────────

const parseLineToBlocks = (line: string): ChatBlock[] => {
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [];
  }

  const blocks: ChatBlock[] = [];
  const entryType = entry.type as string | undefined;
  const uuid = (entry.uuid as string) || genId();

  if (entryType === 'user' || (entryType === 'message' && entry.role === 'user')) {
    parseUserEntry(entry, uuid, blocks);
  } else if (entryType === 'assistant' || (entryType === 'message' && entry.role === 'assistant')) {
    parseAssistantEntry(entry, uuid, blocks);
  } else if (entryType === 'result') {
    parseResultEntry(entry, uuid, blocks);
  } else if (entryType === 'system') {
    const text = (entry.content as string) || '';
    if (text) {
      blocks.push({ type: 'system', id: uuid, text, subtype: entry.subtype as string | undefined });
    }
  }

  return blocks;
};

const parseUserEntry = (entry: Record<string, unknown>, uuid: string, blocks: ChatBlock[]): void => {
  const msg = entry.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  let text = '';
  const images: ImageData[] = [];

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    for (const b of content as Array<Record<string, unknown>>) {
      if (b.type === 'text') text += (b.text as string) || '';
      if (b.type === 'image') {
        const src = b.source as { media_type: string; data: string } | undefined;
        if (src) images.push({ mediaType: src.media_type, base64: src.data });
      }
    }
  }

  blocks.push({
    type: 'user-message',
    id: uuid,
    text,
    images,
    timestamp: entry.timestamp as string | undefined,
  });
};

const parseAssistantEntry = (entry: Record<string, unknown>, uuid: string, blocks: ChatBlock[]): void => {
  const msg = entry.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  const costUSD = entry.costUSD as number | undefined;
  const durationMs = entry.durationMs as number | undefined;

  if (typeof content === 'string') {
    if (content) blocks.push({ type: 'assistant-text', id: uuid, text: content, costUSD, durationMs });
    return;
  }

  if (!Array.isArray(content)) return;

  let idx = 0;
  for (const b of content as Array<Record<string, unknown>>) {
    const bid = `${uuid}-${idx++}`;
    if (b.type === 'text') {
      blocks.push({ type: 'assistant-text', id: bid, text: (b.text as string) || '', costUSD, durationMs });
    } else if (b.type === 'tool_use') {
      blocks.push({
        type: 'tool-use',
        id: bid,
        toolUseId: (b.id as string) || '',
        toolName: (b.name as string) || '',
        input: (b.input as Record<string, unknown>) || {},
      });
    } else if (b.type === 'thinking') {
      blocks.push({ type: 'thinking', id: bid, text: (b.thinking as string) || '' });
    } else if (b.type === 'image') {
      const src = b.source as { media_type: string; data: string } | undefined;
      if (src) blocks.push({ type: 'image', id: bid, mediaType: src.media_type, base64: src.data });
    }
  }
};

const parseResultEntry = (entry: Record<string, unknown>, uuid: string, blocks: ChatBlock[]): void => {
  const msg = entry.message as Record<string, unknown> | undefined;
  const content = msg?.content;
  if (!Array.isArray(content)) return;

  let idx = 0;
  for (const b of content as Array<Record<string, unknown>>) {
    if (b.type === 'tool_result') {
      const raw = b.content;
      const text = typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? (raw as Array<Record<string, unknown>>).map(c => (c.text as string) || '').join('\n')
          : (b.output as string) || '';
      blocks.push({
        type: 'tool-result',
        id: `${uuid}-${idx++}`,
        toolUseId: (b.tool_use_id as string) || '',
        toolName: '',
        content: text,
        isError: !!b.is_error,
      });
    }
  }
};

// ── Tailing API (11.1) ───────────────────────────────────────────────

export const startTailing = (sessionId: string, onNewBlocks: (blocks: ChatBlock[]) => void): void => {
  stopTailing();
  currentSessionId = sessionId;
  currentCallback = onNewBlocks;

  if (!listenerRegistered) {
    window.api.onTailSessionJsonl((sid: string, newLines: string[]) => {
      if (sid !== currentSessionId || !currentCallback) return;
      const blocks: ChatBlock[] = [];
      for (const line of newLines) {
        blocks.push(...parseLineToBlocks(line));
      }
      if (blocks.length > 0) {
        currentCallback(blocks);
      }
    });
    listenerRegistered = true;
  }

  window.api.tailSessionJsonl(sessionId);
};

export const stopTailing = (sessionId?: string): void => {
  if (sessionId && currentSessionId !== sessionId) return;
  if (currentSessionId) {
    window.api.stopTailSessionJsonl(currentSessionId);
  }
  currentSessionId = null;
  currentCallback = null;
  pendingToolUseId = null;
};

export const isTailing = (sessionId: string): boolean => currentSessionId === sessionId;

// ── Delta append (11.3) ──────────────────────────────────────────────

export const appendBlocks = (
  container: HTMLElement,
  newBlocks: ChatBlock[],
  renderBlock: (block: ChatBlock) => HTMLElement,
): void => {
  removeSpinnerIfResolved(container, newBlocks);

  for (const block of newBlocks) {
    if (block.type === 'tool-result') continue;

    if (block.type === 'cost-summary') {
      container.querySelector('.chat-cost-footer')?.remove();
      const footer = document.createElement('div');
      footer.className = 'chat-cost-footer';
      footer.setAttribute('data-block-id', block.id);
      footer.innerHTML = [
        `<span>Cost: $${block.totalCostUSD.toFixed(4)}</span>`,
        `<span>In: ${(block.totalInputTokens / 1000).toFixed(1)}k</span>`,
        `<span>Out: ${(block.totalOutputTokens / 1000).toFixed(1)}k</span>`,
        `<span>Messages: ${block.messageCount}</span>`,
      ].join('');
      container.appendChild(footer);
      continue;
    }

    if (block.type === 'user-message') {
      const turn = document.createElement('div');
      turn.className = 'chat-turn chat-turn--user';
      turn.appendChild(renderBlock(block));
      container.appendChild(turn);
    } else {
      const lastTurn = getLastTurn(container);
      lastTurn.appendChild(renderBlock(block));
    }
  }

  addSpinnerIfNeeded(container, newBlocks);
  scrollToBottomIfNeeded();
};

// ── Auto-scroll (11.4) ──────────────────────────────────────────────

export const initAutoScroll = (container: HTMLElement): void => {
  scrollContainer = container;
  atBottom = true;
  container.addEventListener('scroll', () => {
    atBottom =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - SCROLL_THRESHOLD;
  });
};

const scrollToBottomIfNeeded = (): void => {
  if (atBottom && scrollContainer) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }
};

// ── Spinner (11.5, 11.6) ────────────────────────────────────────────

const removeSpinnerIfResolved = (container: HTMLElement, newBlocks: ChatBlock[]): void => {
  if (!pendingToolUseId) return;
  for (const block of newBlocks) {
    if (block.type === 'tool-result' && block.toolUseId === pendingToolUseId) {
      container.querySelector(`.${SPINNER_CLASS}`)?.remove();
      pendingToolUseId = null;
      break;
    }
  }
};

const addSpinnerIfNeeded = (container: HTMLElement, newBlocks: ChatBlock[]): void => {
  const last = newBlocks[newBlocks.length - 1];
  if (!last || last.type !== 'tool-use') return;

  const toolUse = last as ToolUseBlockData;
  const hasResult = newBlocks.some(
    b => b.type === 'tool-result' && b.toolUseId === toolUse.toolUseId,
  );
  if (hasResult) return;

  container.querySelector(`.${SPINNER_CLASS}`)?.remove();
  pendingToolUseId = toolUse.toolUseId;

  const spinner = document.createElement('div');
  spinner.className = SPINNER_CLASS;
  spinner.textContent = `\u23F3 Running ${toolUse.toolName}...`;
  getLastTurn(container).appendChild(spinner);
};

const getLastTurn = (container: HTMLElement): HTMLElement => {
  const turns = container.querySelectorAll(':scope > .chat-turn');
  if (turns.length > 0) return turns[turns.length - 1] as HTMLElement;
  const turn = document.createElement('div');
  turn.className = 'chat-turn chat-turn--system';
  container.appendChild(turn);
  return turn;
};
