// Sidebar view — filter toggles, search, project/session rendering, popovers, resize.
// Pure vanilla TypeScript; morphdom is accessed via window.morphdom.

import type { Session, Project, SessionOptions } from '@shared/types';
import {
  activeSessionId,
  openSessions,
  cachedProjects,
  cachedAllProjects,
  setCachedProjects,
  setCachedAllProjects,
  activePtyIds,
  setActivePtyIds,
  showArchived,
  showStarredOnly,
  showRunningOnly,
  showTodayOnly,
  setShowArchived,
  setShowStarredOnly,
  setShowRunningOnly,
  setShowTodayOnly,
  sortedOrder,
  setSortedOrder,
  searchMatchIds,
  setSearchMatchIds,
  pendingSessions,
  sessionMap,
  visibleSessionCount,
  sessionMaxAgeDays,
  unreadSessions,
  attentionSessions,
  lastActivityTime,
  sessionProgressState,
  activeTab,
  getExpandedSlugs,
  saveExpandedSlugs,
} from '../state';
import { formatDate, escapeHtml, cleanDisplayName } from '../utils';
import { TERMINAL_THEMES } from '../themes';

// ---------------------------------------------------------------------------
// Callbacks — cross-view interactions injected at init
// ---------------------------------------------------------------------------

export interface SidebarCallbacks {
  openSession: (session: Session) => void;
  launchNewSession: (project: Project, options?: SessionOptions) => void;
  launchTerminalSession: (project: { projectPath: string }) => void;
  forkSession: (session: Session, project: Project) => void;
  openSettingsViewer: (scope: 'global' | 'project', projectPath?: string) => void;
  hidePlanViewer: () => void;
  showJsonlViewer: (session: Session) => void;
  resolveDefaultSessionOptions: (project: { projectPath: string }) => Promise<SessionOptions>;
}

let callbacks: SidebarCallbacks;

// ---------------------------------------------------------------------------
// Cached DOM references (resolved once in initSidebar)
// ---------------------------------------------------------------------------

let sidebarContent: HTMLElement;
let searchInput: HTMLInputElement;
let searchBar: HTMLElement;
let searchClear: HTMLElement;
let archiveToggle: HTMLElement;
let starToggle: HTMLElement;
let runningToggle: HTMLElement;
let todayToggle: HTMLElement;
let resortBtn: HTMLElement;
let loadingStatus: HTMLElement;
let addProjectBtn: HTMLElement;
let globalSettingsBtn: HTMLElement;
let statusBarInfo: HTMLElement;

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const el = (id: string): HTMLElement => document.getElementById(id)!;

const slugId = (slug: string): string =>
  'slug-' + slug.replace(/[^a-zA-Z0-9_-]/g, '_');

const folderId = (projectPath: string): string =>
  'project-' + projectPath.replace(/[^a-zA-Z0-9_-]/g, '_');

// ---------------------------------------------------------------------------
// dedup — reconcile session objects so all caches share identity
// ---------------------------------------------------------------------------

