import type { AssistantTextBlock } from '../types';
import { renderMarkdown } from '../../components/markdown';

const FILE_PATH_RE = /(?:\.{0,2}\/[\w@.+-]+(?:\/[\w@.+-]+)*\.\w{1,10}|(?:[\w@-]+\/)+[\w@.+-]+\.\w{1,10})/g;

const linkifyFilePathsInDom = (root: HTMLElement): void => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodesToReplace: { node: Text; frag: DocumentFragment }[] = [];

  let textNode: Text | null;
  while ((textNode = walker.nextNode() as Text | null)) {
    const parent = textNode.parentElement;
    if (parent && (parent.tagName === 'CODE' || parent.tagName === 'PRE' || parent.tagName === 'A')) continue;

    const text = textNode.textContent ?? '';
    FILE_PATH_RE.lastIndex = 0;

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let frag: DocumentFragment | null = null;

    while ((match = FILE_PATH_RE.exec(text)) !== null) {
      const before = text.slice(Math.max(0, match.index - 3), match.index);
      if (before.includes('://')) continue;

      if (!frag) frag = document.createDocumentFragment();
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const span = document.createElement('span');
      span.className = 'file-link';
      span.setAttribute('data-file-path', match[0]);
      span.textContent = match[0];
      frag.appendChild(span);

      lastIndex = match.index + match[0].length;
    }

    if (frag) {
      if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      nodesToReplace.push({ node: textNode, frag });
    }
  }

  for (const { node, frag } of nodesToReplace) {
    node.parentNode?.replaceChild(frag, node);
  }
};

const formatTokens = (count: number): string => {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K tokens`;
  return `${count} tokens`;
};

export function renderAssistantMessage(block: AssistantTextBlock): HTMLElement {
  const el = document.createElement('div');
  el.className = 'chat-block chat-block--assistant-text';
  el.dataset.blockId = block.id;

  // Header
  const header = document.createElement('div');
  header.className = 'chat-block__header';
  const role = document.createElement('span');
  role.className = 'chat-block__role';
  role.textContent = 'Assistant';
  header.appendChild(role);
  el.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'chat-block__body';
  const textEl = renderMarkdown(block.text);
  textEl.classList.add('chat-block__text', 'markdown-content');
  linkifyFilePathsInDom(textEl);
  body.appendChild(textEl);
  el.appendChild(body);

  // Footer
  const totalTokens = (block.inputTokens ?? 0) + (block.outputTokens ?? 0);
  if (block.costUSD != null || block.durationMs != null || totalTokens > 0) {
    const footer = document.createElement('div');
    footer.className = 'chat-block__footer';
    const cost = document.createElement('span');
    cost.className = 'chat-block__cost';
    const parts: string[] = [];
    if (block.costUSD != null) {
      parts.push(`$${block.costUSD.toFixed(4)}`);
    }
    if (block.durationMs != null) {
      parts.push(`${(block.durationMs / 1000).toFixed(1)}s`);
    }
    if (totalTokens > 0) {
      parts.push(formatTokens(totalTokens));
    }
    cost.textContent = parts.join(' \u00b7 ');
    footer.appendChild(cost);
    el.appendChild(footer);
  }

  return el;
}
