export { getDb, closeDb } from './connection';

export {
  getMeta,
  getAllMeta,
  setName,
  toggleStar,
  setArchived,
  isCachePopulated,
  getAllCached,
  getCachedByFolder,
  getCachedFolder,
  getCachedSession,
  upsertCachedSessions,
  deleteCachedSession,
  deleteCachedFolder,
  getFolderMeta,
  getAllFolderMeta,
  setFolderMeta,
} from './sessions';

export {
  upsertSearchEntries,
  updateSearchTitle,
  deleteSearchSession,
  deleteSearchFolder,
  deleteSearchType,
  searchByType,
  isSearchIndexPopulated,
} from './search';

export {
  getSetting,
  setSetting,
  deleteSetting,
} from './settings';

export type {
  SessionMeta,
  SessionCache,
  SessionCacheUpsert,
  CacheMeta,
  CachedByFolder,
  SearchEntry,
  SearchResult,
} from './types';