const dedup = (projects: Project[]): void => {
  for (const p of projects) {
    for (let i = 0; i < p.sessions.length; i++) {
      const s = p.sessions[i]!;
      if (sessionMap.has(s.sessionId)) {
        Object.assign(sessionMap.get(s.sessionId)!, s);
        p.sessions[i] = sessionMap.get(s.sessionId)!;
      } else {
        sessionMap.set(s.sessionId, s);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// buildSessionItem — single session DOM node
// ---------------------------------------------------------------------------

const buildSessionItem = (session: Session): HTMLElement => {
  const item = document.createElement('div');
  item.className = 'session-item';
  item.id = 'si-' + session.sessionId;
  if ((session as Session & { type?: string }).type === 'terminal') item.classList.add('is-terminal');
  if (session.archived) item.classList.add('archived-item');
  if (activePtyIds.has(session.sessionId)) item.classList.add('has-running-pty');
  if (unreadSessions.has(session.sessionId)) item.classList.add('has-unread');
  if (attentionSessions.has(session.sessionId)) item.classList.add('needs-attention');
  const progressInfo = sessionProgressState.get(session.sessionId);
  if (progressInfo) {
    if (progressInfo.state === 3) item.classList.add('is-busy');
    if (progressInfo.state === 1) item.classList.add('has-progress');
    if (progressInfo.state === 2) item.classList.add('has-error');
  }
  item.dataset.sessionId = session.sessionId;

  const modified = lastActivityTime.get(session.sessionId) || new Date(session.modified!);
  const timeStr = formatDate(modified);
  const displayName = cleanDisplayName(session.name || session.summary);

  const row = document.createElement('div');
  row.className = 'session-row';

  // Pin
  const pin = document.createElement('span');
  pin.className = 'session-pin' + (session.starred ? ' pinned' : '');
  pin.innerHTML = session.starred
    ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707c-.28-.28-.576-.49-.888-.656L10.073 9.333l-.07 3.181a.5.5 0 0 1-.853.354l-3.535-3.536-4.243 4.243a.5.5 0 1 1-.707-.707l4.243-4.243L1.372 5.11a.5.5 0 0 1 .354-.854l3.18-.07L8.37 .722A3.37 3.37 0 0 1 9.12.074a.5.5 0 0 1 .708.002l-.707.707z"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707c-.28-.28-.576-.49-.888-.656L10.073 9.333l-.07 3.181a.5.5 0 0 1-.853.354l-3.535-3.536-4.243 4.243a.5.5 0 1 1-.707-.707l4.243-4.243L1.372 5.11a.5.5 0 0 1 .354-.854l3.18-.07L8.37 .722A3.37 3.37 0 0 1 9.12.074a.5.5 0 0 1 .708.002l-.707.707z"/></svg>';

  // Running status dot
  const dot = document.createElement('span');
  dot.className = 'session-status-dot' + (activePtyIds.has(session.sessionId) ? ' running' : '');

  // Info block
  const info = document.createElement('div');
  info.className = 'session-info';

  const summaryEl = document.createElement('div');
  summaryEl.className = 'session-summary';
  summaryEl.textContent = displayName;

  const idEl = document.createElement('div');
  idEl.className = 'session-id';
  idEl.textContent = session.sessionId;

  const metaEl = document.createElement('div');
  metaEl.className = 'session-meta';
  metaEl.textContent = timeStr + (session.messageCount ? ' \u00b7 ' + session.messageCount + ' msgs' : '');

  if ((session as Session & { type?: string }).type === 'terminal') {
    const badge = document.createElement('span');
    badge.className = 'terminal-badge';
    badge.textContent = '>_';
    summaryEl.prepend(badge);
  }
  info.appendChild(summaryEl);
  info.appendChild(idEl);
  info.appendChild(metaEl);

  // Action buttons container
  const actions = document.createElement('div');
  actions.className = 'session-actions';

  const stopBtn = document.createElement('button');
  stopBtn.className = 'session-stop-btn';
  stopBtn.title = 'Stop session';
  stopBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1"/></svg>';

  const archiveBtn = document.createElement('button');
  archiveBtn.className = 'session-archive-btn';
  archiveBtn.title = session.archived ? 'Unarchive' : 'Archive';
  archiveBtn.innerHTML = session.archived
    ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4,7 6,5 8,7"/><line x1="6" y1="5" x2="6" y2="10"/><path d="M1,4 L1,11 L11,11 L11,4"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1,1 L11,1 L11,4 L1,4 Z"/><path d="M1,4 L1,11 L11,11 L11,4"/><line x1="5" y1="6.5" x2="7" y2="6.5"/></svg>';

  const forkBtn = document.createElement('button');
  forkBtn.className = 'session-fork-btn';
  forkBtn.title = 'Fork session';
  forkBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="2.5" r="1.5"/><circle cx="3" cy="9.5" r="1.5"/><circle cx="9" cy="9.5" r="1.5"/><line x1="6" y1="4" x2="6" y2="6"/><line x1="6" y1="6" x2="3" y2="8"/><line x1="6" y1="6" x2="9" y2="8"/></svg>';

  const jsonlBtn = document.createElement('button');
  jsonlBtn.className = 'session-jsonl-btn';
  jsonlBtn.title = 'View messages';
  jsonlBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h8M2 6h6M2 9h4"/></svg>';

  actions.appendChild(stopBtn);
  actions.appendChild(forkBtn);
  actions.appendChild(jsonlBtn);
  actions.appendChild(archiveBtn);

  row.appendChild(pin);
  row.appendChild(dot);
  row.appendChild(info);
  row.appendChild(actions);
  item.appendChild(row);

  return item;
};

// ---------------------------------------------------------------------------
// buildSlugGroup — grouped sessions sharing a slug
// ---------------------------------------------------------------------------

const buildSlugGroup = (slug: string, sessions: Session[]): HTMLElement => {
  const group = document.createElement('div');
  const id = slugId(slug);
  const expanded = getExpandedSlugs().has(id);
  group.className = expanded ? 'slug-group' : 'slug-group collapsed';
  group.id = id;

  const mostRecent = sessions.reduce((a, b) => {
    const aTime = lastActivityTime.get(a.sessionId) || new Date(a.modified!);
    const bTime = lastActivityTime.get(b.sessionId) || new Date(b.modified!);
    return bTime > aTime ? b : a;
  });
  const displayName = cleanDisplayName(mostRecent.name || mostRecent.summary || slug);
  const mostRecentTime = lastActivityTime.get(mostRecent.sessionId) || new Date(mostRecent.modified!);
  const timeStr = formatDate(mostRecentTime);

  const header = document.createElement('div');
  header.className = 'slug-group-header';

  const row = document.createElement('div');
  row.className = 'slug-group-row';

  const expand = document.createElement('span');
  expand.className = 'slug-group-expand';
  expand.innerHTML = '<span class="arrow">&#9654;</span>';

  const info = document.createElement('div');
  info.className = 'slug-group-info';

  const nameEl = document.createElement('div');
  nameEl.className = 'slug-group-name';
  nameEl.textContent = displayName;

  const hasRunning = sessions.some(s => activePtyIds.has(s.sessionId));

  const meta = document.createElement('div');
  meta.className = 'slug-group-meta';
  meta.innerHTML = `<span class="slug-group-dot${hasRunning ? ' running' : ''}"></span><span class="slug-group-count">${sessions.length} sessions</span> ${escapeHtml(timeStr)}`;

  const archiveSlugBtn = document.createElement('button');
  archiveSlugBtn.className = 'slug-group-archive-btn';
  archiveSlugBtn.title = 'Archive all sessions in group';
  archiveSlugBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1,1 L11,1 L11,4 L1,4 Z"/><path d="M1,4 L1,11 L11,11 L11,4"/><line x1="5" y1="6.5" x2="7" y2="6.5"/></svg>';

  info.appendChild(nameEl);
  info.appendChild(meta);
  row.appendChild(expand);
  row.appendChild(info);
  row.appendChild(archiveSlugBtn);
  header.appendChild(row);

  const sessionsContainer = document.createElement('div');
  sessionsContainer.className = 'slug-group-sessions';

  const promoted: Session[] = [];
  const rest: Session[] = [];
  for (const session of sessions) {
    if (activePtyIds.has(session.sessionId)) {
      promoted.push(session);
    } else {
      rest.push(session);
    }
  }

  if (promoted.length > 0) {
    group.classList.add('has-promoted');
    for (const session of promoted) {
      sessionsContainer.appendChild(buildSessionItem(session));
    }
    if (rest.length > 0) {
      const moreBtn = document.createElement('div');
      moreBtn.className = 'slug-group-more';
      moreBtn.id = 'sgm-' + id;
      moreBtn.textContent = `+ ${rest.length} more`;

      const olderDiv = document.createElement('div');
      olderDiv.className = 'slug-group-older';
      olderDiv.id = 'sgo-' + id;
      for (const session of rest) {
        olderDiv.appendChild(buildSessionItem(session));
      }

      sessionsContainer.appendChild(moreBtn);
      sessionsContainer.appendChild(olderDiv);
    }
  } else {
    for (const session of sessions) {
      sessionsContainer.appendChild(buildSessionItem(session));
    }
  }

  group.appendChild(header);
  group.appendChild(sessionsContainer);
  return group;
};

// ---------------------------------------------------------------------------
// startRename — inline rename on double-click
// ---------------------------------------------------------------------------

const startRename = (summaryEl: HTMLElement, session: Session): void => {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'session-rename-input';
  input.value = session.name || session.summary || '';

  summaryEl.replaceWith(input);
  input.focus();
  input.select();

  const save = async (): Promise<void> => {
    const newName = input.value.trim();
    const nameToSave = (newName && newName !== session.summary) ? newName : null;
    await window.api.renameSession(session.sessionId, nameToSave);
    session.name = nameToSave;

    const newSummary = document.createElement('div');
    newSummary.className = 'session-summary';
    newSummary.textContent = nameToSave || session.summary || '';
    newSummary.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(newSummary, session);
    });
    input.replaceWith(newSummary);
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.removeEventListener('blur', save);
      const restored = document.createElement('div');
      restored.className = 'session-summary';
      restored.textContent = session.name || session.summary || '';
      restored.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        startRename(restored, session);
      });
      input.replaceWith(restored);
    }
  });
};

