import { getDb } from './connection';
import type { SettingRow } from './types';

const db = getDb();

// --- Prepared statements ---

const stmts = {
  settingsGet: db.prepare<[string], SettingRow>('SELECT value FROM settings WHERE key = ?'),
  settingsUpsert: db.prepare<[string, string]>(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
  settingsDelete: db.prepare<[string]>('DELETE FROM settings WHERE key = ?'),
};

// --- Settings functions ---

export const getSetting = (key: string): unknown => {
  const row = stmts.settingsGet.get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return row.value; }
};

export const setSetting = (key: string, value: unknown): void => {
  stmts.settingsUpsert.run(key, JSON.stringify(value));
};

export const deleteSetting = (key: string): void => {
  stmts.settingsDelete.run(key);
};
