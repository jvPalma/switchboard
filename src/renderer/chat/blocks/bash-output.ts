import type { ToolResultBlockData } from '../types';

const TRUNCATE_THRESHOLD = 10000;

export function renderBashOutput(block: ToolResultBlockData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'chat-block--bash-output';

  // Command header (from paired tool-use input)
  const command = (block as ToolResultBlockData & { command?: string }).command
    ?? extractCommand(block);
  if (command) {
    const header = document.createElement('div');
    header.className = 'chat-block__bash-header';
    header.style.padding = '6px 12px';
    header.style.backgroundColor = '#1a1a2e';
    header.style.borderRadius = '4px 4px 0 0';
    header.style.fontFamily = 'monospace';
    header.style.fontSize = '12px';
    header.style.color = '#a0a0e0';
    header.style.borderBottom = '1px solid #2a2a3e';
    header.textContent = `$ ${command}`;
    container.appendChild(header);
  }

  // Output body
  const pre = document.createElement('pre');
  pre.className = 'chat-block__bash-body';
  pre.style.margin = '0';
  pre.style.padding = '8px 12px';
  pre.style.backgroundColor = '#1a1a2e';
  pre.style.borderRadius = command ? '0 0 4px 4px' : '4px';
  pre.style.fontFamily = 'monospace';
  pre.style.fontSize = '13px';
  pre.style.lineHeight = '1.5';
  pre.style.maxHeight = '400px';
  pre.style.overflowY = 'auto';
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-word';

  const truncated = block.content.length > TRUNCATE_THRESHOLD;
  const visibleContent = truncated
    ? block.content.slice(0, TRUNCATE_THRESHOLD)
    : block.content;

  applyAnsiContent(pre, visibleContent);
  container.appendChild(pre);

  if (truncated) {
    const toggle = document.createElement('button');
    toggle.className = 'chat-block__show-more';
    toggle.textContent = 'Show full output';
    toggle.style.background = 'none';
    toggle.style.border = '1px solid #333';
    toggle.style.borderRadius = '4px';
    toggle.style.color = '#8888cc';
    toggle.style.cursor = 'pointer';
    toggle.style.padding = '4px 8px';
    toggle.style.marginTop = '4px';
    toggle.style.fontSize = '12px';

    let expanded = false;
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      pre.innerHTML = '';
      applyAnsiContent(pre, expanded ? block.content : visibleContent);
      toggle.textContent = expanded ? 'Show less' : 'Show full output';
    });
    container.appendChild(toggle);
  }

  return container;
}

/** Try to extract command from content first line if it looks like a prompt. */
function extractCommand(block: ToolResultBlockData): string | undefined {
  // The command typically comes from the paired ToolUseBlockData.input.command,
  // but since we only have the result here, return undefined to let caller handle it.
  void block;
  return undefined;
}

const ANSI_REGEX = /\x1b\[([0-9;]*)m/g;

const COLOR_MAP: Record<string, string> = {
  '30': '#555',
  '31': '#f87171',
  '32': '#6ee76e',
  '33': '#e8e86e',
  '34': '#7171f8',
  '35': '#e871e8',
  '36': '#71e8e8',
  '37': '#e0e0e0',
  '90': '#888',
  '91': '#ff9b9b',
  '92': '#9bff9b',
  '93': '#ffff9b',
  '94': '#9b9bff',
  '95': '#ff9bff',
  '96': '#9bffff',
  '97': '#fff',
};

/** Parse ANSI escape codes and append colored spans to the parent element. */
function applyAnsiContent(parent: HTMLElement, text: string): void {
  let currentColor: string | null = null;
  let bold = false;
  let lastIndex = 0;

  // Strip non-SGR escape sequences first
  const cleaned = text.replace(/\x1b\[[^m]*[A-Za-ln-z]/g, '');

  ANSI_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ANSI_REGEX.exec(cleaned)) !== null) {
    // Flush text before this escape
    if (match.index > lastIndex) {
      appendSpan(parent, cleaned.slice(lastIndex, match.index), currentColor, bold);
    }

    const codes = (match[1] ?? '').split(';').filter(Boolean);
    for (const code of codes) {
      if (code === '0') {
        currentColor = null;
        bold = false;
      } else if (code === '1') {
        bold = true;
      } else if (COLOR_MAP[code]) {
        currentColor = COLOR_MAP[code];
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Flush remaining text
  if (lastIndex < cleaned.length) {
    appendSpan(parent, cleaned.slice(lastIndex), currentColor, bold);
  }
}

function appendSpan(
  parent: HTMLElement,
  text: string,
  color: string | null,
  bold: boolean,
): void {
  if (!text) return;

  if (!color && !bold) {
    parent.appendChild(document.createTextNode(text));
    return;
  }

  const span = document.createElement('span');
  if (color) span.style.color = color;
  if (bold) span.style.fontWeight = 'bold';
  span.textContent = text;
  parent.appendChild(span);
}