// ---------------------------------------------------------------------------
// pollActiveSessions
// ---------------------------------------------------------------------------

const pollActiveSessions = async (): Promise<void> => {
  try {
    const ids = await window.api.getActiveSessions();
    setActivePtyIds(new Set(ids));
    updateRunningIndicators();
  } catch {
    // ignore polling errors
  }
};

const updateRunningIndicators = (): void => {
  document.querySelectorAll('.session-item').forEach(item => {
    const htmlItem = item as HTMLElement;
    const id = htmlItem.dataset.sessionId;
    if (!id) return;
    const running = activePtyIds.has(id);
    htmlItem.classList.toggle('has-running-pty', running);
    if (!running) {
      htmlItem.classList.remove('has-unread', 'needs-attention', 'is-busy', 'has-progress', 'has-error');
      unreadSessions.delete(id);
      attentionSessions.delete(id);
      sessionProgressState.delete(id);
    }
    const dot = htmlItem.querySelector('.session-status-dot');
    if (dot) dot.classList.toggle('running', running);
  });
  // Update slug group running dots
  document.querySelectorAll('.slug-group').forEach(group => {
    const hasRunning = group.querySelector('.session-item.has-running-pty') !== null;
    const dot = group.querySelector('.slug-group-dot');
    if (dot) dot.classList.toggle('running', hasRunning);
  });
};

// ---------------------------------------------------------------------------
// rebindSidebarEvents — attach click handlers after morphdom patch
// ---------------------------------------------------------------------------

const rebindSidebarEvents = (projects: Project[]): void => {
  for (const project of projects) {
    const fId = folderId(project.projectPath);
    const header = document.getElementById('ph-' + fId);
    if (!header) continue;

    const newBtn = header.querySelector('.project-new-btn') as HTMLElement | null;
    if (newBtn) {
      newBtn.onclick = (e) => { e.stopPropagation(); showNewSessionPopover(project, newBtn); };
    }

    const settingsBtn = header.querySelector('.project-settings-btn') as HTMLElement | null;
    if (settingsBtn) {
      settingsBtn.onclick = (e) => { e.stopPropagation(); callbacks.openSettingsViewer('project', project.projectPath); };
    }

    const archiveGroupBtn = header.querySelector('.project-archive-btn') as HTMLElement | null;
    if (archiveGroupBtn) {
      archiveGroupBtn.onclick = async (e) => {
        e.stopPropagation();
        const sessions = project.sessions.filter(s => !s.archived);
        if (sessions.length === 0) return;
        const shortName = project.projectPath.split('/').filter(Boolean).slice(-2).join('/');
        if (!confirm(`Archive all ${sessions.length} session${sessions.length > 1 ? 's' : ''} in ${shortName}?`)) return;
        for (const s of sessions) {
          if (activePtyIds.has(s.sessionId)) {
            await window.api.stopSession(s.sessionId);
          }
          await window.api.archiveSession(s.sessionId, 1);
          s.archived = 1;
        }
        pollActiveSessions();
        loadProjects();
      };
    }

    header.onclick = (e) => {
      if ((e.target as HTMLElement).closest('.project-new-btn') ||
          (e.target as HTMLElement).closest('.project-archive-btn') ||
          (e.target as HTMLElement).closest('.project-settings-btn')) return;
      header.classList.toggle('collapsed');
    };
  }

  sidebarContent.querySelectorAll('.slug-group-header').forEach(headerNode => {
    const header = headerNode as HTMLElement;
    const archiveBtn = header.querySelector('.slug-group-archive-btn') as HTMLElement | null;
    if (archiveBtn) {
      archiveBtn.onclick = async (e) => {
        e.stopPropagation();
        const group = header.parentElement!;
        const sessionItems = group.querySelectorAll('.session-item');
        for (const item of sessionItems) {
          const sid = (item as HTMLElement).dataset.sessionId;
          if (!sid) continue;
          const session = sessionMap.get(sid);
          if (!session || session.archived) continue;
          if (activePtyIds.has(sid)) await window.api.stopSession(sid);
          await window.api.archiveSession(sid, 1);
          session.archived = 1;
        }
        pollActiveSessions();
        loadProjects();
      };
    }
    header.onclick = (e) => {
      if ((e.target as HTMLElement).closest('.slug-group-archive-btn')) return;
      header.parentElement!.classList.toggle('collapsed');
      saveExpandedSlugs();
    };
  });

  sidebarContent.querySelectorAll('.slug-group-more').forEach(moreBtnNode => {
    const moreBtn = moreBtnNode as HTMLElement;
    moreBtn.onclick = () => {
      const group = moreBtn.closest('.slug-group');
      if (group) {
        group.classList.remove('collapsed');
        saveExpandedSlugs();
      }
    };
  });

  sidebarContent.querySelectorAll('.sessions-more-toggle').forEach(moreBtnNode => {
    const moreBtn = moreBtnNode as HTMLElement;
    const olderList = moreBtn.nextElementSibling as HTMLElement | null;
    if (!olderList || !olderList.classList.contains('sessions-older')) return;
    const count = olderList.children.length;
    moreBtn.onclick = () => {
      const showing = olderList.style.display !== 'none';
      olderList.style.display = showing ? 'none' : '';
      moreBtn.classList.toggle('expanded', !showing);
      moreBtn.textContent = showing ? `+ ${count} older` : '- hide older';
    };
  });

  sidebarContent.querySelectorAll('.session-item').forEach(itemNode => {
    const item = itemNode as HTMLElement;
    const sessionId = item.dataset.sessionId;
    if (!sessionId) return;
    const session = sessionMap.get(sessionId);
    if (!session) return;

    item.onclick = () => callbacks.openSession(session);

    const pin = item.querySelector('.session-pin') as HTMLElement | null;
    if (pin) {
      pin.onclick = async (e) => {
        e.stopPropagation();
        const { starred } = await window.api.toggleStar(session.sessionId);
        session.starred = starred;
        refreshSidebar({ resort: true });
      };
    }

    const summaryEl = item.querySelector('.session-summary') as HTMLElement | null;
    if (summaryEl) {
      summaryEl.ondblclick = (e) => { e.stopPropagation(); startRename(summaryEl, session); };
    }

    const stopBtn = item.querySelector('.session-stop-btn') as HTMLElement | null;
    if (stopBtn) {
      stopBtn.onclick = async (e) => {
        e.stopPropagation();
        await window.api.stopSession(session.sessionId);
        activePtyIds.delete(session.sessionId);
        if (activeSessionId === session.sessionId) {
          // Clearing active session is handled by the callback host
        }
        refreshSidebar();
      };
    }

    const forkBtn = item.querySelector('.session-fork-btn') as HTMLElement | null;
    if (forkBtn) {
      forkBtn.onclick = async (e) => {
        e.stopPropagation();
        const project = [...cachedAllProjects, ...cachedProjects].find(p =>
          p.sessions.some(s => s.sessionId === session.sessionId),
        );
        if (project) {
          callbacks.forkSession(session, project);
        }
      };
    }

    const jsonlBtn = item.querySelector('.session-jsonl-btn') as HTMLElement | null;
    if (jsonlBtn) {
      jsonlBtn.onclick = (e) => {
        e.stopPropagation();
        callbacks.showJsonlViewer(session);
      };
    }

    const archiveBtn = item.querySelector('.session-archive-btn') as HTMLElement | null;
    if (archiveBtn) {
      archiveBtn.onclick = async (e) => {
        e.stopPropagation();
        const newVal = session.archived ? 0 : 1;
        if (newVal && activePtyIds.has(session.sessionId)) {
          await window.api.stopSession(session.sessionId);
          pollActiveSessions();
        }
        await window.api.archiveSession(session.sessionId, newVal);
        session.archived = newVal;
        loadProjects();
      };
    }
  });
};

