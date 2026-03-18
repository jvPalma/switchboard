import { activeSessionId } from '../state';
import { openFileInPanel, openDiffInPanel } from '../views/file-panel';
import { showToast } from '../components/toast';

interface DiffData {
  filePath: string;
  oldString: string;
  newString: string;
}

const diffDataMap = new WeakMap<HTMLElement, DiffData>();

export const registerDiffData = (element: HTMLElement, data: DiffData): void => {
  diffDataMap.set(element, data);
};

export const attachFileLinkHandler = (container: HTMLElement): void => {
  container.addEventListener('click', async (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('.file-link[data-file-path]') as HTMLElement | null;
    if (!target) return;

    const filePath = target.getAttribute('data-file-path');
    if (!filePath) return;

    const sessionId = activeSessionId;
    if (!sessionId) return;

    // Check if inside a code-diff block — open as diff
    const diffBlock = target.closest('.chat-block--code-diff');
    if (diffBlock) {
      const data = diffDataMap.get(diffBlock as HTMLElement);
      if (data) {
        openDiffInPanel(sessionId, data.filePath, data.oldString, data.newString);
        return;
      }
    }

    // Check if inside a tool-use block that contains a code-diff result
    const toolUseBlock = target.closest('.chat-block--tool-use');
    if (toolUseBlock) {
      const diffChild = toolUseBlock.querySelector('.chat-block--code-diff');
      if (diffChild) {
        const data = diffDataMap.get(diffChild as HTMLElement);
        if (data) {
          openDiffInPanel(sessionId, data.filePath, data.oldString, data.newString);
          return;
        }
      }
    }

    // Regular file open
    const ok = await openFileInPanel(sessionId, filePath);
    if (!ok) {
      showToast(`File not found: ${filePath}`, 'error');
    }
  });
};
