import type { ToolResultBlockData } from '../types';
import { renderMarkdown } from '../../components/markdown';

const MAX_VISIBLE_LINES = 200;

export function renderFileContent(block: ToolResultBlockData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'chat-block--file-content';

  // File path header
  const header = document.createElement('div');
  header.className = 'chat-block__file-header';
  header.style.padding = '6px 12px';
  header.style.backgroundColor = '#1a1a2e';
  header.style.borderRadius = '4px 4px 0 0';
  header.style.fontFamily = 'monospace';
  header.style.fontSize = '12px';
  header.style.color = '#8888cc';
  header.style.cursor = 'pointer';
  header.style.borderBottom = '1px solid #2a2a3e';
  header.textContent = block.filePath ?? block.toolName;
  if (block.filePath) {
    header.classList.add('file-link');
    header.setAttribute('data-file-path', block.filePath);
  }
  container.appendChild(header);

  // Content body with line numbers
  const allLines = block.content.split('\n');
  const truncated = allLines.length > MAX_VISIBLE_LINES;

  const wrapper = document.createElement('div');
  wrapper.className = 'chat-block__file-body';
  wrapper.style.display = 'flex';
  wrapper.style.backgroundColor = '#1a1a2e';
  wrapper.style.borderRadius = '0 0 4px 4px';
  wrapper.style.overflowX = 'auto';
  wrapper.style.fontFamily = 'monospace';
  wrapper.style.fontSize = '13px';
  wrapper.style.lineHeight = '1.5';

  const gutter = document.createElement('pre');
  gutter.className = 'chat-block__line-gutter';
  gutter.style.margin = '0';
  gutter.style.padding = '8px 0';
  gutter.style.textAlign = 'right';
  gutter.style.color = '#555';
  gutter.style.userSelect = 'none';
  gutter.style.paddingLeft = '8px';
  gutter.style.paddingRight = '12px';
  gutter.style.flexShrink = '0';
  gutter.style.borderRight = '1px solid #2a2a3e';

  const code = document.createElement('pre');
  code.className = 'chat-block__file-code';
  code.style.margin = '0';
  code.style.padding = '8px 12px';
  code.style.color = '#e0e0e0';
  code.style.whiteSpace = 'pre-wrap';
  code.style.wordBreak = 'break-word';
  code.style.flex = '1';
  code.style.minWidth = '0';

  const visibleLines = truncated ? allLines.slice(0, MAX_VISIBLE_LINES) : allLines;
  setLines(gutter, code, visibleLines);

  wrapper.appendChild(gutter);
  wrapper.appendChild(code);
  container.appendChild(wrapper);

  // Markdown preview toggle for .md files
  const isMd = block.filePath?.endsWith('.md');
  if (isMd) {
    const previewBtn = document.createElement('button');
    previewBtn.className = 'chat-block__preview-toggle';
    previewBtn.textContent = 'Preview';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    const label = document.createElement('span');
    label.textContent = block.filePath ?? block.toolName;
    if (block.filePath) {
      label.classList.add('file-link');
      label.setAttribute('data-file-path', block.filePath);
      header.classList.remove('file-link');
    }
    header.textContent = '';
    header.appendChild(label);
    header.appendChild(previewBtn);

    let previewing = false;
    const renderedView = renderMarkdown(block.content);
    renderedView.className = 'chat-block__md-preview markdown-content';
    renderedView.style.display = 'none';
    renderedView.style.padding = '12px 16px';
    renderedView.style.backgroundColor = '#1a1a2e';
    renderedView.style.borderRadius = '0 0 4px 4px';

    previewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      previewing = !previewing;
      wrapper.style.display = previewing ? 'none' : 'flex';
      renderedView.style.display = previewing ? 'block' : 'none';
      previewBtn.textContent = previewing ? 'Raw' : 'Preview';
    });

    container.appendChild(renderedView);
  }

  if (truncated) {
    const toggle = document.createElement('button');
    toggle.className = 'chat-block__show-more';
    toggle.textContent = `Show all ${allLines.length} lines`;
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
      const lines = expanded ? allLines : allLines.slice(0, MAX_VISIBLE_LINES);
      setLines(gutter, code, lines);
      toggle.textContent = expanded
        ? `Show first ${MAX_VISIBLE_LINES} lines`
        : `Show all ${allLines.length} lines`;
    });
    container.appendChild(toggle);
  }

  return container;
}

function setLines(gutter: HTMLElement, code: HTMLElement, lines: string[]): void {
  const gutterWidth = String(lines.length).length;
  gutter.textContent = lines.map((_, i) => String(i + 1).padStart(gutterWidth)).join('\n');
  code.textContent = lines.join('\n');
}
