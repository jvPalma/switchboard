/**
 * file-panel.ts — Renderer-side file/diff side panel for Switchboard.
 *
 * Manages a collapsible panel to the right of the terminal that shows
 * files and diffs received from the MCP bridge. Each session has its
 * own set of tabs and panel state.
 *
 * CodeMirror functions are browser globals loaded via script tags:
 *   window.createReadOnlyViewer, window.createMergeViewer,
 *   window.createUnifiedMergeViewer
 */

import type { McpDiffData, McpFileData, DiffAction } from '@shared/types';
import { openSessions } from '../state';
import { basename } from '../utils';

// ── Interfaces ───────────────────────────────────────────────────────

type DiffMode = 'side-by-side' | 'inline';

interface DiffTabState {
  tabId: string;
  type: 'diff';
  label: string;
  filePath: string;
  diffId: string;
  oldContent: string;
  newContent: string;
  resolved: boolean;
  editorView: CodeMirrorEditorView | CodeMirrorMergeView | null;
  /** Tracks which diff mode was used to create the current editorView. */
  _diffMode?: DiffMode;
}

interface FileTabState {
  tabId: string;
  type: 'file';
  label: string;
  filePath: string;
  content: string;
  editorView: CodeMirrorEditorView | null;
}

type TabState = DiffTabState | FileTabState;

interface FilePanelSessionState {
  tabs: Map<string, TabState>;
  activeTabId: string | null;
  panelVisible: boolean;
  panelWidth: number;
  mcpActive: boolean;
}

// ── Per-Session State ────────────────────────────────────────────────

const filePanelState = new Map<string, FilePanelSessionState>();

// ── DOM References ───────────────────────────────────────────────────

let filePanelEl: HTMLDivElement | null = null;
let filePanelHeaderEl: HTMLDivElement | null = null;
let filePanelPathEl: HTMLDivElement | null = null;
let filePanelBodyEl: HTMLDivElement | null = null;
let filePanelActionsEl: HTMLDivElement | null = null;
let filePanelResizeHandle: HTMLDivElement | null = null;
let terminalSplitEl: HTMLDivElement | null = null;
let currentPanelSessionId: string | null = null;

const PANEL_WIDTH_KEY = 'filePanelWidth';
const DEFAULT_PANEL_WIDTH = parseInt(localStorage.getItem(PANEL_WIDTH_KEY) ?? '', 10) || 450;
const MIN_PANEL_WIDTH = 280;

const DIFF_MODE_KEY = 'filePanelDiffMode';
let diffMode: DiffMode =
  (localStorage.getItem(DIFF_MODE_KEY) as DiffMode | null) || 'side-by-side';

// ── MCP Indicator ────────────────────────────────────────────────────

let mcpIndicatorEl: HTMLSpanElement | null = null;

// ── Initialization ───────────────────────────────────────────────────