// ---------------------------------------------------------------------------
// renderProjects — build sidebar DOM and morphdom-patch
// ---------------------------------------------------------------------------

interface RenderItem {
  sortTime: number;
  pinned: boolean;
  running: boolean;
  element: HTMLElement;
}

const renderProjects = (projects: Project[], resort: boolean): void => {
  const newSidebar = document.createElement('div');

  // Sort project groups using sortedOrder as source of truth
  let ordered = projects;
  if (!resort && sortedOrder.length > 0) {
    const orderIndex = new Map(sortedOrder.map((e, i) => [e.projectPath, i]));
    ordered = [...projects].sort((a, b) => {
      const aPos = orderIndex.get(a.projectPath);
      const bPos = orderIndex.get(b.projectPath);
      if (aPos !== undefined && bPos !== undefined) return aPos - bPos;
      if (aPos === undefined && bPos !== undefined) return -1;
      if (aPos !== undefined && bPos === undefined) return 1;
      return 0;
    });
  }

  const newSortedOrder: Array<{ projectPath: string; itemIds: string[] }> = [];

  for (const project of ordered) {
    // === STEP 1: Filter ===
    let filtered = project.sessions;
    if (showStarredOnly) {
      filtered = filtered.filter(s => s.starred);
    }
    if (showRunningOnly) {
      filtered = filtered.filter(s => activePtyIds.has(s.sessionId));
    }
    if (showTodayOnly) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      filtered = filtered.filter(s => {
        if (!s.modified) return false;
        const d = new Date(s.modified);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
      });
    }
    if (filtered.length === 0 && project.sessions.length > 0) continue;
    const fId = folderId(project.projectPath);

    // === STEP 2: Sort ===
    filtered = [...filtered].sort((a, b) => {
      const aRunning = activePtyIds.has(a.sessionId) || pendingSessions.has(a.sessionId);
      const bRunning = activePtyIds.has(b.sessionId) || pendingSessions.has(b.sessionId);
      const aPri = (a.starred && aRunning ? 3 : aRunning ? 2 : a.starred ? 1 : 0);
      const bPri = (b.starred && bRunning ? 3 : bRunning ? 2 : b.starred ? 1 : 0);
      if (aPri !== bPri) return bPri - aPri;
      return new Date(b.modified!).getTime() - new Date(a.modified!).getTime();
    });

    // === STEP 3: Slug grouping ===
    const slugMap = new Map<string, Session[]>();
    const ungrouped: Session[] = [];
    for (const session of filtered) {
      if (session.slug) {
        if (!slugMap.has(session.slug)) slugMap.set(session.slug, []);
        slugMap.get(session.slug)!.push(session);
      } else {
        ungrouped.push(session);
      }
    }

    // Build render items (slug group = 1 item)
    const allItems: RenderItem[] = [];
    for (const session of ungrouped) {
      const isRunning = activePtyIds.has(session.sessionId) || pendingSessions.has(session.sessionId);
      allItems.push({
        sortTime: new Date(session.modified!).getTime(),
        pinned: !!session.starred,
        running: isRunning,
        element: buildSessionItem(session),
      });
    }
    for (const [slug, slugSessions] of slugMap) {
      const mostRecentTime = Math.max(...slugSessions.map(s => new Date(s.modified!).getTime()));
      const hasRunning = slugSessions.some(s => activePtyIds.has(s.sessionId) || pendingSessions.has(s.sessionId));
      const hasPinned = slugSessions.some(s => !!s.starred);
      const element = slugSessions.length === 1 ? buildSessionItem(slugSessions[0]!) : buildSlugGroup(slug, slugSessions);
      allItems.push({
        sortTime: mostRecentTime,
        pinned: hasPinned,
        running: hasRunning,
        element,
      });
    }

    // === STEP 4: Sort render items ===
    const prevEntry = sortedOrder.find(e => e.projectPath === project.projectPath);
    if (resort || !prevEntry) {
      allItems.sort((a, b) => {
        const aPri = (a.pinned && a.running ? 3 : a.running ? 2 : a.pinned ? 1 : 0);
        const bPri = (b.pinned && b.running ? 3 : b.running ? 2 : b.pinned ? 1 : 0);
        if (aPri !== bPri) return bPri - aPri;
        return b.sortTime - a.sortTime;
      });
    } else {
      const orderIndex = new Map(prevEntry.itemIds.map((id, i) => [id, i]));
      allItems.sort((a, b) => {
        const aPos = orderIndex.get(a.element.id);
        const bPos = orderIndex.get(b.element.id);
        if (aPos !== undefined && bPos !== undefined) return aPos - bPos;
        if (aPos === undefined && bPos !== undefined) return -1;
        if (aPos !== undefined && bPos === undefined) return 1;
        return b.sortTime - a.sortTime;
      });
    }
    newSortedOrder.push({ projectPath: project.projectPath, itemIds: allItems.map(item => item.element.id) });

    // === STEP 5: Truncate — split into visible vs older ===
    let visible: RenderItem[] = [];
    let older: RenderItem[] = [];
    if (searchMatchIds !== null || showStarredOnly || showRunningOnly || showTodayOnly) {
      visible = allItems;
    } else {
      let count = 0;
      const ageCutoff = Date.now() - sessionMaxAgeDays * 86400000;
      for (const item of allItems) {
        if (item.running || item.pinned || (count < visibleSessionCount && item.sortTime >= ageCutoff)) {
          visible.push(item);
          count++;
        } else {
          older.push(item);
        }
      }
      if (visible.length === 0 && older.length > 0) {
        visible = older;
        older = [];
      }
    }

    // === STEP 6: Build DOM ===
    const group = document.createElement('div');
    group.className = 'project-group';
    group.id = fId;

    const header = document.createElement('div');
    header.className = 'project-header';
    header.id = 'ph-' + fId;
    const shortName = project.projectPath.split('/').filter(Boolean).slice(-2).join('/');
    header.innerHTML = `<span class="arrow">&#9660;</span> <span class="project-name">${shortName}</span>`;

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'project-settings-btn';
    settingsBtn.title = 'Project settings';
    settingsBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.6 1h2.8l.4 2.1a5.5 5.5 0 0 1 1.3.8l2-.8 1.4 2.4-1.6 1.4a5.6 5.6 0 0 1 0 1.5l1.6 1.4-1.4 2.4-2-.8a5.5 5.5 0 0 1-1.3.8L9.4 15H6.6l-.4-2.1a5.5 5.5 0 0 1-1.3-.8l-2 .8-1.4-2.4 1.6-1.4a5.6 5.6 0 0 1 0-1.5L1.5 6.2l1.4-2.4 2 .8a5.5 5.5 0 0 1 1.3-.8L6.6 1z"/><circle cx="8" cy="8" r="2.5"/></svg>';
    header.appendChild(settingsBtn);

    const archiveGroupBtn = document.createElement('button');
    archiveGroupBtn.className = 'project-archive-btn';
    archiveGroupBtn.title = 'Archive all sessions';
    archiveGroupBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1,1 L11,1 L11,4 L1,4 Z"/><path d="M1,4 L1,11 L11,11 L11,4"/><line x1="5" y1="6.5" x2="7" y2="6.5"/></svg>';
    header.appendChild(archiveGroupBtn);

    const newBtn = document.createElement('button');
    newBtn.className = 'project-new-btn';
    newBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>';
    newBtn.title = 'New session';
    header.appendChild(newBtn);

    const sessionsList = document.createElement('div');
    sessionsList.className = 'project-sessions';
    sessionsList.id = 'sessions-' + fId;

    for (const item of visible) {
      sessionsList.appendChild(item.element);
    }

    if (older.length > 0) {
      const moreBtn = document.createElement('div');
      moreBtn.className = 'sessions-more-toggle';
      moreBtn.id = 'older-' + fId;
      moreBtn.textContent = `+ ${older.length} older`;
      const olderList = document.createElement('div');
      olderList.className = 'sessions-older';
      olderList.id = 'older-list-' + fId;
      olderList.style.display = 'none';
      for (const item of older) {
        olderList.appendChild(item.element);
      }
      sessionsList.appendChild(moreBtn);
      sessionsList.appendChild(olderList);
    }

    // Auto-collapse if most recent session is older than sessionMaxAgeDays
    if (searchMatchIds === null && !showStarredOnly && !showRunningOnly) {
      const mostRecent = filtered[0]?.modified;
      if (mostRecent && (Date.now() - new Date(mostRecent).getTime()) > sessionMaxAgeDays * 86400000) {
        header.classList.add('collapsed');
      }
    }

    group.appendChild(header);
    group.appendChild(sessionsList);
    newSidebar.appendChild(group);
  }

  // Re-apply active state
  if (activeSessionId) {
    const activeItem = newSidebar.querySelector(`[data-session-id="${activeSessionId}"]`);
    if (activeItem) activeItem.classList.add('active');
  }

  window.morphdom(sidebarContent, newSidebar, {
    childrenOnly: true,
    onBeforeElUpdated(fromEl: HTMLElement, toEl: HTMLElement) {
      if (fromEl.classList.contains('project-header')) {
        if (fromEl.classList.contains('collapsed')) {
          toEl.classList.add('collapsed');
        } else {
          toEl.classList.remove('collapsed');
        }
      }
      if (fromEl.classList.contains('slug-group')) {
        if (fromEl.classList.contains('collapsed')) {
          toEl.classList.add('collapsed');
        } else {
          toEl.classList.remove('collapsed');
        }
      }
      if (fromEl.classList.contains('sessions-older') && fromEl.style.display !== 'none') {
        toEl.style.display = '';
      }
      if (fromEl.classList.contains('sessions-more-toggle') && fromEl.classList.contains('expanded')) {
        toEl.classList.add('expanded');
        toEl.textContent = '- hide older';
      }
      if (fromEl.classList.contains('slug-group-older') && (fromEl as HTMLElement).style.display !== 'none') {
        (toEl as HTMLElement).style.display = '';
      }
      if (fromEl.classList.contains('slug-group-more') && fromEl.classList.contains('expanded')) {
        toEl.classList.add('expanded');
      }
      return true;
    },
    getNodeKey(node: HTMLElement) {
      return node.id || undefined;
    },
  });

  // Save the full sorted order as source of truth
  setSortedOrder(newSortedOrder);

  rebindSidebarEvents(projects);

  // Restore terminal focus after morphdom DOM updates, but not if user is typing in search
  if (activeSessionId && openSessions.has(activeSessionId) && document.activeElement !== searchInput) {
    openSessions.get(activeSessionId)!.terminal.focus();
  }
};

