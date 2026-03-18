import type { ToolUseBlockData } from '../types';

function summarizeToolAction(block: ToolUseBlockData): string {
  const input = block.input;
  switch (block.toolName) {
    case 'Bash':
    case 'bash':
      return `wants to run: \`${input.command ?? input.cmd ?? '(unknown)'}\``;
    case 'Edit':
    case 'edit':
      return `wants to edit: \`${input.file_path ?? input.filePath ?? '(unknown)'}\``;
    case 'Write':
    case 'write':
      return `wants to write: \`${input.file_path ?? input.filePath ?? '(unknown)'}\``;
    case 'Read':
    case 'read':
      return `wants to read: \`${input.file_path ?? input.filePath ?? '(unknown)'}\``;
    default:
      return `wants to use tool`;
  }
}

export function renderPermission(block: ToolUseBlockData): HTMLElement {
  const el = document.createElement('div');
  el.className = 'chat-block--permission';
  el.dataset.blockId = block.id;
  el.style.borderLeft = '3px solid #d4a017';
  el.style.background = 'rgba(212, 160, 23, 0.08)';
  el.style.padding = '10px 12px';
  el.style.borderRadius = '4px';

  const header = document.createElement('div');
  header.className = 'chat-block__permission-header';
  header.style.fontWeight = 'bold';
  header.style.marginBottom = '8px';

  const toolName = document.createElement('code');
  toolName.textContent = block.toolName;

  header.appendChild(toolName);
  header.appendChild(document.createTextNode(' ' + summarizeToolAction(block)));

  el.appendChild(header);

  const hasResult = block.result != null;

  if (hasResult) {
    const status = document.createElement('div');
    status.className = 'chat-block__permission-status';
    const accepted = !block.result!.isError;
    status.textContent = accepted ? '\u2705 Accepted' : '\u274C Rejected';
    status.style.color = accepted ? '#4caf50' : '#e05070';
    status.style.fontWeight = 'bold';
    el.appendChild(status);
  } else {
    const actions = document.createElement('div');
    actions.className = 'chat-block__permission-actions';
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.marginTop = '4px';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'chat-block__permission-accept';
    acceptBtn.textContent = 'Accept';
    acceptBtn.style.background = '#2e7d32';
    acceptBtn.style.color = '#fff';
    acceptBtn.style.border = 'none';
    acceptBtn.style.padding = '4px 14px';
    acceptBtn.style.borderRadius = '4px';
    acceptBtn.style.cursor = 'pointer';

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'chat-block__permission-reject';
    rejectBtn.textContent = 'Reject';
    rejectBtn.style.background = '#c62828';
    rejectBtn.style.color = '#fff';
    rejectBtn.style.border = 'none';
    rejectBtn.style.padding = '4px 14px';
    rejectBtn.style.borderRadius = '4px';
    rejectBtn.style.cursor = 'pointer';

    const handleClick = (action: 'accept' | 'reject') => {
      el.dispatchEvent(new CustomEvent('permission-response', {
        bubbles: true,
        detail: { toolUseId: block.toolUseId, action },
      }));
      actions.remove();
      const status = document.createElement('div');
      status.className = 'chat-block__permission-status';
      status.textContent = action === 'accept' ? '\u2705 Accepted' : '\u274C Rejected';
      status.style.color = action === 'accept' ? '#4caf50' : '#e05070';
      status.style.fontWeight = 'bold';
      el.appendChild(status);
    };

    acceptBtn.addEventListener('click', () => handleClick('accept'));
    rejectBtn.addEventListener('click', () => handleClick('reject'));

    actions.appendChild(acceptBtn);
    actions.appendChild(rejectBtn);
    el.appendChild(actions);
  }

  return el;
}