const initFilePanel = (): void => {
  const terminalArea = document.getElementById('terminal-area');
  const terminalsEl = document.getElementById('terminals');
  if (!terminalArea || !terminalsEl) return;

  // Create the split container
  terminalSplitEl = document.createElement('div');
  terminalSplitEl.id = 'terminal-split';

  // Reparent #terminals into the split
  terminalArea.removeChild(terminalsEl);
  terminalSplitEl.appendChild(terminalsEl);

  // Create resize handle
  filePanelResizeHandle = document.createElement('div');
  filePanelResizeHandle.id = 'file-panel-resize-handle';
  terminalSplitEl.appendChild(filePanelResizeHandle);

  // Create the file panel
  filePanelEl = document.createElement('div');
  filePanelEl.id = 'file-panel';

  filePanelHeaderEl = document.createElement('div');
  filePanelHeaderEl.id = 'file-panel-header';
  filePanelEl.appendChild(filePanelHeaderEl);

  // Toolbar: path + diff mode toggle
  const toolbarEl = document.createElement('div');
  toolbarEl.id = 'file-panel-toolbar';

  filePanelPathEl = document.createElement('div');
  filePanelPathEl.className = 'file-panel-path';
  toolbarEl.appendChild(filePanelPathEl);

  const diffToggleBtn = document.createElement('button');
  diffToggleBtn.id = 'diff-mode-toggle';
  diffToggleBtn.title =
    diffMode === 'inline' ? 'Switch to side-by-side diff' : 'Switch to inline diff';
  diffToggleBtn.textContent =
    diffMode === 'inline' ? 'Side-by-Side' : 'Inline';
  diffToggleBtn.addEventListener('click', () => {
    diffMode = diffMode === 'inline' ? 'side-by-side' : 'inline';
    localStorage.setItem(DIFF_MODE_KEY, diffMode);
    diffToggleBtn.textContent = diffMode === 'inline' ? 'Side-by-Side' : 'Inline';
    diffToggleBtn.title =
      diffMode === 'inline' ? 'Switch to side-by-side diff' : 'Switch to inline diff';
    // Re-render active tab if it's a diff
    if (currentPanelSessionId) {
      const state = getSessionState(currentPanelSessionId);
      const activeTab = state.activeTabId ? state.tabs.get(state.activeTabId) : null;
      if (activeTab && activeTab.type === 'diff') {
        activeTab.editorView = null; // force re-create
        renderTabContent(currentPanelSessionId, activeTab);
      }
    }
  });
  toolbarEl.appendChild(diffToggleBtn);

  filePanelEl.appendChild(toolbarEl);

  filePanelBodyEl = document.createElement('div');
  filePanelBodyEl.id = 'file-panel-body';
  filePanelEl.appendChild(filePanelBodyEl);

  filePanelActionsEl = document.createElement('div');
  filePanelActionsEl.id = 'file-panel-actions';
  filePanelActionsEl.style.display = 'none';
  filePanelEl.appendChild(filePanelActionsEl);

  terminalSplitEl.appendChild(filePanelEl);
  terminalArea.appendChild(terminalSplitEl);

  // Wire up IPC listeners
  wireIpcListeners();

  // Wire up resize handle
  setupPanelResizeHandle();

  // Add MCP toggle to terminal header
  addMcpToggle();
};

// ── IPC Wiring ───────────────────────────────────────────────────────

const wireIpcListeners = (): void => {
  window.api.onMcpOpenDiff((sessionId: string, diffId: string, data: McpDiffData) => {
    openDiffTab(sessionId, diffId, data);
  });

  window.api.onMcpOpenFile((sessionId: string, data: McpFileData) => {
    openFileTab(sessionId, data);
  });

  window.api.onMcpCloseAllDiffs((sessionId: string) => {
    closeAllDiffTabs(sessionId);
  });

  window.api.onMcpCloseTab((sessionId: string, diffId: string) => {
    closeDiffTabByDiffId(sessionId, diffId);
  });
};

// ── Session State Helpers ────────────────────────────────────────────

const getSessionState = (sessionId: string): FilePanelSessionState => {
  let state = filePanelState.get(sessionId);
  if (!state) {
    state = {
      tabs: new Map(),
      activeTabId: null,
      panelVisible: false,
      panelWidth: DEFAULT_PANEL_WIDTH,
      mcpActive: false,
    };
    filePanelState.set(sessionId, state);
  }
  return state;
};

/**
 * Called from app after openTerminal returns.
 * Single entry point for setting MCP status — updates state and indicator.
 */
const setSessionMcpActive = (sessionId: string, active: boolean): void => {
  const state = getSessionState(sessionId);
  state.mcpActive = active;
  if (currentPanelSessionId === sessionId) {
    updateMcpIndicator();
  }
};

const rekeyFilePanelState = (oldId: string, newId: string): void => {
  const state = filePanelState.get(oldId);
  if (state) {
    filePanelState.delete(oldId);
    filePanelState.set(newId, state);
  }
};

// ── Tab Operations ───────────────────────────────────────────────────