// ---------------------------------------------------------------------------
// refreshSidebar — single entry point for all sidebar renders
// ---------------------------------------------------------------------------

export const refreshSidebar = ({ resort = false } = {}): void => {
  // When searching, always use all projects (search ignores archive filter)
  let projects: Project[] = (searchMatchIds !== null)
    ? cachedAllProjects
    : (showArchived ? cachedAllProjects : cachedProjects);

  if (searchMatchIds !== null) {
    projects = projects.map(p => ({
      ...p,
      sessions: p.sessions.filter(s => searchMatchIds!.has(s.sessionId)),
    })).filter(p => p.sessions.length > 0);
  }

  renderProjects(projects, resort);
};

// ---------------------------------------------------------------------------
// clearSearch
// ---------------------------------------------------------------------------

const clearSearch = (): void => {
  searchInput.value = '';
  searchBar.classList.remove('has-query');
  if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
  if (activeTab === 'sessions') {
    setSearchMatchIds(null);
    refreshSidebar({ resort: true });
  }
  // Plans and memory search clearing is handled by those respective views
};

// ---------------------------------------------------------------------------
// showNewSessionPopover
// ---------------------------------------------------------------------------

const showNewSessionPopover = (project: Project, anchorEl: HTMLElement): void => {
  // Remove any existing popover
  document.querySelectorAll('.new-session-popover').forEach(popEl => popEl.remove());

  const popover = document.createElement('div');
  popover.className = 'new-session-popover';

  const claudeBtn = document.createElement('button');
  claudeBtn.className = 'popover-option';
  claudeBtn.innerHTML = '<img src="https://claude.ai/favicon.ico" class="popover-option-icon claude-icon" alt=""> Claude';
  claudeBtn.onclick = async () => {
    popover.remove();
    callbacks.launchNewSession(project, await callbacks.resolveDefaultSessionOptions(project));
  };

  const claudeOptsBtn = document.createElement('button');
  claudeOptsBtn.className = 'popover-option';
  claudeOptsBtn.innerHTML = '<img src="https://claude.ai/favicon.ico" class="popover-option-icon claude-icon" alt=""> Claude (Configure...)';
  claudeOptsBtn.onclick = () => { popover.remove(); showNewSessionDialog(project); };

  const termBtn = document.createElement('button');
  termBtn.className = 'popover-option popover-option-terminal';
  termBtn.innerHTML = '<span class="popover-option-icon terminal-icon">&gt;_</span> Terminal';
  termBtn.onclick = () => { popover.remove(); callbacks.launchTerminalSession(project); };

  popover.appendChild(claudeBtn);
  popover.appendChild(claudeOptsBtn);
  popover.appendChild(termBtn);

  // Position relative to anchor, flip upward if it would overflow
  document.body.appendChild(popover);
  const rect = anchorEl.getBoundingClientRect();
  const popoverHeight = popover.offsetHeight;
  if (rect.bottom + 4 + popoverHeight > window.innerHeight) {
    popover.style.top = (rect.top - popoverHeight - 4) + 'px';
  } else {
    popover.style.top = (rect.bottom + 4) + 'px';
  }
  popover.style.left = rect.left + 'px';

  // Close on click outside
  const onClickOutside = (e: MouseEvent): void => {
    if (!popover.contains(e.target as Node) && e.target !== anchorEl) {
      popover.remove();
      document.removeEventListener('mousedown', onClickOutside);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', onClickOutside), 0);
};

// ---------------------------------------------------------------------------
// showNewSessionDialog
// ---------------------------------------------------------------------------

const showNewSessionDialog = async (project: Project): Promise<void> => {
  const effective = await window.api.getEffectiveSettings(project.projectPath);

  const overlay = document.createElement('div');
  overlay.className = 'new-session-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'new-session-dialog';

  let selectedMode = effective.permissionMode || null;
  let dangerousSkip = effective.dangerouslySkipPermissions || false;

  const modes = [
    { value: null as string | null, label: 'Default', desc: 'Prompt for all actions' },
    { value: 'acceptEdits', label: 'Accept Edits', desc: 'Auto-accept file edits, prompt for others' },
    { value: 'plan', label: 'Plan Mode', desc: 'Read-only exploration, no writes' },
    { value: 'dontAsk', label: "Don't Ask", desc: 'Auto-deny tools not explicitly allowed' },
    { value: 'bypassPermissions', label: 'Bypass', desc: 'Auto-accept all tool calls' },
  ];

  const renderModeGrid = (): string => {
    return modes.map(m => {
      const isSelected = !dangerousSkip && selectedMode === m.value;
      return `<button class="permission-option${isSelected ? ' selected' : ''}" data-mode="${m.value}"><span class="perm-name">${m.label}</span><span class="perm-desc">${m.desc}</span></button>`;
    }).join('') +
    `<button class="permission-option dangerous${dangerousSkip ? ' selected' : ''}" data-mode="dangerous-skip"><span class="perm-name">Dangerous Skip</span><span class="perm-desc">Skip all safety prompts (use with caution)</span></button>`;
  };

  dialog.innerHTML = `
    <h3>New Session — ${escapeHtml(project.projectPath.split('/').filter(Boolean).slice(-2).join('/'))}</h3>
    <div class="settings-field">
      <div class="settings-label">Permission Mode</div>
      <div class="permission-grid" id="nsd-mode-grid">${renderModeGrid()}</div>
    </div>
    <div class="settings-field">
      <div class="settings-checkbox-row">
        <input type="checkbox" id="nsd-worktree" ${effective.worktree ? 'checked' : ''}>
        <label for="nsd-worktree">Worktree</label>
        <input type="text" class="settings-input" id="nsd-worktree-name" placeholder="name (optional)" value="${escapeHtml(effective.worktreeName || '')}" style="width:160px;margin-left:8px;">
      </div>
    </div>
    <div class="settings-field">
      <div class="settings-checkbox-row">
        <input type="checkbox" id="nsd-chrome" ${effective.chrome ? 'checked' : ''}>
        <label for="nsd-chrome">Chrome</label>
      </div>
    </div>
    <div class="settings-field">
      <div class="settings-label">Pre-launch Command</div>
      <input type="text" class="settings-input" id="nsd-pre-launch" placeholder="e.g. aws-vault exec profile --" value="${escapeHtml(effective.preLaunchCmd || '')}">
    </div>
    <div class="settings-field">
      <div class="settings-label">Add Directories (comma-separated)</div>
      <input type="text" class="settings-input" id="nsd-add-dirs" placeholder="/path/to/dir1, /path/to/dir2" value="${escapeHtml(effective.addDirs || '')}">
    </div>
    <div class="new-session-actions">
      <button class="new-session-cancel-btn">Cancel</button>
      <button class="new-session-start-btn">Start</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Bind mode grid clicks
  const modeGrid = dialog.querySelector('#nsd-mode-grid')!;
  modeGrid.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.permission-option') as HTMLElement | null;
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (mode === 'dangerous-skip') {
      dangerousSkip = !dangerousSkip;
      if (dangerousSkip) selectedMode = null;
    } else {
      dangerousSkip = false;
      selectedMode = mode === 'null' ? null : (mode ?? null);
    }
    modeGrid.innerHTML = renderModeGrid();
  });

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };

  const start = (): void => {
    const options: SessionOptions = {};
    if (dangerousSkip) {
      options.dangerouslySkipPermissions = true;
    } else if (selectedMode) {
      options.permissionMode = selectedMode;
    }
    if ((dialog.querySelector('#nsd-worktree') as HTMLInputElement).checked) {
      options.worktree = true;
      options.worktreeName = (dialog.querySelector('#nsd-worktree-name') as HTMLInputElement).value.trim();
    }
    if ((dialog.querySelector('#nsd-chrome') as HTMLInputElement).checked) {
      options.chrome = true;
    }
    const preLaunch = (dialog.querySelector('#nsd-pre-launch') as HTMLInputElement).value.trim();
    if (preLaunch) options.preLaunchCmd = preLaunch;
    options.addDirs = (dialog.querySelector('#nsd-add-dirs') as HTMLInputElement).value.trim();
    close();
    callbacks.launchNewSession(project, options);
  };

  (dialog.querySelector('.new-session-cancel-btn') as HTMLElement).onclick = close;
  (dialog.querySelector('.new-session-start-btn') as HTMLElement).onclick = start;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    if (e.key === 'Enter' && !(e.target as HTMLElement).matches('input')) { start(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
};

// ---------------------------------------------------------------------------
// showAddProjectDialog
// ---------------------------------------------------------------------------

const showAddProjectDialog = (): void => {
  const overlay = document.createElement('div');
  overlay.className = 'add-project-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'add-project-dialog';

  dialog.innerHTML = `
    <h3>Add Project</h3>
    <div class="add-project-hint">Select a folder to create a new project. To start a session in an existing project, use the + on its project header.</div>
    <div class="folder-input-row">
      <input type="text" id="add-project-path" placeholder="/path/to/project" autocomplete="off" spellcheck="false">
      <button class="add-project-browse-btn">Browse</button>
    </div>
    <div class="add-project-error" id="add-project-error"></div>
    <div class="add-project-actions">
      <button class="add-project-cancel-btn">Cancel</button>
      <button class="add-project-add-btn">Add</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const pathInput = dialog.querySelector('#add-project-path') as HTMLInputElement;
  const errorEl = dialog.querySelector('#add-project-error') as HTMLElement;
  pathInput.focus();

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };

  const addProject = async (): Promise<void> => {
    const projectPath = pathInput.value.trim();
    if (!projectPath) {
      errorEl.textContent = 'Please enter a folder path.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';
    const result = await window.api.addProject(projectPath);
    if (result.error) {
      errorEl.textContent = result.error;
      errorEl.style.display = 'block';
      return;
    }
    close();
    await loadProjects();
  };

  (dialog.querySelector('.add-project-browse-btn') as HTMLElement).onclick = async () => {
    const folder = await window.api.browseFolder();
    if (folder) pathInput.value = folder;
  };

  (dialog.querySelector('.add-project-cancel-btn') as HTMLElement).onclick = close;
  (dialog.querySelector('.add-project-add-btn') as HTMLElement).onclick = addProject;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') addProject();
  };
  document.addEventListener('keydown', onKey);
};

// ---------------------------------------------------------------------------
// Sidebar resize
// ---------------------------------------------------------------------------

const initSidebarResize = (): void => {
  const sidebar = document.getElementById('sidebar')!;
  const handle = document.getElementById('sidebar-resize-handle')!;
  let dragging = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const width = Math.min(600, Math.max(200, e.clientX));
    sidebar.style.width = width + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Refit active terminal
    if (activeSessionId && openSessions.has(activeSessionId)) {
      const entry = openSessions.get(activeSessionId)!;
      entry.fitAddon.fit();
    }
    // Save sidebar width to settings
    const width = parseInt(sidebar.style.width);
    if (width) {
      window.api.getSetting('global').then(g => {
        const global = (g || {}) as Record<string, unknown>;
        global.sidebarWidth = width;
        window.api.setSetting('global', global);
      });
    }
  });
};

