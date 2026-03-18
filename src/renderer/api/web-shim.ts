// Browser-side shim implementing window.api using fetch + WebSocket.
// Skips entirely when running inside Electron (preload.js sets window.api).

import type { SwitchboardApi } from './types';
import type {
  Plan,
  Memory,
  Project,
  ActiveTerminal,
  OpenTerminalResult,
  SearchResult,
  JsonlEntry,
} from '@shared/types';
import type { EffectiveSettings } from '@shared/types';
import type { StatsData } from './types';

type ListenerCallback = (...args: unknown[]) => void;

export const initWebShim = (): void => {
  if (window.api) return;

  let ws: WebSocket | null = null;
  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY = 30000;
  const listeners: Record<string, ListenerCallback[]> = {};

  const connect = (): void => {
    ws = new WebSocket('ws://' + location.host + '/ws');

    ws.onopen = () => { reconnectDelay = 1000; };

    ws.onclose = () => {
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    };

    ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as { type: string; args?: unknown[] };
      const cbs = listeners[msg.type];
      if (cbs) {
        for (const cb of cbs) cb(...(msg.args ?? []));
      }
    };
  };

  const addListener = (type: string, callback: ListenerCallback): void => {
    if (!listeners[type]) listeners[type] = [];
    listeners[type]!.push(callback);
  };

  const wsSend = (msg: Record<string, unknown>): void => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  const apiCall = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const res = await fetch('/api/' + channel, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
    });
    const data = await res.json() as { error?: string; result?: unknown };
    if (data.error) throw new Error(data.error);
    return data.result as T;
  };

  connect();

  const api: SwitchboardApi = {
    getPlans: () => apiCall<Plan[]>('get-plans'),
    readPlan: (filename) => apiCall<{ content: string; filePath: string }>('read-plan', filename),
    savePlan: (filePath, content) => apiCall<void>('save-plan', filePath, content),
    getStats: () => apiCall<StatsData | null>('get-stats'),
    getMemories: () => apiCall<Memory[]>('get-memories'),
    readMemory: (filePath) => apiCall<string>('read-memory', filePath),
    getProjects: (showArchived) => apiCall<Project[]>('get-projects', showArchived),
    getActiveSessions: () => apiCall<string[]>('get-active-sessions'),
    getActiveTerminals: () => apiCall<ActiveTerminal[]>('get-active-terminals'),
    stopSession: (id) => apiCall<void>('stop-session', id),
    toggleStar: (id) => apiCall<{ starred: number }>('toggle-star', id),
    renameSession: (id, name) => apiCall<void>('rename-session', id, name),
    archiveSession: (id, archived) => apiCall<void>('archive-session', id, archived),
    openTerminal: (id, pp, isNew, opts) => apiCall<OpenTerminalResult>('open-terminal', id, pp, isNew, opts),
    search: (type, query) => apiCall<SearchResult[]>('search', type, query),
    readSessionJsonl: (sid) => apiCall<{ entries?: JsonlEntry[]; error?: string }>('read-session-jsonl', sid),
    tailSessionJsonl: (sid) => apiCall<{ ok: true } | { error: string }>('tail-session-jsonl', sid),
    stopTailSessionJsonl: (sid) => apiCall<{ ok: true }>('stop-tail-session-jsonl', sid),

    getSetting: (key) => apiCall<Record<string, unknown> | null>('get-setting', key),
    setSetting: (key, value) => apiCall<void>('set-setting', key, value),
    deleteSetting: (key) => apiCall<void>('delete-setting', key),
    getEffectiveSettings: (pp) => apiCall<EffectiveSettings>('get-effective-settings', pp),

    browseFolder: () => apiCall<string | null>('browse-folder'),
    addProject: (pp) => apiCall<{ error?: string }>('add-project', pp),
    removeProject: (pp) => apiCall<void>('remove-project', pp),
    openExternal: (url) => apiCall<void>('open-external', url),

    readFileForPanel: (fp) => apiCall<{ ok: boolean; content?: string }>('read-file-for-panel', fp),

    updaterCheck: () => apiCall<void>('updater-check'),
    updaterDownload: () => apiCall<void>('updater-download'),
    updaterInstall: () => apiCall<void>('updater-install'),

    sendInput: (id, data) => { wsSend({ type: 'terminal-input', sessionId: id, data }); },
    resizeTerminal: (id, cols, rows) => { wsSend({ type: 'terminal-resize', sessionId: id, cols, rows }); },
    closeTerminal: (id) => { wsSend({ type: 'close-terminal', sessionId: id }); },
    mcpDiffResponse: (sessionId, diffId, action, editedContent) => {
      wsSend({ type: 'mcp-diff-response', sessionId, diffId, action, editedContent });
    },

    onTerminalData: (cb) => { addListener('terminal-data', cb as ListenerCallback); },
    onSessionDetected: (cb) => { addListener('session-detected', cb as ListenerCallback); },
    onProcessExited: (cb) => { addListener('process-exited', cb as ListenerCallback); },
    onProgressState: (cb) => { addListener('progress-state', cb as ListenerCallback); },
    onTerminalNotification: (cb) => { addListener('terminal-notification', cb as ListenerCallback); },
    onSessionForked: (cb) => { addListener('session-forked', cb as ListenerCallback); },
    onProjectsChanged: (cb) => { addListener('projects-changed', cb as ListenerCallback); },
    onStatusUpdate: (cb) => { addListener('status-update', cb as ListenerCallback); },
    onUpdaterEvent: (cb) => { addListener('updater-event', cb as ListenerCallback); },
    onTailSessionJsonl: (cb) => { addListener('tail-session-jsonl', cb as ListenerCallback); },
    onMcpOpenDiff: (cb) => { addListener('mcp-open-diff', cb as ListenerCallback); },
    onMcpOpenFile: (cb) => { addListener('mcp-open-file', cb as ListenerCallback); },
    onMcpCloseAllDiffs: (cb) => { addListener('mcp-close-all-diffs', cb as ListenerCallback); },
    onMcpCloseTab: (cb) => { addListener('mcp-close-tab', cb as ListenerCallback); },
  };

  window.api = api;
};
