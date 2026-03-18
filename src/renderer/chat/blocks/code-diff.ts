import type { ToolResultBlockData } from '../types';
import { registerDiffData } from '../file-link-handler';

export function renderCodeDiff(block: ToolResultBlockData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'chat-block--code-diff';

  const diff = block.editDiff;
  if (!diff) {
    container.textContent = block.content;
    return container;
  }

  // File path header
  const header = document.createElement('div');
  header.className = 'chat-block__diff-header';
  header.style.padding = '6px 12px';
  header.style.backgroundColor = '#1a1a2e';
  header.style.borderRadius = '4px 4px 0 0';
  header.style.fontFamily = 'monospace';
  header.style.fontSize = '12px';
  header.style.color = '#8888cc';
  header.style.borderBottom = '1px solid #2a2a3e';
  const pathSpan = document.createElement('span');
  pathSpan.className = 'file-link';
  pathSpan.setAttribute('data-file-path', diff.filePath);
  pathSpan.textContent = diff.filePath;
  header.appendChild(pathSpan);
  container.appendChild(header);

  registerDiffData(container, {
    filePath: diff.filePath,
    oldString: diff.oldString,
    newString: diff.newString,
  });

  // Diff body
  const pre = document.createElement('pre');
  pre.className = 'chat-block__diff-body';
  pre.style.margin = '0';
  pre.style.padding = '8px 0';
  pre.style.backgroundColor = '#1a1a2e';
  pre.style.borderRadius = '0 0 4px 4px';
  pre.style.overflowX = 'auto';
  pre.style.fontFamily = 'monospace';
  pre.style.fontSize = '13px';
  pre.style.lineHeight = '1.5';

  const oldLines = diff.oldString.split('\n');
  const newLines = diff.newString.split('\n');
  const diffLines = computeSimpleDiff(oldLines, newLines);

  for (const line of diffLines) {
    const lineEl = document.createElement('div');
    lineEl.style.padding = '0 12px';
    lineEl.style.whiteSpace = 'pre-wrap';
    lineEl.style.wordBreak = 'break-word';

    if (line.type === 'remove') {
      lineEl.style.backgroundColor = '#3a1e1e';
      lineEl.style.color = '#e8a0a0';
      lineEl.textContent = `-${line.text}`;
    } else if (line.type === 'add') {
      lineEl.style.backgroundColor = '#1e3a1e';
      lineEl.style.color = '#a0e8a0';
      lineEl.textContent = `+${line.text}`;
    } else {
      lineEl.style.color = '#e0e0e0';
      lineEl.textContent = ` ${line.text}`;
    }

    pre.appendChild(lineEl);
  }

  container.appendChild(pre);
  return container;
}

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  text: string;
}

/** Simple sequential line diff — walks both arrays, emitting removes then adds for changed regions. */
function computeSimpleDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length && ni < newLines.length) {
    if (oldLines[oi] === newLines[ni]) {
      result.push({ type: 'context', text: oldLines[oi]! });
      oi++;
      ni++;
    } else {
      // Find next common line
      const syncPoint = findSync(oldLines, newLines, oi, ni);
      // Emit removals up to sync
      while (oi < syncPoint.oi) {
        result.push({ type: 'remove', text: oldLines[oi]! });
        oi++;
      }
      // Emit additions up to sync
      while (ni < syncPoint.ni) {
        result.push({ type: 'add', text: newLines[ni]! });
        ni++;
      }
    }
  }

  // Remaining old lines are removals
  while (oi < oldLines.length) {
    result.push({ type: 'remove', text: oldLines[oi]! });
    oi++;
  }

  // Remaining new lines are additions
  while (ni < newLines.length) {
    result.push({ type: 'add', text: newLines[ni]! });
    ni++;
  }

  return result;
}

/** Look ahead to find the next line that matches in both arrays. */
function findSync(
  oldLines: string[],
  newLines: string[],
  oi: number,
  ni: number,
): { oi: number; ni: number } {
  const maxLook = 50;

  for (let ahead = 1; ahead < maxLook; ahead++) {
    // Check if old[oi+ahead] matches new[ni]
    if (oi + ahead < oldLines.length && oldLines[oi + ahead] === newLines[ni]) {
      return { oi: oi + ahead, ni };
    }
    // Check if new[ni+ahead] matches old[oi]
    if (ni + ahead < newLines.length && newLines[ni + ahead] === oldLines[oi]) {
      return { oi, ni: ni + ahead };
    }
    // Check diagonal
    if (
      oi + ahead < oldLines.length &&
      ni + ahead < newLines.length &&
      oldLines[oi + ahead] === newLines[ni + ahead]
    ) {
      return { oi: oi + ahead, ni: ni + ahead };
    }
  }

  // No sync found within lookahead — consume one line from each
  return { oi: oi + 1, ni: ni + 1 };
}
