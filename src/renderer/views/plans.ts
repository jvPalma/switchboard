// Plans tab: listing plan files and CodeMirror editor for viewing/editing.

import type { Plan } from '@shared/types';
import { cachedPlans, setCachedPlans } from '../state';
import { formatDate } from '../utils';

// --- DOM refs (queried on init) ---
let plansContent: HTMLElement;
let planViewer: HTMLElement;
let planViewerTitle: HTMLElement;
let planViewerFilepath: HTMLElement;
let planViewerEditorEl: HTMLElement;
let planCopyPathBtn: HTMLElement;
let planCopyContentBtn: HTMLElement;
let planSaveBtn: HTMLElement;

// --- Plan state ---
let currentPlanContent = '';
let currentPlanFilePath = '';
let planEditorView: CodeMirrorEditorView | null = null;

const flashButtonText = (btn: HTMLElement, text: string, duration = 1200): void => {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; }, duration);
};

// --- Public API ---

export const initPlans = (): void => {
  plansContent = document.getElementById('plans-content')!;
  planViewer = document.getElementById('plan-viewer')!;
  planViewerTitle = document.getElementById('plan-viewer-title')!;
  planViewerFilepath = document.getElementById('plan-viewer-filepath')!;
  planViewerEditorEl = document.getElementById('plan-viewer-editor')!;
  planCopyPathBtn = document.getElementById('plan-copy-path-btn')!;
  planCopyContentBtn = document.getElementById('plan-copy-content-btn')!;
  planSaveBtn = document.getElementById('plan-save-btn')!;

  planCopyPathBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentPlanFilePath);
    flashButtonText(planCopyPathBtn, 'Copied!');
  });

  planCopyContentBtn.addEventListener('click', () => {
    const content = planEditorView ? planEditorView.state.doc.toString() : currentPlanContent;
    navigator.clipboard.writeText(content);
    flashButtonText(planCopyContentBtn, 'Copied!');
  });

  planSaveBtn.addEventListener('click', async () => {
    if (planEditorView) {
      currentPlanContent = planEditorView.state.doc.toString();
    }
    await window.api.savePlan(currentPlanFilePath, currentPlanContent);
    flashButtonText(planSaveBtn, 'Saved!');
  });
};

export const loadPlans = async (): Promise<void> => {
  setCachedPlans(await window.api.getPlans());
  renderPlans();
};

export const renderPlans = (plans?: Plan[]): void => {
  const list = plans ?? cachedPlans;
  plansContent.innerHTML = '';
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'plans-empty';
    empty.textContent = 'No plans found in ~/.claude/plans/';
    plansContent.appendChild(empty);
    return;
  }
  for (const plan of list) {
    plansContent.appendChild(buildPlanItem(plan));
  }
};

export const openPlan = async (plan: Plan): Promise<void> => {
  // Mark active in sidebar
  plansContent.querySelectorAll('.plan-item.active').forEach(el => el.classList.remove('active'));
  plansContent.querySelectorAll('.plan-item').forEach(el => {
    if (el.querySelector('.session-id')?.textContent === plan.filename) {
      el.classList.add('active');
    }
  });

  const result = await window.api.readPlan(plan.filename);
  currentPlanContent = result.content;
  currentPlanFilePath = result.filePath;

  // Hide terminal area and placeholder, show plan viewer
  document.getElementById('placeholder')!.style.display = 'none';
  document.getElementById('terminal-area')!.style.display = 'none';
  document.getElementById('stats-viewer')!.style.display = 'none';
  document.getElementById('memory-viewer')!.style.display = 'none';
  document.getElementById('settings-viewer')!.style.display = 'none';
  planViewer.style.display = 'flex';

  planViewerTitle.textContent = plan.title;
  planViewerFilepath.textContent = currentPlanFilePath;

  // Create or update CodeMirror editor
  if (!planEditorView) {
    planEditorView = window.createPlanEditor(planViewerEditorEl);
  }
  planEditorView.dispatch({
    changes: { from: 0, to: planEditorView.state.doc.length, insert: currentPlanContent },
  });
};

export const hidePlanViewer = (): void => {
  hideAllViewers();
};

export const hideAllViewers = (): void => {
  planViewer.style.display = 'none';
  document.getElementById('stats-viewer')!.style.display = 'none';
  document.getElementById('memory-viewer')!.style.display = 'none';
  document.getElementById('settings-viewer')!.style.display = 'none';
  document.getElementById('jsonl-viewer')!.style.display = 'none';
  document.getElementById('terminal-area')!.style.display = '';
};

// --- Internal ---

const buildPlanItem = (plan: Plan): HTMLElement => {
  const item = document.createElement('div');
  item.className = 'session-item plan-item';

  const row = document.createElement('div');
  row.className = 'session-row';

  const info = document.createElement('div');
  info.className = 'session-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'session-summary';
  titleEl.textContent = plan.title;

  const filenameEl = document.createElement('div');
  filenameEl.className = 'session-id';
  filenameEl.textContent = plan.filename;

  const metaEl = document.createElement('div');
  metaEl.className = 'session-meta';
  metaEl.textContent = formatDate(new Date(plan.modified));

  info.appendChild(titleEl);
  info.appendChild(filenameEl);
  info.appendChild(metaEl);
  row.appendChild(info);
  item.appendChild(row);

  item.addEventListener('click', () => openPlan(plan));
  return item;
};
