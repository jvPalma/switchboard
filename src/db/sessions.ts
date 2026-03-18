import { getDb } from './connection';
import type {
  SessionMeta,
  SessionCache,
  SessionCacheUpsert,
  CacheMeta,
  CachedByFolder,
  CountRow,
  FolderRow,
} from './types';

const db = getDb();

// --- Prepared statements ---

const stmts = {
  get: db.prepare<[string], SessionMeta>('SELECT * FROM session_meta WHERE sessionId = ?'),
  getAll: db.prepare<[], SessionMeta>('SELECT * FROM session_meta'),
  upsertName: db.prepare<[string, string]>(`
    INSERT INTO session_meta (sessionId, name) VALUES (?, ?)
    ON CONFLICT(sessionId) DO UPDATE SET name = excluded.name
  `),
  upsertStar: db.prepare<[string]>(`
    INSERT INTO session_meta (sessionId, starred) VALUES (?, 1)
    ON CONFLICT(sessionId) DO UPDATE SET starred = CASE WHEN starred = 1 THEN 0 ELSE 1 END
  `),
  upsertArchived: db.prepare<[string, number]>(`
    INSERT INTO session_meta (sessionId, archived) VALUES (?, ?)
    ON CONFLICT(sessionId) DO UPDATE SET archived = excluded.archived
  `),
  // Session cache
  cacheCount: db.prepare<[], CountRow>('SELECT COUNT(*) as cnt FROM session_cache'),
  cacheGetAll: db.prepare<[], SessionCache>('SELECT * FROM session_cache'),
  cacheUpsert: db.prepare<[string, string, string | null, string | null, string | null, string | null, string | null, number, string | null]>(`
    INSERT INTO session_cache (sessionId, folder, projectPath, summary, firstPrompt, created, modified, messageCount, slug)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sessionId) DO UPDATE SET
      folder = excluded.folder, projectPath = excluded.projectPath,
      summary = excluded.summary, firstPrompt = excluded.firstPrompt,
      created = excluded.created, modified = excluded.modified,
      messageCount = excluded.messageCount, slug = excluded.slug
  `),
  cacheGetByFolder: db.prepare<[string], CachedByFolder>('SELECT sessionId, modified FROM session_cache WHERE folder = ?'),
  cacheGetFolder: db.prepare<[string], FolderRow>('SELECT folder FROM session_cache WHERE sessionId = ?'),
  cacheGetSession: db.prepare<[string], SessionCache>('SELECT * FROM session_cache WHERE sessionId = ?'),
  cacheDeleteSession: db.prepare<[string]>('DELETE FROM session_cache WHERE sessionId = ?'),
  cacheDeleteFolder: db.prepare<[string]>('DELETE FROM session_cache WHERE folder = ?'),
  // Cache meta
  metaGet: db.prepare<[string], CacheMeta>('SELECT * FROM cache_meta WHERE folder = ?'),
  metaGetAll: db.prepare<[], CacheMeta>('SELECT * FROM cache_meta'),
  metaUpsert: db.prepare<[string, string | null, number]>(`
    INSERT INTO cache_meta (folder, projectPath, indexMtimeMs)
    VALUES (?, ?, ?)
    ON CONFLICT(folder) DO UPDATE SET
      projectPath = excluded.projectPath, indexMtimeMs = excluded.indexMtimeMs
  `),
  metaDelete: db.prepare<[string]>('DELETE FROM cache_meta WHERE folder = ?'),
};

// --- Session meta functions ---

export const getMeta = (sessionId: string): SessionMeta | null => {
  return stmts.get.get(sessionId) ?? null;
};

export const getAllMeta = (): Map<string, SessionMeta> => {
  const rows = stmts.getAll.all();
  const map = new Map<string, SessionMeta>();
  for (const row of rows) map.set(row.sessionId, row);
  return map;
};

export const setName = (sessionId: string, name: string): void => {
  stmts.upsertName.run(sessionId, name);
};

export const toggleStar = (sessionId: string): number => {
  stmts.upsertStar.run(sessionId);
  const row = stmts.get.get(sessionId);
  return row!.starred;
};

export const setArchived = (sessionId: string, archived: boolean): void => {
  stmts.upsertArchived.run(sessionId, archived ? 1 : 0);
};

// --- Session cache functions ---

export const isCachePopulated = (): boolean => {
  return stmts.cacheCount.get()!.cnt > 0;
};

export const getAllCached = (): SessionCache[] => {
  return stmts.cacheGetAll.all();
};

const upsertCachedSessionsBatch = db.transaction((sessions: SessionCacheUpsert[]) => {
  for (const s of sessions) {
    stmts.cacheUpsert.run(
      s.sessionId, s.folder, s.projectPath, s.summary,
      s.firstPrompt, s.created, s.modified, s.messageCount ?? 0,
      s.slug ?? null,
    );
  }
});

export const upsertCachedSessions = (sessions: SessionCacheUpsert[]): void => {
  upsertCachedSessionsBatch(sessions);
};

export const getCachedByFolder = (folder: string): CachedByFolder[] => {
  return stmts.cacheGetByFolder.all(folder);
};

export const getCachedFolder = (sessionId: string): string | null => {
  const row = stmts.cacheGetFolder.get(sessionId);
  return row ? row.folder : null;
};

export const getCachedSession = (sessionId: string): SessionCache | null => {
  return stmts.cacheGetSession.get(sessionId) ?? null;
};

export const deleteCachedSession = (sessionId: string): void => {
  stmts.cacheDeleteSession.run(sessionId);
};

export const deleteCachedFolder = (folder: string): void => {
  stmts.cacheDeleteFolder.run(folder);
  stmts.metaDelete.run(folder);
};

// --- Cache meta functions ---

export const getFolderMeta = (folder: string): CacheMeta | null => {
  return stmts.metaGet.get(folder) ?? null;
};

export const getAllFolderMeta = (): Map<string, CacheMeta> => {
  const rows = stmts.metaGetAll.all();
  const map = new Map<string, CacheMeta>();
  for (const row of rows) map.set(row.folder, row);
  return map;
};

export const setFolderMeta = (folder: string, projectPath: string | null, indexMtimeMs: number): void => {
  stmts.metaUpsert.run(folder, projectPath, indexMtimeMs);
};
