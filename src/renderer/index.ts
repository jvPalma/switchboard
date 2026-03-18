// Renderer entry point — boot sequence that wires all views together.
// Detects API (Electron vs web shim), initializes views, and binds global events.

import { initWebShim } from './api/web-shim';
import * as state from './state';
import { formatDate } from './utils';
import type { Session, Project, SessionOptions } from '@shared/types';
import type { SidebarCallbacks } from './views/sidebar';
import type { TerminalCallbacks } from './views/terminal';
import type { SettingsCallbacks } from './views/settings';
import type { ChatCallbacks } from './views/chat';

// --- Step 1: Detect and initialize API ---
// In Electron, preload.js has already set window.api.
// In browser mode, the web shim sets it via fetch+WebSocket.
initWebShim();

// --- Step 2: Import views (after API is available) ---
// Using dynamic imports would be cleaner but esbuild IIFE bundling inlines everything.
import { initSidebar, refreshSidebar, loadProjects, renderDefaultStatus } from './views/sidebar';
import {
  initTerminal,
  openSession,
  launchNewSession,
  launchTerminalSession,
  forkSession,
  resolveDefaultSessionOptions,
  pollActiveSessions,
} from './views/terminal';
import { initPlans, loadPlans, renderPlans, hidePlanViewer } from './views/plans';
import { initMemory, loadMemories, renderMemories } from './views/memory';
import { loadStats } from './views/stats';
import { initSettings, openSettingsViewer } from './views/settings';
import { initFilePanel, switchPanel, setSessionMcpActive, rekeyFilePanelState } from './views/file-panel';
import { initJsonl, showJsonlViewer } from './views/jsonl';
import { initChat, showChatView, hideChatView, isChatViewActive, getChatToggle, shouldDefaultToChat } from './views/chat';

// --- Step 3: Wire cross-view callbacks ---

const sidebarCallbacks: SidebarCallbacks = {
  openSession: (session: Session) => {
    // Hide chat if switching sessions
    hideChatView();
    openSession(session).then(() => {
      // Default to chat view for completed sessions (no active PTY)
      if (shouldDefaultToChat(session.sessionId)) {
        showChatView(session.sessionId);
      }
    });
  },
  launchNewSession: (project: Project, options?: SessionOptions) => launchNewSession(project, options),
  launchTerminalSession: (project: { projectPath: string }) => launchTerminalSession(project),
  forkSession: (session: Session, project: Project) => forkSession(session, project),
  openSettingsViewer: (scope: 'global' | 'project', projectPath?: string) => openSettingsViewer(scope, projectPath),
  hidePlanViewer: () => hidePlanViewer(),
  showJsonlViewer: (session: Session) => showJsonlViewer(session),
  resolveDefaultSessionOptions: (project: { projectPath: string }) => resolveDefaultSessionOptions(project),
};

const terminalCallbacks: TerminalCallbacks = {
  refreshSidebar: (opts?: { resort?: boolean }) => refreshSidebar(opts),
  loadProjects: (opts?: { resort?: boolean }) => loadProjects(opts),
  setSessionMcpActive: (sessionId: string, active: boolean) => setSessionMcpActive(sessionId, active),
  rekeyFilePanelState: (oldId: string, newId: string) => rekeyFilePanelState(oldId, newId),
  hidePlanViewer: () => hidePlanViewer(),
  switchPanel: (sessionId: string | null) => switchPanel(sessionId),
};

const chatCallbacks: ChatCallbacks = {
  refreshSidebar: (opts?: { resort?: boolean }) => refreshSidebar(opts),
};

const settingsCallbacks: SettingsCallbacks = {
  refreshSidebar: () => refreshSidebar(),
  loadProjects: () => loadProjects(),
};

// --- Step 4: Initialize all views ---
initPlans();
initMemory();
initJsonl();
initChat(chatCallbacks);
initSettings(settingsCallbacks);
initSidebar(sidebarCallbacks);
initTerminal(terminalCallbacks);
initFilePanel();

