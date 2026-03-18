// Full typed interface for window.api — every method exposed by preload.js

import type {
  Plan,
  Memory,
  Project,
  SessionOptions,
  OpenTerminalResult,
  McpDiffData,
  McpFileData,
  DiffAction,
  SearchResult,
  ActiveTerminal,
  JsonlEntry,
} from '@shared/types';
import type { EffectiveSettings } from '@shared/types';

export interface SwitchboardApi {
  // Invoke (request-response)
  getPlans(): Promise<Plan[]>;
  readPlan(filename: string): Promise<{ content: string; filePath: string }>;
  savePlan(filePath: string, content: string): Promise<void>;
  getStats(): Promise<StatsData | null>;
  getMemories(): Promise<Memory[]>;
  readMemory(filePath: string): Promise<string>;
  getProjects(showArchived: boolean): Promise<Project[]>;
  getActiveSessions(): Promise<string[]>;
  getActiveTerminals(): Promise<ActiveTerminal[]>;
  stopSession(id: string): Promise<void>;
  toggleStar(id: string): Promise<{ starred: number }>;
  renameSession(id: string, name: string | null): Promise<void>;
  archiveSession(id: string, archived: number): Promise<void>;
  openTerminal(
    id: string,
    projectPath: string,
    isNew: boolean,
    sessionOptions: SessionOptions | null,
  ): Promise<OpenTerminalResult>;
  search(type: string, query: string): Promise<SearchResult[]>;
  readSessionJsonl(sessionId: string): Promise<{ entries?: JsonlEntry[]; error?: string }>;
  tailSessionJsonl(sessionId: string): Promise<{ ok: true } | { error: string }>;
  stopTailSessionJsonl(sessionId?: string): Promise<{ ok: true }>;

  // Settings
  getSetting(key: string): Promise<Record<string, unknown> | null>;
  setSetting(key: string, value: unknown): Promise<void>;
  deleteSetting(key: string): Promise<void>;
  getEffectiveSettings(projectPath: string): Promise<EffectiveSettings>;

  browseFolder(): Promise<string | null>;
  addProject(projectPath: string): Promise<{ error?: string }>;
  removeProject(projectPath: string): Promise<void>;
  openExternal(url: string): Promise<void>;

  // File panel
  readFileForPanel(filePath: string): Promise<{ ok: boolean; content?: string }>;

  // Auto-updater
  updaterCheck(): Promise<void>;
  updaterDownload(): Promise<void>;
  updaterInstall(): Promise<void>;

  // Send (fire-and-forget)
  sendInput(id: string, data: string): void;
  resizeTerminal(id: string, cols: number, rows: number): void;
  closeTerminal(id: string): void;
  mcpDiffResponse(sessionId: string, diffId: string, action: DiffAction, editedContent: string | null): void;

  // Listeners (main -> renderer)
  onTerminalData(callback: (sessionId: string, data: string) => void): void;
  onSessionDetected(callback: (tempId: string, realId: string) => void): void;
  onProcessExited(callback: (sessionId: string, exitCode: number) => void): void;
  onProgressState(callback: (sessionId: string, state: number, percent: number) => void): void;
  onTerminalNotification(callback: (sessionId: string, message: string) => void): void;
  onSessionForked(callback: (oldId: string, newId: string) => void): void;
  onProjectsChanged(callback: () => void): void;
  onStatusUpdate(callback: (text: string, type: string) => void): void;
  onUpdaterEvent(callback: (type: string, data: Record<string, unknown>) => void): void;

  // Session tailing (main -> renderer)
  onTailSessionJsonl(callback: (sessionId: string, newLines: string[]) => void): void;

  // MCP bridge (main -> renderer)
  onMcpOpenDiff(callback: (sessionId: string, diffId: string, data: McpDiffData) => void): void;
  onMcpOpenFile(callback: (sessionId: string, data: McpFileData) => void): void;
  onMcpCloseAllDiffs(callback: (sessionId: string) => void): void;
  onMcpCloseTab(callback: (sessionId: string, diffId: string) => void): void;
}

// Stats data shape returned by get-stats (Claude's stats cache)
export interface StatsData {
  dailyActivity?: DailyActivityEntry[] | Record<string, unknown>;
  dailyModelTokens?: DailyModelTokensEntry[];
  totalMessages?: number;
  totalSessions?: number;
  modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number }>;
  lastComputedDate?: string;
}

export interface DailyActivityEntry {
  date: string;
  messageCount?: number;
  toolCallCount?: number;
}

export interface DailyModelTokensEntry {
  date: string;
  tokensByModel?: Record<string, number>;
}