const openDiffTab = (sessionId: string, diffId: string, data: McpDiffData): void => {
  const state = getSessionState(sessionId);

  const tabId = `diff:${diffId}`;
  const label = data.tabName || basename(data.oldFilePath);

  state.tabs.set(tabId, {
    tabId,
    type: 'diff',
    label,
    filePath: data.oldFilePath,
    diffId,
    oldContent: data.oldContent,
    newContent: data.newContent,
    resolved: false,
    editorView: null,
  });

  state.activeTabId = tabId;
  state.panelVisible = true;

  // If this is the active session, update the UI
  if (currentPanelSessionId === sessionId) {
    showPanel(state);
    renderPanel(sessionId);
  }
};

const openFileTab = (sessionId: string, data: McpFileData): void => {
  const state = getSessionState(sessionId);

  const tabId = `file:${data.filePath}`;
  const label = basename(data.filePath);

  // Reuse existing tab for same file
  const existing = state.tabs.get(tabId);
  if (existing && existing.type === 'file') {
    existing.content = data.content;
    // Destroy old editor so it re-renders
    if (existing.editorView) {
      existing.editorView.destroy();
      existing.editorView = null;
    }
  } else {
    state.tabs.set(tabId, {
      tabId,
      type: 'file',
      label,
      filePath: data.filePath,
      content: data.content,
      editorView: null,
    });
  }

  state.activeTabId = tabId;
  state.panelVisible = true;

  if (currentPanelSessionId === sessionId) {
    showPanel(state);
    renderPanel(sessionId);
  }
};

/**
 * Open a file in the panel from an OSC 8 file:// link click.
 * Reads the file via IPC and creates a file tab.
 */
const openFileInPanel = async (sessionId: string, filePath: string): Promise<boolean> => {
  const result = await window.api.readFileForPanel(filePath);
  if (!result.ok) return false;

  openFileTab(sessionId, {
    filePath,
    content: result.content ?? '',
    preview: false,
    startText: '',
    endText: '',
  });
  return true;
};

const openDiffInPanel = (sessionId: string, filePath: string, oldContent: string, newContent: string): void => {
  const diffId = `chat-${Date.now()}`;
  openDiffTab(sessionId, diffId, {
    oldFilePath: filePath,
    oldContent,
    newContent,
    tabName: basename(filePath),
  });
};

const closeTab = (sessionId: string, tabId: string): void => {
  const state = getSessionState(sessionId);
  const tab = state.tabs.get(tabId);
  if (!tab) return;

  // If it's an unresolved diff, respond as rejected
  if (tab.type === 'diff' && !tab.resolved) {
    window.api.mcpDiffResponse(sessionId, tab.diffId, 'reject', null);
  }

  // Destroy editor
  if (tab.editorView) {
    tab.editorView.destroy();
    tab.editorView = null;
  }

  state.tabs.delete(tabId);

  // Switch to another tab or hide panel
  if (state.activeTabId === tabId) {
    const remaining = [...state.tabs.keys()];
    state.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1]! : null;
  }

  if (state.tabs.size === 0) {
    state.panelVisible = false;
    if (currentPanelSessionId === sessionId) {
      hidePanel();
    }
  } else if (currentPanelSessionId === sessionId) {
    renderPanel(sessionId);
  }
};

const closeAllDiffTabs = (sessionId: string): void => {
  const state = getSessionState(sessionId);

  for (const [tabId, tab] of state.tabs) {
    if (tab.type === 'diff') {
      if (tab.editorView) {
        tab.editorView.destroy();
        tab.editorView = null;
      }
      state.tabs.delete(tabId);
    }
  }

  // Update active tab
  if (state.activeTabId && !state.tabs.has(state.activeTabId)) {
    const remaining = [...state.tabs.keys()];
    state.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1]! : null;
  }

  if (state.tabs.size === 0) {
    state.panelVisible = false;
    if (currentPanelSessionId === sessionId) hidePanel();
  } else if (currentPanelSessionId === sessionId) {
    renderPanel(sessionId);
  }
};