// --- Step 4b: Insert chat/terminal toggle into terminal header ---
const terminalHeaderInfo = document.getElementById('terminal-header-info');
if (terminalHeaderInfo) {
  terminalHeaderInfo.appendChild(getChatToggle());
}

// --- Step 5: Tab switching ---
document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = (tab as HTMLElement).dataset['tab']!;
    if (tabName === state.activeTab) return;
    state.setActiveTab(tabName);
    document.querySelectorAll('.sidebar-tab').forEach(t =>
      t.classList.toggle('active', (t as HTMLElement).dataset['tab'] === tabName),
    );

    // Clear search on tab switch
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    const searchBar = document.getElementById('search-bar')!;
    searchInput.value = '';
    searchBar.classList.remove('has-query');
    state.setSearchMatchIds(null);

    // Hide all sidebar content areas
    document.getElementById('sidebar-content')!.style.display = 'none';
    document.getElementById('plans-content')!.style.display = 'none';
    document.getElementById('stats-content')!.style.display = 'none';
    document.getElementById('memory-content')!.style.display = 'none';
    document.getElementById('session-filters')!.style.display = 'none';
    searchBar.style.display = 'none';
    if (isChatViewActive()) hideChatView();

    if (tabName === 'sessions') {
      document.getElementById('session-filters')!.style.display = '';
      searchBar.style.display = '';
      document.getElementById('sidebar-content')!.style.display = '';
      // Restore terminal area if a session is open
      hidePlanViewer();
      if (!state.activeSessionId) {
        document.getElementById('placeholder')!.style.display = '';
      }
      if (state.projectsChangedWhileAway) {
        state.setProjectsChangedWhileAway(false);
        loadProjects();
      }
    } else if (tabName === 'plans') {
      searchBar.style.display = '';
      document.getElementById('plans-content')!.style.display = '';
      loadPlans();
    } else if (tabName === 'stats') {
      document.getElementById('stats-content')!.style.display = '';
      document.getElementById('placeholder')!.style.display = 'none';
      document.getElementById('terminal-area')!.style.display = 'none';
      document.getElementById('plan-viewer')!.style.display = 'none';
      document.getElementById('memory-viewer')!.style.display = 'none';
      document.getElementById('settings-viewer')!.style.display = 'none';
      document.getElementById('stats-viewer')!.style.display = 'flex';
      loadStats();
    } else if (tabName === 'memory') {
      searchBar.style.display = '';
      document.getElementById('memory-content')!.style.display = '';
      loadMemories();
    }
  });
});

// --- Step 6: Global search wiring for plans/memory tabs ---
// (Session search is handled in sidebar.ts; plans/memory need render callbacks)
const searchInput = document.getElementById('search-input') as HTMLInputElement;
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

searchInput.addEventListener('input', () => {
  const searchBar = document.getElementById('search-bar')!;
  searchBar.classList.toggle('has-query', searchInput.value.length > 0);

  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    searchDebounceTimer = null;
    const query = searchInput.value.trim();

    if (!query) return; // clearSearch handled by sidebar

    try {
      if (state.activeTab === 'plans') {
        const results = await window.api.search('plan', query);
        const matchIds = new Set(results.map(r => r.id));
        renderPlans(state.cachedPlans.filter(p => matchIds.has(p.filename)));
      } else if (state.activeTab === 'memory') {
        const results = await window.api.search('memory', query);
        const matchIds = new Set(results.map(r => r.id));
        renderMemories(state.cachedMemories.filter(m => matchIds.has(m.filePath)));
      }
    } catch {
      // Ignore search errors
    }
  }, 200);
});

// --- Step 7: Live-reload sidebar when filesystem changes ---
let projectsChangedTimer: ReturnType<typeof setTimeout> | null = null;
window.api.onProjectsChanged(() => {
  if (projectsChangedTimer) clearTimeout(projectsChangedTimer);
  if (state.activeTab !== 'sessions') {
    state.setProjectsChangedWhileAway(true);
    return;
  }
  projectsChangedTimer = setTimeout(() => {
    projectsChangedTimer = null;
    loadProjects();
  }, 300);
});

