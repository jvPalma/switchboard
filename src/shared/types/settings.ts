// Setting defaults and effective settings derived from SETTING_DEFAULTS in main.js.

/** All setting keys and their default values. */
export interface SettingDefaults {
  permissionMode: string | null;
  dangerouslySkipPermissions: boolean;
  worktree: boolean;
  worktreeName: string;
  chrome: boolean;
  preLaunchCmd: string;
  addDirs: string;
  visibleSessionCount: number;
  sidebarWidth: number;
  terminalTheme: string;
  mcpEmulation: boolean;
  webServerEnabled: boolean;
  webServerPort: number;
}

/**
 * Effective settings computed by merging:
 * SETTING_DEFAULTS → global settings → project settings.
 * All keys are guaranteed present (no optional fields).
 */
export type EffectiveSettings = SettingDefaults;

/**
 * Partial settings as stored per-scope (global or project).
 * Only keys the user has explicitly set are present.
 */
export type PartialSettings = Partial<SettingDefaults>;

/**
 * Global settings blob stored under `settings` key `"global"`.
 * Extends partial settings with additional global-only fields.
 */
export interface GlobalSettings extends PartialSettings {
  hiddenProjects?: string[];
  windowBounds?: WindowBounds;
}

/** Persisted window bounds for restore on launch. */
export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}
