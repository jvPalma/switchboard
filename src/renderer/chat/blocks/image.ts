import type { ImageBlockData } from '../types';
import { openImageViewer } from '../../components/image-viewer';

export function renderImage(block: ImageBlockData): HTMLElement {
  const el = document.createElement('div');
  el.className = 'chat-block--image';
  el.dataset.blockId = block.id;

  const src = `data:${block.mediaType};base64,${block.base64}`;

  const img = document.createElement('img');
  img.className = 'chat-block__image-preview';
  img.src = src;
  img.style.maxWidth = '100%';
  img.style.maxHeight = '400px';
  img.style.objectFit = 'contain';
  img.style.cursor = 'pointer';
  img.style.borderRadius = '8px';
  img.style.border = '1px solid #333';

  img.addEventListener('click', () => openImageViewer(src));

  const dims = document.createElement('div');
  dims.className = 'chat-block__image-dims';
  dims.style.fontSize = '0.8em';
  dims.style.color = '#888';
  dims.style.marginTop = '4px';

  img.addEventListener('load', () => {
    if (img.naturalWidth && img.naturalHeight) {
      dims.textContent = `${img.naturalWidth} \u00D7 ${img.naturalHeight}`;
    }
  });

  el.appendChild(img);
  el.appendChild(dims);
  return el;
}
