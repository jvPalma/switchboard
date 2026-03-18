import type { ToolUseBlockData } from '../types';
import { renderToolResult } from './tool-result';

const toolParamKeys: Record<string, { key: string; truncate?: number }> = {
  Read:      { key: 'file_path' },
  Write:     { key: 'file_path' },
  Edit:      { key: 'file_path' },
  Bash:      { key: 'command', truncate: 80 },
  Glob:      { key: 'pattern' },
  Grep:      { key: 'pattern' },
  WebSearch: { key: 'query' },
  Agent:     { key: 'prompt', truncate: 60 },
};

const filePathTools = new Set(['Read', 'Write', 'Edit']);

function getToolSummary(toolName: string, input: Record<string, unknown>): string {
  const meta = toolParamKeys[toolName];
  if (!meta) return '';

  const value = input[meta.key];
  let label = typeof value === 'string' ? value : '';
  if (meta.truncate && label.length > meta.truncate) {
    label = `${label.slice(0, meta.truncate)}\u2026`;
  }
  return label;
}

export function renderToolUse(block: ToolUseBlockData): HTMLElement {
  const el = document.createElement('div');

  // Collapsible header — CSS ::before provides the chevron
  const header = document.createElement('div');
  header.className = 'chat-block__tool-header chat-tool-header';
  header.setAttribute('tabindex', '0');
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', 'false');

  const nameSpan = document.createElement('span');
  nameSpan.className = 'chat-block__tool-name';
  nameSpan.textContent = block.toolName;
  header.appendChild(nameSpan);

  const filePath = filePathTools.has(block.toolName) && typeof block.input['file_path'] === 'string'
    ? (block.input['file_path'] as string)
    : null;

  if (filePath) {
    const pathSpan = document.createElement('span');
    pathSpan.className = 'chat-block__tool-summary file-link';
    pathSpan.setAttribute('data-file-path', filePath);
    pathSpan.textContent = filePath;
    header.appendChild(pathSpan);
  } else {
    const summary = getToolSummary(block.toolName, block.input);
    if (summary) {
      const summarySpan = document.createElement('span');
      summarySpan.className = 'chat-block__tool-summary';
      summarySpan.textContent = summary;
      header.appendChild(summarySpan);
    }
  }

  el.appendChild(header);

  // Collapsible body (hidden by default via CSS)
  const body = document.createElement('div');
  body.className = 'chat-tool-body';

  const inputPre = document.createElement('pre');
  inputPre.className = 'chat-block__tool-input';
  inputPre.textContent = JSON.stringify(block.input, null, 2);
  body.appendChild(inputPre);

  if (block.result) {
    body.appendChild(renderToolResult(block.result));
  }

  el.appendChild(body);

  // Toggle expand/collapse
  header.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.file-link')) return;
    const expanded = header.classList.contains('expanded');
    header.classList.toggle('expanded', !expanded);
    body.classList.toggle('visible', !expanded);
    header.setAttribute('aria-expanded', String(!expanded));
  });

  return el;
}
