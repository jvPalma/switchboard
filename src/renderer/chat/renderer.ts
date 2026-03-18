import type { ChatBlock, CostSummaryBlock } from './types';
import { renderUserMessage } from './blocks/user-message';
import { renderAssistantMessage } from './blocks/assistant-message';
import { renderToolUse } from './blocks/tool-use';
import { renderThinking } from './blocks/thinking';
import { renderError } from './blocks/error';

// ── Turn grouping ────────────────────────────────────────────────────

export interface ChatTurn {
  kind: 'system' | 'user';
  blocks: ChatBlock[];
}

/**
 * Group flat blocks into conversation turns, extracting cost summary.
 * A turn starts with a UserMessageBlock and continues until the next one.
 * Blocks before the first user message go into a system turn.
 * Tool-result blocks are skipped (rendered inside tool-use via block.result).
 */
export const groupBlocksIntoTurns = (
  blocks: ChatBlock[],
): { turns: ChatTurn[]; costSummary: CostSummaryBlock | null } => {
  const turns: ChatTurn[] = [];
  let costSummary: CostSummaryBlock | null = null;
  let current: ChatTurn | null = null;

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

// ── Block rendering ──────────────────────────────────────────────────

/** Render a single block to an HTMLElement (dispatches to per-type renderer). */
export const renderBlock = (block: ChatBlock): HTMLElement => {
  switch (block.type) {
    case 'user-message':
      return renderUserMessage(block);
    case 'assistant-text':
      return renderAssistantMessage(block);
    case 'tool-use':
      return renderToolUse(block);
    case 'thinking':
      return renderThinking(block);
    case 'error':
      return renderError(block);
    default: {
      const el = document.createElement('div');
      el.className = `chat-block chat-block--${block.type}`;
      el.setAttribute('data-block-id', block.id);
      el.textContent = `[${block.type}]`;
      return el;
    }
  }
};

/** Render cost summary as a footer bar. */
export const renderCostFooter = (block: CostSummaryBlock): HTMLElement => {
  const footer = document.createElement('div');
  footer.className = 'chat-cost-footer';
  footer.setAttribute('data-block-id', block.id);
  footer.innerHTML = [
    `<span>Cost: $${block.totalCostUSD.toFixed(4)}</span>`,
    `<span>In: ${(block.totalInputTokens / 1000).toFixed(1)}k</span>`,
    `<span>Out: ${(block.totalOutputTokens / 1000).toFixed(1)}k</span>`,
    `<span>Messages: ${block.messageCount}</span>`,
  ].join('');
  return footer;
};

/** Check if a turn has any visible content worth rendering. */
const isTurnVisible = (turn: ChatTurn): boolean => {
  for (const block of turn.blocks) {
    if (block.type === 'user-message' && block.text.trim()) return true;
    if (block.type === 'assistant-text') return true;
    if (block.type === 'tool-use') return true;
    if (block.type === 'error') return true;
    if (block.type === 'image') return true;
  }
  return false;
};

/** Render a conversation turn into a .chat-turn wrapper. */
export const renderTurn = (turn: ChatTurn): HTMLElement | null => {
  if (!isTurnVisible(turn)) return null;

  const div = document.createElement('div');
  div.className = `chat-turn chat-turn--${turn.kind}`;
  for (const block of turn.blocks) {
    // Skip user messages with empty text (just tool results, no prompt)
    if (block.type === 'user-message' && !block.text.trim()) continue;
    div.appendChild(renderBlock(block));
  }
  return div;
};

/** Render all blocks into a container with turn grouping, using morphdom. */
export const renderBlocks = (container: HTMLElement, blocks: ChatBlock[]): void => {
  const { turns, costSummary } = groupBlocksIntoTurns(blocks);

  const newTree = document.createElement(container.tagName);
  newTree.className = container.className;

  for (const turn of turns) {
    const el = renderTurn(turn);
    if (el) newTree.appendChild(el);
  }

  if (costSummary) {
    newTree.appendChild(renderCostFooter(costSummary));
  }

  window.morphdom(container, newTree, {
    childrenOnly: true,
    getNodeKey(node) {
      return (node as HTMLElement).getAttribute?.('data-block-id') ?? undefined;
    },
  });
};
