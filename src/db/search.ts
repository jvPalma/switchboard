import { getDb } from './connection';
import type { SearchEntry, SearchResult, SearchMapRow, CountRow } from './types';

const db = getDb();

// --- Prepared statements ---

const stmts = {
  searchDeleteBySession: db.prepare<[string]>(
    "DELETE FROM search_fts WHERE rowid IN (SELECT rowid FROM search_map WHERE type = 'session' AND id = ?)",
  ),
  searchMapDeleteBySession: db.prepare<[string]>(
    "DELETE FROM search_map WHERE type = 'session' AND id = ?",
  ),
  searchDeleteByFolder: db.prepare<[string]>(
    "DELETE FROM search_fts WHERE rowid IN (SELECT rowid FROM search_map WHERE type = 'session' AND folder = ?)",
  ),
  searchMapDeleteByFolder: db.prepare<[string]>(
    "DELETE FROM search_map WHERE type = 'session' AND folder = ?",
  ),
  searchDeleteByType: db.prepare<[string]>(
    'DELETE FROM search_fts WHERE rowid IN (SELECT rowid FROM search_map WHERE type = ?)',
  ),
  searchMapDeleteByType: db.prepare<[string]>(
    'DELETE FROM search_map WHERE type = ?',
  ),
  searchInsertFts: db.prepare<[number, string, string]>(
    'INSERT OR REPLACE INTO search_fts(rowid, title, body) VALUES (?, ?, ?)',
  ),
  searchInsertMap: db.prepare<[string, string, string | null]>(
    'INSERT OR REPLACE INTO search_map(id, type, folder) VALUES (?, ?, ?)',
  ),
  searchMapLookup: db.prepare<[string, string], SearchMapRow>(
    'SELECT rowid FROM search_map WHERE id = ? AND type = ?',
  ),
  searchUpdateTitle: db.prepare<[string, string, string]>(
    'UPDATE search_fts SET title = ? WHERE rowid = (SELECT rowid FROM search_map WHERE id = ? AND type = ?)',
  ),
  searchDeleteByRowid: db.prepare<[number]>(
    'DELETE FROM search_fts WHERE rowid = ?',
  ),
  searchMapDeleteByRowid: db.prepare<[number]>(
    'DELETE FROM search_map WHERE rowid = ?',
  ),
  searchQuery: db.prepare<[string, string, number], SearchResult>(`
    SELECT search_map.id, snippet(search_fts, 1, '<mark>', '</mark>', '...', 40) as snippet
    FROM search_fts
    JOIN search_map ON search_fts.rowid = search_map.rowid
    WHERE search_map.type = ? AND search_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `),
};

// --- Search functions ---

const upsertSearchEntriesBatch = db.transaction((entries: SearchEntry[]) => {
  for (const e of entries) {
    // Delete any existing FTS row for this (id, type) pair before inserting.
    // search_map uses INSERT OR REPLACE which deletes the old row and creates
    // a new one with a new rowid, but the orphaned FTS5 row keyed to the old
    // rowid would never be cleaned up — causing duplicate search results and
    // unbounded FTS table growth.
    const existing = stmts.searchMapLookup.get(e.id, e.type);
    if (existing) {
      stmts.searchDeleteByRowid.run(existing.rowid);
      stmts.searchMapDeleteByRowid.run(existing.rowid);
    }
    const result = stmts.searchInsertMap.run(e.id, e.type, e.folder ?? null);
    stmts.searchInsertFts.run(Number(result.lastInsertRowid), e.title ?? '', e.body ?? '');
  }
});

export const upsertSearchEntries = (entries: SearchEntry[]): void => {
  upsertSearchEntriesBatch(entries);
};

export const deleteSearchSession = (sessionId: string): void => {
  stmts.searchDeleteBySession.run(sessionId);
  stmts.searchMapDeleteBySession.run(sessionId);
};

export const deleteSearchFolder = (folder: string): void => {
  stmts.searchDeleteByFolder.run(folder);
  stmts.searchMapDeleteByFolder.run(folder);
};

export const deleteSearchType = (type: string): void => {
  stmts.searchDeleteByType.run(type);
  stmts.searchMapDeleteByType.run(type);
};

export const updateSearchTitle = (id: string, type: string, title: string): void => {
  try {
    stmts.searchUpdateTitle.run(title, id, type);
  } catch { /* ignore */ }
};

export const searchByType = (type: string, query: string, limit = 50): SearchResult[] => {
  try {
    // Wrap in double quotes for exact substring matching with trigram tokenizer.
    // This prevents FTS5 from splitting on punctuation (e.g. "spec.md" -> "spec" + "md")
    const escaped = '"' + query.replace(/"/g, '""') + '"';
    return stmts.searchQuery.all(type, escaped, limit);
  } catch {
    return [];
  }
};

export const isSearchIndexPopulated = (): boolean => {
  const row = db.prepare<[string], CountRow>(
    "SELECT COUNT(*) as cnt FROM search_map WHERE type = ?",
  ).get('session');
  return row!.cnt > 0;
};
