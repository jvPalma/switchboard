import type { UserMessageBlock } from '../types';
import { openImageViewer } from '../../components/image-viewer';

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function renderUserMessage(block: UserMessageBlock): HTMLElement {
  const el = document.createElement('div');
  el.className = 'chat-block chat-block--user-message';
  el.dataset.blockId = block.id;

  // Header: role label + optional timestamp
  const header = document.createElement('div');
  header.className = 'chat-block__header';

  const role = document.createElement('span');
  role.className = 'chat-block__role';
  role.textContent = 'Human';
  header.appendChild(role);

  if (block.timestamp) {
    const time = formatTime(block.timestamp);
    if (time) {
      const timeEl = document.createElement('span');
      timeEl.className = 'chat-block__time';
      timeEl.textContent = time;
      header.appendChild(timeEl);
    }
  }

  el.appendChild(header);

  // Body: text + images
  const body = document.createElement('div');
  body.className = 'chat-block__body';

  const textEl = document.createElement('div');
  textEl.className = 'chat-block__text';
  textEl.style.whiteSpace = 'pre-wrap';
  textEl.style.wordBreak = 'break-word';
  textEl.textContent = block.text;
  body.appendChild(textEl);

  if (block.images.length > 0) {
    const gallery = document.createElement('div');
    gallery.className = 'chat-block__images';

    for (const img of block.images) {
      const src = `data:${img.mediaType};base64,${img.base64}`;
      const imgEl = document.createElement('img');
      imgEl.src = src;
      imgEl.className = 'chat-block__thumbnail';
      imgEl.addEventListener('click', () => openImageViewer(src));
      gallery.appendChild(imgEl);
    }
    body.appendChild(gallery);
  }

  el.appendChild(body);

  return el;
}