/**
 * Close a specific diff tab by diffId (called when CLI accepts/rejects in terminal).
 * The pending diff is already resolved by mcp-bridge, so just remove the tab UI.
 */
const closeDiffTabByDiffId = (sessionId: string, diffId: string): void => {
  const state = filePanelState.get(sessionId);
  if (!state) return;

  const tabId = `diff:${diffId}`;
  const tab = state.tabs.get(tabId);
  if (!tab) return;

  // Mark as resolved so closeTab doesn't send another IPC response
  if (tab.type === 'diff') {
    tab.resolved = true;
  }

  if (tab.editorView) {
    tab.editorView.destroy();
    tab.editorView = null;
  }

  state.tabs.delete(tabId);

  if (state.activeTabId === tabId) {
    const remaining = [...state.tabs.keys()];
    state.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1]! : null;
  }

  if (state.tabs.size === 0) {
    state.panelVisible = false;
    if (currentPanelSessionId === sessionId) hidePanel();
  } else if (currentPanelSessionId === sessionId) {
    renderPanel(sessionId);
  }
};

// ── Panel Show/Hide ──────────────────────────────────────────────────

const showPanel = (state: FilePanelSessionState): void => {
  if (!filePanelEl || !filePanelResizeHandle) return;
  filePanelEl.classList.add('open');
  filePanelEl.style.width = `${state.panelWidth || DEFAULT_PANEL_WIDTH}px`;
  filePanelResizeHandle.style.display = 'block';
  refitActiveTerminal();
};

const hidePanel = (): void => {
  if (!filePanelEl || !filePanelResizeHandle) return;
  filePanelEl.classList.remove('open');
  filePanelEl.style.width = '0';
  filePanelResizeHandle.style.display = 'none';
  refitActiveTerminal();
};

/**
 * Called when the active session changes. Shows/hides the panel
 * based on the new session's state.
 */
const switchPanel = (sessionId: string | null): void => {
  currentPanelSessionId = sessionId;

  // Destroy any visible editors from previous session
  clearPanelEditors();

  // Update IDE Emulation indicator from file-panel state
  updateMcpIndicator();

  if (!sessionId) {
    hidePanel();
    return;
  }

  const state = getSessionState(sessionId);

  if (state.panelVisible && state.tabs.size > 0) {
    showPanel(state);
    renderPanel(sessionId);
  } else {
    hidePanel();
  }
};

const updateMcpIndicator = (): void => {
  if (!mcpIndicatorEl) return;
  if (!currentPanelSessionId) {
    mcpIndicatorEl.style.display = 'none';
    return;
  }
  const state = filePanelState.get(currentPanelSessionId);
  mcpIndicatorEl.style.display = state?.mcpActive ? '' : 'none';
};

// ── Panel Rendering ──────────────────────────────────────────────────

const renderPanel = (sessionId: string): void => {
  if (!filePanelEl || currentPanelSessionId !== sessionId) return;

  const state = getSessionState(sessionId);

  // Render tab bar
  renderTabBar(sessionId, state);

  // Render active tab content
  const activeTab = state.activeTabId ? state.tabs.get(state.activeTabId) : undefined;
  renderTabContent(sessionId, activeTab ?? null);
};

const renderTabBar = (sessionId: string, state: FilePanelSessionState): void => {
  if (!filePanelHeaderEl) return;
  filePanelHeaderEl.innerHTML = '';

  for (const [tabId, tab] of state.tabs) {
    const tabEl = document.createElement('button');
    tabEl.className = 'file-tab';
    if (tabId === state.activeTabId) tabEl.classList.add('active');
    if (tab.type === 'diff') {
      tabEl.classList.add('is-diff');
      if (tab.resolved) tabEl.classList.add('resolved');
    }

    const labelSpan = document.createElement('span');
    labelSpan.textContent = tab.label;
    tabEl.appendChild(labelSpan);

    const closeBtn = document.createElement('span');
    closeBtn.className = 'file-tab-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      closeTab(sessionId, tabId);
    });
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener('click', () => {
      state.activeTabId = tabId;
      renderPanel(sessionId);
    });

    filePanelHeaderEl.appendChild(tabEl);
  }
};