// --- Step 8: Status bar ---
let activityTimer: ReturnType<typeof setTimeout> | null = null;
const statusBarActivity = document.getElementById('status-bar-activity')!;

window.api.onStatusUpdate((text, type) => {
  if (activityTimer) clearTimeout(activityTimer);
  statusBarActivity.textContent = text;
  statusBarActivity.className = type === 'done' ? 'status-done' : '';
  if (!text || type === 'done') {
    activityTimer = setTimeout(() => {
      statusBarActivity.textContent = '';
      statusBarActivity.className = '';
    }, type === 'done' ? 3000 : 0);
  }
});

// --- Step 9: Auto-updater ---
const statusBarUpdater = document.getElementById('status-bar-updater')!;
let updaterStatusTimer: ReturnType<typeof setTimeout> | null = null;

const setUpdaterStatus = (text: string, duration?: number): void => {
  if (updaterStatusTimer) clearTimeout(updaterStatusTimer);
  statusBarUpdater.textContent = text;
  if (duration) {
    updaterStatusTimer = setTimeout(() => { statusBarUpdater.textContent = ''; }, duration);
  }
};

window.api.onUpdaterEvent((type, data) => {
  switch (type) {
    case 'checking':
      setUpdaterStatus('Checking for updates\u2026');
      break;
    case 'update-available':
      setUpdaterStatus(`Downloading v${data['version'] as string}\u2026`);
      break;
    case 'update-not-available':
      setUpdaterStatus('Up to date', 3000);
      break;
    case 'download-progress':
      setUpdaterStatus(`Updating\u2026 ${Math.round(data['percent'] as number)}%`);
      break;
    case 'update-downloaded': {
      setUpdaterStatus(`v${data['version'] as string} ready \u2014 restart to update`);
      const dismissed = localStorage.getItem('update-dismissed');
      if (dismissed === (data['version'] as string)) return;
      const toast = document.getElementById('update-toast')!;
      const msg = document.getElementById('update-toast-msg')!;
      msg.innerHTML = `New Version Ready<br><span class="update-version">v${data['version'] as string}</span>`;
      toast.classList.remove('hidden');
      document.getElementById('update-restart-btn')!.onclick = () => window.api.updaterInstall();
      document.getElementById('update-dismiss-btn')!.onclick = () => {
        toast.classList.add('hidden');
        localStorage.setItem('update-dismissed', data['version'] as string);
      };
      break;
    }
    case 'error':
      setUpdaterStatus('Update check failed', 5000);
      break;
  }
});

// --- Step 10: Restore settings and boot ---
(async () => {
  const global = await window.api.getSetting('global');
  if (global) {
    if (global['sidebarWidth']) {
      document.getElementById('sidebar')!.style.width = (global['sidebarWidth'] as number) + 'px';
    }
    if (global['visibleSessionCount']) {
      state.setVisibleSessionCount(global['visibleSessionCount'] as number);
    }
    if (global['sessionMaxAgeDays']) {
      state.setSessionMaxAgeDays(global['sessionMaxAgeDays'] as number);
    }
    if (global['terminalTheme']) {
      state.setTerminalTheme(global['terminalTheme'] as string);
    }
  }
})();

loadProjects().then(() => {
  // Restore active session after reload
  if (state.activeSessionId && !state.openSessions.has(state.activeSessionId)) {
    const session = state.sessionMap.get(state.activeSessionId);
    if (session) openSession(session);
  }
});

// Refresh sidebar timeago labels every 30s
setInterval(() => {
  for (const [sessionId, time] of state.lastActivityTime) {
    const item = document.getElementById('si-' + sessionId);
    if (!item) continue;
    const meta = item.querySelector('.session-meta');
    if (!meta) continue;
    const session = state.sessionMap.get(sessionId);
    const msgSuffix = session?.messageCount ? ' \u00b7 ' + session.messageCount + ' msgs' : '';
    (meta as HTMLElement).textContent = formatDate(time) + msgSuffix;
  }
}, 30000);
