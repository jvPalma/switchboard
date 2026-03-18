/**
 * Typed re-exports of db.js functions.
 * TODO: Replace with @db imports when DB migration is complete
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const db = require('../../db');
const folderIndexState = require('../../folder-index-state');
/* eslint-enable */

// TODO: import from @shared/types when available
export interface SessionMeta {
  name: string | null;
  starred: number;
  archived: number;
}

export interface CachedSession {
  sessionId: string;
  folder: string;
  projectPath: string;
  summary: string;
  firstPrompt: string;
  created: string;
  modified: string;
  messageCount: number;
  slug: string | null;
}

export interface SessionUpsertData {
  sessionId: string;
  folder: string;
  projectPath: string;
  summary: string;
  firstPrompt: string;
  created: string;
  modified: string;
  messageCount: number;
  textContent: string;
  slug: string | null;
  customTitle?: string | null;
}

export interface SearchEntry {
  id: string;
  type: string;
  folder: string | null;
  title: string;
  body: string;
}

export interface SearchResult {
  id: string;
  type: string;
  folder: string | null;
  title: string;
  snippet: string;
}

// Session meta
export const getAllMeta: () => Map<string, SessionMeta> = db.getAllMeta;
export const toggleStar: (sessionId: string) => number = db.toggleStar;
export const setName: (sessionId: string, name: string | null) => void = db.setName;
export const setArchived: (sessionId: string, archived: number) => void = db.setArchived;

// Session cache
export const isCachePopulated: () => boolean = db.isCachePopulated;
export const getAllCached: () => CachedSession[] = db.getAllCached;
export const getCachedByFolder: (folder: string) => CachedSession[] = db.getCachedByFolder;
export const getCachedFolder: (sessionId: string) => string | null = db.getCachedFolder;
export const getCachedSession: (sessionId: string) => CachedSession | null = db.getCachedSession;
export const upsertCachedSessions: (sessions: SessionUpsertData[]) => void = db.upsertCachedSessions;
export const deleteCachedSession: (sessionId: string) => void = db.deleteCachedSession;
export const deleteCachedFolder: (folder: string) => void = db.deleteCachedFolder;

// Folder meta
export const getFolderMeta: (folder: string) => { projectPath: string | null; mtimeMs: number } | null = db.getFolderMeta;
export const getAllFolderMeta: () => Map<string, { projectPath: string | null; mtimeMs: number }> = db.getAllFolderMeta;
export const setFolderMeta: (folder: string, projectPath: string | null, mtimeMs: number) => void = db.setFolderMeta;

// Search
export const upsertSearchEntries: (entries: SearchEntry[]) => void = db.upsertSearchEntries;
export const updateSearchTitle: (id: string, type: string, title: string) => void = db.updateSearchTitle;
export const deleteSearchSession: (id: string) => void = db.deleteSearchSession;
export const deleteSearchFolder: (folder: string) => void = db.deleteSearchFolder;
export const deleteSearchType: (type: string) => void = db.deleteSearchType;
export const searchByType: (type: string, query: string, limit: number) => SearchResult[] = db.searchByType;
export const isSearchIndexPopulated: () => boolean = db.isSearchIndexPopulated;

// Settings
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getSetting: (key: string) => any = db.getSetting;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setSetting: (key: string, value: any) => void = db.setSetting;
export const deleteSetting: (key: string) => void = db.deleteSetting;

// Lifecycle
export const closeDb: () => void = db.closeDb;

// Folder index state
export const getFolderIndexMtimeMs: (folderPath: string) => number = folderIndexState.getFolderIndexMtimeMs;
