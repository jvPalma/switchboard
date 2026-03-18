/**
 * web-api-shim.js
 *
 * Browser-side shim that implements the same window.api interface as preload.js,
 * using fetch() for request-response calls and WebSocket for real-time events
 * and fire-and-forget commands. Skips entirely when running inside Electron
 * (where preload.js has already set window.api).
 */
(function () {
  if (window.api) return; // Electron mode — preload.js already provided the API

  // ---------------------------------------------------------------------------
  // WebSocket with exponential-backoff auto-reconnect
  // ---------------------------------------------------------------------------
  var ws = null;
  var reconnectDelay = 1000;
  var MAX_RECONNECT_DELAY = 30000;
  var listeners = {}; // { eventType: [callback, ...] }

  function connect() {
    ws = new WebSocket('ws://' + location.host + '/ws');

    ws.onopen = function () {
      reconnectDelay = 1000;
    };

    ws.onclose = function () {
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    };

    ws.onmessage = function (event) {
      var msg = JSON.parse(event.data);
      var cbs = listeners[msg.type];
      if (cbs) {
        for (var i = 0; i < cbs.length; i++) {
          cbs[i].apply(null, msg.args || []);
        }
      }
    };
  }

  function addListener(type, callback) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(callback);
  }

  // ---------------------------------------------------------------------------
  // Fire-and-forget commands over WebSocket
  // ---------------------------------------------------------------------------
  function wsSend(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // ---------------------------------------------------------------------------
  // Request-response via REST
  // ---------------------------------------------------------------------------
  async function apiCall(channel) {
    var args = Array.prototype.slice.call(arguments, 1);
    var res = await fetch('/api/' + channel, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: args }),
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  connect();

  // ---------------------------------------------------------------------------
  // Public API — mirrors preload.js exactly
  // ---------------------------------------------------------------------------
  window.api = {
    // Invoke (request-response)
    getPlans: function ()                                    { return apiCall('get-plans'); },
    readPlan: function (filename)                            { return apiCall('read-plan', filename); },
    savePlan: function (filePath, content)                   { return apiCall('save-plan', filePath, content); },
    getStats: function ()                                    { return apiCall('get-stats'); },
    getMemories: function ()                                 { return apiCall('get-memories'); },
    readMemory: function (filePath)                          { return apiCall('read-memory', filePath); },
    getProjects: function (showArchived)                     { return apiCall('get-projects', showArchived); },
    getActiveSessions: function ()                           { return apiCall('get-active-sessions'); },
    getActiveTerminals: function ()                          { return apiCall('get-active-terminals'); },
    stopSession: function (id)                               { return apiCall('stop-session', id); },
    toggleStar: function (id)                                { return apiCall('toggle-star', id); },
    renameSession: function (id, name)                       { return apiCall('rename-session', id, name); },
    archiveSession: function (id, archived)                  { return apiCall('archive-session', id, archived); },
    openTerminal: function (id, projectPath, isNew, opts)    { return apiCall('open-terminal', id, projectPath, isNew, opts); },
    search: function (type, query)                           { return apiCall('search', type, query); },
    readSessionJsonl: function (sessionId)                   { return apiCall('read-session-jsonl', sessionId); },

    // Settings
    getSetting: function (key)                               { return apiCall('get-setting', key); },
    setSetting: function (key, value)                        { return apiCall('set-setting', key, value); },
    deleteSetting: function (key)                            { return apiCall('delete-setting', key); },
    getEffectiveSettings: function (projectPath)             { return apiCall('get-effective-settings', projectPath); },

    browseFolder: function ()                                { return apiCall('browse-folder'); },
    addProject: function (projectPath)                       { return apiCall('add-project', projectPath); },
    removeProject: function (projectPath)                    { return apiCall('remove-project', projectPath); },
    openExternal: function (url)                             { return apiCall('open-external', url); },

    // File panel
    readFileForPanel: function (filePath)                    { return apiCall('read-file-for-panel', filePath); },

    // Auto-updater
    updaterCheck: function ()                                { return apiCall('updater-check'); },
    updaterDownload: function ()                             { return apiCall('updater-download'); },
    updaterInstall: function ()                              { return apiCall('updater-install'); },

    // Fire-and-forget (WebSocket)
    sendInput: function (id, data)                           { wsSend({ type: 'terminal-input', sessionId: id, data: data }); },
    resizeTerminal: function (id, cols, rows)                { wsSend({ type: 'terminal-resize', sessionId: id, cols: cols, rows: rows }); },
    closeTerminal: function (id)                             { wsSend({ type: 'close-terminal', sessionId: id }); },
    mcpDiffResponse: function (sessionId, diffId, action, editedContent) {
      wsSend({ type: 'mcp-diff-response', sessionId: sessionId, diffId: diffId, action: action, editedContent: editedContent });
    },

    // Listeners (server → browser push via WebSocket)
    onTerminalData: function (cb)                            { addListener('terminal-data', cb); },
    onSessionDetected: function (cb)                         { addListener('session-detected', cb); },
    onProcessExited: function (cb)                           { addListener('process-exited', cb); },
    onProgressState: function (cb)                           { addListener('progress-state', cb); },
    onTerminalNotification: function (cb)                    { addListener('terminal-notification', cb); },
    onSessionForked: function (cb)                           { addListener('session-forked', cb); },
    onProjectsChanged: function (cb)                         { addListener('projects-changed', cb); },
    onStatusUpdate: function (cb)                            { addListener('status-update', cb); },
    onUpdaterEvent: function (cb)                            { addListener('updater-event', cb); },
    onMcpOpenDiff: function (cb)                             { addListener('mcp-open-diff', cb); },
    onMcpOpenFile: function (cb)                             { addListener('mcp-open-file', cb); },
    onMcpCloseAllDiffs: function (cb)                        { addListener('mcp-close-all-diffs', cb); },
    onMcpCloseTab: function (cb)                             { addListener('mcp-close-tab', cb); },
  };
})();
