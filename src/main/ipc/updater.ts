import { registerHandler } from './registry';

// TODO: import from @shared/types when available
interface AutoUpdater {
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

// Updater is injected from the main index module since it's conditionally loaded
let autoUpdater: AutoUpdater | null = null;

export function setAutoUpdater(updater: AutoUpdater | null): void {
  autoUpdater = updater;
}

export function register(): void {
  registerHandler('updater-check', () => {
    if (!autoUpdater) return { available: false, dev: true };
    return autoUpdater.checkForUpdates();
  });

  registerHandler('updater-download', () => {
    if (!autoUpdater) return;
    return autoUpdater.downloadUpdate();
  });

  registerHandler('updater-install', () => {
    if (!autoUpdater) return;
    autoUpdater.quitAndInstall();
  });
}
