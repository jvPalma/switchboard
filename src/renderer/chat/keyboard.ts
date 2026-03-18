// Keyboard navigation for the chat view.
// Single keydown listener on the chat container handles:
//   Tab     — move focus between collapsible block headers
//   Enter   — expand/collapse the focused block
//   Escape  — close any expanded block, or blur the chat

const COLLAPSIBLE_SELECTOR = '.chat-tool-header[tabindex]';

const getCollapsibles = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(COLLAPSIBLE_SELECTOR));

const isExpanded = (header: HTMLElement): boolean =>
  header.classList.contains('expanded');

const toggle = (header: HTMLElement): void => {
  header.click();
};

export const initChatKeyboard = (container: HTMLElement): void => {
  container.addEventListener('keydown', (e: KeyboardEvent) => {
    const key = e.key;

    if (key === 'Tab') {
      handleTab(e, container);
    } else if (key === 'Enter') {
      handleEnter(e);
    } else if (key === 'Escape') {
      handleEscape(e, container);
    }
  });
};

const handleTab = (e: KeyboardEvent, container: HTMLElement): void => {
  const items = getCollapsibles(container);
  if (items.length === 0) return;

  e.preventDefault();
  const active = document.activeElement as HTMLElement | null;
  const currentIdx = active ? items.indexOf(active) : -1;

  let nextIdx: number;
  if (e.shiftKey) {
    nextIdx = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
  } else {
    nextIdx = currentIdx >= items.length - 1 ? 0 : currentIdx + 1;
  }

  items[nextIdx]!.focus();
};

const handleEnter = (e: KeyboardEvent): void => {
  const target = e.target as HTMLElement;
  if (!target.matches(COLLAPSIBLE_SELECTOR)) return;

  e.preventDefault();
  toggle(target);
};

const handleEscape = (e: KeyboardEvent, container: HTMLElement): void => {
  e.preventDefault();

  // Close any expanded block first
  const expanded = container.querySelector<HTMLElement>('.chat-tool-header.expanded');
  if (expanded) {
    toggle(expanded);
    expanded.focus();
    return;
  }

  // Otherwise blur the chat
  (document.activeElement as HTMLElement | null)?.blur();
};
