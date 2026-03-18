import type { ThinkingBlockData } from '../types';

export const renderThinking = (block: ThinkingBlockData): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'chat-block--thinking';

  const header = document.createElement('div');
  header.className = 'chat-block__thinking-header';
  header.setAttribute('tabindex', '0');

  const chevron = document.createElement('span');
  chevron.className = 'chat-block__thinking-chevron';
  chevron.textContent = '\u25B6';

  const label = document.createElement('span');
  label.className = 'chat-block__thinking-label';
  label.textContent = 'Thinking\u2026';

  header.appendChild(chevron);
  header.appendChild(label);

  if (block.durationMs != null) {
    const duration = document.createElement('span');
    duration.className = 'chat-block__thinking-duration';
    duration.textContent = formatDuration(block.durationMs);
    header.appendChild(duration);
  }

  const body = document.createElement('div');
  body.className = 'chat-block__thinking-content';

  const pre = document.createElement('pre');
  pre.className = 'chat-block__thinking-text';
  pre.textContent = block.text;
  body.appendChild(pre);

  header.addEventListener('click', () => {
    const expanded = el.classList.toggle('chat-block--thinking-expanded');
    header.classList.toggle('expanded', expanded);
    chevron.textContent = expanded ? '\u25BC' : '\u25B6';
  });

  el.appendChild(header);
  el.appendChild(body);
  return el;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};
