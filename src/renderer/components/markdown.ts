import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true,
});

const DANGEROUS_TAG_RE = /<\s*\/?\s*(script|iframe)[^>]*>/gi;
const ON_ATTR_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

function sanitize(html: string): string {
  return html.replace(DANGEROUS_TAG_RE, '').replace(ON_ATTR_RE, '');
}

function addCopyButtons(container: HTMLElement): void {
  const preEls = container.querySelectorAll('pre');
  for (const pre of preEls) {
    pre.style.position = 'relative';

    const btn = document.createElement('button');
    btn.className = 'markdown-copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code');
      const text = code ? code.textContent ?? '' : pre.textContent ?? '';
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = 'Copy';
        }, 2000);
      });
    });

    pre.appendChild(btn);
  }
}

export function renderMarkdown(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'markdown-content';

  if (!text) return el;

  const raw = marked.parse(text) as string;
  el.innerHTML = sanitize(raw);
  addCopyButtons(el);

  return el;
}
