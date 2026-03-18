// TODO: import from @shared/types once shared types are defined

export interface SessionMeta {
  sessionId: string;
  name: string | null;
  starred: number;
  archived: number;
}

export interface SessionCache {
  sessionId: string;
  folder: string;
  projectPath: string | null;
  summary: string | null;
  firstPrompt: string | null;
  created: string | null;
  modified: string | null;
  messageCount: number;
  slug: string | null;
}

export interface SessionCacheUpsert {
  sessionId: string;
  folder: string;
  projectPath: string | null;
  summary: string | null;
  firstPrompt: string | null;
  created: string | null;
  modified: string | null;
  messageCount?: number;
  slug?: string | null;
}

export interface CacheMeta {
  folder: string;
  projectPath: string | null;
  indexMtimeMs: number;
}

export interface CachedByFolder {
  sessionId: string;
  modified: string | null;
}

export interface SearchEntry {
  id: string;
  type: string;
  folder?: string | null;
  title?: string;
  body?: string;
}

export interface SearchResult {
  id: string;
  snippet: string;
}

export interface SearchMapRow {
  rowid: number;
}

export interface CountRow {
  cnt: number;
}

export interface FolderRow {
  folder: string;
}

export interface SettingRow {
  value: string;
}
