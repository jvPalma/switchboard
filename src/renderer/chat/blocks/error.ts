import type { ErrorBlock } from '../types';

export const renderError = (block: ErrorBlock): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'chat-block--error';

  if (block.details) el.classList.add('has-details');

  const header = document.createElement('div');
  header.className = 'chat-block__error-header';

  const icon = document.createElement('span');
  icon.className = 'chat-block__error-icon';
  icon.textContent = '\u2715';

  const message = document.createElement('span');
  message.className = 'chat-block__error-message';
  message.textContent = block.message;

  header.appendChild(icon);
  header.appendChild(message);
  el.appendChild(header);

  if (block.details) {
    const details = document.createElement('div');
    details.className = 'chat-block__error-details';

    const pre = document.createElement('pre');
    pre.textContent = block.details;
    details.appendChild(pre);

    header.addEventListener('click', () => {
      el.classList.toggle('chat-block--error-expanded');
    });

    el.appendChild(details);
  }

  return el;
};
