// Memory tab: listing memory files and viewer.

import type { Memory } from '@shared/types';
import { cachedMemories, setCachedMemories } from '../state';
import { formatDate } from '../utils';

// --- DOM refs ---
let memoryContent: HTMLElement;
let memoryViewer: HTMLElement;
let memoryViewerTitle: HTMLElement;
let memoryViewerFilename: HTMLElement;
let memoryViewerBody: HTMLElement;

// --- Public API ---

export const initMemory = (): void => {
  memoryContent = document.getElementById('memory-content')!;
  memoryViewer = document.getElementById('memory-viewer')!;
  memoryViewerTitle = document.getElementById('memory-viewer-title')!;
  memoryViewerFilename = document.getElementById('memory-viewer-filename')!;
  memoryViewerBody = document.getElementById('memory-viewer-body')!;
};

export const loadMemories = async (): Promise<void> => {
  setCachedMemories(await window.api.getMemories());
  renderMemories();
};

export const renderMemories = (memories?: Memory[]): void => {
  const list = memories ?? cachedMemories;
  memoryContent.innerHTML = '';
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'plans-empty';
    empty.textContent = 'No memory files found.';
    memoryContent.appendChild(empty);
    return;
  }
  for (const mem of list) {
    memoryContent.appendChild(buildMemoryItem(mem));
  }
};

export const openMemory = async (mem: Memory): Promise<void> => {
  // Mark active in sidebar
  memoryContent.querySelectorAll('.memory-item.active').forEach(el => el.classList.remove('active'));
  memoryContent.querySelectorAll('.memory-item').forEach(el => {
    if (el.querySelector('.session-id')?.textContent === mem.filename &&
        el.querySelector('.session-summary')?.textContent?.includes(mem.label)) {
      el.classList.add('active');
    }
  });

  const content = await window.api.readMemory(mem.filePath);

  // Show memory viewer in main area
  document.getElementById('placeholder')!.style.display = 'none';
  document.getElementById('terminal-area')!.style.display = 'none';
  document.getElementById('plan-viewer')!.style.display = 'none';
  document.getElementById('stats-viewer')!.style.display = 'none';
  document.getElementById('settings-viewer')!.style.display = 'none';
  memoryViewer.style.display = 'flex';

  memoryViewerTitle.textContent = `${mem.label} — ${mem.filename}`;
  memoryViewerFilename.textContent = mem.filePath;
  memoryViewerBody.textContent = content;
};

// --- Internal ---

const buildMemoryItem = (mem: Memory): HTMLElement => {
  const item = document.createElement('div');
  item.className = 'session-item memory-item';

  const row = document.createElement('div');
  row.className = 'session-row';

  const info = document.createElement('div');
  info.className = 'session-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'session-summary';

  const badge = document.createElement('span');
  badge.className = `memory-type-badge type-${mem.type}`;
  badge.textContent = mem.type;
  titleEl.appendChild(badge);
  titleEl.appendChild(document.createTextNode(mem.label));

  const filenameEl = document.createElement('div');
  filenameEl.className = 'session-id';
  filenameEl.textContent = mem.filename;

  const metaEl = document.createElement('div');
  metaEl.className = 'session-meta';
  metaEl.textContent = formatDate(new Date(mem.modified));

  info.appendChild(titleEl);
  info.appendChild(filenameEl);
  info.appendChild(metaEl);
  row.appendChild(info);
  item.appendChild(row);

  item.addEventListener('click', () => openMemory(mem));
  return item;
};
