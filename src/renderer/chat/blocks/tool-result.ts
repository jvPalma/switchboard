import type { ToolResultBlockData } from '../types';
import { renderCodeDiff } from './code-diff';
import { renderFileContent } from './file-content';
import { renderBashOutput } from './bash-output';
import { openImageViewer } from '../../components/image-viewer';

const TRUNCATE_THRESHOLD = 5000;

export function renderToolResult(block: ToolResultBlockData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'chat-block--tool-result';

  if (block.isError) {
    container.classList.add('is-error');

    const errorText = document.createElement('pre');
    errorText.className = 'chat-block__error-text';
    errorText.textContent = block.content;
    container.appendChild(errorText);
    return container;
  }

  // Delegate to specialized renderers based on tool type
  if (block.toolName === 'Edit' && block.editDiff) {
    container.appendChild(renderCodeDiff(block));
    return container;
  }

  if ((block.toolName === 'Read' || block.toolName === 'Write') && block.filePath) {
    container.appendChild(renderFileContent(block));
    return container;
  }

  if (block.toolName === 'Bash') {
    container.appendChild(renderBashOutput(block));
    return container;
  }

  // Check if content is a base64 image (from Playwright screenshots, etc.)
  const imageSrc = extractImageSrc(block.content);
  if (imageSrc) {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'chat-block__image-wrapper';
    const img = document.createElement('img');
    img.src = imageSrc;
    img.className = 'chat-block__result-image';
    img.addEventListener('click', () => openImageViewer(imageSrc, block.toolName));
    imgWrapper.appendChild(img);
    container.appendChild(imgWrapper);
    return container;
  }

  // Generic tool result: show content in pre/code
  const pre = document.createElement('pre');
  pre.className = 'chat-block__tool-output';

  const code = document.createElement('code');

  if (block.content.length > TRUNCATE_THRESHOLD) {
    code.textContent = block.content.slice(0, TRUNCATE_THRESHOLD);
    pre.appendChild(code);
    container.appendChild(pre);
    container.appendChild(createShowMoreToggle(code, block.content));
  } else {
    code.textContent = block.content;
    pre.appendChild(code);
    container.appendChild(pre);
  }

  return container;
}

// Common base64 image magic byte prefixes (first few chars after encoding)
const BASE64_SIGNATURES: Record<string, string> = {
  '/9j/': 'image/jpeg',
  'iVBOR': 'image/png',
  'R0lGO': 'image/gif',
  'UklGR': 'image/webp',
};

function extractImageSrc(content: string): string | null {
  const trimmed = content.trim();

  // Already a data URI
  if (trimmed.startsWith('data:image/')) return trimmed;

  // Raw base64 — check magic bytes
  for (const [prefix, mime] of Object.entries(BASE64_SIGNATURES)) {
    if (trimmed.startsWith(prefix)) {
      return `data:${mime};base64,${trimmed}`;
    }
  }

  return null;
}

function createShowMoreToggle(code: HTMLElement, fullContent: string): HTMLElement {
  const toggle = document.createElement('button');
  toggle.className = 'chat-block__show-more';
  toggle.textContent = 'Show more';

  let expanded = false;
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    code.textContent = expanded ? fullContent : fullContent.slice(0, TRUNCATE_THRESHOLD);
    toggle.textContent = expanded ? 'Show less' : 'Show more';
  });

  return toggle;
}