const renderTabContent = (sessionId: string, tab: TabState | null): void => {
  // Clear previous editor
  clearPanelEditors();

  const toggleBtn = document.getElementById('diff-mode-toggle');

  if (!tab) {
    if (filePanelPathEl) filePanelPathEl.textContent = '';
    if (filePanelActionsEl) filePanelActionsEl.style.display = 'none';
    if (toggleBtn) toggleBtn.style.display = 'none';
    return;
  }

  // Show file path
  if (filePanelPathEl) filePanelPathEl.textContent = tab.filePath || '';

  if (tab.type === 'diff') {
    if (toggleBtn) toggleBtn.style.display = '';
    renderDiffContent(sessionId, tab);
  } else {
    if (toggleBtn) toggleBtn.style.display = 'none';
    renderFileContent(tab);
  }
};

const renderDiffContent = (sessionId: string, tab: DiffTabState): void => {
  if (!filePanelBodyEl || !filePanelActionsEl || !filePanelHeaderEl) return;

  // Create viewer if not already created (or recreated after mode switch)
  if (!tab.editorView) {
    if (diffMode === 'inline') {
      tab.editorView = window.createUnifiedMergeViewer(
        filePanelBodyEl,
        tab.oldContent,
        tab.newContent,
        tab.filePath,
      );
      tab._diffMode = 'inline';
    } else {
      tab.editorView = window.createMergeViewer(
        filePanelBodyEl,
        tab.oldContent,
        tab.newContent,
        tab.filePath,
      );
      tab._diffMode = 'side-by-side';
    }
  } else {
    filePanelBodyEl.appendChild(tab.editorView.dom);
  }

  // Show accept/reject buttons (unless already resolved)
  if (!tab.resolved) {
    filePanelActionsEl.style.display = 'flex';
    filePanelActionsEl.innerHTML = '';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'file-panel-accept-btn';
    acceptBtn.textContent = 'Accept';
    acceptBtn.addEventListener('click', () => {
      handleDiffAction(sessionId, tab, 'accept');
    });

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'file-panel-reject-btn';
    rejectBtn.textContent = 'Reject';
    rejectBtn.addEventListener('click', () => {
      handleDiffAction(sessionId, tab, 'reject');
    });

    filePanelActionsEl.appendChild(acceptBtn);
    filePanelActionsEl.appendChild(rejectBtn);
  } else {
    filePanelActionsEl.style.display = 'none';
  }
};

const renderFileContent = (tab: FileTabState): void => {
  if (!filePanelBodyEl || !filePanelActionsEl) return;
  filePanelActionsEl.style.display = 'none';

  if (!tab.editorView) {
    tab.editorView = window.createReadOnlyViewer(
      filePanelBodyEl,
      tab.content,
      tab.filePath,
    );
  } else {
    filePanelBodyEl.appendChild(tab.editorView.dom);
  }
};

const clearPanelEditors = (): void => {
  if (filePanelBodyEl) {
    filePanelBodyEl.innerHTML = '';
  }
};

// ── Diff Actions ─────────────────────────────────────────────────────