// ---------------------------------------------------------------------------
// loadProjects — fetch from main, reconcile pending, render
// ---------------------------------------------------------------------------

export const loadProjects = async ({ resort = false } = {}): Promise<void> => {
  const wasEmpty = cachedProjects.length === 0;
  if (wasEmpty) {
    loadingStatus.textContent = 'Loading\u2026';
    loadingStatus.className = 'active';
    loadingStatus.style.display = '';
  }
  const [defaultProjects, allProjects] = await Promise.all([
    window.api.getProjects(false),
    window.api.getProjects(true),
  ]);
  setCachedProjects(defaultProjects);
  setCachedAllProjects(allProjects);
  loadingStatus.style.display = 'none';
  loadingStatus.className = '';
  dedup(cachedProjects);
  dedup(cachedAllProjects);

  // Reconcile pending sessions: remove ones that now have real data
  for (const [sid, pending] of [...pendingSessions]) {
    const realExists = allProjects.some(p => p.sessions.some(s => s.sessionId === sid));
    if (realExists) {
      pendingSessions.delete(sid);
    } else {
      // Still pending — re-inject into cached data
      for (const projList of [cachedProjects, cachedAllProjects]) {
        let proj = projList.find(p => p.projectPath === pending.projectPath);
        if (!proj) {
          proj = { folder: pending.folder, projectPath: pending.projectPath, sessions: [] };
          projList.unshift(proj);
        }
        if (!proj.sessions.some(s => s.sessionId === sid)) {
          proj.sessions.unshift(pending.session);
        }
      }
    }
  }

  // Restore active plain terminals from main process (survives renderer reload)
  try {
    const activeTerminals = await window.api.getActiveTerminals();
    for (const { sessionId, projectPath } of activeTerminals) {
      if (pendingSessions.has(sessionId)) continue;
      const folder = projectPath.replace(/[/_]/g, '-').replace(/^-/, '-');
      const session: Session & { type?: string } = {
        sessionId,
        summary: 'Terminal',
        firstPrompt: '',
        projectPath,
        name: null,
        starred: 0,
        archived: 0,
        messageCount: 0,
        modified: new Date().toISOString(),
        created: new Date().toISOString(),
        slug: null,
        type: 'terminal',
      };
      pendingSessions.set(sessionId, { session, projectPath, folder });
      sessionMap.set(sessionId, session);
      for (const projList of [cachedProjects, cachedAllProjects]) {
        let proj = projList.find(p => p.projectPath === projectPath);
        if (!proj) {
          proj = { folder, projectPath, sessions: [] };
          projList.push(proj);
        }
        if (!proj.sessions.some(s => s.sessionId === sessionId)) {
          proj.sessions.unshift(session);
        }
      }
    }
  } catch {
    // ignore errors restoring terminals
  }

  await pollActiveSessions();
  refreshSidebar({ resort });
  renderDefaultStatus();
};

