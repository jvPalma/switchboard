// Settings viewer — renders the global or per-project settings form
// and handles save/remove logic.

import {
  openSessions,
  setVisibleSessionCount,
  setSessionMaxAgeDays,
  setTerminalTheme,
  getTerminalTheme,
} from '../state';
import { TERMINAL_THEMES } from '../themes';
import { escapeHtml } from '../utils';

// --- DOM references (resolved once on init) ---

let settingsViewer: HTMLElement;
let settingsViewerTitle: HTMLElement;
let settingsViewerBody: HTMLElement;
let placeholder: HTMLElement;
let terminalArea: HTMLElement;
let planViewer: HTMLElement;
let statsViewer: HTMLElement;
let memoryViewer: HTMLElement;

// --- Callbacks supplied by the app shell ---

export interface SettingsCallbacks {
  refreshSidebar: () => void;
  loadProjects: () => Promise<void>;
}

let callbacks: SettingsCallbacks;

// --- Public API ---

export const initSettings = (cb: SettingsCallbacks): void => {
  callbacks = cb;

  settingsViewer = document.getElementById('settings-viewer')!;
  settingsViewerTitle = document.getElementById('settings-viewer-title')!;
  settingsViewerBody = document.getElementById('settings-viewer-body')!;
  placeholder = document.getElementById('placeholder')!;
  terminalArea = document.getElementById('terminal-area')!;
  planViewer = document.getElementById('plan-viewer')!;
  statsViewer = document.getElementById('stats-viewer')!;
  memoryViewer = document.getElementById('memory-viewer')!;
};