const handleDiffAction = (sessionId: string, tab: DiffTabState, action: DiffAction): void => {
  if (tab.resolved) return;
  tab.resolved = true;

  if (action === 'accept') {
    // Get content from the editor (user may have edited or partially accepted chunks)
    let editedContent: string | null = null;
    if (tab.editorView) {
      if (tab._diffMode === 'inline') {
        // Unified view: content is in the EditorView's doc directly
        editedContent = tab.editorView.state?.doc.toString() ?? null;
      } else {
        // Side-by-side: content is in the right (b) editor
        const mergeView = tab.editorView as CodeMirrorMergeView;
        editedContent = mergeView.b?.state.doc.toString() ?? null;
      }
    }

    // If user edited the content, send accept-edited; otherwise just accept
    if (editedContent && editedContent !== tab.newContent) {
      window.api.mcpDiffResponse(sessionId, tab.diffId, 'accept-edited', editedContent);
    } else {
      window.api.mcpDiffResponse(sessionId, tab.diffId, 'accept', null);
    }
  } else {
    window.api.mcpDiffResponse(sessionId, tab.diffId, 'reject', null);
  }

  // Update tab UI
  if (filePanelHeaderEl) {
    const tabEl = filePanelHeaderEl.querySelector('.file-tab.active');
    if (tabEl) tabEl.classList.add('resolved');
  }
  if (filePanelActionsEl) {
    filePanelActionsEl.style.display = 'none';
  }
};

// ── IDE Emulation Indicator ──────────────────────────────────────────

const addMcpToggle = (): void => {
  const controls = document.getElementById('terminal-header-controls');
  if (!controls) return;

  mcpIndicatorEl = document.createElement('span');
  mcpIndicatorEl.className = 'mcp-toggle enabled';
  mcpIndicatorEl.title = 'IDE Emulation is active. Go to Global Settings to disable.';
  mcpIndicatorEl.textContent = 'IDE Emulation';
  mcpIndicatorEl.style.display = 'none';

  // Insert before the stop button
  const stopBtn = document.getElementById('terminal-stop-btn');
  if (stopBtn) {
    controls.insertBefore(mcpIndicatorEl, stopBtn);
  } else {
    controls.appendChild(mcpIndicatorEl);
  }
};

// ── Resize Handle ────────────────────────────────────────────────────

const setupPanelResizeHandle = (): void => {
  if (!filePanelResizeHandle) return;

  let startX = 0;
  let startWidth = 0;

  const onMouseMove = (e: MouseEvent): void => {
    if (!filePanelEl) return;
    // Panel is on the right, so dragging left increases width
    const delta = startX - e.clientX;
    const newWidth = Math.max(MIN_PANEL_WIDTH, startWidth + delta);
    filePanelEl.style.width = `${newWidth}px`;
  };

  const onMouseUp = (): void => {
    if (filePanelResizeHandle) {
      filePanelResizeHandle.classList.remove('dragging');
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    // Save width globally (persists across sessions and restarts)
    if (filePanelEl) {
      const w = filePanelEl.offsetWidth;
      localStorage.setItem(PANEL_WIDTH_KEY, String(w));
      if (currentPanelSessionId) {
        const state = getSessionState(currentPanelSessionId);
        state.panelWidth = w;
      }
    }

    refitActiveTerminal();
  };

  const onMouseDown = (e: MouseEvent): void => {
    e.preventDefault();
    if (!filePanelEl || !filePanelResizeHandle) return;
    startX = e.clientX;
    startWidth = filePanelEl.offsetWidth;
    filePanelResizeHandle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  filePanelResizeHandle.addEventListener('mousedown', onMouseDown);
};

// ── Terminal Refit ───────────────────────────────────────────────────

const refitActiveTerminal = (): void => {
  // Refit terminal after panel resize — uses openSessions from state
  requestAnimationFrame(() => {
    if (currentPanelSessionId) {
      const entry = openSessions.get(currentPanelSessionId);
      if (entry?.fitAddon) {
        try { entry.fitAddon.fit(); } catch { /* swallow xterm fit errors */ }
      }
    }
  });
};

// ── Exports ──────────────────────────────────────────────────────────

export {
  initFilePanel,
  switchPanel,
  setSessionMcpActive,
  rekeyFilePanelState,
  openFileInPanel,
  openDiffInPanel,
};

export type {
  TabState,
  DiffTabState,
  FileTabState,
  FilePanelSessionState,
  DiffMode,
};