// ---------------------------------------------------------------------------
// renderDefaultStatus — update status bar counts
// ---------------------------------------------------------------------------

export const renderDefaultStatus = (): void => {
  const totalSessions = cachedAllProjects.reduce((n, p) => n + p.sessions.length, 0);
  const totalProjects = cachedAllProjects.length;
  const running = activePtyIds.size;
  const parts: string[] = [];
  if (running > 0) parts.push(`${running} running`);
  parts.push(`${totalSessions} sessions`);
  parts.push(`${totalProjects} projects`);
  statusBarInfo.textContent = parts.join(' \u00b7 ');
};

// ---------------------------------------------------------------------------
// initSidebar — wire up all sidebar event listeners
// ---------------------------------------------------------------------------

export const initSidebar = (cb: SidebarCallbacks): void => {
  callbacks = cb;

  // Cache DOM references
  sidebarContent = el('sidebar-content');
  searchInput = el('search-input') as HTMLInputElement;
  searchBar = el('search-bar');
  searchClear = el('search-clear');
  archiveToggle = el('archive-toggle');
  starToggle = el('star-toggle');
  runningToggle = el('running-toggle');
  todayToggle = el('today-toggle');
  resortBtn = el('resort-btn');
  loadingStatus = el('loading-status');
  addProjectBtn = el('add-project-btn');
  globalSettingsBtn = el('global-settings-btn');
  statusBarInfo = el('status-bar-info');

  // --- Archive toggle ---
  archiveToggle.addEventListener('click', () => {
    setShowArchived(!showArchived);
    archiveToggle.classList.toggle('active', showArchived);
    refreshSidebar({ resort: true });
  });

  // --- Star filter toggle ---
  starToggle.addEventListener('click', () => {
    setShowStarredOnly(!showStarredOnly);
    if (showStarredOnly) { setShowRunningOnly(false); runningToggle.classList.remove('active'); }
    starToggle.classList.toggle('active', showStarredOnly);
    refreshSidebar({ resort: true });
  });

  // --- Running filter toggle ---
  runningToggle.addEventListener('click', () => {
    setShowRunningOnly(!showRunningOnly);
    if (showRunningOnly) { setShowStarredOnly(false); starToggle.classList.remove('active'); }
    runningToggle.classList.toggle('active', showRunningOnly);
    refreshSidebar({ resort: true });
  });

  // --- Today filter toggle ---
  todayToggle.addEventListener('click', () => {
    setShowTodayOnly(!showTodayOnly);
    todayToggle.classList.toggle('active', showTodayOnly);
    refreshSidebar({ resort: true });
  });

  // --- Re-sort button ---
  resortBtn.addEventListener('click', () => {
    loadProjects({ resort: true });
  });

  // --- Search clear ---
  searchClear.addEventListener('click', () => {
    clearSearch();
    searchInput.focus();
  });

  // --- Debounced FTS search ---
  searchInput.addEventListener('input', () => {
    searchBar.classList.toggle('has-query', searchInput.value.length > 0);

    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(async () => {
      searchDebounceTimer = null;
      const query = searchInput.value.trim();

      if (!query) {
        clearSearch();
        return;
      }

      try {
        if (activeTab === 'sessions') {
          const results = await window.api.search('session', query);
          setSearchMatchIds(new Set(results.map(r => r.id)));
          refreshSidebar({ resort: true });
        }
        // Plans and memory search are handled by their respective views
      } catch {
        if (activeTab === 'sessions') {
          setSearchMatchIds(null);
          refreshSidebar({ resort: true });
        }
      }
    }, 200);
  });

  // --- Global settings gear button ---
  globalSettingsBtn.addEventListener('click', () => {
    callbacks.openSettingsViewer('global');
  });

  // --- Add project button ---
  addProjectBtn.addEventListener('click', () => {
    showAddProjectDialog();
  });

  // --- Sidebar resize ---
  initSidebarResize();

  // --- Poll for active PTY sessions periodically ---
  setInterval(pollActiveSessions, 3000);

  // --- Refresh sidebar timeago labels every 30s ---
  setInterval(() => {
    for (const [sessionId, time] of lastActivityTime) {
      const item = document.getElementById('si-' + sessionId);
      if (!item) continue;
      const meta = item.querySelector('.session-meta');
      if (!meta) continue;
      const session = sessionMap.get(sessionId);
      const msgSuffix = session?.messageCount ? ' \u00b7 ' + session.messageCount + ' msgs' : '';
      meta.textContent = formatDate(time) + msgSuffix;
    }
  }, 30000);
};
