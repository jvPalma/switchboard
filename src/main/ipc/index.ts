import * as projects from './projects';
import * as sessions from './sessions';
import * as terminals from './terminals';
import * as plans from './plans';
import * as memory from './memory';
import * as search from './search';
import * as settings from './settings';
import * as updater from './updater';
import * as tail from './tail';

/** Register all IPC handlers across all domains */
export function registerAllHandlers(): void {
  projects.register();
  sessions.register();
  terminals.register();
  plans.register();
  memory.register();
  search.register();
  settings.register();
  updater.register();
  tail.register();
}

export { getApiHandlers } from './registry';
export { setAutoUpdater } from './updater';
export { SETTING_DEFAULTS } from './settings';