export const openSettingsViewer = async (
  scope: 'global' | 'project',
  projectPath?: string,
): Promise<void> => {
  const isProject = scope === 'project';
  const settingsKey = isProject ? `project:${projectPath}` : 'global';
  const current: Record<string, unknown> =
    (await window.api.getSetting(settingsKey)) ?? {};
  const globalSettings: Record<string, unknown> = isProject
    ? ((await window.api.getSetting('global')) ?? {})
    : {};

  const shortName = isProject
    ? (projectPath ?? '').split('/').filter(Boolean).slice(-2).join('/')
    : 'Global';

  settingsViewerTitle.textContent =
    (isProject ? 'Project Settings \u2014 ' : 'Global Settings \u2014 ') + shortName;

  // Show settings viewer, hide everything else
  placeholder.style.display = 'none';
  terminalArea.style.display = 'none';
  planViewer.style.display = 'none';
  statsViewer.style.display = 'none';
  memoryViewer.style.display = 'none';
  settingsViewer.style.display = 'flex';

  // --- Helpers ---

  const useGlobalCheckbox = (fieldName: string): string => {
    if (!isProject) return '';
    const useGlobal =
      current[fieldName] === undefined || current[fieldName] === null;
    return `<label class="settings-use-global"><input type="checkbox" data-field="${fieldName}" class="use-global-cb" ${useGlobal ? 'checked' : ''}> Use global default</label>`;
  };

  const fieldValue = <T>(fieldName: string, fallback: T): T => {
    if (
      isProject &&
      (current[fieldName] === undefined || current[fieldName] === null)
    ) {
      return globalSettings[fieldName] !== undefined
        ? (globalSettings[fieldName] as T)
        : fallback;
    }
    return current[fieldName] !== undefined
      ? (current[fieldName] as T)
      : fallback;
  };

  const fieldDisabled = (fieldName: string): string => {
    if (!isProject) return '';
    return current[fieldName] === undefined || current[fieldName] === null
      ? 'disabled'
      : '';
  };

  // --- Read current values ---

  const permModeValue = fieldValue<string>('permissionMode', '');
  const worktreeValue = fieldValue<boolean>('worktree', false);
  const worktreeNameValue = fieldValue<string>('worktreeName', '');
  const chromeValue = fieldValue<boolean>('chrome', false);
  const preLaunchValue = fieldValue<string>('preLaunchCmd', '');
  const addDirsValue = fieldValue<string>('addDirs', '');
  const visCountValue = fieldValue<number>('visibleSessionCount', 10);
  const maxAgeValue = fieldValue<number>('sessionMaxAgeDays', 3);
  const themeValue = fieldValue<string>('terminalTheme', 'switchboard');
  const mcpEmulationValue = fieldValue<boolean>('mcpEmulation', true);
  const webServerEnabledValue = fieldValue<boolean>('webServerEnabled', false);
  const webServerPortValue = fieldValue<number>('webServerPort', 8081);

  // --- Render form ---

  settingsViewerBody.innerHTML = `
    <div class="settings-form">
      <div class="settings-section">
        <div class="settings-section-title">Claude CLI Options</div>
        <div class="settings-hint">These options are passed to the <code>claude</code> command when launching sessions.</div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Permission Mode</span>
            ${useGlobalCheckbox('permissionMode')}
          </div>
          <select class="settings-select" id="sv-perm-mode" ${fieldDisabled('permissionMode')}>
            <option value="">Default (none)</option>
            <option value="acceptEdits" ${permModeValue === 'acceptEdits' ? 'selected' : ''}>Accept Edits</option>
            <option value="plan" ${permModeValue === 'plan' ? 'selected' : ''}>Plan Mode</option>
            <option value="dontAsk" ${permModeValue === 'dontAsk' ? 'selected' : ''}>Don't Ask</option>
            <option value="bypassPermissions" ${permModeValue === 'bypassPermissions' ? 'selected' : ''}>Bypass</option>
          </select>
        </div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Worktree</span>
            ${useGlobalCheckbox('worktree')}
          </div>
          <div class="settings-checkbox-row">
            <input type="checkbox" id="sv-worktree" ${worktreeValue ? 'checked' : ''} ${fieldDisabled('worktree')}>
            <label for="sv-worktree">Enable worktree for new sessions</label>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Worktree Name</span>
            ${useGlobalCheckbox('worktreeName')}
          </div>
          <input type="text" class="settings-input" id="sv-worktree-name" placeholder="auto" value="${escapeHtml(worktreeNameValue)}" ${fieldDisabled('worktreeName')}>
        </div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Chrome</span>
            ${useGlobalCheckbox('chrome')}
          </div>
          <div class="settings-checkbox-row">
            <input type="checkbox" id="sv-chrome" ${chromeValue ? 'checked' : ''} ${fieldDisabled('chrome')}>
            <label for="sv-chrome">Enable Chrome browser automation</label>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Additional Directories</span>
            ${useGlobalCheckbox('addDirs')}
          </div>
          <input type="text" class="settings-input" id="sv-add-dirs" placeholder="/path/to/dir1, /path/to/dir2" value="${escapeHtml(addDirsValue)}" ${fieldDisabled('addDirs')}>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Session Launch</div>
        <div class="settings-hint">Options that control how sessions are started.</div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Pre-launch Command</span>
            ${useGlobalCheckbox('preLaunchCmd')}
          </div>
          <div class="settings-hint">Prepended to the claude command (e.g. "aws-vault exec profile --" or "source .env &&")</div>
          <input type="text" class="settings-input" id="sv-pre-launch" placeholder="e.g. aws-vault exec profile --" value="${escapeHtml(preLaunchValue)}" ${fieldDisabled('preLaunchCmd')}>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Application</div>
        <div class="settings-hint">Switchboard display and appearance settings.</div>

        ${!isProject ? `<div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Terminal Theme</span>
          </div>
          <select class="settings-select" id="sv-terminal-theme">
            ${Object.entries(TERMINAL_THEMES).map(([key, t]) =>
              `<option value="${key}" ${themeValue === key ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
            ).join('')}
          </select>
        </div>` : ''}

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Max Visible Sessions</span>
            ${useGlobalCheckbox('visibleSessionCount')}
          </div>
          <div class="settings-hint">Show up to this many sessions before collapsing the rest behind "+N older"</div>
          <input type="number" class="settings-input" id="sv-visible-count" min="1" max="100" value="${visCountValue}" ${fieldDisabled('visibleSessionCount')}>
        </div>

        ${!isProject ? `<div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Hide Sessions Older Than (days)</span>
          </div>
          <div class="settings-hint">Sessions older than this are hidden behind "+N older" even if under the count limit</div>
          <input type="number" class="settings-input" id="sv-max-age" min="1" max="365" value="${maxAgeValue}">
        </div>` : ''}

        ${!isProject ? `<div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">IDE Emulation</span>
          </div>
          <div class="settings-checkbox-row">
            <input type="checkbox" id="sv-mcp-emulation" ${mcpEmulationValue ? 'checked' : ''}>
            <label for="sv-mcp-emulation">Emulate an IDE for Claude CLI sessions</label>
          </div>
          <div class="settings-hint">When enabled, Switchboard acts as an IDE so Claude can open files and diffs in a side panel. Disable this if you want Claude to use your own IDE (e.g. VS Code, Cursor) instead. Changes take effect for new sessions only \u2014 running sessions are not affected.</div>
        </div>` : ''}
      </div>

      ${!isProject ? `<div class="settings-section">
        <div class="settings-section-title">Web Server</div>
        <div class="settings-hint">Serve Switchboard as a web interface accessible from a browser.</div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Enable Web Interface</span>
          </div>
          <div class="settings-checkbox-row">
            <input type="checkbox" id="sv-web-server-enabled" ${webServerEnabledValue ? 'checked' : ''}>
            <label for="sv-web-server-enabled">Enable web interface (port ${webServerPortValue})</label>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Port</span>
          </div>
          <input type="number" class="settings-input" id="sv-web-server-port" min="1" max="65535" placeholder="8081" value="${webServerPortValue}">
        </div>

        <div class="settings-hint">Changes take effect on restart.</div>
      </div>` : ''}

      <button class="settings-save-btn" id="sv-save-btn">Save Settings</button>
      ${isProject ? '<button class="settings-remove-btn" id="sv-remove-btn">Remove Project</button>' : ''}
    </div>
  `;

  // --- Use-global checkboxes toggle field disabled state ---

  const fieldMap: Record<string, string> = {
    permissionMode: 'sv-perm-mode',
    worktree: 'sv-worktree',
    worktreeName: 'sv-worktree-name',
    chrome: 'sv-chrome',
    preLaunchCmd: 'sv-pre-launch',
    addDirs: 'sv-add-dirs',
    visibleSessionCount: 'sv-visible-count',
  };

  settingsViewerBody.querySelectorAll<HTMLInputElement>('.use-global-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const field = cb.dataset.field;
      if (!field) return;
      const inputId = fieldMap[field];
      if (!inputId) return;
      const input = settingsViewerBody.querySelector<HTMLInputElement | HTMLSelectElement>(`#${inputId}`);
      if (input) input.disabled = cb.checked;
    });
  });

  // --- Save button ---

  settingsViewerBody.querySelector('#sv-save-btn')!.addEventListener('click', async () => {
    const settings: Record<string, unknown> = {};

    if (isProject) {
      // Only save fields where "use global" is unchecked
      const projectFieldReaders: Record<string, () => unknown> = {
        permissionMode: () =>
          settingsViewerBody.querySelector<HTMLSelectElement>('#sv-perm-mode')!.value || null,
        worktree: () =>
          settingsViewerBody.querySelector<HTMLInputElement>('#sv-worktree')!.checked,
        worktreeName: () =>
          settingsViewerBody.querySelector<HTMLInputElement>('#sv-worktree-name')!.value.trim(),
        chrome: () =>
          settingsViewerBody.querySelector<HTMLInputElement>('#sv-chrome')!.checked,
        preLaunchCmd: () =>
          settingsViewerBody.querySelector<HTMLInputElement>('#sv-pre-launch')!.value.trim(),
        addDirs: () =>
          settingsViewerBody.querySelector<HTMLInputElement>('#sv-add-dirs')!.value.trim(),
        visibleSessionCount: () =>
          parseInt(settingsViewerBody.querySelector<HTMLInputElement>('#sv-visible-count')!.value) || 10,
      };

      settingsViewerBody.querySelectorAll<HTMLInputElement>('.use-global-cb').forEach(cb => {
        if (!cb.checked) {
          const field = cb.dataset.field;
          if (field && projectFieldReaders[field]) {
            settings[field] = projectFieldReaders[field]();
          }
        }
      });
    } else {
      settings.permissionMode =
        settingsViewerBody.querySelector<HTMLSelectElement>('#sv-perm-mode')!.value || null;
      settings.worktree =
        settingsViewerBody.querySelector<HTMLInputElement>('#sv-worktree')!.checked;
      settings.worktreeName =
        settingsViewerBody.querySelector<HTMLInputElement>('#sv-worktree-name')!.value.trim();
      settings.chrome =
        settingsViewerBody.querySelector<HTMLInputElement>('#sv-chrome')!.checked;
      settings.preLaunchCmd =
        settingsViewerBody.querySelector<HTMLInputElement>('#sv-pre-launch')!.value.trim();
      settings.addDirs =
        settingsViewerBody.querySelector<HTMLInputElement>('#sv-add-dirs')!.value.trim();
      settings.visibleSessionCount =
        parseInt(settingsViewerBody.querySelector<HTMLInputElement>('#sv-visible-count')!.value) || 10;
      settings.sessionMaxAgeDays =
        parseInt(settingsViewerBody.querySelector<HTMLInputElement>('#sv-max-age')!.value) || 3;
      settings.terminalTheme =
        settingsViewerBody.querySelector<HTMLSelectElement>('#sv-terminal-theme')!.value || 'switchboard';
      settings.mcpEmulation =
        settingsViewerBody.querySelector<HTMLInputElement>('#sv-mcp-emulation')!.checked;
      settings.webServerEnabled =
        settingsViewerBody.querySelector<HTMLInputElement>('#sv-web-server-enabled')!.checked;
      settings.webServerPort =
        parseInt(settingsViewerBody.querySelector<HTMLInputElement>('#sv-web-server-port')!.value) || 8081;
    }

    // Preserve windowBounds and sidebarWidth if they exist
    if (!isProject) {
      const existing: Record<string, unknown> =
        (await window.api.getSetting('global')) ?? {};
      if (existing.windowBounds) settings.windowBounds = existing.windowBounds;
      if (existing.sidebarWidth) settings.sidebarWidth = existing.sidebarWidth;
    }

    await window.api.setSetting(settingsKey, settings);

    // Update runtime state for display settings and theme
    if (!isProject) {
      if (settings.visibleSessionCount) {
        setVisibleSessionCount(settings.visibleSessionCount as number);
      }
      if (settings.sessionMaxAgeDays) {
        setSessionMaxAgeDays(settings.sessionMaxAgeDays as number);
      }
      if (settings.terminalTheme) {
        setTerminalTheme(settings.terminalTheme as string);
        const theme = getTerminalTheme();
        // Apply to all open terminals
        for (const [, entry] of openSessions) {
          entry.terminal.options.theme = theme;
        }
      }
      callbacks.refreshSidebar();
    }

    // Notify if IDE Emulation changed
    if (!isProject && settings.mcpEmulation !== mcpEmulationValue) {
      const notice = document.createElement('div');
      notice.className = 'settings-notice';
      notice.textContent =
        'IDE Emulation setting changed. New sessions will use the updated setting \u2014 running sessions are not affected.';
      const saveBtn = settingsViewerBody.querySelector('#sv-save-btn')!;
      saveBtn.parentElement!.insertBefore(notice, saveBtn);
      setTimeout(() => notice.remove(), 8000);
    }

    // Flash save confirmation
    const btn = settingsViewerBody.querySelector<HTMLElement>('#sv-save-btn')!;
    btn.classList.add('saved');
    btn.textContent = 'Saved!';
    setTimeout(() => {
      btn.classList.remove('saved');
      btn.textContent = 'Save Settings';
    }, 1500);
  });

  // --- Remove project button ---

  const removeBtn = settingsViewerBody.querySelector<HTMLButtonElement>('#sv-remove-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      const confirmed = confirm(
        `Remove project "${shortName}" from Switchboard?\n\nThis hides the project from the sidebar. Your session files are not deleted.`,
      );
      if (!confirmed) return;
      await window.api.removeProject(projectPath!);
      settingsViewer.style.display = 'none';
      placeholder.style.display = 'flex';
      callbacks.loadProjects();
    });
  }
};
