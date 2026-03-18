// Shared mutable state for the renderer — single source of truth.
// All views import this module to read/write application state.

import type { Session, Project, Plan, Memory } from '@shared/types';

export interface ProgressInfo {
  state: number;
  percent?: number;
}
import { TERMINAL_THEMES, type TerminalTheme } from './themes';

// --- Open terminal entries ---

export interface OpenSessionEntry {
  terminal: Terminal;
  element: HTMLElement;
  fitAddon: FitAddon.FitAddon;
  session: Session;
  closed: boolean;
  ptyTitle?: string;
}

export interface PendingSession {
  session: Session;
  projectPath: string;
  folder: string;
}

export interface SortedOrderEntry {
  projectPath: string;
  itemIds: string[];
}

// --- Terminal sessions ---
export const openSessions = new Map<string, OpenSessionEntry>();
export let activeSessionId: string | null = sessionStorage.getItem('activeSessionId') || null;

export const setActiveSessionId = (id: string | null): void => {
  activeSessionId = id;
  if (id) sessionStorage.setItem('activeSessionId', id);
  else sessionStorage.removeItem('activeSessionId');
};

// --- Sidebar filters ---
export let showArchived = false;
export let showStarredOnly = false;
export let showRunningOnly = false;
export let showTodayOnly = false;

export const setShowArchived = (v: boolean): void => { showArchived = v; };
export const setShowStarredOnly = (v: boolean): void => { showStarredOnly = v; };
export const setShowRunningOnly = (v: boolean): void => { showRunningOnly = v; };
export const setShowTodayOnly = (v: boolean): void => { showTodayOnly = v; };

// --- Project data ---
export let cachedProjects: Project[] = [];
export let cachedAllProjects: Project[] = [];
export const setCachedProjects = (p: Project[]): void => { cachedProjects = p; };
export const setCachedAllProjects = (p: Project[]): void => { cachedAllProjects = p; };

export let activePtyIds = new Set<string>();
export const setActivePtyIds = (ids: Set<string>): void => { activePtyIds = ids; };

export let sortedOrder: SortedOrderEntry[] = [];
export const setSortedOrder = (o: SortedOrderEntry[]): void => { sortedOrder = o; };

// --- Active tab ---
export let activeTab = 'sessions';
export const setActiveTab = (t: string): void => { activeTab = t; };

// --- Plans ---
export let cachedPlans: Plan[] = [];
export const setCachedPlans = (p: Plan[]): void => { cachedPlans = p; };

// --- Memories ---
export let cachedMemories: Memory[] = [];
export const setCachedMemories = (m: Memory[]): void => { cachedMemories = m; };

// --- Display settings ---
export let visibleSessionCount = 10;
export let sessionMaxAgeDays = 3;
export const setVisibleSessionCount = (n: number): void => { visibleSessionCount = n; };
export const setSessionMaxAgeDays = (n: number): void => { sessionMaxAgeDays = n; };

// --- Pending sessions (no .jsonl yet) ---
export const pendingSessions = new Map<string, PendingSession>();

// --- Search ---
export let searchMatchIds: Set<string> | null = null;
export const setSearchMatchIds = (ids: Set<string> | null): void => { searchMatchIds = ids; };

// --- Activity tracking ---
export const unreadSessions = new Set<string>();
export const attentionSessions = new Set<string>();
export const lastActivityTime = new Map<string, Date>();
export const sessionProgressState = new Map<string, ProgressInfo>();

// --- Session map (shared reference cache) ---
export const sessionMap = new Map<string, Session>();

// --- Terminal theme ---
export let currentThemeName = 'switchboard';
export let TERMINAL_THEME: TerminalTheme = TERMINAL_THEMES['switchboard']!;

export const setTerminalTheme = (name: string): void => {
  currentThemeName = name;
  TERMINAL_THEME = TERMINAL_THEMES[name] ?? TERMINAL_THEMES['switchboard']!;
};

export const getTerminalTheme = (): TerminalTheme => TERMINAL_THEME;

// --- Redraw scroll tracking ---
export let redrawScrollUntil = 0;
export const setRedrawScrollUntil = (t: number): void => { redrawScrollUntil = t; };

// --- Projects changed while on another tab ---
export let projectsChangedWhileAway = false;
export const setProjectsChangedWhileAway = (v: boolean): void => { projectsChangedWhileAway = v; };

// --- Slug expand state ---
export const getExpandedSlugs = (): Set<string> => {
  try {
    return new Set(JSON.parse(sessionStorage.getItem('expandedSlugs') || '[]') as string[]);
  } catch {
    return new Set();
  }
};

export const saveExpandedSlugs = (): void => {
  const expanded: string[] = [];
  document.querySelectorAll('.slug-group:not(.collapsed)').forEach(g => {
    if (g.id) expanded.push(g.id);
  });
  sessionStorage.setItem('expandedSlugs', JSON.stringify(expanded));
};

// --- Noise pattern for unread tracking ---
export const unreadNoiseRe = /file-history-snapshot|^\s*$/;
