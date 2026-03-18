"use strict";
(() => {
  // src/renderer/api/web-shim.ts
  var initWebShim = () => {
    if (window.api) return;
    let ws = null;
    let reconnectDelay = 1e3;
    const MAX_RECONNECT_DELAY = 3e4;
    const listeners = {};
    const connect = () => {
      ws = new WebSocket("ws://" + location.host + "/ws");
      ws.onopen = () => {
        reconnectDelay = 1e3;
      };
      ws.onclose = () => {
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const cbs = listeners[msg.type];
        if (cbs) {
          for (const cb of cbs) cb(...msg.args ?? []);
        }
      };
    };
    const addListener = (type, callback) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(callback);
    };
    const wsSend = (msg) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };
    const apiCall = async (channel, ...args) => {
      const res = await fetch("/api/" + channel, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data.result;
    };
    connect();
    const api3 = {
      getPlans: () => apiCall("get-plans"),
      readPlan: (filename) => apiCall("read-plan", filename),
      savePlan: (filePath, content) => apiCall("save-plan", filePath, content),
      getStats: () => apiCall("get-stats"),
      getMemories: () => apiCall("get-memories"),
      readMemory: (filePath) => apiCall("read-memory", filePath),
      getProjects: (showArchived2) => apiCall("get-projects", showArchived2),
      getActiveSessions: () => apiCall("get-active-sessions"),
      getActiveTerminals: () => apiCall("get-active-terminals"),
      stopSession: (id) => apiCall("stop-session", id),
      toggleStar: (id) => apiCall("toggle-star", id),
      renameSession: (id, name) => apiCall("rename-session", id, name),
      archiveSession: (id, archived) => apiCall("archive-session", id, archived),
      openTerminal: (id, pp, isNew, opts) => apiCall("open-terminal", id, pp, isNew, opts),
      search: (type, query) => apiCall("search", type, query),
      readSessionJsonl: (sid) => apiCall("read-session-jsonl", sid),
      tailSessionJsonl: (sid) => apiCall("tail-session-jsonl", sid),
      stopTailSessionJsonl: (sid) => apiCall("stop-tail-session-jsonl", sid),
      getSetting: (key) => apiCall("get-setting", key),
      setSetting: (key, value) => apiCall("set-setting", key, value),
      deleteSetting: (key) => apiCall("delete-setting", key),
      getEffectiveSettings: (pp) => apiCall("get-effective-settings", pp),
      browseFolder: () => apiCall("browse-folder"),
      addProject: (pp) => apiCall("add-project", pp),
      removeProject: (pp) => apiCall("remove-project", pp),
      openExternal: (url) => apiCall("open-external", url),
      readFileForPanel: (fp) => apiCall("read-file-for-panel", fp),
      updaterCheck: () => apiCall("updater-check"),
      updaterDownload: () => apiCall("updater-download"),
      updaterInstall: () => apiCall("updater-install"),
      sendInput: (id, data) => {
        wsSend({ type: "terminal-input", sessionId: id, data });
      },
      resizeTerminal: (id, cols, rows) => {
        wsSend({ type: "terminal-resize", sessionId: id, cols, rows });
      },
      closeTerminal: (id) => {
        wsSend({ type: "close-terminal", sessionId: id });
      },
      mcpDiffResponse: (sessionId, diffId, action, editedContent) => {
        wsSend({ type: "mcp-diff-response", sessionId, diffId, action, editedContent });
      },
      onTerminalData: (cb) => {
        addListener("terminal-data", cb);
      },
      onSessionDetected: (cb) => {
        addListener("session-detected", cb);
      },
      onProcessExited: (cb) => {
        addListener("process-exited", cb);
      },
      onProgressState: (cb) => {
        addListener("progress-state", cb);
      },
      onTerminalNotification: (cb) => {
        addListener("terminal-notification", cb);
      },
      onSessionForked: (cb) => {
        addListener("session-forked", cb);
      },
      onProjectsChanged: (cb) => {
        addListener("projects-changed", cb);
      },
      onStatusUpdate: (cb) => {
        addListener("status-update", cb);
      },
      onUpdaterEvent: (cb) => {
        addListener("updater-event", cb);
      },
      onTailSessionJsonl: (cb) => {
        addListener("tail-session-jsonl", cb);
      },
      onMcpOpenDiff: (cb) => {
        addListener("mcp-open-diff", cb);
      },
      onMcpOpenFile: (cb) => {
        addListener("mcp-open-file", cb);
      },
      onMcpCloseAllDiffs: (cb) => {
        addListener("mcp-close-all-diffs", cb);
      },
      onMcpCloseTab: (cb) => {
        addListener("mcp-close-tab", cb);
      }
    };
    window.api = api3;
  };

  // src/renderer/themes.ts
  var TERMINAL_THEMES = {
    switchboard: {
      label: "Switchboard",
      background: "#1a1a2e",
      foreground: "#e0e0e0",
      cursor: "#e94560",
      selectionBackground: "#3a3a5e",
      black: "#1a1a2e",
      red: "#e94560",
      green: "#0dff00",
      yellow: "#f5a623",
      blue: "#7b68ee",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#c5c8c6",
      brightBlack: "#555568",
      brightRed: "#ff6b81",
      brightGreen: "#69ff69",
      brightYellow: "#ffd93d",
      brightBlue: "#8fa8ff",
      brightMagenta: "#d19afc",
      brightCyan: "#7ee8e8",
      brightWhite: "#eaeaea"
    },
    ghostty: {
      label: "Ghostty",
      background: "#292c33",
      foreground: "#ffffff",
      cursor: "#ffffff",
      cursorAccent: "#363a43",
      selectionBackground: "#ffffff",
      selectionForeground: "#292c33",
      black: "#1d1f21",
      red: "#bf6b69",
      green: "#b7bd73",
      yellow: "#e9c880",
      blue: "#88a1bb",
      magenta: "#ad95b8",
      cyan: "#95bdb7",
      white: "#c5c8c6",
      brightBlack: "#666666",
      brightRed: "#c55757",
      brightGreen: "#bcc95f",
      brightYellow: "#e1c65e",
      brightBlue: "#83a5d6",
      brightMagenta: "#bc99d4",
      brightCyan: "#83beb1",
      brightWhite: "#eaeaea"
    },
    tokyoNight: {
      label: "Tokyo Night",
      background: "#1a1b26",
      foreground: "#c0caf5",
      cursor: "#c0caf5",
      selectionBackground: "#33467c",
      black: "#15161e",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#c0caf5"
    },
    catppuccinMocha: {
      label: "Catppuccin Mocha",
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      cursor: "#f5e0dc",
      selectionBackground: "#45475a",
      black: "#45475a",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#f5c2e7",
      cyan: "#94e2d5",
      white: "#bac2de",
      brightBlack: "#585b70",
      brightRed: "#f38ba8",
      brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af",
      brightBlue: "#89b4fa",
      brightMagenta: "#f5c2e7",
      brightCyan: "#94e2d5",
      brightWhite: "#a6adc8"
    },
    dracula: {
      label: "Dracula",
      background: "#282a36",
      foreground: "#f8f8f2",
      cursor: "#f8f8f2",
      selectionBackground: "#44475a",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff"
    },
    nord: {
      label: "Nord",
      background: "#2e3440",
      foreground: "#d8dee9",
      cursor: "#d8dee9",
      selectionBackground: "#434c5e",
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#4c566a",
      brightRed: "#bf616a",
      brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1",
      brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb",
      brightWhite: "#eceff4"
    },
    solarizedDark: {
      label: "Solarized Dark",
      background: "#002b36",
      foreground: "#839496",
      cursor: "#839496",
      selectionBackground: "#073642",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3"
    }
  };

  // src/renderer/state.ts
  var openSessions = /* @__PURE__ */ new Map();
  var activeSessionId = sessionStorage.getItem("activeSessionId") || null;
  var setActiveSessionId = (id) => {
    activeSessionId = id;
    if (id) sessionStorage.setItem("activeSessionId", id);
    else sessionStorage.removeItem("activeSessionId");
  };
  var showArchived = false;
  var showStarredOnly = false;
  var showRunningOnly = false;
  var showTodayOnly = false;
  var setShowArchived = (v2) => {
    showArchived = v2;
  };
  var setShowStarredOnly = (v2) => {
    showStarredOnly = v2;
  };
  var setShowRunningOnly = (v2) => {
    showRunningOnly = v2;
  };
  var setShowTodayOnly = (v2) => {
    showTodayOnly = v2;
  };
  var cachedProjects = [];
  var cachedAllProjects = [];
  var setCachedProjects = (p) => {
    cachedProjects = p;
  };
  var setCachedAllProjects = (p) => {
    cachedAllProjects = p;
  };
  var activePtyIds = /* @__PURE__ */ new Set();
  var setActivePtyIds = (ids) => {
    activePtyIds = ids;
  };
  var sortedOrder = [];
  var setSortedOrder = (o) => {
    sortedOrder = o;
  };
  var activeTab = "sessions";
  var setActiveTab = (t) => {
    activeTab = t;
  };
  var cachedPlans = [];
  var setCachedPlans = (p) => {
    cachedPlans = p;
  };
  var cachedMemories = [];
  var setCachedMemories = (m2) => {
    cachedMemories = m2;
  };
  var visibleSessionCount = 10;
  var sessionMaxAgeDays = 3;
  var setVisibleSessionCount = (n) => {
    visibleSessionCount = n;
  };
  var setSessionMaxAgeDays = (n) => {
    sessionMaxAgeDays = n;
  };
  var pendingSessions = /* @__PURE__ */ new Map();
  var searchMatchIds = null;
  var setSearchMatchIds = (ids) => {
    searchMatchIds = ids;
  };
  var unreadSessions = /* @__PURE__ */ new Set();
  var attentionSessions = /* @__PURE__ */ new Set();
  var lastActivityTime = /* @__PURE__ */ new Map();
  var sessionProgressState = /* @__PURE__ */ new Map();
  var sessionMap = /* @__PURE__ */ new Map();
  var currentThemeName = "switchboard";
  var TERMINAL_THEME = TERMINAL_THEMES["switchboard"];
  var setTerminalTheme = (name) => {
    currentThemeName = name;
    TERMINAL_THEME = TERMINAL_THEMES[name] ?? TERMINAL_THEMES["switchboard"];
  };
  var getTerminalTheme = () => TERMINAL_THEME;
  var redrawScrollUntil = 0;
  var setRedrawScrollUntil = (t) => {
    redrawScrollUntil = t;
  };
  var projectsChangedWhileAway = false;
  var setProjectsChangedWhileAway = (v2) => {
    projectsChangedWhileAway = v2;
  };
  var getExpandedSlugs = () => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem("expandedSlugs") || "[]"));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  };
  var saveExpandedSlugs = () => {
    const expanded = [];
    document.querySelectorAll(".slug-group:not(.collapsed)").forEach((g2) => {
      if (g2.id) expanded.push(g2.id);
    });
    sessionStorage.setItem("expandedSlugs", JSON.stringify(expanded));
  };
  var unreadNoiseRe = /file-history-snapshot|^\s*$/;

  // src/renderer/utils.ts
  var formatDate = (date) => {
    const now = /* @__PURE__ */ new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 6e4);
    const hours = Math.floor(diff / 36e5);
    const days = Math.floor(diff / 864e5);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  var escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  };
  var cleanDisplayName = (name) => {
    if (!name) return "";
    const prefix = "Implement the following plan:";
    if (name.startsWith(prefix)) return name.slice(prefix.length).trim();
    return name;
  };
  var formatDuration = (ms) => {
    if (ms < 1e3) return ms + "ms";
    const s = (ms / 1e3).toFixed(1);
    return s + "s";
  };
  var basename = (filePath) => {
    if (!filePath) return "untitled";
    const parts = filePath.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || "untitled";
  };

  // src/renderer/views/sidebar.ts
  var callbacks;
  var sidebarContent;
  var searchInput;
  var searchBar;
  var searchClear;
  var archiveToggle;
  var starToggle;
  var runningToggle;
  var todayToggle;
  var resortBtn;
  var loadingStatus;
  var addProjectBtn;
  var globalSettingsBtn;
  var statusBarInfo;
  var searchDebounceTimer = null;
  var el = (id) => document.getElementById(id);
  var slugId = (slug) => "slug-" + slug.replace(/[^a-zA-Z0-9_-]/g, "_");
  var folderId = (projectPath) => "project-" + projectPath.replace(/[^a-zA-Z0-9_-]/g, "_");
  var dedup = (projects) => {
    for (const p of projects) {
      for (let i = 0; i < p.sessions.length; i++) {
        const s = p.sessions[i];
        if (sessionMap.has(s.sessionId)) {
          Object.assign(sessionMap.get(s.sessionId), s);
          p.sessions[i] = sessionMap.get(s.sessionId);
        } else {
          sessionMap.set(s.sessionId, s);
        }
      }
    }
  };
  var buildSessionItem = (session) => {
    const item = document.createElement("div");
    item.className = "session-item";
    item.id = "si-" + session.sessionId;
    if (session.type === "terminal") item.classList.add("is-terminal");
    if (session.archived) item.classList.add("archived-item");
    if (activePtyIds.has(session.sessionId)) item.classList.add("has-running-pty");
    if (unreadSessions.has(session.sessionId)) item.classList.add("has-unread");
    if (attentionSessions.has(session.sessionId)) item.classList.add("needs-attention");
    const progressInfo = sessionProgressState.get(session.sessionId);
    if (progressInfo) {
      if (progressInfo.state === 3) item.classList.add("is-busy");
      if (progressInfo.state === 1) item.classList.add("has-progress");
      if (progressInfo.state === 2) item.classList.add("has-error");
    }
    item.dataset.sessionId = session.sessionId;
    const modified = lastActivityTime.get(session.sessionId) || new Date(session.modified);
    const timeStr = formatDate(modified);
    const displayName = cleanDisplayName(session.name || session.summary);
    const row = document.createElement("div");
    row.className = "session-row";
    const pin = document.createElement("span");
    pin.className = "session-pin" + (session.starred ? " pinned" : "");
    pin.innerHTML = session.starred ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707c-.28-.28-.576-.49-.888-.656L10.073 9.333l-.07 3.181a.5.5 0 0 1-.853.354l-3.535-3.536-4.243 4.243a.5.5 0 1 1-.707-.707l4.243-4.243L1.372 5.11a.5.5 0 0 1 .354-.854l3.18-.07L8.37 .722A3.37 3.37 0 0 1 9.12.074a.5.5 0 0 1 .708.002l-.707.707z"/></svg>' : '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707c-.28-.28-.576-.49-.888-.656L10.073 9.333l-.07 3.181a.5.5 0 0 1-.853.354l-3.535-3.536-4.243 4.243a.5.5 0 1 1-.707-.707l4.243-4.243L1.372 5.11a.5.5 0 0 1 .354-.854l3.18-.07L8.37 .722A3.37 3.37 0 0 1 9.12.074a.5.5 0 0 1 .708.002l-.707.707z"/></svg>';
    const dot = document.createElement("span");
    dot.className = "session-status-dot" + (activePtyIds.has(session.sessionId) ? " running" : "");
    const info = document.createElement("div");
    info.className = "session-info";
    const summaryEl = document.createElement("div");
    summaryEl.className = "session-summary";
    summaryEl.textContent = displayName;
    const idEl = document.createElement("div");
    idEl.className = "session-id";
    idEl.textContent = session.sessionId;
    const metaEl = document.createElement("div");
    metaEl.className = "session-meta";
    metaEl.textContent = timeStr + (session.messageCount ? " \xB7 " + session.messageCount + " msgs" : "");
    if (session.type === "terminal") {
      const badge = document.createElement("span");
      badge.className = "terminal-badge";
      badge.textContent = ">_";
      summaryEl.prepend(badge);
    }
    info.appendChild(summaryEl);
    info.appendChild(idEl);
    info.appendChild(metaEl);
    const actions = document.createElement("div");
    actions.className = "session-actions";
    const stopBtn = document.createElement("button");
    stopBtn.className = "session-stop-btn";
    stopBtn.title = "Stop session";
    stopBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="8" height="8" rx="1"/></svg>';
    const archiveBtn = document.createElement("button");
    archiveBtn.className = "session-archive-btn";
    archiveBtn.title = session.archived ? "Unarchive" : "Archive";
    archiveBtn.innerHTML = session.archived ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4,7 6,5 8,7"/><line x1="6" y1="5" x2="6" y2="10"/><path d="M1,4 L1,11 L11,11 L11,4"/></svg>' : '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1,1 L11,1 L11,4 L1,4 Z"/><path d="M1,4 L1,11 L11,11 L11,4"/><line x1="5" y1="6.5" x2="7" y2="6.5"/></svg>';
    const forkBtn = document.createElement("button");
    forkBtn.className = "session-fork-btn";
    forkBtn.title = "Fork session";
    forkBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="2.5" r="1.5"/><circle cx="3" cy="9.5" r="1.5"/><circle cx="9" cy="9.5" r="1.5"/><line x1="6" y1="4" x2="6" y2="6"/><line x1="6" y1="6" x2="3" y2="8"/><line x1="6" y1="6" x2="9" y2="8"/></svg>';
    const jsonlBtn = document.createElement("button");
    jsonlBtn.className = "session-jsonl-btn";
    jsonlBtn.title = "View messages";
    jsonlBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h8M2 6h6M2 9h4"/></svg>';
    actions.appendChild(stopBtn);
    actions.appendChild(forkBtn);
    actions.appendChild(jsonlBtn);
    actions.appendChild(archiveBtn);
    row.appendChild(pin);
    row.appendChild(dot);
    row.appendChild(info);
    row.appendChild(actions);
    item.appendChild(row);
    return item;
  };
  var buildSlugGroup = (slug, sessions) => {
    const group = document.createElement("div");
    const id = slugId(slug);
    const expanded = getExpandedSlugs().has(id);
    group.className = expanded ? "slug-group" : "slug-group collapsed";
    group.id = id;
    const mostRecent = sessions.reduce((a, b2) => {
      const aTime = lastActivityTime.get(a.sessionId) || new Date(a.modified);
      const bTime = lastActivityTime.get(b2.sessionId) || new Date(b2.modified);
      return bTime > aTime ? b2 : a;
    });
    const displayName = cleanDisplayName(mostRecent.name || mostRecent.summary || slug);
    const mostRecentTime = lastActivityTime.get(mostRecent.sessionId) || new Date(mostRecent.modified);
    const timeStr = formatDate(mostRecentTime);
    const header = document.createElement("div");
    header.className = "slug-group-header";
    const row = document.createElement("div");
    row.className = "slug-group-row";
    const expand = document.createElement("span");
    expand.className = "slug-group-expand";
    expand.innerHTML = '<span class="arrow">&#9654;</span>';
    const info = document.createElement("div");
    info.className = "slug-group-info";
    const nameEl = document.createElement("div");
    nameEl.className = "slug-group-name";
    nameEl.textContent = displayName;
    const hasRunning = sessions.some((s) => activePtyIds.has(s.sessionId));
    const meta = document.createElement("div");
    meta.className = "slug-group-meta";
    meta.innerHTML = `<span class="slug-group-dot${hasRunning ? " running" : ""}"></span><span class="slug-group-count">${sessions.length} sessions</span> ${escapeHtml(timeStr)}`;
    const archiveSlugBtn = document.createElement("button");
    archiveSlugBtn.className = "slug-group-archive-btn";
    archiveSlugBtn.title = "Archive all sessions in group";
    archiveSlugBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1,1 L11,1 L11,4 L1,4 Z"/><path d="M1,4 L1,11 L11,11 L11,4"/><line x1="5" y1="6.5" x2="7" y2="6.5"/></svg>';
    info.appendChild(nameEl);
    info.appendChild(meta);
    row.appendChild(expand);
    row.appendChild(info);
    row.appendChild(archiveSlugBtn);
    header.appendChild(row);
    const sessionsContainer = document.createElement("div");
    sessionsContainer.className = "slug-group-sessions";
    const promoted = [];
    const rest = [];
    for (const session of sessions) {
      if (activePtyIds.has(session.sessionId)) {
        promoted.push(session);
      } else {
        rest.push(session);
      }
    }
    if (promoted.length > 0) {
      group.classList.add("has-promoted");
      for (const session of promoted) {
        sessionsContainer.appendChild(buildSessionItem(session));
      }
      if (rest.length > 0) {
        const moreBtn = document.createElement("div");
        moreBtn.className = "slug-group-more";
        moreBtn.id = "sgm-" + id;
        moreBtn.textContent = `+ ${rest.length} more`;
        const olderDiv = document.createElement("div");
        olderDiv.className = "slug-group-older";
        olderDiv.id = "sgo-" + id;
        for (const session of rest) {
          olderDiv.appendChild(buildSessionItem(session));
        }
        sessionsContainer.appendChild(moreBtn);
        sessionsContainer.appendChild(olderDiv);
      }
    } else {
      for (const session of sessions) {
        sessionsContainer.appendChild(buildSessionItem(session));
      }
    }
    group.appendChild(header);
    group.appendChild(sessionsContainer);
    return group;
  };
  var startRename = (summaryEl, session) => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "session-rename-input";
    input.value = session.name || session.summary || "";
    summaryEl.replaceWith(input);
    input.focus();
    input.select();
    const save = async () => {
      const newName = input.value.trim();
      const nameToSave = newName && newName !== session.summary ? newName : null;
      await window.api.renameSession(session.sessionId, nameToSave);
      session.name = nameToSave;
      const newSummary = document.createElement("div");
      newSummary.className = "session-summary";
      newSummary.textContent = nameToSave || session.summary || "";
      newSummary.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startRename(newSummary, session);
      });
      input.replaceWith(newSummary);
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") {
        input.removeEventListener("blur", save);
        const restored = document.createElement("div");
        restored.className = "session-summary";
        restored.textContent = session.name || session.summary || "";
        restored.addEventListener("dblclick", (ev) => {
          ev.stopPropagation();
          startRename(restored, session);
        });
        input.replaceWith(restored);
      }
    });
  };
  var pollActiveSessions = async () => {
    try {
      const ids = await window.api.getActiveSessions();
      setActivePtyIds(new Set(ids));
      updateRunningIndicators();
    } catch {
    }
  };
  var updateRunningIndicators = () => {
    document.querySelectorAll(".session-item").forEach((item) => {
      const htmlItem = item;
      const id = htmlItem.dataset.sessionId;
      if (!id) return;
      const running = activePtyIds.has(id);
      htmlItem.classList.toggle("has-running-pty", running);
      if (!running) {
        htmlItem.classList.remove("has-unread", "needs-attention", "is-busy", "has-progress", "has-error");
        unreadSessions.delete(id);
        attentionSessions.delete(id);
        sessionProgressState.delete(id);
      }
      const dot = htmlItem.querySelector(".session-status-dot");
      if (dot) dot.classList.toggle("running", running);
    });
    document.querySelectorAll(".slug-group").forEach((group) => {
      const hasRunning = group.querySelector(".session-item.has-running-pty") !== null;
      const dot = group.querySelector(".slug-group-dot");
      if (dot) dot.classList.toggle("running", hasRunning);
    });
  };
  var rebindSidebarEvents = (projects) => {
    for (const project of projects) {
      const fId = folderId(project.projectPath);
      const header = document.getElementById("ph-" + fId);
      if (!header) continue;
      const newBtn = header.querySelector(".project-new-btn");
      if (newBtn) {
        newBtn.onclick = (e) => {
          e.stopPropagation();
          showNewSessionPopover(project, newBtn);
        };
      }
      const settingsBtn = header.querySelector(".project-settings-btn");
      if (settingsBtn) {
        settingsBtn.onclick = (e) => {
          e.stopPropagation();
          callbacks.openSettingsViewer("project", project.projectPath);
        };
      }
      const archiveGroupBtn = header.querySelector(".project-archive-btn");
      if (archiveGroupBtn) {
        archiveGroupBtn.onclick = async (e) => {
          e.stopPropagation();
          const sessions = project.sessions.filter((s) => !s.archived);
          if (sessions.length === 0) return;
          const shortName = project.projectPath.split("/").filter(Boolean).slice(-2).join("/");
          if (!confirm(`Archive all ${sessions.length} session${sessions.length > 1 ? "s" : ""} in ${shortName}?`)) return;
          for (const s of sessions) {
            if (activePtyIds.has(s.sessionId)) {
              await window.api.stopSession(s.sessionId);
            }
            await window.api.archiveSession(s.sessionId, 1);
            s.archived = 1;
          }
          pollActiveSessions();
          loadProjects();
        };
      }
      header.onclick = (e) => {
        if (e.target.closest(".project-new-btn") || e.target.closest(".project-archive-btn") || e.target.closest(".project-settings-btn")) return;
        header.classList.toggle("collapsed");
      };
    }
    sidebarContent.querySelectorAll(".slug-group-header").forEach((headerNode) => {
      const header = headerNode;
      const archiveBtn = header.querySelector(".slug-group-archive-btn");
      if (archiveBtn) {
        archiveBtn.onclick = async (e) => {
          e.stopPropagation();
          const group = header.parentElement;
          const sessionItems = group.querySelectorAll(".session-item");
          for (const item of sessionItems) {
            const sid = item.dataset.sessionId;
            if (!sid) continue;
            const session = sessionMap.get(sid);
            if (!session || session.archived) continue;
            if (activePtyIds.has(sid)) await window.api.stopSession(sid);
            await window.api.archiveSession(sid, 1);
            session.archived = 1;
          }
          pollActiveSessions();
          loadProjects();
        };
      }
      header.onclick = (e) => {
        if (e.target.closest(".slug-group-archive-btn")) return;
        header.parentElement.classList.toggle("collapsed");
        saveExpandedSlugs();
      };
    });
    sidebarContent.querySelectorAll(".slug-group-more").forEach((moreBtnNode) => {
      const moreBtn = moreBtnNode;
      moreBtn.onclick = () => {
        const group = moreBtn.closest(".slug-group");
        if (group) {
          group.classList.remove("collapsed");
          saveExpandedSlugs();
        }
      };
    });
    sidebarContent.querySelectorAll(".sessions-more-toggle").forEach((moreBtnNode) => {
      const moreBtn = moreBtnNode;
      const olderList = moreBtn.nextElementSibling;
      if (!olderList || !olderList.classList.contains("sessions-older")) return;
      const count = olderList.children.length;
      moreBtn.onclick = () => {
        const showing = olderList.style.display !== "none";
        olderList.style.display = showing ? "none" : "";
        moreBtn.classList.toggle("expanded", !showing);
        moreBtn.textContent = showing ? `+ ${count} older` : "- hide older";
      };
    });
    sidebarContent.querySelectorAll(".session-item").forEach((itemNode) => {
      const item = itemNode;
      const sessionId = item.dataset.sessionId;
      if (!sessionId) return;
      const session = sessionMap.get(sessionId);
      if (!session) return;
      item.onclick = () => callbacks.openSession(session);
      const pin = item.querySelector(".session-pin");
      if (pin) {
        pin.onclick = async (e) => {
          e.stopPropagation();
          const { starred } = await window.api.toggleStar(session.sessionId);
          session.starred = starred;
          refreshSidebar({ resort: true });
        };
      }
      const summaryEl = item.querySelector(".session-summary");
      if (summaryEl) {
        summaryEl.ondblclick = (e) => {
          e.stopPropagation();
          startRename(summaryEl, session);
        };
      }
      const stopBtn = item.querySelector(".session-stop-btn");
      if (stopBtn) {
        stopBtn.onclick = async (e) => {
          e.stopPropagation();
          await window.api.stopSession(session.sessionId);
          activePtyIds.delete(session.sessionId);
          if (activeSessionId === session.sessionId) {
          }
          refreshSidebar();
        };
      }
      const forkBtn = item.querySelector(".session-fork-btn");
      if (forkBtn) {
        forkBtn.onclick = async (e) => {
          e.stopPropagation();
          const project = [...cachedAllProjects, ...cachedProjects].find(
            (p) => p.sessions.some((s) => s.sessionId === session.sessionId)
          );
          if (project) {
            callbacks.forkSession(session, project);
          }
        };
      }
      const jsonlBtn = item.querySelector(".session-jsonl-btn");
      if (jsonlBtn) {
        jsonlBtn.onclick = (e) => {
          e.stopPropagation();
          callbacks.showJsonlViewer(session);
        };
      }
      const archiveBtn = item.querySelector(".session-archive-btn");
      if (archiveBtn) {
        archiveBtn.onclick = async (e) => {
          e.stopPropagation();
          const newVal = session.archived ? 0 : 1;
          if (newVal && activePtyIds.has(session.sessionId)) {
            await window.api.stopSession(session.sessionId);
            pollActiveSessions();
          }
          await window.api.archiveSession(session.sessionId, newVal);
          session.archived = newVal;
          loadProjects();
        };
      }
    });
  };
  var renderProjects = (projects, resort) => {
    const newSidebar = document.createElement("div");
    let ordered = projects;
    if (!resort && sortedOrder.length > 0) {
      const orderIndex = new Map(sortedOrder.map((e, i) => [e.projectPath, i]));
      ordered = [...projects].sort((a, b2) => {
        const aPos = orderIndex.get(a.projectPath);
        const bPos = orderIndex.get(b2.projectPath);
        if (aPos !== void 0 && bPos !== void 0) return aPos - bPos;
        if (aPos === void 0 && bPos !== void 0) return -1;
        if (aPos !== void 0 && bPos === void 0) return 1;
        return 0;
      });
    }
    const newSortedOrder = [];
    for (const project of ordered) {
      let filtered = project.sessions;
      if (showStarredOnly) {
        filtered = filtered.filter((s) => s.starred);
      }
      if (showRunningOnly) {
        filtered = filtered.filter((s) => activePtyIds.has(s.sessionId));
      }
      if (showTodayOnly) {
        const now = /* @__PURE__ */ new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        filtered = filtered.filter((s) => {
          if (!s.modified) return false;
          const d = new Date(s.modified);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` === todayStr;
        });
      }
      if (filtered.length === 0 && project.sessions.length > 0) continue;
      const fId = folderId(project.projectPath);
      filtered = [...filtered].sort((a, b2) => {
        const aRunning = activePtyIds.has(a.sessionId) || pendingSessions.has(a.sessionId);
        const bRunning = activePtyIds.has(b2.sessionId) || pendingSessions.has(b2.sessionId);
        const aPri = a.starred && aRunning ? 3 : aRunning ? 2 : a.starred ? 1 : 0;
        const bPri = b2.starred && bRunning ? 3 : bRunning ? 2 : b2.starred ? 1 : 0;
        if (aPri !== bPri) return bPri - aPri;
        return new Date(b2.modified).getTime() - new Date(a.modified).getTime();
      });
      const slugMap = /* @__PURE__ */ new Map();
      const ungrouped = [];
      for (const session of filtered) {
        if (session.slug) {
          if (!slugMap.has(session.slug)) slugMap.set(session.slug, []);
          slugMap.get(session.slug).push(session);
        } else {
          ungrouped.push(session);
        }
      }
      const allItems = [];
      for (const session of ungrouped) {
        const isRunning = activePtyIds.has(session.sessionId) || pendingSessions.has(session.sessionId);
        allItems.push({
          sortTime: new Date(session.modified).getTime(),
          pinned: !!session.starred,
          running: isRunning,
          element: buildSessionItem(session)
        });
      }
      for (const [slug, slugSessions] of slugMap) {
        const mostRecentTime = Math.max(...slugSessions.map((s) => new Date(s.modified).getTime()));
        const hasRunning = slugSessions.some((s) => activePtyIds.has(s.sessionId) || pendingSessions.has(s.sessionId));
        const hasPinned = slugSessions.some((s) => !!s.starred);
        const element = slugSessions.length === 1 ? buildSessionItem(slugSessions[0]) : buildSlugGroup(slug, slugSessions);
        allItems.push({
          sortTime: mostRecentTime,
          pinned: hasPinned,
          running: hasRunning,
          element
        });
      }
      const prevEntry = sortedOrder.find((e) => e.projectPath === project.projectPath);
      if (resort || !prevEntry) {
        allItems.sort((a, b2) => {
          const aPri = a.pinned && a.running ? 3 : a.running ? 2 : a.pinned ? 1 : 0;
          const bPri = b2.pinned && b2.running ? 3 : b2.running ? 2 : b2.pinned ? 1 : 0;
          if (aPri !== bPri) return bPri - aPri;
          return b2.sortTime - a.sortTime;
        });
      } else {
        const orderIndex = new Map(prevEntry.itemIds.map((id, i) => [id, i]));
        allItems.sort((a, b2) => {
          const aPos = orderIndex.get(a.element.id);
          const bPos = orderIndex.get(b2.element.id);
          if (aPos !== void 0 && bPos !== void 0) return aPos - bPos;
          if (aPos === void 0 && bPos !== void 0) return -1;
          if (aPos !== void 0 && bPos === void 0) return 1;
          return b2.sortTime - a.sortTime;
        });
      }
      newSortedOrder.push({ projectPath: project.projectPath, itemIds: allItems.map((item) => item.element.id) });
      let visible = [];
      let older = [];
      if (searchMatchIds !== null || showStarredOnly || showRunningOnly || showTodayOnly) {
        visible = allItems;
      } else {
        let count = 0;
        const ageCutoff = Date.now() - sessionMaxAgeDays * 864e5;
        for (const item of allItems) {
          if (item.running || item.pinned || count < visibleSessionCount && item.sortTime >= ageCutoff) {
            visible.push(item);
            count++;
          } else {
            older.push(item);
          }
        }
        if (visible.length === 0 && older.length > 0) {
          visible = older;
          older = [];
        }
      }
      const group = document.createElement("div");
      group.className = "project-group";
      group.id = fId;
      const header = document.createElement("div");
      header.className = "project-header";
      header.id = "ph-" + fId;
      const shortName = project.projectPath.split("/").filter(Boolean).slice(-2).join("/");
      header.innerHTML = `<span class="arrow">&#9660;</span> <span class="project-name">${shortName}</span>`;
      const settingsBtn = document.createElement("button");
      settingsBtn.className = "project-settings-btn";
      settingsBtn.title = "Project settings";
      settingsBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.6 1h2.8l.4 2.1a5.5 5.5 0 0 1 1.3.8l2-.8 1.4 2.4-1.6 1.4a5.6 5.6 0 0 1 0 1.5l1.6 1.4-1.4 2.4-2-.8a5.5 5.5 0 0 1-1.3.8L9.4 15H6.6l-.4-2.1a5.5 5.5 0 0 1-1.3-.8l-2 .8-1.4-2.4 1.6-1.4a5.6 5.6 0 0 1 0-1.5L1.5 6.2l1.4-2.4 2 .8a5.5 5.5 0 0 1 1.3-.8L6.6 1z"/><circle cx="8" cy="8" r="2.5"/></svg>';
      header.appendChild(settingsBtn);
      const archiveGroupBtn = document.createElement("button");
      archiveGroupBtn.className = "project-archive-btn";
      archiveGroupBtn.title = "Archive all sessions";
      archiveGroupBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1,1 L11,1 L11,4 L1,4 Z"/><path d="M1,4 L1,11 L11,11 L11,4"/><line x1="5" y1="6.5" x2="7" y2="6.5"/></svg>';
      header.appendChild(archiveGroupBtn);
      const newBtn = document.createElement("button");
      newBtn.className = "project-new-btn";
      newBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>';
      newBtn.title = "New session";
      header.appendChild(newBtn);
      const sessionsList = document.createElement("div");
      sessionsList.className = "project-sessions";
      sessionsList.id = "sessions-" + fId;
      for (const item of visible) {
        sessionsList.appendChild(item.element);
      }
      if (older.length > 0) {
        const moreBtn = document.createElement("div");
        moreBtn.className = "sessions-more-toggle";
        moreBtn.id = "older-" + fId;
        moreBtn.textContent = `+ ${older.length} older`;
        const olderList = document.createElement("div");
        olderList.className = "sessions-older";
        olderList.id = "older-list-" + fId;
        olderList.style.display = "none";
        for (const item of older) {
          olderList.appendChild(item.element);
        }
        sessionsList.appendChild(moreBtn);
        sessionsList.appendChild(olderList);
      }
      if (searchMatchIds === null && !showStarredOnly && !showRunningOnly) {
        const mostRecent = filtered[0]?.modified;
        if (mostRecent && Date.now() - new Date(mostRecent).getTime() > sessionMaxAgeDays * 864e5) {
          header.classList.add("collapsed");
        }
      }
      group.appendChild(header);
      group.appendChild(sessionsList);
      newSidebar.appendChild(group);
    }
    if (activeSessionId) {
      const activeItem = newSidebar.querySelector(`[data-session-id="${activeSessionId}"]`);
      if (activeItem) activeItem.classList.add("active");
    }
    window.morphdom(sidebarContent, newSidebar, {
      childrenOnly: true,
      onBeforeElUpdated(fromEl, toEl) {
        if (fromEl.classList.contains("project-header")) {
          if (fromEl.classList.contains("collapsed")) {
            toEl.classList.add("collapsed");
          } else {
            toEl.classList.remove("collapsed");
          }
        }
        if (fromEl.classList.contains("slug-group")) {
          if (fromEl.classList.contains("collapsed")) {
            toEl.classList.add("collapsed");
          } else {
            toEl.classList.remove("collapsed");
          }
        }
        if (fromEl.classList.contains("sessions-older") && fromEl.style.display !== "none") {
          toEl.style.display = "";
        }
        if (fromEl.classList.contains("sessions-more-toggle") && fromEl.classList.contains("expanded")) {
          toEl.classList.add("expanded");
          toEl.textContent = "- hide older";
        }
        if (fromEl.classList.contains("slug-group-older") && fromEl.style.display !== "none") {
          toEl.style.display = "";
        }
        if (fromEl.classList.contains("slug-group-more") && fromEl.classList.contains("expanded")) {
          toEl.classList.add("expanded");
        }
        return true;
      },
      getNodeKey(node) {
        return node.id || void 0;
      }
    });
    setSortedOrder(newSortedOrder);
    rebindSidebarEvents(projects);
    if (activeSessionId && openSessions.has(activeSessionId) && document.activeElement !== searchInput) {
      openSessions.get(activeSessionId).terminal.focus();
    }
  };
  var refreshSidebar = ({ resort = false } = {}) => {
    let projects = searchMatchIds !== null ? cachedAllProjects : showArchived ? cachedAllProjects : cachedProjects;
    if (searchMatchIds !== null) {
      projects = projects.map((p) => ({
        ...p,
        sessions: p.sessions.filter((s) => searchMatchIds.has(s.sessionId))
      })).filter((p) => p.sessions.length > 0);
    }
    renderProjects(projects, resort);
  };
  var clearSearch = () => {
    searchInput.value = "";
    searchBar.classList.remove("has-query");
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    if (activeTab === "sessions") {
      setSearchMatchIds(null);
      refreshSidebar({ resort: true });
    }
  };
  var showNewSessionPopover = (project, anchorEl) => {
    document.querySelectorAll(".new-session-popover").forEach((popEl) => popEl.remove());
    const popover = document.createElement("div");
    popover.className = "new-session-popover";
    const claudeBtn = document.createElement("button");
    claudeBtn.className = "popover-option";
    claudeBtn.innerHTML = '<img src="https://claude.ai/favicon.ico" class="popover-option-icon claude-icon" alt=""> Claude';
    claudeBtn.onclick = async () => {
      popover.remove();
      callbacks.launchNewSession(project, await callbacks.resolveDefaultSessionOptions(project));
    };
    const claudeOptsBtn = document.createElement("button");
    claudeOptsBtn.className = "popover-option";
    claudeOptsBtn.innerHTML = '<img src="https://claude.ai/favicon.ico" class="popover-option-icon claude-icon" alt=""> Claude (Configure...)';
    claudeOptsBtn.onclick = () => {
      popover.remove();
      showNewSessionDialog(project);
    };
    const termBtn = document.createElement("button");
    termBtn.className = "popover-option popover-option-terminal";
    termBtn.innerHTML = '<span class="popover-option-icon terminal-icon">&gt;_</span> Terminal';
    termBtn.onclick = () => {
      popover.remove();
      callbacks.launchTerminalSession(project);
    };
    popover.appendChild(claudeBtn);
    popover.appendChild(claudeOptsBtn);
    popover.appendChild(termBtn);
    document.body.appendChild(popover);
    const rect = anchorEl.getBoundingClientRect();
    const popoverHeight = popover.offsetHeight;
    if (rect.bottom + 4 + popoverHeight > window.innerHeight) {
      popover.style.top = rect.top - popoverHeight - 4 + "px";
    } else {
      popover.style.top = rect.bottom + 4 + "px";
    }
    popover.style.left = rect.left + "px";
    const onClickOutside = (e) => {
      if (!popover.contains(e.target) && e.target !== anchorEl) {
        popover.remove();
        document.removeEventListener("mousedown", onClickOutside);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", onClickOutside), 0);
  };
  var showNewSessionDialog = async (project) => {
    const effective = await window.api.getEffectiveSettings(project.projectPath);
    const overlay2 = document.createElement("div");
    overlay2.className = "new-session-overlay";
    const dialog = document.createElement("div");
    dialog.className = "new-session-dialog";
    let selectedMode = effective.permissionMode || null;
    let dangerousSkip = effective.dangerouslySkipPermissions || false;
    const modes = [
      { value: null, label: "Default", desc: "Prompt for all actions" },
      { value: "acceptEdits", label: "Accept Edits", desc: "Auto-accept file edits, prompt for others" },
      { value: "plan", label: "Plan Mode", desc: "Read-only exploration, no writes" },
      { value: "dontAsk", label: "Don't Ask", desc: "Auto-deny tools not explicitly allowed" },
      { value: "bypassPermissions", label: "Bypass", desc: "Auto-accept all tool calls" }
    ];
    const renderModeGrid = () => {
      return modes.map((m2) => {
        const isSelected = !dangerousSkip && selectedMode === m2.value;
        return `<button class="permission-option${isSelected ? " selected" : ""}" data-mode="${m2.value}"><span class="perm-name">${m2.label}</span><span class="perm-desc">${m2.desc}</span></button>`;
      }).join("") + `<button class="permission-option dangerous${dangerousSkip ? " selected" : ""}" data-mode="dangerous-skip"><span class="perm-name">Dangerous Skip</span><span class="perm-desc">Skip all safety prompts (use with caution)</span></button>`;
    };
    dialog.innerHTML = `
    <h3>New Session \u2014 ${escapeHtml(project.projectPath.split("/").filter(Boolean).slice(-2).join("/"))}</h3>
    <div class="settings-field">
      <div class="settings-label">Permission Mode</div>
      <div class="permission-grid" id="nsd-mode-grid">${renderModeGrid()}</div>
    </div>
    <div class="settings-field">
      <div class="settings-checkbox-row">
        <input type="checkbox" id="nsd-worktree" ${effective.worktree ? "checked" : ""}>
        <label for="nsd-worktree">Worktree</label>
        <input type="text" class="settings-input" id="nsd-worktree-name" placeholder="name (optional)" value="${escapeHtml(effective.worktreeName || "")}" style="width:160px;margin-left:8px;">
      </div>
    </div>
    <div class="settings-field">
      <div class="settings-checkbox-row">
        <input type="checkbox" id="nsd-chrome" ${effective.chrome ? "checked" : ""}>
        <label for="nsd-chrome">Chrome</label>
      </div>
    </div>
    <div class="settings-field">
      <div class="settings-label">Pre-launch Command</div>
      <input type="text" class="settings-input" id="nsd-pre-launch" placeholder="e.g. aws-vault exec profile --" value="${escapeHtml(effective.preLaunchCmd || "")}">
    </div>
    <div class="settings-field">
      <div class="settings-label">Add Directories (comma-separated)</div>
      <input type="text" class="settings-input" id="nsd-add-dirs" placeholder="/path/to/dir1, /path/to/dir2" value="${escapeHtml(effective.addDirs || "")}">
    </div>
    <div class="new-session-actions">
      <button class="new-session-cancel-btn">Cancel</button>
      <button class="new-session-start-btn">Start</button>
    </div>
  `;
    overlay2.appendChild(dialog);
    document.body.appendChild(overlay2);
    const modeGrid = dialog.querySelector("#nsd-mode-grid");
    modeGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".permission-option");
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (mode === "dangerous-skip") {
        dangerousSkip = !dangerousSkip;
        if (dangerousSkip) selectedMode = null;
      } else {
        dangerousSkip = false;
        selectedMode = mode === "null" ? null : mode ?? null;
      }
      modeGrid.innerHTML = renderModeGrid();
    });
    const close = () => {
      overlay2.remove();
      document.removeEventListener("keydown", onKey);
    };
    const start = () => {
      const options = {};
      if (dangerousSkip) {
        options.dangerouslySkipPermissions = true;
      } else if (selectedMode) {
        options.permissionMode = selectedMode;
      }
      if (dialog.querySelector("#nsd-worktree").checked) {
        options.worktree = true;
        options.worktreeName = dialog.querySelector("#nsd-worktree-name").value.trim();
      }
      if (dialog.querySelector("#nsd-chrome").checked) {
        options.chrome = true;
      }
      const preLaunch = dialog.querySelector("#nsd-pre-launch").value.trim();
      if (preLaunch) options.preLaunchCmd = preLaunch;
      options.addDirs = dialog.querySelector("#nsd-add-dirs").value.trim();
      close();
      callbacks.launchNewSession(project, options);
    };
    dialog.querySelector(".new-session-cancel-btn").onclick = close;
    dialog.querySelector(".new-session-start-btn").onclick = start;
    overlay2.addEventListener("click", (e) => {
      if (e.target === overlay2) close();
    });
    const onKey = (e) => {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onKey);
      }
      if (e.key === "Enter" && !e.target.matches("input")) {
        start();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
  };
  var showAddProjectDialog = () => {
    const overlay2 = document.createElement("div");
    overlay2.className = "add-project-overlay";
    const dialog = document.createElement("div");
    dialog.className = "add-project-dialog";
    dialog.innerHTML = `
    <h3>Add Project</h3>
    <div class="add-project-hint">Select a folder to create a new project. To start a session in an existing project, use the + on its project header.</div>
    <div class="folder-input-row">
      <input type="text" id="add-project-path" placeholder="/path/to/project" autocomplete="off" spellcheck="false">
      <button class="add-project-browse-btn">Browse</button>
    </div>
    <div class="add-project-error" id="add-project-error"></div>
    <div class="add-project-actions">
      <button class="add-project-cancel-btn">Cancel</button>
      <button class="add-project-add-btn">Add</button>
    </div>
  `;
    overlay2.appendChild(dialog);
    document.body.appendChild(overlay2);
    const pathInput = dialog.querySelector("#add-project-path");
    const errorEl = dialog.querySelector("#add-project-error");
    pathInput.focus();
    const close = () => {
      overlay2.remove();
      document.removeEventListener("keydown", onKey);
    };
    const addProject = async () => {
      const projectPath = pathInput.value.trim();
      if (!projectPath) {
        errorEl.textContent = "Please enter a folder path.";
        errorEl.style.display = "block";
        return;
      }
      errorEl.style.display = "none";
      const result = await window.api.addProject(projectPath);
      if (result.error) {
        errorEl.textContent = result.error;
        errorEl.style.display = "block";
        return;
      }
      close();
      await loadProjects();
    };
    dialog.querySelector(".add-project-browse-btn").onclick = async () => {
      const folder = await window.api.browseFolder();
      if (folder) pathInput.value = folder;
    };
    dialog.querySelector(".add-project-cancel-btn").onclick = close;
    dialog.querySelector(".add-project-add-btn").onclick = addProject;
    overlay2.addEventListener("click", (e) => {
      if (e.target === overlay2) close();
    });
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter") addProject();
    };
    document.addEventListener("keydown", onKey);
  };
  var initSidebarResize = () => {
    const sidebar = document.getElementById("sidebar");
    const handle = document.getElementById("sidebar-resize-handle");
    let dragging = false;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dragging = true;
      handle.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const width = Math.min(600, Math.max(200, e.clientX));
      sidebar.style.width = width + "px";
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (activeSessionId && openSessions.has(activeSessionId)) {
        const entry = openSessions.get(activeSessionId);
        entry.fitAddon.fit();
      }
      const width = parseInt(sidebar.style.width);
      if (width) {
        window.api.getSetting("global").then((g2) => {
          const global = g2 || {};
          global.sidebarWidth = width;
          window.api.setSetting("global", global);
        });
      }
    });
  };
  var loadProjects = async ({ resort = false } = {}) => {
    const wasEmpty = cachedProjects.length === 0;
    if (wasEmpty) {
      loadingStatus.textContent = "Loading\u2026";
      loadingStatus.className = "active";
      loadingStatus.style.display = "";
    }
    const [defaultProjects, allProjects] = await Promise.all([
      window.api.getProjects(false),
      window.api.getProjects(true)
    ]);
    setCachedProjects(defaultProjects);
    setCachedAllProjects(allProjects);
    loadingStatus.style.display = "none";
    loadingStatus.className = "";
    dedup(cachedProjects);
    dedup(cachedAllProjects);
    for (const [sid, pending] of [...pendingSessions]) {
      const realExists = allProjects.some((p) => p.sessions.some((s) => s.sessionId === sid));
      if (realExists) {
        pendingSessions.delete(sid);
      } else {
        for (const projList of [cachedProjects, cachedAllProjects]) {
          let proj = projList.find((p) => p.projectPath === pending.projectPath);
          if (!proj) {
            proj = { folder: pending.folder, projectPath: pending.projectPath, sessions: [] };
            projList.unshift(proj);
          }
          if (!proj.sessions.some((s) => s.sessionId === sid)) {
            proj.sessions.unshift(pending.session);
          }
        }
      }
    }
    try {
      const activeTerminals = await window.api.getActiveTerminals();
      for (const { sessionId, projectPath } of activeTerminals) {
        if (pendingSessions.has(sessionId)) continue;
        const folder = projectPath.replace(/[/_]/g, "-").replace(/^-/, "-");
        const session = {
          sessionId,
          summary: "Terminal",
          firstPrompt: "",
          projectPath,
          name: null,
          starred: 0,
          archived: 0,
          messageCount: 0,
          modified: (/* @__PURE__ */ new Date()).toISOString(),
          created: (/* @__PURE__ */ new Date()).toISOString(),
          slug: null,
          type: "terminal"
        };
        pendingSessions.set(sessionId, { session, projectPath, folder });
        sessionMap.set(sessionId, session);
        for (const projList of [cachedProjects, cachedAllProjects]) {
          let proj = projList.find((p) => p.projectPath === projectPath);
          if (!proj) {
            proj = { folder, projectPath, sessions: [] };
            projList.push(proj);
          }
          if (!proj.sessions.some((s) => s.sessionId === sessionId)) {
            proj.sessions.unshift(session);
          }
        }
      }
    } catch {
    }
    await pollActiveSessions();
    refreshSidebar({ resort });
    renderDefaultStatus();
  };
  var renderDefaultStatus = () => {
    const totalSessions = cachedAllProjects.reduce((n, p) => n + p.sessions.length, 0);
    const totalProjects = cachedAllProjects.length;
    const running = activePtyIds.size;
    const parts = [];
    if (running > 0) parts.push(`${running} running`);
    parts.push(`${totalSessions} sessions`);
    parts.push(`${totalProjects} projects`);
    statusBarInfo.textContent = parts.join(" \xB7 ");
  };
  var initSidebar = (cb) => {
    callbacks = cb;
    sidebarContent = el("sidebar-content");
    searchInput = el("search-input");
    searchBar = el("search-bar");
    searchClear = el("search-clear");
    archiveToggle = el("archive-toggle");
    starToggle = el("star-toggle");
    runningToggle = el("running-toggle");
    todayToggle = el("today-toggle");
    resortBtn = el("resort-btn");
    loadingStatus = el("loading-status");
    addProjectBtn = el("add-project-btn");
    globalSettingsBtn = el("global-settings-btn");
    statusBarInfo = el("status-bar-info");
    archiveToggle.addEventListener("click", () => {
      setShowArchived(!showArchived);
      archiveToggle.classList.toggle("active", showArchived);
      refreshSidebar({ resort: true });
    });
    starToggle.addEventListener("click", () => {
      setShowStarredOnly(!showStarredOnly);
      if (showStarredOnly) {
        setShowRunningOnly(false);
        runningToggle.classList.remove("active");
      }
      starToggle.classList.toggle("active", showStarredOnly);
      refreshSidebar({ resort: true });
    });
    runningToggle.addEventListener("click", () => {
      setShowRunningOnly(!showRunningOnly);
      if (showRunningOnly) {
        setShowStarredOnly(false);
        starToggle.classList.remove("active");
      }
      runningToggle.classList.toggle("active", showRunningOnly);
      refreshSidebar({ resort: true });
    });
    todayToggle.addEventListener("click", () => {
      setShowTodayOnly(!showTodayOnly);
      todayToggle.classList.toggle("active", showTodayOnly);
      refreshSidebar({ resort: true });
    });
    resortBtn.addEventListener("click", () => {
      loadProjects({ resort: true });
    });
    searchClear.addEventListener("click", () => {
      clearSearch();
      searchInput.focus();
    });
    searchInput.addEventListener("input", () => {
      searchBar.classList.toggle("has-query", searchInput.value.length > 0);
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(async () => {
        searchDebounceTimer = null;
        const query = searchInput.value.trim();
        if (!query) {
          clearSearch();
          return;
        }
        try {
          if (activeTab === "sessions") {
            const results = await window.api.search("session", query);
            setSearchMatchIds(new Set(results.map((r) => r.id)));
            refreshSidebar({ resort: true });
          }
        } catch {
          if (activeTab === "sessions") {
            setSearchMatchIds(null);
            refreshSidebar({ resort: true });
          }
        }
      }, 200);
    });
    globalSettingsBtn.addEventListener("click", () => {
      callbacks.openSettingsViewer("global");
    });
    addProjectBtn.addEventListener("click", () => {
      showAddProjectDialog();
    });
    initSidebarResize();
    setInterval(pollActiveSessions, 3e3);
    setInterval(() => {
      for (const [sessionId, time] of lastActivityTime) {
        const item = document.getElementById("si-" + sessionId);
        if (!item) continue;
        const meta = item.querySelector(".session-meta");
        if (!meta) continue;
        const session = sessionMap.get(sessionId);
        const msgSuffix = session?.messageCount ? " \xB7 " + session.messageCount + " msgs" : "";
        meta.textContent = formatDate(time) + msgSuffix;
      }
    }, 3e4);
  };

  // src/renderer/views/terminal.ts
  var callbacks2;
  var terminalsEl;
  var placeholder;
  var terminalHeader;
  var terminalHeaderName;
  var terminalHeaderId;
  var terminalHeaderStatus;
  var terminalHeaderPtyTitle;
  var terminalStopBtn;
  var terminalRestartBtn;
  var ESC_SYNC_START = "\x1B[?2026h";
  var ESC_SYNC_END = "\x1B[?2026l";
  var ESC_SCREEN_CLEAR = "\x1B[2J";
  var ESC_ALT_SCREEN_ON = "\x1B[?1049h";
  var api = () => window.api;
  var setActiveSession = (id) => {
    setActiveSessionId(id);
    callbacks2.switchPanel(id);
  };
  var isAtBottom = (terminal) => {
    const buf = terminal.buffer.active;
    return buf.viewportY >= buf.baseY;
  };
  var markUnread = (sessionId, data) => {
    if (sessionId === activeSessionId) return;
    if (unreadNoiseRe.test(data)) return;
    if (!unreadSessions.has(sessionId)) {
      unreadSessions.add(sessionId);
      const item = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
      if (item) item.classList.add("has-unread");
    }
  };
  var clearUnread = (sessionId) => {
    unreadSessions.delete(sessionId);
    const item = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
    if (item) item.classList.remove("has-unread");
  };
  var setupTerminalKeyBindings = (terminal, container, getSessionId) => {
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.type === "keydown") {
          api().sendInput(getSessionId(), "\x1B[13;2u");
        }
        return false;
      }
      return true;
    });
    const textarea = container.querySelector(".xterm-helper-textarea");
    if (textarea) {
      textarea.addEventListener("keydown", ((e) => {
        if (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
        }
      }), { capture: true });
    }
  };
  var tryOpenFileInPanel = (sessionId, uri) => {
    try {
      const path = decodeURIComponent(new URL(uri).pathname);
      const fn = window["openFileInPanel"];
      if (typeof fn === "function") {
        fn(sessionId, path);
      }
    } catch {
    }
  };
  var makeLinkHandler = (sessionId) => ({
    activate: (_event, uri) => {
      if (uri.startsWith("file://")) {
        tryOpenFileInPanel(sessionId, uri);
      } else {
        api().openExternal(uri);
      }
    },
    allowNonHttpProtocols: true
  });
  var makeWebLinksHandler = (sessionId) => (_event, url) => {
    if (url.startsWith("file://")) {
      tryOpenFileInPanel(sessionId, url);
    } else {
      api().openExternal(url);
    }
  };
  var createTerminalInstance = (opts) => {
    const { sessionId, session, container, getSessionId } = opts;
    const terminal = new Terminal({
      fontSize: 12,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: TERMINAL_THEME,
      cursorBlink: true,
      scrollback: 1e4,
      convertEol: true,
      linkHandler: makeLinkHandler(sessionId)
    });
    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon.WebLinksAddon(makeWebLinksHandler(sessionId)));
    terminal.open(container);
    fitAddon.fit();
    const entry = { terminal, element: container, fitAddon, session, closed: false };
    openSessions.set(sessionId, entry);
    terminal.onData((data) => {
      api().sendInput(getSessionId(), data);
    });
    setupTerminalKeyBindings(terminal, container, getSessionId);
    terminal.onResize(({ cols, rows }) => {
      api().resizeTerminal(getSessionId(), cols, rows);
    });
    terminal.onTitleChange((title) => {
      entry.ptyTitle = title;
      if (activeSessionId === getSessionId()) updatePtyTitle();
    });
    terminal.onBell(() => {
      markUnread(getSessionId(), "\x07");
    });
    return entry;
  };
  var showTerminalHeader = (session) => {
    const displayName = cleanDisplayName(session.name || session.summary);
    terminalHeaderName.textContent = displayName;
    terminalHeaderId.textContent = session.sessionId;
    terminalHeader.style.display = "";
    updateTerminalHeader();
    updateProgressIndicators(session.sessionId);
  };
  var updateTerminalHeader = () => {
    if (!activeSessionId) return;
    const running = activePtyIds.has(activeSessionId);
    terminalHeaderStatus.className = running ? "running" : "stopped";
    terminalHeaderStatus.textContent = running ? "Running" : "Stopped";
    terminalStopBtn.style.display = running ? "" : "none";
    updatePtyTitle();
  };
  var updatePtyTitle = () => {
    if (!activeSessionId || !terminalHeaderPtyTitle) return;
    const entry = openSessions.get(activeSessionId);
    const title = entry?.ptyTitle || "";
    terminalHeaderPtyTitle.textContent = title;
    terminalHeaderPtyTitle.style.display = title ? "" : "none";
  };
  var updateProgressIndicators = (sessionId) => {
    const info = sessionProgressState.get(sessionId);
    const state = info?.state ?? 0;
    const item = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
    if (item) {
      item.classList.toggle("is-busy", state === 3);
      item.classList.toggle("has-progress", state === 1);
      item.classList.toggle("has-error", state === 2);
    }
    if (sessionId === activeSessionId) {
      const bar = document.getElementById("terminal-progress-bar");
      if (!bar) return;
      bar.className = "progress-state-" + state;
      if (state === 1) {
        bar.style.setProperty("--progress", (info?.percent || 0) + "%");
      }
    }
  };
  var updateRunningIndicators2 = () => {
    document.querySelectorAll(".session-item").forEach((item) => {
      const el2 = item;
      const id = el2.dataset.sessionId;
      if (!id) return;
      const running = activePtyIds.has(id);
      el2.classList.toggle("has-running-pty", running);
      if (!running) {
        el2.classList.remove("has-unread", "needs-attention", "is-busy", "has-progress", "has-error");
        unreadSessions.delete(id);
        attentionSessions.delete(id);
        sessionProgressState.delete(id);
      }
      const dot = el2.querySelector(".session-status-dot");
      if (dot) dot.classList.toggle("running", running);
    });
    document.querySelectorAll(".slug-group").forEach((group) => {
      const hasRunning = group.querySelector(".session-item.has-running-pty") !== null;
      const dot = group.querySelector(".slug-group-dot");
      if (dot) dot.classList.toggle("running", hasRunning);
    });
  };
  var pollActiveSessions2 = async () => {
    try {
      const ids = await api().getActiveSessions();
      setActivePtyIds(new Set(ids));
      updateRunningIndicators2();
      updateTerminalHeader();
    } catch {
    }
  };
  var resolveDefaultSessionOptions = async (project) => {
    const effective = await api().getEffectiveSettings(project.projectPath);
    const options = {};
    if (effective.dangerouslySkipPermissions) {
      options.dangerouslySkipPermissions = true;
    } else if (effective.permissionMode) {
      options.permissionMode = effective.permissionMode;
    }
    if (effective.worktree) {
      options.worktree = true;
      if (effective.worktreeName) options.worktreeName = effective.worktreeName;
    }
    if (effective.chrome) options.chrome = true;
    if (effective.preLaunchCmd) options.preLaunchCmd = effective.preLaunchCmd;
    if (effective.addDirs) options.addDirs = effective.addDirs;
    if (effective.mcpEmulation === false) options.mcpEmulation = false;
    return options;
  };
  var prepareSessionUI = (sessionId, session) => {
    document.querySelectorAll(".session-item.active").forEach((el2) => el2.classList.remove("active"));
    const item = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (item) item.classList.add("active");
    document.querySelectorAll(".terminal-container").forEach((el2) => el2.classList.remove("visible"));
    placeholder.style.display = "none";
    callbacks2.hidePlanViewer();
    setActiveSession(sessionId);
    showTerminalHeader(session);
  };
  var openSession = async (session) => {
    const { sessionId, projectPath } = session;
    document.querySelectorAll(".session-item.active").forEach((el2) => el2.classList.remove("active"));
    const item = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (item) item.classList.add("active");
    document.querySelectorAll(".terminal-container").forEach((el2) => el2.classList.remove("visible"));
    placeholder.style.display = "none";
    callbacks2.hidePlanViewer();
    setActiveSession(sessionId);
    clearUnread(sessionId);
    attentionSessions.delete(sessionId);
    const attentionItem = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
    if (attentionItem) attentionItem.classList.remove("needs-attention");
    showTerminalHeader(session);
    if (openSessions.has(sessionId)) {
      const entry2 = openSessions.get(sessionId);
      if (entry2.closed) {
        api().closeTerminal(sessionId);
        entry2.terminal.dispose();
        entry2.element.remove();
        openSessions.delete(sessionId);
        if (session.type === "terminal") {
          launchTerminalSession({ projectPath: session.projectPath });
          return;
        }
      } else {
        entry2.element.classList.add("visible");
        entry2.terminal.focus();
        requestAnimationFrame(() => {
          entry2.fitAddon.fit();
          if (isAtBottom(entry2.terminal)) {
            requestAnimationFrame(() => entry2.terminal.scrollToBottom());
          }
        });
        return;
      }
    }
    const container = document.createElement("div");
    container.className = "terminal-container visible";
    terminalsEl.appendChild(container);
    const entry = createTerminalInstance({
      sessionId,
      session,
      container,
      getSessionId: () => entry.session.sessionId
    });
    const resumeOptions = await resolveDefaultSessionOptions({ projectPath });
    const result = await api().openTerminal(sessionId, projectPath, false, resumeOptions);
    if (!result.ok) {
      entry.terminal.write(`\r
Error: ${result.error}\r
`);
      entry.closed = true;
      return;
    }
    callbacks2.setSessionMcpActive(sessionId, !!result.mcpActive);
    api().resizeTerminal(sessionId, entry.terminal.cols, entry.terminal.rows);
    entry.terminal.focus();
    pollActiveSessions2();
  };
  var launchNewSession = async (project, sessionOptions) => {
    const sessionId = crypto.randomUUID();
    const projectPath = project.projectPath;
    const session = {
      sessionId,
      summary: "New session",
      firstPrompt: "",
      projectPath,
      name: null,
      starred: 0,
      archived: 0,
      messageCount: 0,
      modified: (/* @__PURE__ */ new Date()).toISOString(),
      created: (/* @__PURE__ */ new Date()).toISOString(),
      slug: null
    };
    const folder = projectPath.replace(/[/_]/g, "-").replace(/^-/, "-");
    pendingSessions.set(sessionId, { session, projectPath, folder });
    sessionMap.set(sessionId, session);
    for (const projList of [cachedProjects, cachedAllProjects]) {
      let proj = projList.find((p) => p.projectPath === projectPath);
      if (!proj) {
        proj = { folder, projectPath, sessions: [] };
        projList.unshift(proj);
      }
      proj.sessions.unshift(session);
    }
    callbacks2.refreshSidebar();
    prepareSessionUI(sessionId, session);
    const container = document.createElement("div");
    container.className = "terminal-container visible";
    terminalsEl.appendChild(container);
    const entry = createTerminalInstance({
      sessionId,
      session,
      container,
      getSessionId: () => session.sessionId
    });
    const result = await api().openTerminal(sessionId, projectPath, true, sessionOptions || null);
    if (!result.ok) {
      entry.terminal.write(`\r
Error: ${result.error}\r
`);
      entry.closed = true;
      return;
    }
    callbacks2.setSessionMcpActive(sessionId, !!result.mcpActive);
    api().resizeTerminal(sessionId, entry.terminal.cols, entry.terminal.rows);
    entry.terminal.focus();
    pollActiveSessions2();
  };
  var launchTerminalSession = async (project) => {
    const sessionId = crypto.randomUUID();
    const projectPath = project.projectPath;
    const session = {
      sessionId,
      summary: "Terminal",
      firstPrompt: "",
      projectPath,
      name: null,
      starred: 0,
      archived: 0,
      messageCount: 0,
      modified: (/* @__PURE__ */ new Date()).toISOString(),
      created: (/* @__PURE__ */ new Date()).toISOString(),
      slug: null,
      type: "terminal"
    };
    const folder = projectPath.replace(/[/_]/g, "-").replace(/^-/, "-");
    pendingSessions.set(sessionId, { session, projectPath, folder });
    sessionMap.set(sessionId, session);
    for (const projList of [cachedProjects, cachedAllProjects]) {
      let proj = projList.find((p) => p.projectPath === projectPath);
      if (!proj) {
        proj = { folder, projectPath, sessions: [] };
        projList.unshift(proj);
      }
      proj.sessions.unshift(session);
    }
    callbacks2.refreshSidebar();
    prepareSessionUI(sessionId, session);
    const container = document.createElement("div");
    container.className = "terminal-container visible";
    terminalsEl.appendChild(container);
    const entry = createTerminalInstance({
      sessionId,
      session,
      container,
      getSessionId: () => session.sessionId
    });
    const result = await api().openTerminal(sessionId, projectPath, true, { type: "terminal" });
    if (!result.ok) {
      entry.terminal.write(`\r
Error: ${result.error}\r
`);
      entry.closed = true;
      return;
    }
    api().resizeTerminal(sessionId, entry.terminal.cols, entry.terminal.rows);
    entry.terminal.focus();
    pollActiveSessions2();
  };
  var forkSession = async (session, project) => {
    const options = await resolveDefaultSessionOptions(project);
    options.forkFrom = session.sessionId;
    launchNewSession(project, options);
  };
  var wireIpcListeners = () => {
    api().onTerminalData((sessionId, data) => {
      const entry = openSessions.get(sessionId);
      if (entry) {
        const wasAtBottom = isAtBottom(entry.terminal);
        if (data.includes(ESC_SCREEN_CLEAR) || data.includes(ESC_ALT_SCREEN_ON)) {
          setRedrawScrollUntil(Date.now() + 1e3);
        }
        const forceScroll = Date.now() < redrawScrollUntil;
        entry.terminal.write(data, () => {
          if (sessionId !== activeSessionId) return;
          if (wasAtBottom || forceScroll) {
            entry.terminal.scrollToBottom();
          }
        });
      }
      const isSyncRedraw = data.startsWith(ESC_SYNC_START) && data.endsWith(ESC_SYNC_END);
      if (!isSyncRedraw) {
        if (!unreadNoiseRe.test(data)) lastActivityTime.set(sessionId, /* @__PURE__ */ new Date());
        markUnread(sessionId, data);
      }
    });
    api().onSessionDetected((tempId, realId) => {
      const entry = openSessions.get(tempId);
      if (!entry) return;
      entry.session.sessionId = realId;
      if (activeSessionId === tempId) setActiveSession(realId);
      openSessions.delete(tempId);
      openSessions.set(realId, entry);
      terminalHeaderId.textContent = realId;
      terminalHeaderName.textContent = "New session";
      callbacks2.loadProjects().then(() => {
        const item = document.querySelector(`[data-session-id="${realId}"]`);
        if (item) {
          document.querySelectorAll(".session-item.active").forEach((el2) => el2.classList.remove("active"));
          item.classList.add("active");
        }
      });
      pollActiveSessions2();
    });
    api().onSessionForked((oldId, newId) => {
      const entry = openSessions.get(oldId);
      if (!entry) return;
      entry.session.sessionId = newId;
      if (activeSessionId === oldId) setActiveSession(newId);
      openSessions.delete(oldId);
      openSessions.set(newId, entry);
      callbacks2.rekeyFilePanelState(oldId, newId);
      pendingSessions.delete(oldId);
      sessionMap.delete(oldId);
      sessionMap.set(newId, entry.session);
      terminalHeaderId.textContent = newId;
      callbacks2.loadProjects().then(() => {
        const item = document.querySelector(`[data-session-id="${newId}"]`);
        if (item) {
          document.querySelectorAll(".session-item.active").forEach((el2) => el2.classList.remove("active"));
          item.classList.add("active");
          const summary = item.querySelector(".session-summary");
          if (summary) terminalHeaderName.textContent = summary.textContent;
        }
      });
      pollActiveSessions2();
    });
    api().onProcessExited((sessionId, _exitCode) => {
      const entry = openSessions.get(sessionId);
      const session = sessionMap.get(sessionId);
      if (entry) {
        entry.closed = true;
      }
      if (entry) {
        api().closeTerminal(sessionId);
        entry.terminal.dispose();
        entry.element.remove();
        openSessions.delete(sessionId);
      }
      if (activeSessionId === sessionId) {
        setActiveSession(null);
        terminalHeader.style.display = "none";
        placeholder.style.display = "";
      }
      if (session?.type === "terminal") {
        pendingSessions.delete(sessionId);
        for (const projList of [cachedProjects, cachedAllProjects]) {
          for (const proj of projList) {
            proj.sessions = proj.sessions.filter((s) => s.sessionId !== sessionId);
          }
        }
        sessionMap.delete(sessionId);
        callbacks2.refreshSidebar();
        pollActiveSessions2();
        return;
      }
      if (pendingSessions.has(sessionId)) {
        pendingSessions.delete(sessionId);
        for (const projList of [cachedProjects, cachedAllProjects]) {
          for (const proj of projList) {
            proj.sessions = proj.sessions.filter((s) => s.sessionId !== sessionId);
          }
        }
        sessionMap.delete(sessionId);
        callbacks2.refreshSidebar();
      }
      pollActiveSessions2();
    });
    api().onTerminalNotification((sessionId, message) => {
      if (/attention|approval|permission|needs your/i.test(message) && sessionId !== activeSessionId) {
        attentionSessions.add(sessionId);
        const item = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
        if (item) item.classList.add("needs-attention");
      }
      if (sessionId === activeSessionId && terminalHeaderPtyTitle) {
        terminalHeaderPtyTitle.textContent = message;
        terminalHeaderPtyTitle.style.display = "";
      }
    });
    api().onProgressState((sessionId, state, percent) => {
      sessionProgressState.set(sessionId, { state, percent });
      updateProgressIndicators(sessionId);
    });
  };
  var wireHeaderControls = () => {
    terminalStopBtn.addEventListener("click", async () => {
      if (!activeSessionId) return;
      const sid = activeSessionId;
      await api().stopSession(sid);
      activePtyIds.delete(sid);
      setActiveSession(null);
      terminalHeader.style.display = "none";
      placeholder.style.display = "";
      callbacks2.refreshSidebar();
    });
    terminalRestartBtn.addEventListener("click", () => {
      if (!activeSessionId) return;
      const entry = openSessions.get(activeSessionId);
      if (!entry) return;
      api().closeTerminal(activeSessionId);
      entry.terminal.dispose();
      entry.element.remove();
      openSessions.delete(activeSessionId);
      openSession(entry.session);
    });
  };
  var wireResizeHandler = () => {
    window.addEventListener("resize", () => {
      if (activeSessionId && openSessions.has(activeSessionId)) {
        const entry = openSessions.get(activeSessionId);
        entry.fitAddon.fit();
      }
    });
  };
  var warmUpXterm = () => {
    setTimeout(() => {
      const warmEl = document.createElement("div");
      warmEl.style.cssText = "position:absolute;left:-9999px;width:400px;height:200px;";
      document.body.appendChild(warmEl);
      const warmTerm = new Terminal({ cols: 80, rows: 10 });
      const warmFit = new FitAddon.FitAddon();
      warmTerm.loadAddon(warmFit);
      warmTerm.open(warmEl);
      warmTerm.write(" ");
      requestAnimationFrame(() => {
        warmTerm.dispose();
        warmEl.remove();
      });
    }, 100);
  };
  var startPolling = () => {
    setInterval(pollActiveSessions2, 3e3);
  };
  var initTerminal = (cb) => {
    callbacks2 = cb;
    terminalsEl = document.getElementById("terminals");
    placeholder = document.getElementById("placeholder");
    terminalHeader = document.getElementById("terminal-header");
    terminalHeaderName = document.getElementById("terminal-header-name");
    terminalHeaderId = document.getElementById("terminal-header-id");
    terminalHeaderStatus = document.getElementById("terminal-header-status");
    terminalHeaderPtyTitle = document.getElementById("terminal-header-pty-title");
    terminalStopBtn = document.getElementById("terminal-stop-btn");
    terminalRestartBtn = document.getElementById("terminal-restart-btn");
    wireIpcListeners();
    wireHeaderControls();
    wireResizeHandler();
    warmUpXterm();
    startPolling();
  };

  // src/renderer/views/plans.ts
  var plansContent;
  var planViewer;
  var planViewerTitle;
  var planViewerFilepath;
  var planViewerEditorEl;
  var planCopyPathBtn;
  var planCopyContentBtn;
  var planSaveBtn;
  var currentPlanContent = "";
  var currentPlanFilePath = "";
  var planEditorView = null;
  var flashButtonText = (btn, text, duration = 1200) => {
    const original = btn.textContent;
    btn.textContent = text;
    setTimeout(() => {
      btn.textContent = original;
    }, duration);
  };
  var initPlans = () => {
    plansContent = document.getElementById("plans-content");
    planViewer = document.getElementById("plan-viewer");
    planViewerTitle = document.getElementById("plan-viewer-title");
    planViewerFilepath = document.getElementById("plan-viewer-filepath");
    planViewerEditorEl = document.getElementById("plan-viewer-editor");
    planCopyPathBtn = document.getElementById("plan-copy-path-btn");
    planCopyContentBtn = document.getElementById("plan-copy-content-btn");
    planSaveBtn = document.getElementById("plan-save-btn");
    planCopyPathBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(currentPlanFilePath);
      flashButtonText(planCopyPathBtn, "Copied!");
    });
    planCopyContentBtn.addEventListener("click", () => {
      const content = planEditorView ? planEditorView.state.doc.toString() : currentPlanContent;
      navigator.clipboard.writeText(content);
      flashButtonText(planCopyContentBtn, "Copied!");
    });
    planSaveBtn.addEventListener("click", async () => {
      if (planEditorView) {
        currentPlanContent = planEditorView.state.doc.toString();
      }
      await window.api.savePlan(currentPlanFilePath, currentPlanContent);
      flashButtonText(planSaveBtn, "Saved!");
    });
  };
  var loadPlans = async () => {
    setCachedPlans(await window.api.getPlans());
    renderPlans();
  };
  var renderPlans = (plans) => {
    const list = plans ?? cachedPlans;
    plansContent.innerHTML = "";
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "plans-empty";
      empty.textContent = "No plans found in ~/.claude/plans/";
      plansContent.appendChild(empty);
      return;
    }
    for (const plan of list) {
      plansContent.appendChild(buildPlanItem(plan));
    }
  };
  var openPlan = async (plan) => {
    plansContent.querySelectorAll(".plan-item.active").forEach((el2) => el2.classList.remove("active"));
    plansContent.querySelectorAll(".plan-item").forEach((el2) => {
      if (el2.querySelector(".session-id")?.textContent === plan.filename) {
        el2.classList.add("active");
      }
    });
    const result = await window.api.readPlan(plan.filename);
    currentPlanContent = result.content;
    currentPlanFilePath = result.filePath;
    document.getElementById("placeholder").style.display = "none";
    document.getElementById("terminal-area").style.display = "none";
    document.getElementById("stats-viewer").style.display = "none";
    document.getElementById("memory-viewer").style.display = "none";
    document.getElementById("settings-viewer").style.display = "none";
    planViewer.style.display = "flex";
    planViewerTitle.textContent = plan.title;
    planViewerFilepath.textContent = currentPlanFilePath;
    if (!planEditorView) {
      planEditorView = window.createPlanEditor(planViewerEditorEl);
    }
    planEditorView.dispatch({
      changes: { from: 0, to: planEditorView.state.doc.length, insert: currentPlanContent }
    });
  };
  var hidePlanViewer = () => {
    hideAllViewers();
  };
  var hideAllViewers = () => {
    planViewer.style.display = "none";
    document.getElementById("stats-viewer").style.display = "none";
    document.getElementById("memory-viewer").style.display = "none";
    document.getElementById("settings-viewer").style.display = "none";
    document.getElementById("jsonl-viewer").style.display = "none";
    document.getElementById("terminal-area").style.display = "";
  };
  var buildPlanItem = (plan) => {
    const item = document.createElement("div");
    item.className = "session-item plan-item";
    const row = document.createElement("div");
    row.className = "session-row";
    const info = document.createElement("div");
    info.className = "session-info";
    const titleEl = document.createElement("div");
    titleEl.className = "session-summary";
    titleEl.textContent = plan.title;
    const filenameEl = document.createElement("div");
    filenameEl.className = "session-id";
    filenameEl.textContent = plan.filename;
    const metaEl = document.createElement("div");
    metaEl.className = "session-meta";
    metaEl.textContent = formatDate(new Date(plan.modified));
    info.appendChild(titleEl);
    info.appendChild(filenameEl);
    info.appendChild(metaEl);
    row.appendChild(info);
    item.appendChild(row);
    item.addEventListener("click", () => openPlan(plan));
    return item;
  };

  // src/renderer/views/memory.ts
  var memoryContent;
  var memoryViewer;
  var memoryViewerTitle;
  var memoryViewerFilename;
  var memoryViewerBody;
  var initMemory = () => {
    memoryContent = document.getElementById("memory-content");
    memoryViewer = document.getElementById("memory-viewer");
    memoryViewerTitle = document.getElementById("memory-viewer-title");
    memoryViewerFilename = document.getElementById("memory-viewer-filename");
    memoryViewerBody = document.getElementById("memory-viewer-body");
  };
  var loadMemories = async () => {
    setCachedMemories(await window.api.getMemories());
    renderMemories();
  };
  var renderMemories = (memories) => {
    const list = memories ?? cachedMemories;
    memoryContent.innerHTML = "";
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "plans-empty";
      empty.textContent = "No memory files found.";
      memoryContent.appendChild(empty);
      return;
    }
    for (const mem of list) {
      memoryContent.appendChild(buildMemoryItem(mem));
    }
  };
  var openMemory = async (mem) => {
    memoryContent.querySelectorAll(".memory-item.active").forEach((el2) => el2.classList.remove("active"));
    memoryContent.querySelectorAll(".memory-item").forEach((el2) => {
      if (el2.querySelector(".session-id")?.textContent === mem.filename && el2.querySelector(".session-summary")?.textContent?.includes(mem.label)) {
        el2.classList.add("active");
      }
    });
    const content = await window.api.readMemory(mem.filePath);
    document.getElementById("placeholder").style.display = "none";
    document.getElementById("terminal-area").style.display = "none";
    document.getElementById("plan-viewer").style.display = "none";
    document.getElementById("stats-viewer").style.display = "none";
    document.getElementById("settings-viewer").style.display = "none";
    memoryViewer.style.display = "flex";
    memoryViewerTitle.textContent = `${mem.label} \u2014 ${mem.filename}`;
    memoryViewerFilename.textContent = mem.filePath;
    memoryViewerBody.textContent = content;
  };
  var buildMemoryItem = (mem) => {
    const item = document.createElement("div");
    item.className = "session-item memory-item";
    const row = document.createElement("div");
    row.className = "session-row";
    const info = document.createElement("div");
    info.className = "session-info";
    const titleEl = document.createElement("div");
    titleEl.className = "session-summary";
    const badge = document.createElement("span");
    badge.className = `memory-type-badge type-${mem.type}`;
    badge.textContent = mem.type;
    titleEl.appendChild(badge);
    titleEl.appendChild(document.createTextNode(mem.label));
    const filenameEl = document.createElement("div");
    filenameEl.className = "session-id";
    filenameEl.textContent = mem.filename;
    const metaEl = document.createElement("div");
    metaEl.className = "session-meta";
    metaEl.textContent = formatDate(new Date(mem.modified));
    info.appendChild(titleEl);
    info.appendChild(filenameEl);
    info.appendChild(metaEl);
    row.appendChild(info);
    item.appendChild(row);
    item.addEventListener("click", () => openMemory(mem));
    return item;
  };

  // src/renderer/views/stats.ts
  var getStatsViewerBody = () => document.getElementById("stats-viewer-body");
  var formatTokenCount = (tokens) => {
    if (tokens >= 1e9) return (tokens / 1e9).toFixed(1) + "B";
    if (tokens >= 1e6) return (tokens / 1e6).toFixed(1) + "M";
    if (tokens >= 1e3) return (tokens / 1e3).toFixed(1) + "K";
    return tokens.toLocaleString();
  };
  var calculateStreak = (counts) => {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    let current = 0;
    let longest = 0;
    let streak = 0;
    const d = new Date(today);
    let started = false;
    for (let i = 0; i < 365; i++) {
      const dateStr = d.toISOString().slice(0, 10);
      const count = counts[dateStr] || 0;
      if (count > 0) {
        streak++;
        started = true;
      } else {
        if (started) {
          if (!current) current = streak;
          if (streak > longest) longest = streak;
          streak = 0;
          if (current) started = false;
        }
      }
      d.setDate(d.getDate() - 1);
    }
    if (streak > longest) longest = streak;
    if (!current && streak > 0) current = streak;
    return { current, longest };
  };
  var buildDailyBarChart = (stats, container) => {
    const rawTokens = stats.dailyModelTokens || [];
    const rawActivity = stats.dailyActivity || [];
    const tokenMap = {};
    if (Array.isArray(rawTokens)) {
      for (const entry of rawTokens) {
        let total = 0;
        for (const count of Object.values(entry.tokensByModel || {})) total += count;
        tokenMap[entry.date] = total;
      }
    }
    const activityMap = {};
    if (Array.isArray(rawActivity)) {
      for (const entry of rawActivity) activityMap[entry.date] = entry;
    }
    const days = [];
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const tokenValues = days.map((d) => tokenMap[d] || 0);
    const msgValues = days.map((d) => activityMap[d]?.messageCount || 0);
    const toolValues = days.map((d) => activityMap[d]?.toolCallCount || 0);
    const maxTokens = Math.max(...tokenValues, 1);
    const maxMsgs = Math.max(...msgValues, 1);
    const wrapper = document.createElement("div");
    wrapper.className = "daily-chart-container";
    const title = document.createElement("div");
    title.className = "daily-chart-title";
    title.textContent = "Last 30 days";
    wrapper.appendChild(title);
    const chart = document.createElement("div");
    chart.className = "daily-chart";
    for (let i = 0; i < days.length; i++) {
      const tokenVal = tokenValues[i] ?? 0;
      const msgVal = msgValues[i] ?? 0;
      const toolVal = toolValues[i] ?? 0;
      const dayStr = days[i] ?? "";
      const col = document.createElement("div");
      col.className = "daily-chart-col";
      const bar = document.createElement("div");
      bar.className = "daily-chart-bar";
      const pct = tokenVal / maxTokens * 100;
      bar.style.height = Math.max(pct, tokenVal > 0 ? 3 : 0) + "%";
      const msgPct = msgVal / maxMsgs * 100;
      const msgBar = document.createElement("div");
      msgBar.className = "daily-chart-bar-msgs";
      msgBar.style.height = Math.max(msgPct, msgVal > 0 ? 3 : 0) + "%";
      const d = new Date(dayStr);
      const dayLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const tokStr = formatTokenCount(tokenVal);
      col.title = `${dayLabel}
${tokStr} tokens
${msgVal} messages
${toolVal} tool calls`;
      const label = document.createElement("div");
      label.className = "daily-chart-label";
      label.textContent = d.getDate().toString();
      col.appendChild(bar);
      col.appendChild(msgBar);
      col.appendChild(label);
      chart.appendChild(col);
    }
    wrapper.appendChild(chart);
    const legend = document.createElement("div");
    legend.className = "daily-chart-legend";
    legend.innerHTML = '<span class="daily-chart-legend-dot tokens"></span> Tokens <span class="daily-chart-legend-dot msgs"></span> Messages';
    wrapper.appendChild(legend);
    container.appendChild(wrapper);
  };
  var buildHeatmap = (counts, container) => {
    const heatmapContainer = document.createElement("div");
    heatmapContainer.className = "heatmap-container";
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();
    const endDate = new Date(today);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (52 * 7 + dayOfWeek));
    const monthLabels = document.createElement("div");
    monthLabels.className = "heatmap-month-labels";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let lastMonth = -1;
    const weekStarts = [];
    const d = new Date(startDate);
    while (d <= endDate) {
      if (d.getDay() === 0) {
        weekStarts.push(new Date(d));
      }
      d.setDate(d.getDate() + 1);
    }
    const colWidth = 16;
    for (let w2 = 0; w2 < weekStarts.length; w2++) {
      const weekStart = weekStarts[w2];
      if (!weekStart) continue;
      const m2 = weekStart.getMonth();
      if (m2 !== lastMonth) {
        const label = document.createElement("span");
        label.className = "heatmap-month-label";
        label.textContent = months[m2] ?? "";
        label.style.position = "absolute";
        label.style.left = w2 * colWidth + "px";
        monthLabels.appendChild(label);
        lastMonth = m2;
      }
    }
    monthLabels.style.position = "relative";
    monthLabels.style.height = "16px";
    heatmapContainer.appendChild(monthLabels);
    const wrapper = document.createElement("div");
    wrapper.className = "heatmap-grid-wrapper";
    const dayLabelsEl = document.createElement("div");
    dayLabelsEl.className = "heatmap-day-labels";
    const dayNames = ["", "Mon", "", "Wed", "", "Fri", ""];
    for (const name of dayNames) {
      const label = document.createElement("div");
      label.className = "heatmap-day-label";
      label.textContent = name;
      dayLabelsEl.appendChild(label);
    }
    wrapper.appendChild(dayLabelsEl);
    const nonZero = Object.values(counts).filter((c) => c > 0).sort((a, b2) => a - b2);
    const q1 = nonZero[Math.floor(nonZero.length * 0.25)] || 1;
    const q2 = nonZero[Math.floor(nonZero.length * 0.5)] || 2;
    const q3 = nonZero[Math.floor(nonZero.length * 0.75)] || 3;
    const grid = document.createElement("div");
    grid.className = "heatmap-grid";
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const count = counts[dateStr] || 0;
      let level = 0;
      if (count > 0) {
        if (count <= q1) level = 1;
        else if (count <= q2) level = 2;
        else if (count <= q3) level = 3;
        else level = 4;
      }
      const cell = document.createElement("div");
      cell.className = `heatmap-cell heatmap-level-${level}`;
      const displayDate = cursor.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      cell.title = count > 0 ? `${displayDate}: ${count} messages` : `${displayDate}: No activity`;
      grid.appendChild(cell);
      cursor.setDate(cursor.getDate() + 1);
    }
    wrapper.appendChild(grid);
    heatmapContainer.appendChild(wrapper);
    const legend = document.createElement("div");
    legend.className = "heatmap-legend";
    const lessLabel = document.createElement("span");
    lessLabel.className = "heatmap-legend-label";
    lessLabel.textContent = "Less";
    legend.appendChild(lessLabel);
    for (let i = 0; i <= 4; i++) {
      const cell = document.createElement("div");
      cell.className = `heatmap-legend-cell heatmap-level-${i}`;
      legend.appendChild(cell);
    }
    const moreLabel = document.createElement("span");
    moreLabel.className = "heatmap-legend-label";
    moreLabel.textContent = "More";
    legend.appendChild(moreLabel);
    heatmapContainer.appendChild(legend);
    container.appendChild(heatmapContainer);
  };
  var buildStatsSummary = (stats, dailyMap, container) => {
    const summaryEl = document.createElement("div");
    summaryEl.className = "stats-summary";
    const { current: currentStreak, longest: longestStreak } = calculateStreak(dailyMap);
    let totalMessages = 0;
    for (const count of Object.values(dailyMap)) {
      totalMessages += count;
    }
    if (stats.totalMessages && stats.totalMessages > totalMessages) {
      totalMessages = stats.totalMessages;
    }
    const totalSessions = stats.totalSessions || Object.keys(dailyMap).length;
    const models = stats.modelUsage || {};
    const cards = [
      { value: totalSessions.toLocaleString(), label: "Total Sessions" },
      { value: totalMessages.toLocaleString(), label: "Total Messages" },
      { value: currentStreak + "d", label: "Current Streak" },
      { value: longestStreak + "d", label: "Longest Streak" }
    ];
    for (const [model, usage] of Object.entries(models)) {
      const shortName = model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
      const tokens = (usage?.inputTokens || 0) + (usage?.outputTokens || 0);
      const valueStr = formatTokenCount(tokens);
      cards.push({ value: valueStr, label: shortName + " tokens" });
    }
    for (const card of cards) {
      const el2 = document.createElement("div");
      el2.className = "stat-card";
      el2.innerHTML = `<span class="stat-card-value">${escapeHtml(card.value)}</span><span class="stat-card-label">${escapeHtml(card.label)}</span>`;
      summaryEl.appendChild(el2);
    }
    container.appendChild(summaryEl);
  };
  var loadStats = async () => {
    const statsViewerBody = getStatsViewerBody();
    if (!statsViewerBody) return;
    const stats = await window.api.getStats();
    statsViewerBody.innerHTML = "";
    if (!stats) {
      statsViewerBody.innerHTML = '<div class="plans-empty">No stats data found. Run some Claude sessions first.</div>';
      return;
    }
    const rawDaily = stats.dailyActivity || {};
    const dailyMap = {};
    if (Array.isArray(rawDaily)) {
      for (const entry of rawDaily) {
        dailyMap[entry.date] = entry.messageCount || 0;
      }
    } else {
      for (const [date, data] of Object.entries(rawDaily)) {
        dailyMap[date] = typeof data === "number" ? data : data?.messageCount || data?.messages || data?.count || 0;
      }
    }
    buildHeatmap(dailyMap, statsViewerBody);
    buildDailyBarChart(stats, statsViewerBody);
    buildStatsSummary(stats, dailyMap, statsViewerBody);
    const notice = document.createElement("div");
    notice.className = "stats-notice";
    const lastDate = stats.lastComputedDate || "unknown";
    notice.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="vertical-align:-2px;margin-right:6px;flex-shrink:0"><circle cx="8" cy="8" r="7"/><line x1="8" y1="5" x2="8" y2="9"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none"/></svg>Data sourced from Claude\u2019s stats cache (last updated ${escapeHtml(lastDate)}). Run <code>/stats</code> in a Claude session to refresh.`;
    statsViewerBody.appendChild(notice);
  };

  // src/renderer/views/settings.ts
  var settingsViewer;
  var settingsViewerTitle;
  var settingsViewerBody;
  var placeholder2;
  var terminalArea;
  var planViewer2;
  var statsViewer;
  var memoryViewer2;
  var callbacks3;
  var initSettings = (cb) => {
    callbacks3 = cb;
    settingsViewer = document.getElementById("settings-viewer");
    settingsViewerTitle = document.getElementById("settings-viewer-title");
    settingsViewerBody = document.getElementById("settings-viewer-body");
    placeholder2 = document.getElementById("placeholder");
    terminalArea = document.getElementById("terminal-area");
    planViewer2 = document.getElementById("plan-viewer");
    statsViewer = document.getElementById("stats-viewer");
    memoryViewer2 = document.getElementById("memory-viewer");
  };
  var openSettingsViewer = async (scope, projectPath) => {
    const isProject = scope === "project";
    const settingsKey = isProject ? `project:${projectPath}` : "global";
    const current = await window.api.getSetting(settingsKey) ?? {};
    const globalSettings = isProject ? await window.api.getSetting("global") ?? {} : {};
    const shortName = isProject ? (projectPath ?? "").split("/").filter(Boolean).slice(-2).join("/") : "Global";
    settingsViewerTitle.textContent = (isProject ? "Project Settings \u2014 " : "Global Settings \u2014 ") + shortName;
    placeholder2.style.display = "none";
    terminalArea.style.display = "none";
    planViewer2.style.display = "none";
    statsViewer.style.display = "none";
    memoryViewer2.style.display = "none";
    settingsViewer.style.display = "flex";
    const useGlobalCheckbox = (fieldName) => {
      if (!isProject) return "";
      const useGlobal = current[fieldName] === void 0 || current[fieldName] === null;
      return `<label class="settings-use-global"><input type="checkbox" data-field="${fieldName}" class="use-global-cb" ${useGlobal ? "checked" : ""}> Use global default</label>`;
    };
    const fieldValue = (fieldName, fallback) => {
      if (isProject && (current[fieldName] === void 0 || current[fieldName] === null)) {
        return globalSettings[fieldName] !== void 0 ? globalSettings[fieldName] : fallback;
      }
      return current[fieldName] !== void 0 ? current[fieldName] : fallback;
    };
    const fieldDisabled = (fieldName) => {
      if (!isProject) return "";
      return current[fieldName] === void 0 || current[fieldName] === null ? "disabled" : "";
    };
    const permModeValue = fieldValue("permissionMode", "");
    const worktreeValue = fieldValue("worktree", false);
    const worktreeNameValue = fieldValue("worktreeName", "");
    const chromeValue = fieldValue("chrome", false);
    const preLaunchValue = fieldValue("preLaunchCmd", "");
    const addDirsValue = fieldValue("addDirs", "");
    const visCountValue = fieldValue("visibleSessionCount", 10);
    const maxAgeValue = fieldValue("sessionMaxAgeDays", 3);
    const themeValue = fieldValue("terminalTheme", "switchboard");
    const mcpEmulationValue = fieldValue("mcpEmulation", true);
    const webServerEnabledValue = fieldValue("webServerEnabled", false);
    const webServerPortValue = fieldValue("webServerPort", 8081);
    settingsViewerBody.innerHTML = `
    <div class="settings-form">
      <div class="settings-section">
        <div class="settings-section-title">Claude CLI Options</div>
        <div class="settings-hint">These options are passed to the <code>claude</code> command when launching sessions.</div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Permission Mode</span>
            ${useGlobalCheckbox("permissionMode")}
          </div>
          <select class="settings-select" id="sv-perm-mode" ${fieldDisabled("permissionMode")}>
            <option value="">Default (none)</option>
            <option value="acceptEdits" ${permModeValue === "acceptEdits" ? "selected" : ""}>Accept Edits</option>
            <option value="plan" ${permModeValue === "plan" ? "selected" : ""}>Plan Mode</option>
            <option value="dontAsk" ${permModeValue === "dontAsk" ? "selected" : ""}>Don't Ask</option>
            <option value="bypassPermissions" ${permModeValue === "bypassPermissions" ? "selected" : ""}>Bypass</option>
          </select>
        </div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Worktree</span>
            ${useGlobalCheckbox("worktree")}
          </div>
          <div class="settings-checkbox-row">
            <input type="checkbox" id="sv-worktree" ${worktreeValue ? "checked" : ""} ${fieldDisabled("worktree")}>
            <label for="sv-worktree">Enable worktree for new sessions</label>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Worktree Name</span>
            ${useGlobalCheckbox("worktreeName")}
          </div>
          <input type="text" class="settings-input" id="sv-worktree-name" placeholder="auto" value="${escapeHtml(worktreeNameValue)}" ${fieldDisabled("worktreeName")}>
        </div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Chrome</span>
            ${useGlobalCheckbox("chrome")}
          </div>
          <div class="settings-checkbox-row">
            <input type="checkbox" id="sv-chrome" ${chromeValue ? "checked" : ""} ${fieldDisabled("chrome")}>
            <label for="sv-chrome">Enable Chrome browser automation</label>
          </div>
        </div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Additional Directories</span>
            ${useGlobalCheckbox("addDirs")}
          </div>
          <input type="text" class="settings-input" id="sv-add-dirs" placeholder="/path/to/dir1, /path/to/dir2" value="${escapeHtml(addDirsValue)}" ${fieldDisabled("addDirs")}>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Session Launch</div>
        <div class="settings-hint">Options that control how sessions are started.</div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Pre-launch Command</span>
            ${useGlobalCheckbox("preLaunchCmd")}
          </div>
          <div class="settings-hint">Prepended to the claude command (e.g. "aws-vault exec profile --" or "source .env &&")</div>
          <input type="text" class="settings-input" id="sv-pre-launch" placeholder="e.g. aws-vault exec profile --" value="${escapeHtml(preLaunchValue)}" ${fieldDisabled("preLaunchCmd")}>
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
            ${Object.entries(TERMINAL_THEMES).map(
      ([key, t]) => `<option value="${key}" ${themeValue === key ? "selected" : ""}>${escapeHtml(t.label)}</option>`
    ).join("")}
          </select>
        </div>` : ""}

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Max Visible Sessions</span>
            ${useGlobalCheckbox("visibleSessionCount")}
          </div>
          <div class="settings-hint">Show up to this many sessions before collapsing the rest behind "+N older"</div>
          <input type="number" class="settings-input" id="sv-visible-count" min="1" max="100" value="${visCountValue}" ${fieldDisabled("visibleSessionCount")}>
        </div>

        ${!isProject ? `<div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Hide Sessions Older Than (days)</span>
          </div>
          <div class="settings-hint">Sessions older than this are hidden behind "+N older" even if under the count limit</div>
          <input type="number" class="settings-input" id="sv-max-age" min="1" max="365" value="${maxAgeValue}">
        </div>` : ""}

        ${!isProject ? `<div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">IDE Emulation</span>
          </div>
          <div class="settings-checkbox-row">
            <input type="checkbox" id="sv-mcp-emulation" ${mcpEmulationValue ? "checked" : ""}>
            <label for="sv-mcp-emulation">Emulate an IDE for Claude CLI sessions</label>
          </div>
          <div class="settings-hint">When enabled, Switchboard acts as an IDE so Claude can open files and diffs in a side panel. Disable this if you want Claude to use your own IDE (e.g. VS Code, Cursor) instead. Changes take effect for new sessions only \u2014 running sessions are not affected.</div>
        </div>` : ""}
      </div>

      ${!isProject ? `<div class="settings-section">
        <div class="settings-section-title">Web Server</div>
        <div class="settings-hint">Serve Switchboard as a web interface accessible from a browser.</div>

        <div class="settings-field">
          <div class="settings-field-header">
            <span class="settings-label">Enable Web Interface</span>
          </div>
          <div class="settings-checkbox-row">
            <input type="checkbox" id="sv-web-server-enabled" ${webServerEnabledValue ? "checked" : ""}>
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
      </div>` : ""}

      <button class="settings-save-btn" id="sv-save-btn">Save Settings</button>
      ${isProject ? '<button class="settings-remove-btn" id="sv-remove-btn">Remove Project</button>' : ""}
    </div>
  `;
    const fieldMap = {
      permissionMode: "sv-perm-mode",
      worktree: "sv-worktree",
      worktreeName: "sv-worktree-name",
      chrome: "sv-chrome",
      preLaunchCmd: "sv-pre-launch",
      addDirs: "sv-add-dirs",
      visibleSessionCount: "sv-visible-count"
    };
    settingsViewerBody.querySelectorAll(".use-global-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        const field = cb.dataset.field;
        if (!field) return;
        const inputId = fieldMap[field];
        if (!inputId) return;
        const input = settingsViewerBody.querySelector(`#${inputId}`);
        if (input) input.disabled = cb.checked;
      });
    });
    settingsViewerBody.querySelector("#sv-save-btn").addEventListener("click", async () => {
      const settings = {};
      if (isProject) {
        const projectFieldReaders = {
          permissionMode: () => settingsViewerBody.querySelector("#sv-perm-mode").value || null,
          worktree: () => settingsViewerBody.querySelector("#sv-worktree").checked,
          worktreeName: () => settingsViewerBody.querySelector("#sv-worktree-name").value.trim(),
          chrome: () => settingsViewerBody.querySelector("#sv-chrome").checked,
          preLaunchCmd: () => settingsViewerBody.querySelector("#sv-pre-launch").value.trim(),
          addDirs: () => settingsViewerBody.querySelector("#sv-add-dirs").value.trim(),
          visibleSessionCount: () => parseInt(settingsViewerBody.querySelector("#sv-visible-count").value) || 10
        };
        settingsViewerBody.querySelectorAll(".use-global-cb").forEach((cb) => {
          if (!cb.checked) {
            const field = cb.dataset.field;
            if (field && projectFieldReaders[field]) {
              settings[field] = projectFieldReaders[field]();
            }
          }
        });
      } else {
        settings.permissionMode = settingsViewerBody.querySelector("#sv-perm-mode").value || null;
        settings.worktree = settingsViewerBody.querySelector("#sv-worktree").checked;
        settings.worktreeName = settingsViewerBody.querySelector("#sv-worktree-name").value.trim();
        settings.chrome = settingsViewerBody.querySelector("#sv-chrome").checked;
        settings.preLaunchCmd = settingsViewerBody.querySelector("#sv-pre-launch").value.trim();
        settings.addDirs = settingsViewerBody.querySelector("#sv-add-dirs").value.trim();
        settings.visibleSessionCount = parseInt(settingsViewerBody.querySelector("#sv-visible-count").value) || 10;
        settings.sessionMaxAgeDays = parseInt(settingsViewerBody.querySelector("#sv-max-age").value) || 3;
        settings.terminalTheme = settingsViewerBody.querySelector("#sv-terminal-theme").value || "switchboard";
        settings.mcpEmulation = settingsViewerBody.querySelector("#sv-mcp-emulation").checked;
        settings.webServerEnabled = settingsViewerBody.querySelector("#sv-web-server-enabled").checked;
        settings.webServerPort = parseInt(settingsViewerBody.querySelector("#sv-web-server-port").value) || 8081;
      }
      if (!isProject) {
        const existing = await window.api.getSetting("global") ?? {};
        if (existing.windowBounds) settings.windowBounds = existing.windowBounds;
        if (existing.sidebarWidth) settings.sidebarWidth = existing.sidebarWidth;
      }
      await window.api.setSetting(settingsKey, settings);
      if (!isProject) {
        if (settings.visibleSessionCount) {
          setVisibleSessionCount(settings.visibleSessionCount);
        }
        if (settings.sessionMaxAgeDays) {
          setSessionMaxAgeDays(settings.sessionMaxAgeDays);
        }
        if (settings.terminalTheme) {
          setTerminalTheme(settings.terminalTheme);
          const theme = getTerminalTheme();
          for (const [, entry] of openSessions) {
            entry.terminal.options.theme = theme;
          }
        }
        callbacks3.refreshSidebar();
      }
      if (!isProject && settings.mcpEmulation !== mcpEmulationValue) {
        const notice = document.createElement("div");
        notice.className = "settings-notice";
        notice.textContent = "IDE Emulation setting changed. New sessions will use the updated setting \u2014 running sessions are not affected.";
        const saveBtn = settingsViewerBody.querySelector("#sv-save-btn");
        saveBtn.parentElement.insertBefore(notice, saveBtn);
        setTimeout(() => notice.remove(), 8e3);
      }
      const btn = settingsViewerBody.querySelector("#sv-save-btn");
      btn.classList.add("saved");
      btn.textContent = "Saved!";
      setTimeout(() => {
        btn.classList.remove("saved");
        btn.textContent = "Save Settings";
      }, 1500);
    });
    const removeBtn = settingsViewerBody.querySelector("#sv-remove-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", async () => {
        const confirmed = confirm(
          `Remove project "${shortName}" from Switchboard?

This hides the project from the sidebar. Your session files are not deleted.`
        );
        if (!confirmed) return;
        await window.api.removeProject(projectPath);
        settingsViewer.style.display = "none";
        placeholder2.style.display = "flex";
        callbacks3.loadProjects();
      });
    }
  };

  // src/renderer/views/file-panel.ts
  var filePanelState = /* @__PURE__ */ new Map();
  var filePanelEl = null;
  var filePanelHeaderEl = null;
  var filePanelPathEl = null;
  var filePanelBodyEl = null;
  var filePanelActionsEl = null;
  var filePanelResizeHandle = null;
  var terminalSplitEl = null;
  var currentPanelSessionId = null;
  var PANEL_WIDTH_KEY = "filePanelWidth";
  var DEFAULT_PANEL_WIDTH = parseInt(localStorage.getItem(PANEL_WIDTH_KEY) ?? "", 10) || 450;
  var MIN_PANEL_WIDTH = 280;
  var DIFF_MODE_KEY = "filePanelDiffMode";
  var diffMode = localStorage.getItem(DIFF_MODE_KEY) || "side-by-side";
  var mcpIndicatorEl = null;
  var initFilePanel = () => {
    const terminalArea2 = document.getElementById("terminal-area");
    const terminalsEl2 = document.getElementById("terminals");
    if (!terminalArea2 || !terminalsEl2) return;
    terminalSplitEl = document.createElement("div");
    terminalSplitEl.id = "terminal-split";
    terminalArea2.removeChild(terminalsEl2);
    terminalSplitEl.appendChild(terminalsEl2);
    filePanelResizeHandle = document.createElement("div");
    filePanelResizeHandle.id = "file-panel-resize-handle";
    terminalSplitEl.appendChild(filePanelResizeHandle);
    filePanelEl = document.createElement("div");
    filePanelEl.id = "file-panel";
    filePanelHeaderEl = document.createElement("div");
    filePanelHeaderEl.id = "file-panel-header";
    filePanelEl.appendChild(filePanelHeaderEl);
    const toolbarEl = document.createElement("div");
    toolbarEl.id = "file-panel-toolbar";
    filePanelPathEl = document.createElement("div");
    filePanelPathEl.className = "file-panel-path";
    toolbarEl.appendChild(filePanelPathEl);
    const diffToggleBtn = document.createElement("button");
    diffToggleBtn.id = "diff-mode-toggle";
    diffToggleBtn.title = diffMode === "inline" ? "Switch to side-by-side diff" : "Switch to inline diff";
    diffToggleBtn.textContent = diffMode === "inline" ? "Side-by-Side" : "Inline";
    diffToggleBtn.addEventListener("click", () => {
      diffMode = diffMode === "inline" ? "side-by-side" : "inline";
      localStorage.setItem(DIFF_MODE_KEY, diffMode);
      diffToggleBtn.textContent = diffMode === "inline" ? "Side-by-Side" : "Inline";
      diffToggleBtn.title = diffMode === "inline" ? "Switch to side-by-side diff" : "Switch to inline diff";
      if (currentPanelSessionId) {
        const state = getSessionState(currentPanelSessionId);
        const activeTab2 = state.activeTabId ? state.tabs.get(state.activeTabId) : null;
        if (activeTab2 && activeTab2.type === "diff") {
          activeTab2.editorView = null;
          renderTabContent(currentPanelSessionId, activeTab2);
        }
      }
    });
    toolbarEl.appendChild(diffToggleBtn);
    filePanelEl.appendChild(toolbarEl);
    filePanelBodyEl = document.createElement("div");
    filePanelBodyEl.id = "file-panel-body";
    filePanelEl.appendChild(filePanelBodyEl);
    filePanelActionsEl = document.createElement("div");
    filePanelActionsEl.id = "file-panel-actions";
    filePanelActionsEl.style.display = "none";
    filePanelEl.appendChild(filePanelActionsEl);
    terminalSplitEl.appendChild(filePanelEl);
    terminalArea2.appendChild(terminalSplitEl);
    wireIpcListeners2();
    setupPanelResizeHandle();
    addMcpToggle();
  };
  var wireIpcListeners2 = () => {
    window.api.onMcpOpenDiff((sessionId, diffId, data) => {
      openDiffTab(sessionId, diffId, data);
    });
    window.api.onMcpOpenFile((sessionId, data) => {
      openFileTab(sessionId, data);
    });
    window.api.onMcpCloseAllDiffs((sessionId) => {
      closeAllDiffTabs(sessionId);
    });
    window.api.onMcpCloseTab((sessionId, diffId) => {
      closeDiffTabByDiffId(sessionId, diffId);
    });
  };
  var getSessionState = (sessionId) => {
    let state = filePanelState.get(sessionId);
    if (!state) {
      state = {
        tabs: /* @__PURE__ */ new Map(),
        activeTabId: null,
        panelVisible: false,
        panelWidth: DEFAULT_PANEL_WIDTH,
        mcpActive: false
      };
      filePanelState.set(sessionId, state);
    }
    return state;
  };
  var setSessionMcpActive = (sessionId, active) => {
    const state = getSessionState(sessionId);
    state.mcpActive = active;
    if (currentPanelSessionId === sessionId) {
      updateMcpIndicator();
    }
  };
  var rekeyFilePanelState = (oldId, newId) => {
    const state = filePanelState.get(oldId);
    if (state) {
      filePanelState.delete(oldId);
      filePanelState.set(newId, state);
    }
  };
  var openDiffTab = (sessionId, diffId, data) => {
    const state = getSessionState(sessionId);
    const tabId = `diff:${diffId}`;
    const label = data.tabName || basename(data.oldFilePath);
    state.tabs.set(tabId, {
      tabId,
      type: "diff",
      label,
      filePath: data.oldFilePath,
      diffId,
      oldContent: data.oldContent,
      newContent: data.newContent,
      resolved: false,
      editorView: null
    });
    state.activeTabId = tabId;
    state.panelVisible = true;
    if (currentPanelSessionId === sessionId) {
      showPanel(state);
      renderPanel(sessionId);
    }
  };
  var openFileTab = (sessionId, data) => {
    const state = getSessionState(sessionId);
    const tabId = `file:${data.filePath}`;
    const label = basename(data.filePath);
    const existing = state.tabs.get(tabId);
    if (existing && existing.type === "file") {
      existing.content = data.content;
      if (existing.editorView) {
        existing.editorView.destroy();
        existing.editorView = null;
      }
    } else {
      state.tabs.set(tabId, {
        tabId,
        type: "file",
        label,
        filePath: data.filePath,
        content: data.content,
        editorView: null
      });
    }
    state.activeTabId = tabId;
    state.panelVisible = true;
    if (currentPanelSessionId === sessionId) {
      showPanel(state);
      renderPanel(sessionId);
    }
  };
  var openFileInPanel = async (sessionId, filePath) => {
    const result = await window.api.readFileForPanel(filePath);
    if (!result.ok) return false;
    openFileTab(sessionId, {
      filePath,
      content: result.content ?? "",
      preview: false,
      startText: "",
      endText: ""
    });
    return true;
  };
  var openDiffInPanel = (sessionId, filePath, oldContent, newContent) => {
    const diffId = `chat-${Date.now()}`;
    openDiffTab(sessionId, diffId, {
      oldFilePath: filePath,
      oldContent,
      newContent,
      tabName: basename(filePath)
    });
  };
  var closeTab = (sessionId, tabId) => {
    const state = getSessionState(sessionId);
    const tab = state.tabs.get(tabId);
    if (!tab) return;
    if (tab.type === "diff" && !tab.resolved) {
      window.api.mcpDiffResponse(sessionId, tab.diffId, "reject", null);
    }
    if (tab.editorView) {
      tab.editorView.destroy();
      tab.editorView = null;
    }
    state.tabs.delete(tabId);
    if (state.activeTabId === tabId) {
      const remaining = [...state.tabs.keys()];
      state.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }
    if (state.tabs.size === 0) {
      state.panelVisible = false;
      if (currentPanelSessionId === sessionId) {
        hidePanel();
      }
    } else if (currentPanelSessionId === sessionId) {
      renderPanel(sessionId);
    }
  };
  var closeAllDiffTabs = (sessionId) => {
    const state = getSessionState(sessionId);
    for (const [tabId, tab] of state.tabs) {
      if (tab.type === "diff") {
        if (tab.editorView) {
          tab.editorView.destroy();
          tab.editorView = null;
        }
        state.tabs.delete(tabId);
      }
    }
    if (state.activeTabId && !state.tabs.has(state.activeTabId)) {
      const remaining = [...state.tabs.keys()];
      state.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }
    if (state.tabs.size === 0) {
      state.panelVisible = false;
      if (currentPanelSessionId === sessionId) hidePanel();
    } else if (currentPanelSessionId === sessionId) {
      renderPanel(sessionId);
    }
  };
  var closeDiffTabByDiffId = (sessionId, diffId) => {
    const state = filePanelState.get(sessionId);
    if (!state) return;
    const tabId = `diff:${diffId}`;
    const tab = state.tabs.get(tabId);
    if (!tab) return;
    if (tab.type === "diff") {
      tab.resolved = true;
    }
    if (tab.editorView) {
      tab.editorView.destroy();
      tab.editorView = null;
    }
    state.tabs.delete(tabId);
    if (state.activeTabId === tabId) {
      const remaining = [...state.tabs.keys()];
      state.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }
    if (state.tabs.size === 0) {
      state.panelVisible = false;
      if (currentPanelSessionId === sessionId) hidePanel();
    } else if (currentPanelSessionId === sessionId) {
      renderPanel(sessionId);
    }
  };
  var showPanel = (state) => {
    if (!filePanelEl || !filePanelResizeHandle) return;
    filePanelEl.classList.add("open");
    filePanelEl.style.width = `${state.panelWidth || DEFAULT_PANEL_WIDTH}px`;
    filePanelResizeHandle.style.display = "block";
    refitActiveTerminal();
  };
  var hidePanel = () => {
    if (!filePanelEl || !filePanelResizeHandle) return;
    filePanelEl.classList.remove("open");
    filePanelEl.style.width = "0";
    filePanelResizeHandle.style.display = "none";
    refitActiveTerminal();
  };
  var switchPanel = (sessionId) => {
    currentPanelSessionId = sessionId;
    clearPanelEditors();
    updateMcpIndicator();
    if (!sessionId) {
      hidePanel();
      return;
    }
    const state = getSessionState(sessionId);
    if (state.panelVisible && state.tabs.size > 0) {
      showPanel(state);
      renderPanel(sessionId);
    } else {
      hidePanel();
    }
  };
  var updateMcpIndicator = () => {
    if (!mcpIndicatorEl) return;
    if (!currentPanelSessionId) {
      mcpIndicatorEl.style.display = "none";
      return;
    }
    const state = filePanelState.get(currentPanelSessionId);
    mcpIndicatorEl.style.display = state?.mcpActive ? "" : "none";
  };
  var renderPanel = (sessionId) => {
    if (!filePanelEl || currentPanelSessionId !== sessionId) return;
    const state = getSessionState(sessionId);
    renderTabBar(sessionId, state);
    const activeTab2 = state.activeTabId ? state.tabs.get(state.activeTabId) : void 0;
    renderTabContent(sessionId, activeTab2 ?? null);
  };
  var renderTabBar = (sessionId, state) => {
    if (!filePanelHeaderEl) return;
    filePanelHeaderEl.innerHTML = "";
    for (const [tabId, tab] of state.tabs) {
      const tabEl = document.createElement("button");
      tabEl.className = "file-tab";
      if (tabId === state.activeTabId) tabEl.classList.add("active");
      if (tab.type === "diff") {
        tabEl.classList.add("is-diff");
        if (tab.resolved) tabEl.classList.add("resolved");
      }
      const labelSpan = document.createElement("span");
      labelSpan.textContent = tab.label;
      tabEl.appendChild(labelSpan);
      const closeBtn = document.createElement("span");
      closeBtn.className = "file-tab-close";
      closeBtn.textContent = "\xD7";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeTab(sessionId, tabId);
      });
      tabEl.appendChild(closeBtn);
      tabEl.addEventListener("click", () => {
        state.activeTabId = tabId;
        renderPanel(sessionId);
      });
      filePanelHeaderEl.appendChild(tabEl);
    }
  };
  var renderTabContent = (sessionId, tab) => {
    clearPanelEditors();
    const toggleBtn = document.getElementById("diff-mode-toggle");
    if (!tab) {
      if (filePanelPathEl) filePanelPathEl.textContent = "";
      if (filePanelActionsEl) filePanelActionsEl.style.display = "none";
      if (toggleBtn) toggleBtn.style.display = "none";
      return;
    }
    if (filePanelPathEl) filePanelPathEl.textContent = tab.filePath || "";
    if (tab.type === "diff") {
      if (toggleBtn) toggleBtn.style.display = "";
      renderDiffContent(sessionId, tab);
    } else {
      if (toggleBtn) toggleBtn.style.display = "none";
      renderFileContent(tab);
    }
  };
  var renderDiffContent = (sessionId, tab) => {
    if (!filePanelBodyEl || !filePanelActionsEl || !filePanelHeaderEl) return;
    if (!tab.editorView) {
      if (diffMode === "inline") {
        tab.editorView = window.createUnifiedMergeViewer(
          filePanelBodyEl,
          tab.oldContent,
          tab.newContent,
          tab.filePath
        );
        tab._diffMode = "inline";
      } else {
        tab.editorView = window.createMergeViewer(
          filePanelBodyEl,
          tab.oldContent,
          tab.newContent,
          tab.filePath
        );
        tab._diffMode = "side-by-side";
      }
    } else {
      filePanelBodyEl.appendChild(tab.editorView.dom);
    }
    if (!tab.resolved) {
      filePanelActionsEl.style.display = "flex";
      filePanelActionsEl.innerHTML = "";
      const acceptBtn = document.createElement("button");
      acceptBtn.className = "file-panel-accept-btn";
      acceptBtn.textContent = "Accept";
      acceptBtn.addEventListener("click", () => {
        handleDiffAction(sessionId, tab, "accept");
      });
      const rejectBtn = document.createElement("button");
      rejectBtn.className = "file-panel-reject-btn";
      rejectBtn.textContent = "Reject";
      rejectBtn.addEventListener("click", () => {
        handleDiffAction(sessionId, tab, "reject");
      });
      filePanelActionsEl.appendChild(acceptBtn);
      filePanelActionsEl.appendChild(rejectBtn);
    } else {
      filePanelActionsEl.style.display = "none";
    }
  };
  var renderFileContent = (tab) => {
    if (!filePanelBodyEl || !filePanelActionsEl) return;
    filePanelActionsEl.style.display = "none";
    if (!tab.editorView) {
      tab.editorView = window.createReadOnlyViewer(
        filePanelBodyEl,
        tab.content,
        tab.filePath
      );
    } else {
      filePanelBodyEl.appendChild(tab.editorView.dom);
    }
  };
  var clearPanelEditors = () => {
    if (filePanelBodyEl) {
      filePanelBodyEl.innerHTML = "";
    }
  };
  var handleDiffAction = (sessionId, tab, action) => {
    if (tab.resolved) return;
    tab.resolved = true;
    if (action === "accept") {
      let editedContent = null;
      if (tab.editorView) {
        if (tab._diffMode === "inline") {
          editedContent = tab.editorView.state?.doc.toString() ?? null;
        } else {
          const mergeView = tab.editorView;
          editedContent = mergeView.b?.state.doc.toString() ?? null;
        }
      }
      if (editedContent && editedContent !== tab.newContent) {
        window.api.mcpDiffResponse(sessionId, tab.diffId, "accept-edited", editedContent);
      } else {
        window.api.mcpDiffResponse(sessionId, tab.diffId, "accept", null);
      }
    } else {
      window.api.mcpDiffResponse(sessionId, tab.diffId, "reject", null);
    }
    if (filePanelHeaderEl) {
      const tabEl = filePanelHeaderEl.querySelector(".file-tab.active");
      if (tabEl) tabEl.classList.add("resolved");
    }
    if (filePanelActionsEl) {
      filePanelActionsEl.style.display = "none";
    }
  };
  var addMcpToggle = () => {
    const controls = document.getElementById("terminal-header-controls");
    if (!controls) return;
    mcpIndicatorEl = document.createElement("span");
    mcpIndicatorEl.className = "mcp-toggle enabled";
    mcpIndicatorEl.title = "IDE Emulation is active. Go to Global Settings to disable.";
    mcpIndicatorEl.textContent = "IDE Emulation";
    mcpIndicatorEl.style.display = "none";
    const stopBtn = document.getElementById("terminal-stop-btn");
    if (stopBtn) {
      controls.insertBefore(mcpIndicatorEl, stopBtn);
    } else {
      controls.appendChild(mcpIndicatorEl);
    }
  };
  var setupPanelResizeHandle = () => {
    if (!filePanelResizeHandle) return;
    let startX = 0;
    let startWidth = 0;
    const onMouseMove = (e) => {
      if (!filePanelEl) return;
      const delta = startX - e.clientX;
      const newWidth = Math.max(MIN_PANEL_WIDTH, startWidth + delta);
      filePanelEl.style.width = `${newWidth}px`;
    };
    const onMouseUp = () => {
      if (filePanelResizeHandle) {
        filePanelResizeHandle.classList.remove("dragging");
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (filePanelEl) {
        const w2 = filePanelEl.offsetWidth;
        localStorage.setItem(PANEL_WIDTH_KEY, String(w2));
        if (currentPanelSessionId) {
          const state = getSessionState(currentPanelSessionId);
          state.panelWidth = w2;
        }
      }
      refitActiveTerminal();
    };
    const onMouseDown = (e) => {
      e.preventDefault();
      if (!filePanelEl || !filePanelResizeHandle) return;
      startX = e.clientX;
      startWidth = filePanelEl.offsetWidth;
      filePanelResizeHandle.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };
    filePanelResizeHandle.addEventListener("mousedown", onMouseDown);
  };
  var refitActiveTerminal = () => {
    requestAnimationFrame(() => {
      if (currentPanelSessionId) {
        const entry = openSessions.get(currentPanelSessionId);
        if (entry?.fitAddon) {
          try {
            entry.fitAddon.fit();
          } catch {
          }
        }
      }
    });
  };

  // src/renderer/views/jsonl.ts
  var jsonlViewer;
  var jsonlViewerTitle;
  var jsonlViewerSessionId;
  var jsonlViewerBody;
  var initJsonl = () => {
    jsonlViewer = document.getElementById("jsonl-viewer");
    jsonlViewerTitle = document.getElementById("jsonl-viewer-title");
    jsonlViewerSessionId = document.getElementById("jsonl-viewer-session-id");
    jsonlViewerBody = document.getElementById("jsonl-viewer-body");
  };
  var showJsonlViewer = async (session) => {
    const result = await window.api.readSessionJsonl(session.sessionId);
    hideAllViewers();
    document.getElementById("placeholder").style.display = "none";
    document.getElementById("terminal-area").style.display = "none";
    jsonlViewer.style.display = "flex";
    const displayName = session.name || session.summary || session.sessionId;
    jsonlViewerTitle.textContent = displayName;
    jsonlViewerSessionId.textContent = session.sessionId;
    jsonlViewerBody.innerHTML = "";
    if (result.error) {
      jsonlViewerBody.innerHTML = '<div class="plans-empty">Error loading messages: ' + escapeHtml(result.error) + "</div>";
      return;
    }
    const entries = result.entries ?? [];
    let rendered = 0;
    for (const entry of entries) {
      const el2 = renderJsonlEntry(entry);
      if (el2) {
        jsonlViewerBody.appendChild(el2);
        rendered++;
      }
    }
    if (rendered === 0) {
      jsonlViewerBody.innerHTML = '<div class="plans-empty">No messages found in this session.</div>';
    }
  };
  var renderJsonlText = (text) => {
    let html = escapeHtml(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="jsonl-code-block"><code>$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code class="jsonl-inline-code">$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return html;
  };
  var makeCollapsible = (className, headerText, bodyContent, startExpanded) => {
    const wrapper = document.createElement("div");
    wrapper.className = className;
    const header = document.createElement("div");
    header.className = "jsonl-toggle" + (startExpanded ? " expanded" : "");
    header.textContent = headerText;
    const body = document.createElement("pre");
    body.className = "jsonl-tool-body";
    body.style.display = startExpanded ? "" : "none";
    if (typeof bodyContent === "string") {
      body.textContent = bodyContent;
    } else {
      try {
        body.textContent = JSON.stringify(bodyContent, null, 2);
      } catch {
        body.textContent = String(bodyContent);
      }
    }
    header.onclick = () => {
      const showing = body.style.display !== "none";
      body.style.display = showing ? "none" : "";
      header.classList.toggle("expanded", !showing);
    };
    wrapper.appendChild(header);
    wrapper.appendChild(body);
    return wrapper;
  };
  var renderJsonlEntry = (entry) => {
    const ts = entry.timestamp;
    const timeStr = ts ? new Date(ts).toLocaleTimeString() : "";
    if (entry.type === "custom-title") {
      const div2 = document.createElement("div");
      div2.className = "jsonl-entry jsonl-meta-entry";
      div2.innerHTML = '<span class="jsonl-meta-icon">T</span> Title set: <strong>' + escapeHtml(entry.customTitle ?? "") + "</strong>";
      return div2;
    }
    if (entry.type === "system") {
      const div2 = document.createElement("div");
      div2.className = "jsonl-entry jsonl-meta-entry";
      const sysEntry = entry;
      if (sysEntry.subtype === "turn_duration") {
        div2.innerHTML = '<span class="jsonl-meta-icon">&#9201;</span> Turn duration: <strong>' + formatDuration(sysEntry.durationMs ?? 0) + "</strong>" + (timeStr ? ' <span class="jsonl-ts">' + timeStr + "</span>" : "");
      } else if (sysEntry.subtype === "local_command") {
        const cmdMatch = (sysEntry.content ?? "").match(/<command-name>(.*?)<\/command-name>/);
        const cmd = cmdMatch ? cmdMatch[1] : sysEntry.content ?? "unknown";
        div2.innerHTML = '<span class="jsonl-meta-icon">$</span> Command: <code class="jsonl-inline-code">' + escapeHtml(cmd) + "</code>" + (timeStr ? ' <span class="jsonl-ts">' + timeStr + "</span>" : "");
      } else {
        return null;
      }
      return div2;
    }
    if (entry.type === "progress") {
      const data = entry.data;
      if (!data || typeof data !== "object") return null;
      const dt = data["type"];
      if (dt === "bash_progress") {
        const div2 = document.createElement("div");
        div2.className = "jsonl-entry jsonl-meta-entry";
        const elapsed = data["elapsedTimeSeconds"] ? ` (${data["elapsedTimeSeconds"]}s, ${data["totalLines"] ?? 0} lines)` : "";
        div2.innerHTML = '<span class="jsonl-meta-icon">&#9658;</span> Bash output' + escapeHtml(elapsed);
        if (data["output"] || data["fullOutput"]) {
          const output = data["fullOutput"] || data["output"] || "";
          div2.appendChild(makeCollapsible("jsonl-tool-result", "Output", output, false));
        }
        return div2;
      }
      return null;
    }
    let role = null;
    let contentBlocks = null;
    const msgEntry = entry;
    if (entry.type === "user" || entry.type === "message" && msgEntry.role === "user") {
      role = "user";
      contentBlocks = msgEntry.message?.content ?? msgEntry.content;
    } else if (entry.type === "assistant" || entry.type === "message" && msgEntry.role === "assistant") {
      role = "assistant";
      contentBlocks = msgEntry.message?.content ?? msgEntry.content;
    } else {
      return null;
    }
    if (!contentBlocks) return null;
    let blocks;
    if (typeof contentBlocks === "string") {
      blocks = [{ type: "text", text: contentBlocks }];
    } else if (Array.isArray(contentBlocks)) {
      blocks = contentBlocks;
    } else {
      return null;
    }
    const div = document.createElement("div");
    div.className = "jsonl-entry " + (role === "user" ? "jsonl-user" : "jsonl-assistant");
    const labelRow = document.createElement("div");
    labelRow.className = "jsonl-role-label";
    labelRow.textContent = role === "user" ? "User" : "Assistant";
    if (timeStr) {
      const tsSpan = document.createElement("span");
      tsSpan.className = "jsonl-ts";
      tsSpan.textContent = timeStr;
      labelRow.appendChild(tsSpan);
    }
    div.appendChild(labelRow);
    for (const block of blocks) {
      if (block.type === "thinking" && block.thinking) {
        div.appendChild(makeCollapsible("jsonl-thinking", "Thinking", block.thinking, false));
      } else if (block.type === "text" && block.text) {
        const textEl = document.createElement("div");
        textEl.className = "jsonl-text";
        textEl.innerHTML = renderJsonlText(block.text);
        div.appendChild(textEl);
      } else if (block.type === "tool_use") {
        const toolBlock = block;
        div.appendChild(makeCollapsible(
          "jsonl-tool-call",
          "Tool: " + (toolBlock.name ?? "unknown"),
          typeof toolBlock.input === "string" ? toolBlock.input : toolBlock.input,
          false
        ));
      } else if (block.type === "tool_result") {
        const resultBlock = block;
        const resultContent = resultBlock.content ?? resultBlock.output ?? "";
        div.appendChild(makeCollapsible(
          "jsonl-tool-result",
          "Tool Result" + (resultBlock.tool_use_id ? " (" + resultBlock.tool_use_id.slice(0, 12) + "...)" : ""),
          resultContent,
          false
        ));
      }
    }
    return div;
  };

  // src/renderer/components/image-viewer.ts
  var ZOOM_LEVELS = [1, 1.5, 2, 3];
  var overlay = null;
  var currentZoomIdx = 0;
  var isDragging = false;
  var dragStart = { x: 0, y: 0 };
  var translate = { x: 0, y: 0 };
  function applyTransform(img) {
    const scale = ZOOM_LEVELS[currentZoomIdx];
    img.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;
  }
  function cleanup() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    currentZoomIdx = 0;
    isDragging = false;
    translate = { x: 0, y: 0 };
    document.removeEventListener("keydown", onKeydown);
  }
  function onKeydown(e) {
    if (e.key === "Escape") cleanup();
  }
  function createButton(text, onClick) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    Object.assign(btn.style, {
      background: "rgba(255,255,255,0.1)",
      border: "none",
      color: "#e0e0e0",
      fontSize: "18px",
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backdropFilter: "blur(4px)",
      transition: "background 0.15s",
      lineHeight: "1"
    });
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(255,255,255,0.2)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "rgba(255,255,255,0.1)";
    });
    return btn;
  }
  function openImageViewer(src, alt) {
    if (overlay) cleanup();
    overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(8px)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "10000",
      opacity: "0",
      transition: "opacity 0.2s ease"
    });
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt ?? "Image";
    Object.assign(img.style, {
      maxWidth: "90vw",
      maxHeight: "85vh",
      objectFit: "contain",
      cursor: "grab",
      transition: "transform 0.15s ease",
      transformOrigin: "center center",
      userSelect: "none"
    });
    img.draggable = false;
    img.addEventListener("mousedown", (e) => {
      if (currentZoomIdx === 0) return;
      e.preventDefault();
      isDragging = true;
      dragStart = { x: e.clientX - translate.x, y: e.clientY - translate.y };
      img.style.cursor = "grabbing";
      img.style.transition = "none";
    });
    const onMouseMove = (e) => {
      if (!isDragging) return;
      translate = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
      applyTransform(img);
    };
    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      img.style.cursor = currentZoomIdx > 0 ? "grab" : "default";
      img.style.transition = "transform 0.15s ease";
    };
    const onWheel = (e) => {
      e.preventDefault();
      if (e.deltaY < 0 && currentZoomIdx < ZOOM_LEVELS.length - 1) {
        currentZoomIdx++;
      } else if (e.deltaY > 0 && currentZoomIdx > 0) {
        currentZoomIdx--;
        if (currentZoomIdx === 0) translate = { x: 0, y: 0 };
      }
      img.style.cursor = currentZoomIdx > 0 ? "grab" : "default";
      zoomLabel.textContent = `${ZOOM_LEVELS[currentZoomIdx]}x`;
      applyTransform(img);
    };
    const controls = document.createElement("div");
    Object.assign(controls.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginTop: "12px"
    });
    const zoomOut = createButton("\u2212", () => {
      if (currentZoomIdx > 0) {
        currentZoomIdx--;
        if (currentZoomIdx === 0) translate = { x: 0, y: 0 };
        img.style.cursor = currentZoomIdx > 0 ? "grab" : "default";
        zoomLabel.textContent = `${ZOOM_LEVELS[currentZoomIdx]}x`;
        applyTransform(img);
      }
    });
    const zoomLabel = document.createElement("span");
    zoomLabel.textContent = "1x";
    Object.assign(zoomLabel.style, {
      color: "#999",
      fontSize: "13px",
      minWidth: "32px",
      textAlign: "center",
      userSelect: "none"
    });
    const zoomIn = createButton("+", () => {
      if (currentZoomIdx < ZOOM_LEVELS.length - 1) {
        currentZoomIdx++;
        img.style.cursor = "grab";
        zoomLabel.textContent = `${ZOOM_LEVELS[currentZoomIdx]}x`;
        applyTransform(img);
      }
    });
    controls.append(zoomOut, zoomLabel, zoomIn);
    const caption = document.createElement("div");
    caption.textContent = alt ?? "Image";
    Object.assign(caption.style, {
      color: "#888",
      fontSize: "12px",
      marginTop: "6px",
      userSelect: "none"
    });
    const closeBtn = createButton("\xD7", cleanup);
    Object.assign(closeBtn.style, {
      position: "absolute",
      top: "16px",
      right: "16px",
      fontSize: "24px",
      width: "40px",
      height: "40px"
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup();
    });
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    const observer = new MutationObserver(() => {
      if (overlay && !document.body.contains(overlay)) {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true });
    overlay.addEventListener("wheel", onWheel, { passive: false });
    img.addEventListener("click", (e) => e.stopPropagation());
    overlay.append(closeBtn, img, controls, caption);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      if (overlay) overlay.style.opacity = "1";
    });
  }

  // src/renderer/chat/blocks/user-message.ts
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function renderUserMessage(block) {
    const el2 = document.createElement("div");
    el2.className = "chat-block chat-block--user-message";
    el2.dataset.blockId = block.id;
    const header = document.createElement("div");
    header.className = "chat-block__header";
    const role = document.createElement("span");
    role.className = "chat-block__role";
    role.textContent = "Human";
    header.appendChild(role);
    if (block.timestamp) {
      const time = formatTime(block.timestamp);
      if (time) {
        const timeEl = document.createElement("span");
        timeEl.className = "chat-block__time";
        timeEl.textContent = time;
        header.appendChild(timeEl);
      }
    }
    el2.appendChild(header);
    const body = document.createElement("div");
    body.className = "chat-block__body";
    const textEl = document.createElement("div");
    textEl.className = "chat-block__text";
    textEl.style.whiteSpace = "pre-wrap";
    textEl.style.wordBreak = "break-word";
    textEl.textContent = block.text;
    body.appendChild(textEl);
    if (block.images.length > 0) {
      const gallery = document.createElement("div");
      gallery.className = "chat-block__images";
      for (const img of block.images) {
        const src = `data:${img.mediaType};base64,${img.base64}`;
        const imgEl = document.createElement("img");
        imgEl.src = src;
        imgEl.className = "chat-block__thumbnail";
        imgEl.addEventListener("click", () => openImageViewer(src));
        gallery.appendChild(imgEl);
      }
      body.appendChild(gallery);
    }
    el2.appendChild(body);
    return el2;
  }

  // node_modules/marked/lib/marked.esm.js
  function M() {
    return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
  }
  var T = M();
  function G(u3) {
    T = u3;
  }
  var _ = { exec: () => null };
  function k(u3, e = "") {
    let t = typeof u3 == "string" ? u3 : u3.source, n = { replace: (r, i) => {
      let s = typeof i == "string" ? i : i.source;
      return s = s.replace(m.caret, "$1"), t = t.replace(r, s), n;
    }, getRegex: () => new RegExp(t, e) };
    return n;
  }
  var Re = (() => {
    try {
      return !!new RegExp("(?<=1)(?<!1)");
    } catch {
      return false;
    }
  })();
  var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (u3) => new RegExp(`^( {0,3}${u3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`), hrRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`), fencesBeginRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}(?:\`\`\`|~~~)`), headingBeginRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}#`), htmlBeginRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}<(?:[a-z].*>|!--)`, "i"), blockquoteBeginRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}>`) };
  var Te = /^(?:[ \t]*(?:\n|$))+/;
  var Oe = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
  var we = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
  var A = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
  var ye = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
  var N = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
  var re = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
  var se = k(re).replace(/bull/g, N).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
  var Pe = k(re).replace(/bull/g, N).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
  var Q = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
  var Se = /^[^\n]+/;
  var j = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
  var $e = k(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", j).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
  var _e = k(/^(bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, N).getRegex();
  var q = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
  var F = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
  var Le = k("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", F).replace("tag", q).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
  var ie = k(Q).replace("hr", A).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", q).getRegex();
  var Me = k(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", ie).getRegex();
  var U = { blockquote: Me, code: Oe, def: $e, fences: we, heading: ye, hr: A, html: Le, lheading: se, list: _e, newline: Te, paragraph: ie, table: _, text: Se };
  var te = k("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", A).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", q).getRegex();
  var ze = { ...U, lheading: Pe, table: te, paragraph: k(Q).replace("hr", A).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", te).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", q).getRegex() };
  var Ee = { ...U, html: k(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", F).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: _, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: k(Q).replace("hr", A).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", se).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
  var Ie = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
  var Ae = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
  var oe = /^( {2,}|\\)\n(?!\s*$)/;
  var Ce = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
  var v = /[\p{P}\p{S}]/u;
  var K = /[\s\p{P}\p{S}]/u;
  var ae = /[^\s\p{P}\p{S}]/u;
  var Be = k(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, K).getRegex();
  var le = /(?!~)[\p{P}\p{S}]/u;
  var De = /(?!~)[\s\p{P}\p{S}]/u;
  var qe = /(?:[^\s\p{P}\p{S}]|~)/u;
  var ue = /(?![*_])[\p{P}\p{S}]/u;
  var ve = /(?![*_])[\s\p{P}\p{S}]/u;
  var He = /(?:[^\s\p{P}\p{S}]|[*_])/u;
  var Ge = k(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Re ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
  var pe = /^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/;
  var Ze = k(pe, "u").replace(/punct/g, v).getRegex();
  var Ne = k(pe, "u").replace(/punct/g, le).getRegex();
  var ce = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
  var Qe = k(ce, "gu").replace(/notPunctSpace/g, ae).replace(/punctSpace/g, K).replace(/punct/g, v).getRegex();
  var je = k(ce, "gu").replace(/notPunctSpace/g, qe).replace(/punctSpace/g, De).replace(/punct/g, le).getRegex();
  var Fe = k("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, ae).replace(/punctSpace/g, K).replace(/punct/g, v).getRegex();
  var Ue = k(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, ue).getRegex();
  var Ke = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
  var We = k(Ke, "gu").replace(/notPunctSpace/g, He).replace(/punctSpace/g, ve).replace(/punct/g, ue).getRegex();
  var Xe = k(/\\(punct)/, "gu").replace(/punct/g, v).getRegex();
  var Je = k(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
  var Ve = k(F).replace("(?:-->|$)", "-->").getRegex();
  var Ye = k("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Ve).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
  var D = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+[^`]*?`+(?!`)|[^\[\]\\`])*?/;
  var et = k(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", D).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
  var he = k(/^!?\[(label)\]\[(ref)\]/).replace("label", D).replace("ref", j).getRegex();
  var ke = k(/^!?\[(ref)\](?:\[\])?/).replace("ref", j).getRegex();
  var tt = k("reflink|nolink(?!\\()", "g").replace("reflink", he).replace("nolink", ke).getRegex();
  var ne = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
  var W = { _backpedal: _, anyPunctuation: Xe, autolink: Je, blockSkip: Ge, br: oe, code: Ae, del: _, delLDelim: _, delRDelim: _, emStrongLDelim: Ze, emStrongRDelimAst: Qe, emStrongRDelimUnd: Fe, escape: Ie, link: et, nolink: ke, punctuation: Be, reflink: he, reflinkSearch: tt, tag: Ye, text: Ce, url: _ };
  var nt = { ...W, link: k(/^!?\[(label)\]\((.*?)\)/).replace("label", D).getRegex(), reflink: k(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", D).getRegex() };
  var Z = { ...W, emStrongRDelimAst: je, emStrongLDelim: Ne, delLDelim: Ue, delRDelim: We, url: k(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", ne).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: k(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", ne).getRegex() };
  var rt = { ...Z, br: k(oe).replace("{2,}", "*").getRegex(), text: k(Z.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
  var C = { normal: U, gfm: ze, pedantic: Ee };
  var z = { normal: W, gfm: Z, breaks: rt, pedantic: nt };
  var st = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  var de = (u3) => st[u3];
  function O(u3, e) {
    if (e) {
      if (m.escapeTest.test(u3)) return u3.replace(m.escapeReplace, de);
    } else if (m.escapeTestNoEncode.test(u3)) return u3.replace(m.escapeReplaceNoEncode, de);
    return u3;
  }
  function X(u3) {
    try {
      u3 = encodeURI(u3).replace(m.percentDecode, "%");
    } catch {
      return null;
    }
    return u3;
  }
  function J(u3, e) {
    let t = u3.replace(m.findPipe, (i, s, a) => {
      let o = false, l = s;
      for (; --l >= 0 && a[l] === "\\"; ) o = !o;
      return o ? "|" : " |";
    }), n = t.split(m.splitPipe), r = 0;
    if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
    else for (; n.length < e; ) n.push("");
    for (; r < n.length; r++) n[r] = n[r].trim().replace(m.slashPipe, "|");
    return n;
  }
  function E(u3, e, t) {
    let n = u3.length;
    if (n === 0) return "";
    let r = 0;
    for (; r < n; ) {
      let i = u3.charAt(n - r - 1);
      if (i === e && !t) r++;
      else if (i !== e && t) r++;
      else break;
    }
    return u3.slice(0, n - r);
  }
  function ge(u3, e) {
    if (u3.indexOf(e[1]) === -1) return -1;
    let t = 0;
    for (let n = 0; n < u3.length; n++) if (u3[n] === "\\") n++;
    else if (u3[n] === e[0]) t++;
    else if (u3[n] === e[1] && (t--, t < 0)) return n;
    return t > 0 ? -2 : -1;
  }
  function fe(u3, e = 0) {
    let t = e, n = "";
    for (let r of u3) if (r === "	") {
      let i = 4 - t % 4;
      n += " ".repeat(i), t += i;
    } else n += r, t++;
    return n;
  }
  function me(u3, e, t, n, r) {
    let i = e.href, s = e.title || null, a = u3[1].replace(r.other.outputLinkReplace, "$1");
    n.state.inLink = true;
    let o = { type: u3[0].charAt(0) === "!" ? "image" : "link", raw: t, href: i, title: s, text: a, tokens: n.inlineTokens(a) };
    return n.state.inLink = false, o;
  }
  function it(u3, e, t) {
    let n = u3.match(t.other.indentCodeCompensation);
    if (n === null) return e;
    let r = n[1];
    return e.split(`
`).map((i) => {
      let s = i.match(t.other.beginningSpace);
      if (s === null) return i;
      let [a] = s;
      return a.length >= r.length ? i.slice(r.length) : i;
    }).join(`
`);
  }
  var w = class {
    options;
    rules;
    lexer;
    constructor(e) {
      this.options = e || T;
    }
    space(e) {
      let t = this.rules.block.newline.exec(e);
      if (t && t[0].length > 0) return { type: "space", raw: t[0] };
    }
    code(e) {
      let t = this.rules.block.code.exec(e);
      if (t) {
        let n = t[0].replace(this.rules.other.codeRemoveIndent, "");
        return { type: "code", raw: t[0], codeBlockStyle: "indented", text: this.options.pedantic ? n : E(n, `
`) };
      }
    }
    fences(e) {
      let t = this.rules.block.fences.exec(e);
      if (t) {
        let n = t[0], r = it(n, t[3] || "", this.rules);
        return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: r };
      }
    }
    heading(e) {
      let t = this.rules.block.heading.exec(e);
      if (t) {
        let n = t[2].trim();
        if (this.rules.other.endingHash.test(n)) {
          let r = E(n, "#");
          (this.options.pedantic || !r || this.rules.other.endingSpaceChar.test(r)) && (n = r.trim());
        }
        return { type: "heading", raw: t[0], depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
      }
    }
    hr(e) {
      let t = this.rules.block.hr.exec(e);
      if (t) return { type: "hr", raw: E(t[0], `
`) };
    }
    blockquote(e) {
      let t = this.rules.block.blockquote.exec(e);
      if (t) {
        let n = E(t[0], `
`).split(`
`), r = "", i = "", s = [];
        for (; n.length > 0; ) {
          let a = false, o = [], l;
          for (l = 0; l < n.length; l++) if (this.rules.other.blockquoteStart.test(n[l])) o.push(n[l]), a = true;
          else if (!a) o.push(n[l]);
          else break;
          n = n.slice(l);
          let p = o.join(`
`), c = p.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
          r = r ? `${r}
${p}` : p, i = i ? `${i}
${c}` : c;
          let d = this.lexer.state.top;
          if (this.lexer.state.top = true, this.lexer.blockTokens(c, s, true), this.lexer.state.top = d, n.length === 0) break;
          let h = s.at(-1);
          if (h?.type === "code") break;
          if (h?.type === "blockquote") {
            let R = h, f = R.raw + `
` + n.join(`
`), S = this.blockquote(f);
            s[s.length - 1] = S, r = r.substring(0, r.length - R.raw.length) + S.raw, i = i.substring(0, i.length - R.text.length) + S.text;
            break;
          } else if (h?.type === "list") {
            let R = h, f = R.raw + `
` + n.join(`
`), S = this.list(f);
            s[s.length - 1] = S, r = r.substring(0, r.length - h.raw.length) + S.raw, i = i.substring(0, i.length - R.raw.length) + S.raw, n = f.substring(s.at(-1).raw.length).split(`
`);
            continue;
          }
        }
        return { type: "blockquote", raw: r, tokens: s, text: i };
      }
    }
    list(e) {
      let t = this.rules.block.list.exec(e);
      if (t) {
        let n = t[1].trim(), r = n.length > 1, i = { type: "list", raw: "", ordered: r, start: r ? +n.slice(0, -1) : "", loose: false, items: [] };
        n = r ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = r ? n : "[*+-]");
        let s = this.rules.other.listItemRegex(n), a = false;
        for (; e; ) {
          let l = false, p = "", c = "";
          if (!(t = s.exec(e)) || this.rules.block.hr.test(e)) break;
          p = t[0], e = e.substring(p.length);
          let d = fe(t[2].split(`
`, 1)[0], t[1].length), h = e.split(`
`, 1)[0], R = !d.trim(), f = 0;
          if (this.options.pedantic ? (f = 2, c = d.trimStart()) : R ? f = t[1].length + 1 : (f = d.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, c = d.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (p += h + `
`, e = e.substring(h.length + 1), l = true), !l) {
            let S = this.rules.other.nextBulletRegex(f), V = this.rules.other.hrRegex(f), Y = this.rules.other.fencesBeginRegex(f), ee = this.rules.other.headingBeginRegex(f), xe = this.rules.other.htmlBeginRegex(f), be = this.rules.other.blockquoteBeginRegex(f);
            for (; e; ) {
              let H = e.split(`
`, 1)[0], I;
              if (h = H, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), I = h) : I = h.replace(this.rules.other.tabCharGlobal, "    "), Y.test(h) || ee.test(h) || xe.test(h) || be.test(h) || S.test(h) || V.test(h)) break;
              if (I.search(this.rules.other.nonSpaceChar) >= f || !h.trim()) c += `
` + I.slice(f);
              else {
                if (R || d.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || Y.test(d) || ee.test(d) || V.test(d)) break;
                c += `
` + h;
              }
              R = !h.trim(), p += H + `
`, e = e.substring(H.length + 1), d = I.slice(f);
            }
          }
          i.loose || (a ? i.loose = true : this.rules.other.doubleBlankLine.test(p) && (a = true)), i.items.push({ type: "list_item", raw: p, task: !!this.options.gfm && this.rules.other.listIsTask.test(c), loose: false, text: c, tokens: [] }), i.raw += p;
        }
        let o = i.items.at(-1);
        if (o) o.raw = o.raw.trimEnd(), o.text = o.text.trimEnd();
        else return;
        i.raw = i.raw.trimEnd();
        for (let l of i.items) {
          if (this.lexer.state.top = false, l.tokens = this.lexer.blockTokens(l.text, []), l.task) {
            if (l.text = l.text.replace(this.rules.other.listReplaceTask, ""), l.tokens[0]?.type === "text" || l.tokens[0]?.type === "paragraph") {
              l.tokens[0].raw = l.tokens[0].raw.replace(this.rules.other.listReplaceTask, ""), l.tokens[0].text = l.tokens[0].text.replace(this.rules.other.listReplaceTask, "");
              for (let c = this.lexer.inlineQueue.length - 1; c >= 0; c--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[c].src)) {
                this.lexer.inlineQueue[c].src = this.lexer.inlineQueue[c].src.replace(this.rules.other.listReplaceTask, "");
                break;
              }
            }
            let p = this.rules.other.listTaskCheckbox.exec(l.raw);
            if (p) {
              let c = { type: "checkbox", raw: p[0] + " ", checked: p[0] !== "[ ]" };
              l.checked = c.checked, i.loose ? l.tokens[0] && ["paragraph", "text"].includes(l.tokens[0].type) && "tokens" in l.tokens[0] && l.tokens[0].tokens ? (l.tokens[0].raw = c.raw + l.tokens[0].raw, l.tokens[0].text = c.raw + l.tokens[0].text, l.tokens[0].tokens.unshift(c)) : l.tokens.unshift({ type: "paragraph", raw: c.raw, text: c.raw, tokens: [c] }) : l.tokens.unshift(c);
            }
          }
          if (!i.loose) {
            let p = l.tokens.filter((d) => d.type === "space"), c = p.length > 0 && p.some((d) => this.rules.other.anyLine.test(d.raw));
            i.loose = c;
          }
        }
        if (i.loose) for (let l of i.items) {
          l.loose = true;
          for (let p of l.tokens) p.type === "text" && (p.type = "paragraph");
        }
        return i;
      }
    }
    html(e) {
      let t = this.rules.block.html.exec(e);
      if (t) return { type: "html", block: true, raw: t[0], pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: t[0] };
    }
    def(e) {
      let t = this.rules.block.def.exec(e);
      if (t) {
        let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), r = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", i = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
        return { type: "def", tag: n, raw: t[0], href: r, title: i };
      }
    }
    table(e) {
      let t = this.rules.block.table.exec(e);
      if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
      let n = J(t[1]), r = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), i = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], s = { type: "table", raw: t[0], header: [], align: [], rows: [] };
      if (n.length === r.length) {
        for (let a of r) this.rules.other.tableAlignRight.test(a) ? s.align.push("right") : this.rules.other.tableAlignCenter.test(a) ? s.align.push("center") : this.rules.other.tableAlignLeft.test(a) ? s.align.push("left") : s.align.push(null);
        for (let a = 0; a < n.length; a++) s.header.push({ text: n[a], tokens: this.lexer.inline(n[a]), header: true, align: s.align[a] });
        for (let a of i) s.rows.push(J(a, s.header.length).map((o, l) => ({ text: o, tokens: this.lexer.inline(o), header: false, align: s.align[l] })));
        return s;
      }
    }
    lheading(e) {
      let t = this.rules.block.lheading.exec(e);
      if (t) return { type: "heading", raw: t[0], depth: t[2].charAt(0) === "=" ? 1 : 2, text: t[1], tokens: this.lexer.inline(t[1]) };
    }
    paragraph(e) {
      let t = this.rules.block.paragraph.exec(e);
      if (t) {
        let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
        return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
      }
    }
    text(e) {
      let t = this.rules.block.text.exec(e);
      if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
    }
    escape(e) {
      let t = this.rules.inline.escape.exec(e);
      if (t) return { type: "escape", raw: t[0], text: t[1] };
    }
    tag(e) {
      let t = this.rules.inline.tag.exec(e);
      if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
    }
    link(e) {
      let t = this.rules.inline.link.exec(e);
      if (t) {
        let n = t[2].trim();
        if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
          if (!this.rules.other.endAngleBracket.test(n)) return;
          let s = E(n.slice(0, -1), "\\");
          if ((n.length - s.length) % 2 === 0) return;
        } else {
          let s = ge(t[2], "()");
          if (s === -2) return;
          if (s > -1) {
            let o = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + s;
            t[2] = t[2].substring(0, s), t[0] = t[0].substring(0, o).trim(), t[3] = "";
          }
        }
        let r = t[2], i = "";
        if (this.options.pedantic) {
          let s = this.rules.other.pedanticHrefTitle.exec(r);
          s && (r = s[1], i = s[3]);
        } else i = t[3] ? t[3].slice(1, -1) : "";
        return r = r.trim(), this.rules.other.startAngleBracket.test(r) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? r = r.slice(1) : r = r.slice(1, -1)), me(t, { href: r && r.replace(this.rules.inline.anyPunctuation, "$1"), title: i && i.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
      }
    }
    reflink(e, t) {
      let n;
      if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
        let r = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), i = t[r.toLowerCase()];
        if (!i) {
          let s = n[0].charAt(0);
          return { type: "text", raw: s, text: s };
        }
        return me(n, i, n[0], this.lexer, this.rules);
      }
    }
    emStrong(e, t, n = "") {
      let r = this.rules.inline.emStrongLDelim.exec(e);
      if (!r || r[3] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
      if (!(r[1] || r[2] || "") || !n || this.rules.inline.punctuation.exec(n)) {
        let s = [...r[0]].length - 1, a, o, l = s, p = 0, c = r[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
        for (c.lastIndex = 0, t = t.slice(-1 * e.length + s); (r = c.exec(t)) != null; ) {
          if (a = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !a) continue;
          if (o = [...a].length, r[3] || r[4]) {
            l += o;
            continue;
          } else if ((r[5] || r[6]) && s % 3 && !((s + o) % 3)) {
            p += o;
            continue;
          }
          if (l -= o, l > 0) continue;
          o = Math.min(o, o + l + p);
          let d = [...r[0]][0].length, h = e.slice(0, s + r.index + d + o);
          if (Math.min(s, o) % 2) {
            let f = h.slice(1, -1);
            return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
          }
          let R = h.slice(2, -2);
          return { type: "strong", raw: h, text: R, tokens: this.lexer.inlineTokens(R) };
        }
      }
    }
    codespan(e) {
      let t = this.rules.inline.code.exec(e);
      if (t) {
        let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), r = this.rules.other.nonSpaceChar.test(n), i = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
        return r && i && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
      }
    }
    br(e) {
      let t = this.rules.inline.br.exec(e);
      if (t) return { type: "br", raw: t[0] };
    }
    del(e, t, n = "") {
      let r = this.rules.inline.delLDelim.exec(e);
      if (!r) return;
      if (!(r[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
        let s = [...r[0]].length - 1, a, o, l = s, p = this.rules.inline.delRDelim;
        for (p.lastIndex = 0, t = t.slice(-1 * e.length + s); (r = p.exec(t)) != null; ) {
          if (a = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !a || (o = [...a].length, o !== s)) continue;
          if (r[3] || r[4]) {
            l += o;
            continue;
          }
          if (l -= o, l > 0) continue;
          o = Math.min(o, o + l);
          let c = [...r[0]][0].length, d = e.slice(0, s + r.index + c + o), h = d.slice(s, -s);
          return { type: "del", raw: d, text: h, tokens: this.lexer.inlineTokens(h) };
        }
      }
    }
    autolink(e) {
      let t = this.rules.inline.autolink.exec(e);
      if (t) {
        let n, r;
        return t[2] === "@" ? (n = t[1], r = "mailto:" + n) : (n = t[1], r = n), { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
      }
    }
    url(e) {
      let t;
      if (t = this.rules.inline.url.exec(e)) {
        let n, r;
        if (t[2] === "@") n = t[0], r = "mailto:" + n;
        else {
          let i;
          do
            i = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
          while (i !== t[0]);
          n = t[0], t[1] === "www." ? r = "http://" + t[0] : r = t[0];
        }
        return { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
      }
    }
    inlineText(e) {
      let t = this.rules.inline.text.exec(e);
      if (t) {
        let n = this.lexer.state.inRawBlock;
        return { type: "text", raw: t[0], text: t[0], escaped: n };
      }
    }
  };
  var x = class u {
    tokens;
    options;
    state;
    inlineQueue;
    tokenizer;
    constructor(e) {
      this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new w(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
      let t = { other: m, block: C.normal, inline: z.normal };
      this.options.pedantic ? (t.block = C.pedantic, t.inline = z.pedantic) : this.options.gfm && (t.block = C.gfm, this.options.breaks ? t.inline = z.breaks : t.inline = z.gfm), this.tokenizer.rules = t;
    }
    static get rules() {
      return { block: C, inline: z };
    }
    static lex(e, t) {
      return new u(t).lex(e);
    }
    static lexInline(e, t) {
      return new u(t).inlineTokens(e);
    }
    lex(e) {
      e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
      for (let t = 0; t < this.inlineQueue.length; t++) {
        let n = this.inlineQueue[t];
        this.inlineTokens(n.src, n.tokens);
      }
      return this.inlineQueue = [], this.tokens;
    }
    blockTokens(e, t = [], n = false) {
      for (this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, "")); e; ) {
        let r;
        if (this.options.extensions?.block?.some((s) => (r = s.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
        if (r = this.tokenizer.space(e)) {
          e = e.substring(r.raw.length);
          let s = t.at(-1);
          r.raw.length === 1 && s !== void 0 ? s.raw += `
` : t.push(r);
          continue;
        }
        if (r = this.tokenizer.code(e)) {
          e = e.substring(r.raw.length);
          let s = t.at(-1);
          s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.at(-1).src = s.text) : t.push(r);
          continue;
        }
        if (r = this.tokenizer.fences(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.heading(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.hr(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.blockquote(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.list(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.html(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.def(e)) {
          e = e.substring(r.raw.length);
          let s = t.at(-1);
          s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.raw, this.inlineQueue.at(-1).src = s.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
          continue;
        }
        if (r = this.tokenizer.table(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.lheading(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        let i = e;
        if (this.options.extensions?.startBlock) {
          let s = 1 / 0, a = e.slice(1), o;
          this.options.extensions.startBlock.forEach((l) => {
            o = l.call({ lexer: this }, a), typeof o == "number" && o >= 0 && (s = Math.min(s, o));
          }), s < 1 / 0 && s >= 0 && (i = e.substring(0, s + 1));
        }
        if (this.state.top && (r = this.tokenizer.paragraph(i))) {
          let s = t.at(-1);
          n && s?.type === "paragraph" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
          continue;
        }
        if (r = this.tokenizer.text(e)) {
          e = e.substring(r.raw.length);
          let s = t.at(-1);
          s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r);
          continue;
        }
        if (e) {
          let s = "Infinite loop on byte: " + e.charCodeAt(0);
          if (this.options.silent) {
            console.error(s);
            break;
          } else throw new Error(s);
        }
      }
      return this.state.top = true, t;
    }
    inline(e, t = []) {
      return this.inlineQueue.push({ src: e, tokens: t }), t;
    }
    inlineTokens(e, t = []) {
      let n = e, r = null;
      if (this.tokens.links) {
        let o = Object.keys(this.tokens.links);
        if (o.length > 0) for (; (r = this.tokenizer.rules.inline.reflinkSearch.exec(n)) != null; ) o.includes(r[0].slice(r[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, r.index) + "[" + "a".repeat(r[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
      }
      for (; (r = this.tokenizer.rules.inline.anyPunctuation.exec(n)) != null; ) n = n.slice(0, r.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
      let i;
      for (; (r = this.tokenizer.rules.inline.blockSkip.exec(n)) != null; ) i = r[2] ? r[2].length : 0, n = n.slice(0, r.index + i) + "[" + "a".repeat(r[0].length - i - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
      n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
      let s = false, a = "";
      for (; e; ) {
        s || (a = ""), s = false;
        let o;
        if (this.options.extensions?.inline?.some((p) => (o = p.call({ lexer: this }, e, t)) ? (e = e.substring(o.raw.length), t.push(o), true) : false)) continue;
        if (o = this.tokenizer.escape(e)) {
          e = e.substring(o.raw.length), t.push(o);
          continue;
        }
        if (o = this.tokenizer.tag(e)) {
          e = e.substring(o.raw.length), t.push(o);
          continue;
        }
        if (o = this.tokenizer.link(e)) {
          e = e.substring(o.raw.length), t.push(o);
          continue;
        }
        if (o = this.tokenizer.reflink(e, this.tokens.links)) {
          e = e.substring(o.raw.length);
          let p = t.at(-1);
          o.type === "text" && p?.type === "text" ? (p.raw += o.raw, p.text += o.text) : t.push(o);
          continue;
        }
        if (o = this.tokenizer.emStrong(e, n, a)) {
          e = e.substring(o.raw.length), t.push(o);
          continue;
        }
        if (o = this.tokenizer.codespan(e)) {
          e = e.substring(o.raw.length), t.push(o);
          continue;
        }
        if (o = this.tokenizer.br(e)) {
          e = e.substring(o.raw.length), t.push(o);
          continue;
        }
        if (o = this.tokenizer.del(e, n, a)) {
          e = e.substring(o.raw.length), t.push(o);
          continue;
        }
        if (o = this.tokenizer.autolink(e)) {
          e = e.substring(o.raw.length), t.push(o);
          continue;
        }
        if (!this.state.inLink && (o = this.tokenizer.url(e))) {
          e = e.substring(o.raw.length), t.push(o);
          continue;
        }
        let l = e;
        if (this.options.extensions?.startInline) {
          let p = 1 / 0, c = e.slice(1), d;
          this.options.extensions.startInline.forEach((h) => {
            d = h.call({ lexer: this }, c), typeof d == "number" && d >= 0 && (p = Math.min(p, d));
          }), p < 1 / 0 && p >= 0 && (l = e.substring(0, p + 1));
        }
        if (o = this.tokenizer.inlineText(l)) {
          e = e.substring(o.raw.length), o.raw.slice(-1) !== "_" && (a = o.raw.slice(-1)), s = true;
          let p = t.at(-1);
          p?.type === "text" ? (p.raw += o.raw, p.text += o.text) : t.push(o);
          continue;
        }
        if (e) {
          let p = "Infinite loop on byte: " + e.charCodeAt(0);
          if (this.options.silent) {
            console.error(p);
            break;
          } else throw new Error(p);
        }
      }
      return t;
    }
  };
  var y = class {
    options;
    parser;
    constructor(e) {
      this.options = e || T;
    }
    space(e) {
      return "";
    }
    code({ text: e, lang: t, escaped: n }) {
      let r = (t || "").match(m.notSpaceStart)?.[0], i = e.replace(m.endingNewline, "") + `
`;
      return r ? '<pre><code class="language-' + O(r) + '">' + (n ? i : O(i, true)) + `</code></pre>
` : "<pre><code>" + (n ? i : O(i, true)) + `</code></pre>
`;
    }
    blockquote({ tokens: e }) {
      return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
    }
    html({ text: e }) {
      return e;
    }
    def(e) {
      return "";
    }
    heading({ tokens: e, depth: t }) {
      return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
    }
    hr(e) {
      return `<hr>
`;
    }
    list(e) {
      let t = e.ordered, n = e.start, r = "";
      for (let a = 0; a < e.items.length; a++) {
        let o = e.items[a];
        r += this.listitem(o);
      }
      let i = t ? "ol" : "ul", s = t && n !== 1 ? ' start="' + n + '"' : "";
      return "<" + i + s + `>
` + r + "</" + i + `>
`;
    }
    listitem(e) {
      return `<li>${this.parser.parse(e.tokens)}</li>
`;
    }
    checkbox({ checked: e }) {
      return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
    }
    paragraph({ tokens: e }) {
      return `<p>${this.parser.parseInline(e)}</p>
`;
    }
    table(e) {
      let t = "", n = "";
      for (let i = 0; i < e.header.length; i++) n += this.tablecell(e.header[i]);
      t += this.tablerow({ text: n });
      let r = "";
      for (let i = 0; i < e.rows.length; i++) {
        let s = e.rows[i];
        n = "";
        for (let a = 0; a < s.length; a++) n += this.tablecell(s[a]);
        r += this.tablerow({ text: n });
      }
      return r && (r = `<tbody>${r}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + r + `</table>
`;
    }
    tablerow({ text: e }) {
      return `<tr>
${e}</tr>
`;
    }
    tablecell(e) {
      let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
      return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
    }
    strong({ tokens: e }) {
      return `<strong>${this.parser.parseInline(e)}</strong>`;
    }
    em({ tokens: e }) {
      return `<em>${this.parser.parseInline(e)}</em>`;
    }
    codespan({ text: e }) {
      return `<code>${O(e, true)}</code>`;
    }
    br(e) {
      return "<br>";
    }
    del({ tokens: e }) {
      return `<del>${this.parser.parseInline(e)}</del>`;
    }
    link({ href: e, title: t, tokens: n }) {
      let r = this.parser.parseInline(n), i = X(e);
      if (i === null) return r;
      e = i;
      let s = '<a href="' + e + '"';
      return t && (s += ' title="' + O(t) + '"'), s += ">" + r + "</a>", s;
    }
    image({ href: e, title: t, text: n, tokens: r }) {
      r && (n = this.parser.parseInline(r, this.parser.textRenderer));
      let i = X(e);
      if (i === null) return O(n);
      e = i;
      let s = `<img src="${e}" alt="${O(n)}"`;
      return t && (s += ` title="${O(t)}"`), s += ">", s;
    }
    text(e) {
      return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : O(e.text);
    }
  };
  var $ = class {
    strong({ text: e }) {
      return e;
    }
    em({ text: e }) {
      return e;
    }
    codespan({ text: e }) {
      return e;
    }
    del({ text: e }) {
      return e;
    }
    html({ text: e }) {
      return e;
    }
    text({ text: e }) {
      return e;
    }
    link({ text: e }) {
      return "" + e;
    }
    image({ text: e }) {
      return "" + e;
    }
    br() {
      return "";
    }
    checkbox({ raw: e }) {
      return e;
    }
  };
  var b = class u2 {
    options;
    renderer;
    textRenderer;
    constructor(e) {
      this.options = e || T, this.options.renderer = this.options.renderer || new y(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new $();
    }
    static parse(e, t) {
      return new u2(t).parse(e);
    }
    static parseInline(e, t) {
      return new u2(t).parseInline(e);
    }
    parse(e) {
      let t = "";
      for (let n = 0; n < e.length; n++) {
        let r = e[n];
        if (this.options.extensions?.renderers?.[r.type]) {
          let s = r, a = this.options.extensions.renderers[s.type].call({ parser: this }, s);
          if (a !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(s.type)) {
            t += a || "";
            continue;
          }
        }
        let i = r;
        switch (i.type) {
          case "space": {
            t += this.renderer.space(i);
            break;
          }
          case "hr": {
            t += this.renderer.hr(i);
            break;
          }
          case "heading": {
            t += this.renderer.heading(i);
            break;
          }
          case "code": {
            t += this.renderer.code(i);
            break;
          }
          case "table": {
            t += this.renderer.table(i);
            break;
          }
          case "blockquote": {
            t += this.renderer.blockquote(i);
            break;
          }
          case "list": {
            t += this.renderer.list(i);
            break;
          }
          case "checkbox": {
            t += this.renderer.checkbox(i);
            break;
          }
          case "html": {
            t += this.renderer.html(i);
            break;
          }
          case "def": {
            t += this.renderer.def(i);
            break;
          }
          case "paragraph": {
            t += this.renderer.paragraph(i);
            break;
          }
          case "text": {
            t += this.renderer.text(i);
            break;
          }
          default: {
            let s = 'Token with "' + i.type + '" type was not found.';
            if (this.options.silent) return console.error(s), "";
            throw new Error(s);
          }
        }
      }
      return t;
    }
    parseInline(e, t = this.renderer) {
      let n = "";
      for (let r = 0; r < e.length; r++) {
        let i = e[r];
        if (this.options.extensions?.renderers?.[i.type]) {
          let a = this.options.extensions.renderers[i.type].call({ parser: this }, i);
          if (a !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(i.type)) {
            n += a || "";
            continue;
          }
        }
        let s = i;
        switch (s.type) {
          case "escape": {
            n += t.text(s);
            break;
          }
          case "html": {
            n += t.html(s);
            break;
          }
          case "link": {
            n += t.link(s);
            break;
          }
          case "image": {
            n += t.image(s);
            break;
          }
          case "checkbox": {
            n += t.checkbox(s);
            break;
          }
          case "strong": {
            n += t.strong(s);
            break;
          }
          case "em": {
            n += t.em(s);
            break;
          }
          case "codespan": {
            n += t.codespan(s);
            break;
          }
          case "br": {
            n += t.br(s);
            break;
          }
          case "del": {
            n += t.del(s);
            break;
          }
          case "text": {
            n += t.text(s);
            break;
          }
          default: {
            let a = 'Token with "' + s.type + '" type was not found.';
            if (this.options.silent) return console.error(a), "";
            throw new Error(a);
          }
        }
      }
      return n;
    }
  };
  var P = class {
    options;
    block;
    constructor(e) {
      this.options = e || T;
    }
    static passThroughHooks = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
    static passThroughHooksRespectAsync = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"]);
    preprocess(e) {
      return e;
    }
    postprocess(e) {
      return e;
    }
    processAllTokens(e) {
      return e;
    }
    emStrongMask(e) {
      return e;
    }
    provideLexer() {
      return this.block ? x.lex : x.lexInline;
    }
    provideParser() {
      return this.block ? b.parse : b.parseInline;
    }
  };
  var B = class {
    defaults = M();
    options = this.setOptions;
    parse = this.parseMarkdown(true);
    parseInline = this.parseMarkdown(false);
    Parser = b;
    Renderer = y;
    TextRenderer = $;
    Lexer = x;
    Tokenizer = w;
    Hooks = P;
    constructor(...e) {
      this.use(...e);
    }
    walkTokens(e, t) {
      let n = [];
      for (let r of e) switch (n = n.concat(t.call(this, r)), r.type) {
        case "table": {
          let i = r;
          for (let s of i.header) n = n.concat(this.walkTokens(s.tokens, t));
          for (let s of i.rows) for (let a of s) n = n.concat(this.walkTokens(a.tokens, t));
          break;
        }
        case "list": {
          let i = r;
          n = n.concat(this.walkTokens(i.items, t));
          break;
        }
        default: {
          let i = r;
          this.defaults.extensions?.childTokens?.[i.type] ? this.defaults.extensions.childTokens[i.type].forEach((s) => {
            let a = i[s].flat(1 / 0);
            n = n.concat(this.walkTokens(a, t));
          }) : i.tokens && (n = n.concat(this.walkTokens(i.tokens, t)));
        }
      }
      return n;
    }
    use(...e) {
      let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
      return e.forEach((n) => {
        let r = { ...n };
        if (r.async = this.defaults.async || r.async || false, n.extensions && (n.extensions.forEach((i) => {
          if (!i.name) throw new Error("extension name required");
          if ("renderer" in i) {
            let s = t.renderers[i.name];
            s ? t.renderers[i.name] = function(...a) {
              let o = i.renderer.apply(this, a);
              return o === false && (o = s.apply(this, a)), o;
            } : t.renderers[i.name] = i.renderer;
          }
          if ("tokenizer" in i) {
            if (!i.level || i.level !== "block" && i.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
            let s = t[i.level];
            s ? s.unshift(i.tokenizer) : t[i.level] = [i.tokenizer], i.start && (i.level === "block" ? t.startBlock ? t.startBlock.push(i.start) : t.startBlock = [i.start] : i.level === "inline" && (t.startInline ? t.startInline.push(i.start) : t.startInline = [i.start]));
          }
          "childTokens" in i && i.childTokens && (t.childTokens[i.name] = i.childTokens);
        }), r.extensions = t), n.renderer) {
          let i = this.defaults.renderer || new y(this.defaults);
          for (let s in n.renderer) {
            if (!(s in i)) throw new Error(`renderer '${s}' does not exist`);
            if (["options", "parser"].includes(s)) continue;
            let a = s, o = n.renderer[a], l = i[a];
            i[a] = (...p) => {
              let c = o.apply(i, p);
              return c === false && (c = l.apply(i, p)), c || "";
            };
          }
          r.renderer = i;
        }
        if (n.tokenizer) {
          let i = this.defaults.tokenizer || new w(this.defaults);
          for (let s in n.tokenizer) {
            if (!(s in i)) throw new Error(`tokenizer '${s}' does not exist`);
            if (["options", "rules", "lexer"].includes(s)) continue;
            let a = s, o = n.tokenizer[a], l = i[a];
            i[a] = (...p) => {
              let c = o.apply(i, p);
              return c === false && (c = l.apply(i, p)), c;
            };
          }
          r.tokenizer = i;
        }
        if (n.hooks) {
          let i = this.defaults.hooks || new P();
          for (let s in n.hooks) {
            if (!(s in i)) throw new Error(`hook '${s}' does not exist`);
            if (["options", "block"].includes(s)) continue;
            let a = s, o = n.hooks[a], l = i[a];
            P.passThroughHooks.has(s) ? i[a] = (p) => {
              if (this.defaults.async && P.passThroughHooksRespectAsync.has(s)) return (async () => {
                let d = await o.call(i, p);
                return l.call(i, d);
              })();
              let c = o.call(i, p);
              return l.call(i, c);
            } : i[a] = (...p) => {
              if (this.defaults.async) return (async () => {
                let d = await o.apply(i, p);
                return d === false && (d = await l.apply(i, p)), d;
              })();
              let c = o.apply(i, p);
              return c === false && (c = l.apply(i, p)), c;
            };
          }
          r.hooks = i;
        }
        if (n.walkTokens) {
          let i = this.defaults.walkTokens, s = n.walkTokens;
          r.walkTokens = function(a) {
            let o = [];
            return o.push(s.call(this, a)), i && (o = o.concat(i.call(this, a))), o;
          };
        }
        this.defaults = { ...this.defaults, ...r };
      }), this;
    }
    setOptions(e) {
      return this.defaults = { ...this.defaults, ...e }, this;
    }
    lexer(e, t) {
      return x.lex(e, t ?? this.defaults);
    }
    parser(e, t) {
      return b.parse(e, t ?? this.defaults);
    }
    parseMarkdown(e) {
      return (n, r) => {
        let i = { ...r }, s = { ...this.defaults, ...i }, a = this.onError(!!s.silent, !!s.async);
        if (this.defaults.async === true && i.async === false) return a(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
        if (typeof n > "u" || n === null) return a(new Error("marked(): input parameter is undefined or null"));
        if (typeof n != "string") return a(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
        if (s.hooks && (s.hooks.options = s, s.hooks.block = e), s.async) return (async () => {
          let o = s.hooks ? await s.hooks.preprocess(n) : n, p = await (s.hooks ? await s.hooks.provideLexer() : e ? x.lex : x.lexInline)(o, s), c = s.hooks ? await s.hooks.processAllTokens(p) : p;
          s.walkTokens && await Promise.all(this.walkTokens(c, s.walkTokens));
          let h = await (s.hooks ? await s.hooks.provideParser() : e ? b.parse : b.parseInline)(c, s);
          return s.hooks ? await s.hooks.postprocess(h) : h;
        })().catch(a);
        try {
          s.hooks && (n = s.hooks.preprocess(n));
          let l = (s.hooks ? s.hooks.provideLexer() : e ? x.lex : x.lexInline)(n, s);
          s.hooks && (l = s.hooks.processAllTokens(l)), s.walkTokens && this.walkTokens(l, s.walkTokens);
          let c = (s.hooks ? s.hooks.provideParser() : e ? b.parse : b.parseInline)(l, s);
          return s.hooks && (c = s.hooks.postprocess(c)), c;
        } catch (o) {
          return a(o);
        }
      };
    }
    onError(e, t) {
      return (n) => {
        if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
          let r = "<p>An error occurred:</p><pre>" + O(n.message + "", true) + "</pre>";
          return t ? Promise.resolve(r) : r;
        }
        if (t) return Promise.reject(n);
        throw n;
      };
    }
  };
  var L = new B();
  function g(u3, e) {
    return L.parse(u3, e);
  }
  g.options = g.setOptions = function(u3) {
    return L.setOptions(u3), g.defaults = L.defaults, G(g.defaults), g;
  };
  g.getDefaults = M;
  g.defaults = T;
  g.use = function(...u3) {
    return L.use(...u3), g.defaults = L.defaults, G(g.defaults), g;
  };
  g.walkTokens = function(u3, e) {
    return L.walkTokens(u3, e);
  };
  g.parseInline = L.parseInline;
  g.Parser = b;
  g.parser = b.parse;
  g.Renderer = y;
  g.TextRenderer = $;
  g.Lexer = x;
  g.lexer = x.lex;
  g.Tokenizer = w;
  g.Hooks = P;
  g.parse = g;
  var Ut = g.options;
  var Kt = g.setOptions;
  var Wt = g.use;
  var Xt = g.walkTokens;
  var Jt = g.parseInline;
  var Yt = b.parse;
  var en = x.lex;

  // src/renderer/components/markdown.ts
  g.setOptions({
    breaks: true,
    gfm: true
  });
  var DANGEROUS_TAG_RE = /<\s*\/?\s*(script|iframe)[^>]*>/gi;
  var ON_ATTR_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
  function sanitize(html) {
    return html.replace(DANGEROUS_TAG_RE, "").replace(ON_ATTR_RE, "");
  }
  function addCopyButtons(container) {
    const preEls = container.querySelectorAll("pre");
    for (const pre of preEls) {
      pre.style.position = "relative";
      const btn = document.createElement("button");
      btn.className = "markdown-copy-btn";
      btn.textContent = "Copy";
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code");
        const text = code ? code.textContent ?? "" : pre.textContent ?? "";
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.textContent = "Copy";
          }, 2e3);
        });
      });
      pre.appendChild(btn);
    }
  }
  function renderMarkdown(text) {
    const el2 = document.createElement("div");
    el2.className = "markdown-content";
    if (!text) return el2;
    const raw = g.parse(text);
    el2.innerHTML = sanitize(raw);
    addCopyButtons(el2);
    return el2;
  }

  // src/renderer/chat/blocks/assistant-message.ts
  var FILE_PATH_RE = /(?:\.{0,2}\/[\w@.+-]+(?:\/[\w@.+-]+)*\.\w{1,10}|(?:[\w@-]+\/)+[\w@.+-]+\.\w{1,10})/g;
  var linkifyFilePathsInDom = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodesToReplace = [];
    let textNode;
    while (textNode = walker.nextNode()) {
      const parent = textNode.parentElement;
      if (parent && (parent.tagName === "CODE" || parent.tagName === "PRE" || parent.tagName === "A")) continue;
      const text = textNode.textContent ?? "";
      FILE_PATH_RE.lastIndex = 0;
      let lastIndex = 0;
      let match;
      let frag = null;
      while ((match = FILE_PATH_RE.exec(text)) !== null) {
        const before = text.slice(Math.max(0, match.index - 3), match.index);
        if (before.includes("://")) continue;
        if (!frag) frag = document.createDocumentFragment();
        if (match.index > lastIndex) {
          frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const span = document.createElement("span");
        span.className = "file-link";
        span.setAttribute("data-file-path", match[0]);
        span.textContent = match[0];
        frag.appendChild(span);
        lastIndex = match.index + match[0].length;
      }
      if (frag) {
        if (lastIndex < text.length) {
          frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        nodesToReplace.push({ node: textNode, frag });
      }
    }
    for (const { node, frag } of nodesToReplace) {
      node.parentNode?.replaceChild(frag, node);
    }
  };
  var formatTokens = (count) => {
    if (count >= 1e3) return `${(count / 1e3).toFixed(1).replace(/\.0$/, "")}K tokens`;
    return `${count} tokens`;
  };
  function renderAssistantMessage(block) {
    const el2 = document.createElement("div");
    el2.className = "chat-block chat-block--assistant-text";
    el2.dataset.blockId = block.id;
    const header = document.createElement("div");
    header.className = "chat-block__header";
    const role = document.createElement("span");
    role.className = "chat-block__role";
    role.textContent = "Assistant";
    header.appendChild(role);
    el2.appendChild(header);
    const body = document.createElement("div");
    body.className = "chat-block__body";
    const textEl = renderMarkdown(block.text);
    textEl.classList.add("chat-block__text", "markdown-content");
    linkifyFilePathsInDom(textEl);
    body.appendChild(textEl);
    el2.appendChild(body);
    const totalTokens = (block.inputTokens ?? 0) + (block.outputTokens ?? 0);
    if (block.costUSD != null || block.durationMs != null || totalTokens > 0) {
      const footer = document.createElement("div");
      footer.className = "chat-block__footer";
      const cost = document.createElement("span");
      cost.className = "chat-block__cost";
      const parts = [];
      if (block.costUSD != null) {
        parts.push(`$${block.costUSD.toFixed(4)}`);
      }
      if (block.durationMs != null) {
        parts.push(`${(block.durationMs / 1e3).toFixed(1)}s`);
      }
      if (totalTokens > 0) {
        parts.push(formatTokens(totalTokens));
      }
      cost.textContent = parts.join(" \xB7 ");
      footer.appendChild(cost);
      el2.appendChild(footer);
    }
    return el2;
  }

  // src/renderer/components/toast.ts
  var toastContainer = null;
  var ensureContainer = () => {
    if (toastContainer) return toastContainer;
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
    return toastContainer;
  };
  var showToast = (message, type = "info") => {
    const container = ensureContainer();
    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add("toast--visible");
    });
    setTimeout(() => {
      toast.classList.remove("toast--visible");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 300);
    }, 3e3);
  };

  // src/renderer/chat/file-link-handler.ts
  var diffDataMap = /* @__PURE__ */ new WeakMap();
  var registerDiffData = (element, data) => {
    diffDataMap.set(element, data);
  };
  var attachFileLinkHandler = (container) => {
    container.addEventListener("click", async (e) => {
      const target = e.target.closest(".file-link[data-file-path]");
      if (!target) return;
      const filePath = target.getAttribute("data-file-path");
      if (!filePath) return;
      const sessionId = activeSessionId;
      if (!sessionId) return;
      const diffBlock = target.closest(".chat-block--code-diff");
      if (diffBlock) {
        const data = diffDataMap.get(diffBlock);
        if (data) {
          openDiffInPanel(sessionId, data.filePath, data.oldString, data.newString);
          return;
        }
      }
      const toolUseBlock = target.closest(".chat-block--tool-use");
      if (toolUseBlock) {
        const diffChild = toolUseBlock.querySelector(".chat-block--code-diff");
        if (diffChild) {
          const data = diffDataMap.get(diffChild);
          if (data) {
            openDiffInPanel(sessionId, data.filePath, data.oldString, data.newString);
            return;
          }
        }
      }
      const ok = await openFileInPanel(sessionId, filePath);
      if (!ok) {
        showToast(`File not found: ${filePath}`, "error");
      }
    });
  };

  // src/renderer/chat/blocks/code-diff.ts
  function renderCodeDiff(block) {
    const container = document.createElement("div");
    container.className = "chat-block--code-diff";
    const diff = block.editDiff;
    if (!diff) {
      container.textContent = block.content;
      return container;
    }
    const header = document.createElement("div");
    header.className = "chat-block__diff-header";
    header.style.padding = "6px 12px";
    header.style.backgroundColor = "#1a1a2e";
    header.style.borderRadius = "4px 4px 0 0";
    header.style.fontFamily = "monospace";
    header.style.fontSize = "12px";
    header.style.color = "#8888cc";
    header.style.borderBottom = "1px solid #2a2a3e";
    const pathSpan = document.createElement("span");
    pathSpan.className = "file-link";
    pathSpan.setAttribute("data-file-path", diff.filePath);
    pathSpan.textContent = diff.filePath;
    header.appendChild(pathSpan);
    container.appendChild(header);
    registerDiffData(container, {
      filePath: diff.filePath,
      oldString: diff.oldString,
      newString: diff.newString
    });
    const pre = document.createElement("pre");
    pre.className = "chat-block__diff-body";
    pre.style.margin = "0";
    pre.style.padding = "8px 0";
    pre.style.backgroundColor = "#1a1a2e";
    pre.style.borderRadius = "0 0 4px 4px";
    pre.style.overflowX = "auto";
    pre.style.fontFamily = "monospace";
    pre.style.fontSize = "13px";
    pre.style.lineHeight = "1.5";
    const oldLines = diff.oldString.split("\n");
    const newLines = diff.newString.split("\n");
    const diffLines = computeSimpleDiff(oldLines, newLines);
    for (const line of diffLines) {
      const lineEl = document.createElement("div");
      lineEl.style.padding = "0 12px";
      lineEl.style.whiteSpace = "pre-wrap";
      lineEl.style.wordBreak = "break-word";
      if (line.type === "remove") {
        lineEl.style.backgroundColor = "#3a1e1e";
        lineEl.style.color = "#e8a0a0";
        lineEl.textContent = `-${line.text}`;
      } else if (line.type === "add") {
        lineEl.style.backgroundColor = "#1e3a1e";
        lineEl.style.color = "#a0e8a0";
        lineEl.textContent = `+${line.text}`;
      } else {
        lineEl.style.color = "#e0e0e0";
        lineEl.textContent = ` ${line.text}`;
      }
      pre.appendChild(lineEl);
    }
    container.appendChild(pre);
    return container;
  }
  function computeSimpleDiff(oldLines, newLines) {
    const result = [];
    let oi = 0;
    let ni = 0;
    while (oi < oldLines.length && ni < newLines.length) {
      if (oldLines[oi] === newLines[ni]) {
        result.push({ type: "context", text: oldLines[oi] });
        oi++;
        ni++;
      } else {
        const syncPoint = findSync(oldLines, newLines, oi, ni);
        while (oi < syncPoint.oi) {
          result.push({ type: "remove", text: oldLines[oi] });
          oi++;
        }
        while (ni < syncPoint.ni) {
          result.push({ type: "add", text: newLines[ni] });
          ni++;
        }
      }
    }
    while (oi < oldLines.length) {
      result.push({ type: "remove", text: oldLines[oi] });
      oi++;
    }
    while (ni < newLines.length) {
      result.push({ type: "add", text: newLines[ni] });
      ni++;
    }
    return result;
  }
  function findSync(oldLines, newLines, oi, ni) {
    const maxLook = 50;
    for (let ahead = 1; ahead < maxLook; ahead++) {
      if (oi + ahead < oldLines.length && oldLines[oi + ahead] === newLines[ni]) {
        return { oi: oi + ahead, ni };
      }
      if (ni + ahead < newLines.length && newLines[ni + ahead] === oldLines[oi]) {
        return { oi, ni: ni + ahead };
      }
      if (oi + ahead < oldLines.length && ni + ahead < newLines.length && oldLines[oi + ahead] === newLines[ni + ahead]) {
        return { oi: oi + ahead, ni: ni + ahead };
      }
    }
    return { oi: oi + 1, ni: ni + 1 };
  }

  // src/renderer/chat/blocks/file-content.ts
  var MAX_VISIBLE_LINES = 200;
  function renderFileContent2(block) {
    const container = document.createElement("div");
    container.className = "chat-block--file-content";
    const header = document.createElement("div");
    header.className = "chat-block__file-header";
    header.style.padding = "6px 12px";
    header.style.backgroundColor = "#1a1a2e";
    header.style.borderRadius = "4px 4px 0 0";
    header.style.fontFamily = "monospace";
    header.style.fontSize = "12px";
    header.style.color = "#8888cc";
    header.style.cursor = "pointer";
    header.style.borderBottom = "1px solid #2a2a3e";
    header.textContent = block.filePath ?? block.toolName;
    if (block.filePath) {
      header.classList.add("file-link");
      header.setAttribute("data-file-path", block.filePath);
    }
    container.appendChild(header);
    const allLines = block.content.split("\n");
    const truncated = allLines.length > MAX_VISIBLE_LINES;
    const wrapper = document.createElement("div");
    wrapper.className = "chat-block__file-body";
    wrapper.style.display = "flex";
    wrapper.style.backgroundColor = "#1a1a2e";
    wrapper.style.borderRadius = "0 0 4px 4px";
    wrapper.style.overflowX = "auto";
    wrapper.style.fontFamily = "monospace";
    wrapper.style.fontSize = "13px";
    wrapper.style.lineHeight = "1.5";
    const gutter = document.createElement("pre");
    gutter.className = "chat-block__line-gutter";
    gutter.style.margin = "0";
    gutter.style.padding = "8px 0";
    gutter.style.textAlign = "right";
    gutter.style.color = "#555";
    gutter.style.userSelect = "none";
    gutter.style.paddingLeft = "8px";
    gutter.style.paddingRight = "12px";
    gutter.style.flexShrink = "0";
    gutter.style.borderRight = "1px solid #2a2a3e";
    const code = document.createElement("pre");
    code.className = "chat-block__file-code";
    code.style.margin = "0";
    code.style.padding = "8px 12px";
    code.style.color = "#e0e0e0";
    code.style.whiteSpace = "pre-wrap";
    code.style.wordBreak = "break-word";
    code.style.flex = "1";
    code.style.minWidth = "0";
    const visibleLines = truncated ? allLines.slice(0, MAX_VISIBLE_LINES) : allLines;
    setLines(gutter, code, visibleLines);
    wrapper.appendChild(gutter);
    wrapper.appendChild(code);
    container.appendChild(wrapper);
    const isMd = block.filePath?.endsWith(".md");
    if (isMd) {
      const previewBtn = document.createElement("button");
      previewBtn.className = "chat-block__preview-toggle";
      previewBtn.textContent = "Preview";
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      const label = document.createElement("span");
      label.textContent = block.filePath ?? block.toolName;
      if (block.filePath) {
        label.classList.add("file-link");
        label.setAttribute("data-file-path", block.filePath);
        header.classList.remove("file-link");
      }
      header.textContent = "";
      header.appendChild(label);
      header.appendChild(previewBtn);
      let previewing = false;
      const renderedView = renderMarkdown(block.content);
      renderedView.className = "chat-block__md-preview markdown-content";
      renderedView.style.display = "none";
      renderedView.style.padding = "12px 16px";
      renderedView.style.backgroundColor = "#1a1a2e";
      renderedView.style.borderRadius = "0 0 4px 4px";
      previewBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        previewing = !previewing;
        wrapper.style.display = previewing ? "none" : "flex";
        renderedView.style.display = previewing ? "block" : "none";
        previewBtn.textContent = previewing ? "Raw" : "Preview";
      });
      container.appendChild(renderedView);
    }
    if (truncated) {
      const toggle2 = document.createElement("button");
      toggle2.className = "chat-block__show-more";
      toggle2.textContent = `Show all ${allLines.length} lines`;
      toggle2.style.background = "none";
      toggle2.style.border = "1px solid #333";
      toggle2.style.borderRadius = "4px";
      toggle2.style.color = "#8888cc";
      toggle2.style.cursor = "pointer";
      toggle2.style.padding = "4px 8px";
      toggle2.style.marginTop = "4px";
      toggle2.style.fontSize = "12px";
      let expanded = false;
      toggle2.addEventListener("click", () => {
        expanded = !expanded;
        const lines = expanded ? allLines : allLines.slice(0, MAX_VISIBLE_LINES);
        setLines(gutter, code, lines);
        toggle2.textContent = expanded ? `Show first ${MAX_VISIBLE_LINES} lines` : `Show all ${allLines.length} lines`;
      });
      container.appendChild(toggle2);
    }
    return container;
  }
  function setLines(gutter, code, lines) {
    const gutterWidth = String(lines.length).length;
    gutter.textContent = lines.map((_2, i) => String(i + 1).padStart(gutterWidth)).join("\n");
    code.textContent = lines.join("\n");
  }

  // src/renderer/chat/blocks/bash-output.ts
  var TRUNCATE_THRESHOLD = 1e4;
  function renderBashOutput(block) {
    const container = document.createElement("div");
    container.className = "chat-block--bash-output";
    const command = block.command ?? extractCommand(block);
    if (command) {
      const header = document.createElement("div");
      header.className = "chat-block__bash-header";
      header.style.padding = "6px 12px";
      header.style.backgroundColor = "#1a1a2e";
      header.style.borderRadius = "4px 4px 0 0";
      header.style.fontFamily = "monospace";
      header.style.fontSize = "12px";
      header.style.color = "#a0a0e0";
      header.style.borderBottom = "1px solid #2a2a3e";
      header.textContent = `$ ${command}`;
      container.appendChild(header);
    }
    const pre = document.createElement("pre");
    pre.className = "chat-block__bash-body";
    pre.style.margin = "0";
    pre.style.padding = "8px 12px";
    pre.style.backgroundColor = "#1a1a2e";
    pre.style.borderRadius = command ? "0 0 4px 4px" : "4px";
    pre.style.fontFamily = "monospace";
    pre.style.fontSize = "13px";
    pre.style.lineHeight = "1.5";
    pre.style.maxHeight = "400px";
    pre.style.overflowY = "auto";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-word";
    const truncated = block.content.length > TRUNCATE_THRESHOLD;
    const visibleContent = truncated ? block.content.slice(0, TRUNCATE_THRESHOLD) : block.content;
    applyAnsiContent(pre, visibleContent);
    container.appendChild(pre);
    if (truncated) {
      const toggle2 = document.createElement("button");
      toggle2.className = "chat-block__show-more";
      toggle2.textContent = "Show full output";
      toggle2.style.background = "none";
      toggle2.style.border = "1px solid #333";
      toggle2.style.borderRadius = "4px";
      toggle2.style.color = "#8888cc";
      toggle2.style.cursor = "pointer";
      toggle2.style.padding = "4px 8px";
      toggle2.style.marginTop = "4px";
      toggle2.style.fontSize = "12px";
      let expanded = false;
      toggle2.addEventListener("click", () => {
        expanded = !expanded;
        pre.innerHTML = "";
        applyAnsiContent(pre, expanded ? block.content : visibleContent);
        toggle2.textContent = expanded ? "Show less" : "Show full output";
      });
      container.appendChild(toggle2);
    }
    return container;
  }
  function extractCommand(block) {
    void block;
    return void 0;
  }
  var ANSI_REGEX = /\x1b\[([0-9;]*)m/g;
  var COLOR_MAP = {
    "30": "#555",
    "31": "#f87171",
    "32": "#6ee76e",
    "33": "#e8e86e",
    "34": "#7171f8",
    "35": "#e871e8",
    "36": "#71e8e8",
    "37": "#e0e0e0",
    "90": "#888",
    "91": "#ff9b9b",
    "92": "#9bff9b",
    "93": "#ffff9b",
    "94": "#9b9bff",
    "95": "#ff9bff",
    "96": "#9bffff",
    "97": "#fff"
  };
  function applyAnsiContent(parent, text) {
    let currentColor = null;
    let bold = false;
    let lastIndex = 0;
    const cleaned = text.replace(/\x1b\[[^m]*[A-Za-ln-z]/g, "");
    ANSI_REGEX.lastIndex = 0;
    let match;
    while ((match = ANSI_REGEX.exec(cleaned)) !== null) {
      if (match.index > lastIndex) {
        appendSpan(parent, cleaned.slice(lastIndex, match.index), currentColor, bold);
      }
      const codes = (match[1] ?? "").split(";").filter(Boolean);
      for (const code of codes) {
        if (code === "0") {
          currentColor = null;
          bold = false;
        } else if (code === "1") {
          bold = true;
        } else if (COLOR_MAP[code]) {
          currentColor = COLOR_MAP[code];
        }
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < cleaned.length) {
      appendSpan(parent, cleaned.slice(lastIndex), currentColor, bold);
    }
  }
  function appendSpan(parent, text, color, bold) {
    if (!text) return;
    if (!color && !bold) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    const span = document.createElement("span");
    if (color) span.style.color = color;
    if (bold) span.style.fontWeight = "bold";
    span.textContent = text;
    parent.appendChild(span);
  }

  // src/renderer/chat/blocks/tool-result.ts
  var TRUNCATE_THRESHOLD2 = 5e3;
  function renderToolResult(block) {
    const container = document.createElement("div");
    container.className = "chat-block--tool-result";
    if (block.isError) {
      container.classList.add("is-error");
      const errorText = document.createElement("pre");
      errorText.className = "chat-block__error-text";
      errorText.textContent = block.content;
      container.appendChild(errorText);
      return container;
    }
    if (block.toolName === "Edit" && block.editDiff) {
      container.appendChild(renderCodeDiff(block));
      return container;
    }
    if ((block.toolName === "Read" || block.toolName === "Write") && block.filePath) {
      container.appendChild(renderFileContent2(block));
      return container;
    }
    if (block.toolName === "Bash") {
      container.appendChild(renderBashOutput(block));
      return container;
    }
    const imageSrc = extractImageSrc(block.content);
    if (imageSrc) {
      const imgWrapper = document.createElement("div");
      imgWrapper.className = "chat-block__image-wrapper";
      const img = document.createElement("img");
      img.src = imageSrc;
      img.className = "chat-block__result-image";
      img.addEventListener("click", () => openImageViewer(imageSrc, block.toolName));
      imgWrapper.appendChild(img);
      container.appendChild(imgWrapper);
      return container;
    }
    const pre = document.createElement("pre");
    pre.className = "chat-block__tool-output";
    const code = document.createElement("code");
    if (block.content.length > TRUNCATE_THRESHOLD2) {
      code.textContent = block.content.slice(0, TRUNCATE_THRESHOLD2);
      pre.appendChild(code);
      container.appendChild(pre);
      container.appendChild(createShowMoreToggle(code, block.content));
    } else {
      code.textContent = block.content;
      pre.appendChild(code);
      container.appendChild(pre);
    }
    return container;
  }
  var BASE64_SIGNATURES = {
    "/9j/": "image/jpeg",
    "iVBOR": "image/png",
    "R0lGO": "image/gif",
    "UklGR": "image/webp"
  };
  function extractImageSrc(content) {
    const trimmed = content.trim();
    if (trimmed.startsWith("data:image/")) return trimmed;
    for (const [prefix, mime] of Object.entries(BASE64_SIGNATURES)) {
      if (trimmed.startsWith(prefix)) {
        return `data:${mime};base64,${trimmed}`;
      }
    }
    return null;
  }
  function createShowMoreToggle(code, fullContent) {
    const toggle2 = document.createElement("button");
    toggle2.className = "chat-block__show-more";
    toggle2.textContent = "Show more";
    let expanded = false;
    toggle2.addEventListener("click", () => {
      expanded = !expanded;
      code.textContent = expanded ? fullContent : fullContent.slice(0, TRUNCATE_THRESHOLD2);
      toggle2.textContent = expanded ? "Show less" : "Show more";
    });
    return toggle2;
  }

  // src/renderer/chat/blocks/tool-use.ts
  var toolParamKeys = {
    Read: { key: "file_path" },
    Write: { key: "file_path" },
    Edit: { key: "file_path" },
    Bash: { key: "command", truncate: 80 },
    Glob: { key: "pattern" },
    Grep: { key: "pattern" },
    WebSearch: { key: "query" },
    Agent: { key: "prompt", truncate: 60 }
  };
  var filePathTools = /* @__PURE__ */ new Set(["Read", "Write", "Edit"]);
  function getToolSummary(toolName, input) {
    const meta = toolParamKeys[toolName];
    if (!meta) return "";
    const value = input[meta.key];
    let label = typeof value === "string" ? value : "";
    if (meta.truncate && label.length > meta.truncate) {
      label = `${label.slice(0, meta.truncate)}\u2026`;
    }
    return label;
  }
  function renderToolUse(block) {
    const el2 = document.createElement("div");
    const header = document.createElement("div");
    header.className = "chat-block__tool-header chat-tool-header";
    header.setAttribute("tabindex", "0");
    header.setAttribute("role", "button");
    header.setAttribute("aria-expanded", "false");
    const nameSpan = document.createElement("span");
    nameSpan.className = "chat-block__tool-name";
    nameSpan.textContent = block.toolName;
    header.appendChild(nameSpan);
    const filePath = filePathTools.has(block.toolName) && typeof block.input["file_path"] === "string" ? block.input["file_path"] : null;
    if (filePath) {
      const pathSpan = document.createElement("span");
      pathSpan.className = "chat-block__tool-summary file-link";
      pathSpan.setAttribute("data-file-path", filePath);
      pathSpan.textContent = filePath;
      header.appendChild(pathSpan);
    } else {
      const summary = getToolSummary(block.toolName, block.input);
      if (summary) {
        const summarySpan = document.createElement("span");
        summarySpan.className = "chat-block__tool-summary";
        summarySpan.textContent = summary;
        header.appendChild(summarySpan);
      }
    }
    el2.appendChild(header);
    const body = document.createElement("div");
    body.className = "chat-tool-body";
    const inputPre = document.createElement("pre");
    inputPre.className = "chat-block__tool-input";
    inputPre.textContent = JSON.stringify(block.input, null, 2);
    body.appendChild(inputPre);
    if (block.result) {
      body.appendChild(renderToolResult(block.result));
    }
    el2.appendChild(body);
    header.addEventListener("click", (e) => {
      if (e.target.closest(".file-link")) return;
      const expanded = header.classList.contains("expanded");
      header.classList.toggle("expanded", !expanded);
      body.classList.toggle("visible", !expanded);
      header.setAttribute("aria-expanded", String(!expanded));
    });
    return el2;
  }

  // src/renderer/chat/blocks/thinking.ts
  var renderThinking = (block) => {
    const el2 = document.createElement("div");
    el2.className = "chat-block--thinking";
    const header = document.createElement("div");
    header.className = "chat-block__thinking-header";
    header.setAttribute("tabindex", "0");
    const chevron = document.createElement("span");
    chevron.className = "chat-block__thinking-chevron";
    chevron.textContent = "\u25B6";
    const label = document.createElement("span");
    label.className = "chat-block__thinking-label";
    label.textContent = "Thinking\u2026";
    header.appendChild(chevron);
    header.appendChild(label);
    if (block.durationMs != null) {
      const duration = document.createElement("span");
      duration.className = "chat-block__thinking-duration";
      duration.textContent = formatDuration2(block.durationMs);
      header.appendChild(duration);
    }
    const body = document.createElement("div");
    body.className = "chat-block__thinking-content";
    const pre = document.createElement("pre");
    pre.className = "chat-block__thinking-text";
    pre.textContent = block.text;
    body.appendChild(pre);
    header.addEventListener("click", () => {
      const expanded = el2.classList.toggle("chat-block--thinking-expanded");
      header.classList.toggle("expanded", expanded);
      chevron.textContent = expanded ? "\u25BC" : "\u25B6";
    });
    el2.appendChild(header);
    el2.appendChild(body);
    return el2;
  };
  var formatDuration2 = (ms) => {
    if (ms < 1e3) return `${ms}ms`;
    return `${(ms / 1e3).toFixed(1)}s`;
  };

  // src/renderer/chat/blocks/error.ts
  var renderError = (block) => {
    const el2 = document.createElement("div");
    el2.className = "chat-block--error";
    if (block.details) el2.classList.add("has-details");
    const header = document.createElement("div");
    header.className = "chat-block__error-header";
    const icon = document.createElement("span");
    icon.className = "chat-block__error-icon";
    icon.textContent = "\u2715";
    const message = document.createElement("span");
    message.className = "chat-block__error-message";
    message.textContent = block.message;
    header.appendChild(icon);
    header.appendChild(message);
    el2.appendChild(header);
    if (block.details) {
      const details = document.createElement("div");
      details.className = "chat-block__error-details";
      const pre = document.createElement("pre");
      pre.textContent = block.details;
      details.appendChild(pre);
      header.addEventListener("click", () => {
        el2.classList.toggle("chat-block--error-expanded");
      });
      el2.appendChild(details);
    }
    return el2;
  };

  // src/renderer/chat/renderer.ts
  var groupBlocksIntoTurns = (blocks) => {
    const turns = [];
    let costSummary = null;
    let current = null;
    for (const block of blocks) {
      if (block.type === "cost-summary") {
        costSummary = block;
        continue;
      }
      if (block.type === "tool-result") continue;
      if (block.type === "user-message") {
        current = { kind: "user", blocks: [block] };
        turns.push(current);
      } else if (current) {
        current.blocks.push(block);
      } else {
        const last = turns[turns.length - 1];
        if (last?.kind === "system") {
          last.blocks.push(block);
        } else {
          turns.push({ kind: "system", blocks: [block] });
        }
      }
    }
    return { turns, costSummary };
  };
  var renderBlock = (block) => {
    switch (block.type) {
      case "user-message":
        return renderUserMessage(block);
      case "assistant-text":
        return renderAssistantMessage(block);
      case "tool-use":
        return renderToolUse(block);
      case "thinking":
        return renderThinking(block);
      case "error":
        return renderError(block);
      default: {
        const el2 = document.createElement("div");
        el2.className = `chat-block chat-block--${block.type}`;
        el2.setAttribute("data-block-id", block.id);
        el2.textContent = `[${block.type}]`;
        return el2;
      }
    }
  };
  var renderCostFooter = (block) => {
    const footer = document.createElement("div");
    footer.className = "chat-cost-footer";
    footer.setAttribute("data-block-id", block.id);
    footer.innerHTML = [
      `<span>Cost: $${block.totalCostUSD.toFixed(4)}</span>`,
      `<span>In: ${(block.totalInputTokens / 1e3).toFixed(1)}k</span>`,
      `<span>Out: ${(block.totalOutputTokens / 1e3).toFixed(1)}k</span>`,
      `<span>Messages: ${block.messageCount}</span>`
    ].join("");
    return footer;
  };
  var isTurnVisible = (turn) => {
    for (const block of turn.blocks) {
      if (block.type === "user-message" && block.text.trim()) return true;
      if (block.type === "assistant-text") return true;
      if (block.type === "tool-use") return true;
      if (block.type === "error") return true;
      if (block.type === "image") return true;
    }
    return false;
  };
  var renderTurn = (turn) => {
    if (!isTurnVisible(turn)) return null;
    const div = document.createElement("div");
    div.className = `chat-turn chat-turn--${turn.kind}`;
    for (const block of turn.blocks) {
      if (block.type === "user-message" && !block.text.trim()) continue;
      div.appendChild(renderBlock(block));
    }
    return div;
  };

  // src/renderer/chat/parser.ts
  function parseSession(entries) {
    const blocks = [];
    const pendingToolUses = /* @__PURE__ */ new Map();
    let blockIndex = 0;
    const nextId = () => `block-${blockIndex++}`;
    const costs = {
      totalCostUSD: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalDurationMs: 0,
      messageCount: 0
    };
    for (const entry of entries) {
      try {
        processEntry(entry, blocks, pendingToolUses, nextId, costs);
      } catch {
      }
    }
    if (costs.messageCount > 0) {
      blocks.push({
        type: "cost-summary",
        id: nextId(),
        ...costs
      });
    }
    return blocks;
  }
  function processEntry(entry, blocks, pendingToolUses, nextId, costs) {
    switch (entry.type) {
      case "user": {
        const userBlock = buildUserBlock(entry, nextId);
        const lastUser = findLastUserBlock(blocks);
        if (!lastUser || lastUser.text !== userBlock.text) {
          blocks.push(userBlock);
          costs.messageCount++;
        }
        break;
      }
      case "assistant":
        processAssistant(entry, blocks, pendingToolUses, nextId, costs);
        break;
      case "result":
        processResult(entry, blocks, pendingToolUses, nextId, costs);
        break;
      case "system":
        blocks.push(buildSystemBlock(entry, nextId));
        break;
      case "message":
        processLegacy(entry, blocks, pendingToolUses, nextId, costs);
        break;
      default:
        break;
    }
  }
  function findLastUserBlock(blocks) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].type === "user-message") return blocks[i];
    }
    return null;
  }
  function extractUserContent(content) {
    if (typeof content === "string") return { text: content, images: [] };
    const textParts = [];
    const images = [];
    for (const block of content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "image") {
        images.push({ mediaType: block.source.media_type, base64: block.source.data });
      }
    }
    return { text: textParts.join("\n"), images };
  }
  function buildUserBlock(entry, nextId) {
    const { text, images } = extractUserContent(entry.message.content);
    return { type: "user-message", id: nextId(), text, images, timestamp: entry.timestamp };
  }
  function getUsage(entry) {
    const messageAny = entry.message;
    const entryAny = entry;
    return messageAny.usage ?? entryAny.usage;
  }
  function processAssistant(entry, blocks, pendingToolUses, nextId, costs) {
    const { content } = entry.message;
    const usage = getUsage(entry);
    if (entry.costUSD) costs.totalCostUSD += entry.costUSD;
    if (entry.durationMs) costs.totalDurationMs += entry.durationMs;
    if (usage?.input_tokens) costs.totalInputTokens += usage.input_tokens;
    if (usage?.output_tokens) costs.totalOutputTokens += usage.output_tokens;
    costs.messageCount++;
    if (typeof content === "string") {
      if (content.trim()) {
        blocks.push(buildAssistantTextBlock(nextId(), content, entry, usage));
      }
      return;
    }
    for (const block of content) {
      switch (block.type) {
        case "text":
          if (block.text.trim()) {
            blocks.push(buildAssistantTextBlock(nextId(), block.text, entry, usage));
          }
          break;
        case "thinking":
          blocks.push({ type: "thinking", id: nextId(), text: block.thinking });
          break;
        case "tool_use": {
          const toolBlock = {
            type: "tool-use",
            id: nextId(),
            toolUseId: block.id,
            toolName: block.name,
            input: block.input
          };
          blocks.push(toolBlock);
          pendingToolUses.set(block.id, toolBlock);
          break;
        }
        case "image":
          blocks.push({
            type: "image",
            id: nextId(),
            mediaType: block.source.media_type,
            base64: block.source.data
          });
          break;
        default:
          break;
      }
    }
  }
  function buildAssistantTextBlock(id, text, entry, usage) {
    return {
      type: "assistant-text",
      id,
      text,
      costUSD: entry.costUSD,
      durationMs: entry.durationMs,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens
    };
  }
  function processResult(entry, blocks, pendingToolUses, nextId, costs) {
    if (entry.costUSD) costs.totalCostUSD += entry.costUSD;
    const { content } = entry.message;
    if (typeof content === "string") return;
    const usage = getUsage(entry);
    if (usage?.input_tokens) costs.totalInputTokens += usage.input_tokens;
    if (usage?.output_tokens) costs.totalOutputTokens += usage.output_tokens;
    for (const block of content) {
      if (block.type !== "tool_result") continue;
      const pending = pendingToolUses.get(block.tool_use_id);
      const toolName = pending?.toolName ?? "unknown";
      const input = pending?.input ?? {};
      const resultContent = extractResultContent(block);
      const resultBlock = {
        type: "tool-result",
        id: nextId(),
        toolUseId: block.tool_use_id,
        toolName,
        content: resultContent,
        isError: block.is_error ?? false
      };
      if (isEditTool(toolName) && typeof input.file_path === "string") {
        resultBlock.editDiff = {
          filePath: input.file_path,
          oldString: String(input.old_string ?? ""),
          newString: String(input.new_string ?? "")
        };
      }
      if (isFilePathTool(toolName) && typeof input.file_path === "string") {
        resultBlock.filePath = input.file_path;
      }
      blocks.push(resultBlock);
      if (pending) {
        pending.result = resultBlock;
        pendingToolUses.delete(block.tool_use_id);
      }
      if (block.is_error) {
        blocks.push({
          type: "error",
          id: nextId(),
          message: `Tool error: ${toolName}`,
          details: resultContent
        });
      }
    }
  }
  function extractResultContent(block) {
    if (block.output) return block.output;
    if (typeof block.content === "string") return block.content;
    return block.content.filter((b2) => b2.type === "text").map((b2) => b2.text).join("\n");
  }
  function isEditTool(name) {
    return name === "Edit" || name === "edit" || name === "str_replace_editor";
  }
  function isFilePathTool(name) {
    return name === "Read" || name === "Write" || name === "read" || name === "write";
  }
  function buildSystemBlock(entry, nextId) {
    return { type: "system", id: nextId(), text: entry.content ?? "", subtype: entry.subtype };
  }
  function processLegacy(entry, blocks, pendingToolUses, nextId, costs) {
    const content = entry.message?.content ?? entry.content;
    if (!content) return;
    if (entry.role === "user") {
      if (entry.costUSD) costs.totalCostUSD += entry.costUSD;
      const { text, images } = extractUserContent(content);
      blocks.push({ type: "user-message", id: nextId(), text, images, timestamp: entry.timestamp });
      costs.messageCount++;
    } else if (entry.role === "assistant") {
      processAssistant(
        { type: "assistant", message: { role: "assistant", content }, costUSD: entry.costUSD },
        blocks,
        pendingToolUses,
        nextId,
        costs
      );
    }
  }

  // src/renderer/chat/keyboard.ts
  var COLLAPSIBLE_SELECTOR = ".chat-tool-header[tabindex]";
  var getCollapsibles = (container) => Array.from(container.querySelectorAll(COLLAPSIBLE_SELECTOR));
  var toggle = (header) => {
    header.click();
  };
  var initChatKeyboard = (container) => {
    container.addEventListener("keydown", (e) => {
      const key = e.key;
      if (key === "Tab") {
        handleTab(e, container);
      } else if (key === "Enter") {
        handleEnter(e);
      } else if (key === "Escape") {
        handleEscape(e, container);
      }
    });
  };
  var handleTab = (e, container) => {
    const items = getCollapsibles(container);
    if (items.length === 0) return;
    e.preventDefault();
    const active = document.activeElement;
    const currentIdx = active ? items.indexOf(active) : -1;
    let nextIdx;
    if (e.shiftKey) {
      nextIdx = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
    } else {
      nextIdx = currentIdx >= items.length - 1 ? 0 : currentIdx + 1;
    }
    items[nextIdx].focus();
  };
  var handleEnter = (e) => {
    const target = e.target;
    if (!target.matches(COLLAPSIBLE_SELECTOR)) return;
    e.preventDefault();
    toggle(target);
  };
  var handleEscape = (e, container) => {
    e.preventDefault();
    const expanded = container.querySelector(".chat-tool-header.expanded");
    if (expanded) {
      toggle(expanded);
      expanded.focus();
      return;
    }
    document.activeElement?.blur();
  };

  // src/renderer/chat/sticky-prompt.ts
  var textareaEl = null;
  var sendBtnEl = null;
  var newMsgsBtnEl = null;
  var scrollRef = null;
  var userAtBottom = true;
  var newMsgsVisible = false;
  var SCROLL_THRESHOLD = 50;
  var MAX_TEXTAREA_HEIGHT = 150;
  var createStickyPrompt = () => {
    const wrap = document.createElement("div");
    wrap.className = "chat-sticky-prompt";
    const newMsgsBtn = document.createElement("button");
    newMsgsBtn.className = "chat-new-msgs-btn hidden";
    newMsgsBtn.textContent = "\u2193 New messages";
    newMsgsBtn.addEventListener("click", () => {
      scrollToBottom();
      hideNewMsgsBtn();
    });
    wrap.appendChild(newMsgsBtn);
    const row = document.createElement("div");
    row.className = "chat-prompt-row";
    const textarea = document.createElement("textarea");
    textarea.className = "chat-prompt-textarea";
    textarea.placeholder = "No active session";
    textarea.disabled = true;
    textarea.rows = 1;
    textarea.addEventListener("keydown", handleKeydown);
    textarea.addEventListener("input", autoGrow);
    row.appendChild(textarea);
    const sendBtn = document.createElement("button");
    sendBtn.className = "chat-prompt-send";
    sendBtn.textContent = "\u21B5";
    sendBtn.title = "Send (Enter)";
    sendBtn.disabled = true;
    sendBtn.addEventListener("click", sendMessage);
    row.appendChild(sendBtn);
    wrap.appendChild(row);
    textareaEl = textarea;
    sendBtnEl = sendBtn;
    newMsgsBtnEl = newMsgsBtn;
    return wrap;
  };
  var updatePromptState = (sessionId, isRunning) => {
    if (!textareaEl || !sendBtnEl) return;
    if (!sessionId) {
      textareaEl.placeholder = "No active session";
      textareaEl.disabled = true;
      sendBtnEl.disabled = true;
    } else if (isRunning) {
      textareaEl.placeholder = "Type a message\u2026  (Enter to send)";
      textareaEl.disabled = false;
      sendBtnEl.disabled = false;
    } else {
      textareaEl.placeholder = "This session is read-only";
      textareaEl.disabled = true;
      sendBtnEl.disabled = true;
    }
  };
  var bindScrollContainer = (el2) => {
    scrollRef = el2;
    userAtBottom = true;
    hideNewMsgsBtn();
    el2.addEventListener("scroll", () => {
      userAtBottom = el2.scrollTop + el2.clientHeight >= el2.scrollHeight - SCROLL_THRESHOLD;
      if (userAtBottom) hideNewMsgsBtn();
    });
  };
  var notifyNewBlocks = () => {
    if (!userAtBottom && scrollRef) showNewMsgsBtn();
  };
  var handleKeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  var sendMessage = () => {
    if (!textareaEl || textareaEl.disabled) return;
    const text = textareaEl.value.trim();
    if (!text) return;
    const sessionId = activeSessionId;
    if (!sessionId || !activePtyIds.has(sessionId)) return;
    window.api.sendInput(sessionId, text + "\n");
    textareaEl.value = "";
    resetHeight();
  };
  var autoGrow = () => {
    if (!textareaEl) return;
    textareaEl.style.height = "auto";
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  };
  var resetHeight = () => {
    if (!textareaEl) return;
    textareaEl.style.height = "auto";
  };
  var scrollToBottom = () => {
    if (!scrollRef) return;
    scrollRef.scrollTop = scrollRef.scrollHeight;
    userAtBottom = true;
  };
  var showNewMsgsBtn = () => {
    if (newMsgsVisible || !newMsgsBtnEl) return;
    newMsgsVisible = true;
    newMsgsBtnEl.classList.remove("hidden");
  };
  var hideNewMsgsBtn = () => {
    if (!newMsgsVisible || !newMsgsBtnEl) return;
    newMsgsVisible = false;
    newMsgsBtnEl.classList.add("hidden");
  };

  // src/renderer/chat/tail.ts
  var currentSessionId = null;
  var currentCallback = null;
  var listenerRegistered = false;
  var scrollContainer = null;
  var atBottom = true;
  var SCROLL_THRESHOLD2 = 50;
  var pendingToolUseId = null;
  var SPINNER_CLASS = "chat-spinner";
  var idSeq = 0;
  var genId = () => `tail-${++idSeq}`;
  var parseLineToBlocks = (line) => {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      return [];
    }
    const blocks = [];
    const entryType = entry.type;
    const uuid = entry.uuid || genId();
    if (entryType === "user" || entryType === "message" && entry.role === "user") {
      parseUserEntry(entry, uuid, blocks);
    } else if (entryType === "assistant" || entryType === "message" && entry.role === "assistant") {
      parseAssistantEntry(entry, uuid, blocks);
    } else if (entryType === "result") {
      parseResultEntry(entry, uuid, blocks);
    } else if (entryType === "system") {
      const text = entry.content || "";
      if (text) {
        blocks.push({ type: "system", id: uuid, text, subtype: entry.subtype });
      }
    }
    return blocks;
  };
  var parseUserEntry = (entry, uuid, blocks) => {
    const msg = entry.message;
    const content = msg?.content;
    let text = "";
    const images = [];
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      for (const b2 of content) {
        if (b2.type === "text") text += b2.text || "";
        if (b2.type === "image") {
          const src = b2.source;
          if (src) images.push({ mediaType: src.media_type, base64: src.data });
        }
      }
    }
    blocks.push({
      type: "user-message",
      id: uuid,
      text,
      images,
      timestamp: entry.timestamp
    });
  };
  var parseAssistantEntry = (entry, uuid, blocks) => {
    const msg = entry.message;
    const content = msg?.content;
    const costUSD = entry.costUSD;
    const durationMs = entry.durationMs;
    if (typeof content === "string") {
      if (content) blocks.push({ type: "assistant-text", id: uuid, text: content, costUSD, durationMs });
      return;
    }
    if (!Array.isArray(content)) return;
    let idx = 0;
    for (const b2 of content) {
      const bid = `${uuid}-${idx++}`;
      if (b2.type === "text") {
        blocks.push({ type: "assistant-text", id: bid, text: b2.text || "", costUSD, durationMs });
      } else if (b2.type === "tool_use") {
        blocks.push({
          type: "tool-use",
          id: bid,
          toolUseId: b2.id || "",
          toolName: b2.name || "",
          input: b2.input || {}
        });
      } else if (b2.type === "thinking") {
        blocks.push({ type: "thinking", id: bid, text: b2.thinking || "" });
      } else if (b2.type === "image") {
        const src = b2.source;
        if (src) blocks.push({ type: "image", id: bid, mediaType: src.media_type, base64: src.data });
      }
    }
  };
  var parseResultEntry = (entry, uuid, blocks) => {
    const msg = entry.message;
    const content = msg?.content;
    if (!Array.isArray(content)) return;
    let idx = 0;
    for (const b2 of content) {
      if (b2.type === "tool_result") {
        const raw = b2.content;
        const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((c) => c.text || "").join("\n") : b2.output || "";
        blocks.push({
          type: "tool-result",
          id: `${uuid}-${idx++}`,
          toolUseId: b2.tool_use_id || "",
          toolName: "",
          content: text,
          isError: !!b2.is_error
        });
      }
    }
  };
  var startTailing = (sessionId, onNewBlocks) => {
    stopTailing();
    currentSessionId = sessionId;
    currentCallback = onNewBlocks;
    if (!listenerRegistered) {
      window.api.onTailSessionJsonl((sid, newLines) => {
        if (sid !== currentSessionId || !currentCallback) return;
        const blocks = [];
        for (const line of newLines) {
          blocks.push(...parseLineToBlocks(line));
        }
        if (blocks.length > 0) {
          currentCallback(blocks);
        }
      });
      listenerRegistered = true;
    }
    window.api.tailSessionJsonl(sessionId);
  };
  var stopTailing = (sessionId) => {
    if (sessionId && currentSessionId !== sessionId) return;
    if (currentSessionId) {
      window.api.stopTailSessionJsonl(currentSessionId);
    }
    currentSessionId = null;
    currentCallback = null;
    pendingToolUseId = null;
  };
  var appendBlocks = (container, newBlocks, renderBlock2) => {
    removeSpinnerIfResolved(container, newBlocks);
    for (const block of newBlocks) {
      if (block.type === "tool-result") continue;
      if (block.type === "cost-summary") {
        container.querySelector(".chat-cost-footer")?.remove();
        const footer = document.createElement("div");
        footer.className = "chat-cost-footer";
        footer.setAttribute("data-block-id", block.id);
        footer.innerHTML = [
          `<span>Cost: $${block.totalCostUSD.toFixed(4)}</span>`,
          `<span>In: ${(block.totalInputTokens / 1e3).toFixed(1)}k</span>`,
          `<span>Out: ${(block.totalOutputTokens / 1e3).toFixed(1)}k</span>`,
          `<span>Messages: ${block.messageCount}</span>`
        ].join("");
        container.appendChild(footer);
        continue;
      }
      if (block.type === "user-message") {
        const turn = document.createElement("div");
        turn.className = "chat-turn chat-turn--user";
        turn.appendChild(renderBlock2(block));
        container.appendChild(turn);
      } else {
        const lastTurn = getLastTurn(container);
        lastTurn.appendChild(renderBlock2(block));
      }
    }
    addSpinnerIfNeeded(container, newBlocks);
    scrollToBottomIfNeeded();
  };
  var initAutoScroll = (container) => {
    scrollContainer = container;
    atBottom = true;
    container.addEventListener("scroll", () => {
      atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - SCROLL_THRESHOLD2;
    });
  };
  var scrollToBottomIfNeeded = () => {
    if (atBottom && scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  };
  var removeSpinnerIfResolved = (container, newBlocks) => {
    if (!pendingToolUseId) return;
    for (const block of newBlocks) {
      if (block.type === "tool-result" && block.toolUseId === pendingToolUseId) {
        container.querySelector(`.${SPINNER_CLASS}`)?.remove();
        pendingToolUseId = null;
        break;
      }
    }
  };
  var addSpinnerIfNeeded = (container, newBlocks) => {
    const last = newBlocks[newBlocks.length - 1];
    if (!last || last.type !== "tool-use") return;
    const toolUse = last;
    const hasResult = newBlocks.some(
      (b2) => b2.type === "tool-result" && b2.toolUseId === toolUse.toolUseId
    );
    if (hasResult) return;
    container.querySelector(`.${SPINNER_CLASS}`)?.remove();
    pendingToolUseId = toolUse.toolUseId;
    const spinner = document.createElement("div");
    spinner.className = SPINNER_CLASS;
    spinner.textContent = `\u23F3 Running ${toolUse.toolName}...`;
    getLastTurn(container).appendChild(spinner);
  };
  var getLastTurn = (container) => {
    const turns = container.querySelectorAll(":scope > .chat-turn");
    if (turns.length > 0) return turns[turns.length - 1];
    const turn = document.createElement("div");
    turn.className = "chat-turn chat-turn--system";
    container.appendChild(turn);
    return turn;
  };

  // src/renderer/views/chat.ts
  var callbacks4;
  var chatViewEl = null;
  var chatActive = false;
  var currentChatSessionId = null;
  var toggleEl = null;
  var stickyPromptEl = null;
  var api2 = () => window.api;
  var createToggle = () => {
    const wrap = document.createElement("div");
    wrap.className = "chat-toggle";
    const termBtn = document.createElement("button");
    termBtn.className = "chat-toggle-btn active";
    termBtn.textContent = "Terminal";
    termBtn.dataset["view"] = "terminal";
    const chatBtn = document.createElement("button");
    chatBtn.className = "chat-toggle-btn";
    chatBtn.textContent = "Chat";
    chatBtn.dataset["view"] = "chat";
    wrap.appendChild(termBtn);
    wrap.appendChild(chatBtn);
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".chat-toggle-btn");
      if (!btn) return;
      const view = btn.dataset["view"];
      if (view === "chat" && !chatActive) {
        activateChat();
      } else if (view === "terminal" && chatActive) {
        activateTerminal();
      }
    });
    return wrap;
  };
  var updateToggleState = () => {
    if (!toggleEl) return;
    const buttons = toggleEl.querySelectorAll(".chat-toggle-btn");
    buttons.forEach((btn) => {
      const el2 = btn;
      el2.classList.toggle("active", el2.dataset["view"] === (chatActive ? "chat" : "terminal"));
    });
  };
  var ensureChatView = () => {
    if (chatViewEl) return chatViewEl;
    chatViewEl = document.createElement("div");
    chatViewEl.id = "chat-view";
    const terminalsEl2 = document.getElementById("terminals");
    terminalsEl2.parentElement.appendChild(chatViewEl);
    initChatKeyboard(chatViewEl);
    attachFileLinkHandler(chatViewEl);
    stickyPromptEl = createStickyPrompt();
    chatViewEl.appendChild(stickyPromptEl);
    return chatViewEl;
  };
  var reattachPrompt = () => {
    if (stickyPromptEl && chatViewEl) {
      chatViewEl.appendChild(stickyPromptEl);
    }
  };
  var syncPromptState = () => {
    const sessionId = chatActive ? activeSessionId : null;
    const isRunning = sessionId ? activePtyIds.has(sessionId) : false;
    updatePromptState(sessionId, isRunning);
  };
  var getBlockRenderer = () => {
    return renderBlockFn;
  };
  var activateChat = () => {
    chatActive = true;
    updateToggleState();
    document.querySelectorAll(".terminal-container").forEach((el2) => el2.classList.remove("visible"));
    const view = ensureChatView();
    view.classList.add("visible");
    if (activeSessionId && currentChatSessionId !== activeSessionId) {
      loadAndRenderChat(activeSessionId);
    } else {
      syncPromptState();
    }
  };
  var activateTerminal = () => {
    chatActive = false;
    updateToggleState();
    stopTailing();
    const view = ensureChatView();
    view.classList.remove("visible");
    if (activeSessionId && openSessions.has(activeSessionId)) {
      const entry = openSessions.get(activeSessionId);
      entry.element.classList.add("visible");
      requestAnimationFrame(() => {
        entry.fitAddon.fit();
        entry.terminal.focus();
      });
    }
  };
  var loadAndRenderChat = async (sessionId) => {
    currentChatSessionId = sessionId;
    stopTailing();
    const view = ensureChatView();
    view.innerHTML = '<div class="chat-loading"><div class="chat-loading-spinner"></div>Loading conversation...</div>';
    reattachPrompt();
    syncPromptState();
    try {
      const result = await api2().readSessionJsonl(sessionId);
      if (currentChatSessionId !== sessionId) return;
      if (result.error || !result.entries) {
        view.innerHTML = `<div class="chat-error">${escapeHtml2(result.error || "No entries found")}</div>`;
        reattachPrompt();
        return;
      }
      const blocks = parseEntries(result.entries);
      if (blocks.length === 0) {
        view.innerHTML = '<div class="chat-empty">Empty session</div>';
        reattachPrompt();
        syncPromptState();
        return;
      }
      renderChatBlocks(view, blocks);
      if (activePtyIds.has(sessionId)) {
        startTailing(sessionId, (newBlocks) => {
          if (currentChatSessionId !== sessionId) return;
          const messages = view.querySelector(".chat-messages");
          if (!messages) return;
          appendBlocks(messages, newBlocks, getBlockRenderer());
          notifyNewBlocks();
        });
      }
    } catch (err) {
      if (currentChatSessionId !== sessionId) return;
      view.innerHTML = `<div class="chat-error">Failed to load conversation: ${escapeHtml2(String(err))}</div>`;
      reattachPrompt();
    }
  };
  var parseEntries = (entries) => {
    return parseSession(entries);
  };
  var renderBlockFn = renderBlock;
  var renderChatBlocks = (container, blocks) => {
    const scroll = document.createElement("div");
    scroll.className = "chat-scroll";
    const messages = document.createElement("div");
    messages.className = "chat-messages";
    const { turns, costSummary } = groupBlocksIntoTurns(blocks);
    for (const turn of turns) {
      const el2 = renderTurn(turn);
      if (el2) messages.appendChild(el2);
    }
    if (costSummary) {
      messages.appendChild(renderCostFooter(costSummary));
    }
    scroll.appendChild(messages);
    container.innerHTML = "";
    container.appendChild(scroll);
    reattachPrompt();
    syncPromptState();
    initAutoScroll(scroll);
    bindScrollContainer(scroll);
    requestAnimationFrame(() => {
      scroll.scrollTop = scroll.scrollHeight;
    });
  };
  var escapeHtml2 = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  var initChat = (cb) => {
    callbacks4 = cb;
  };
  var showChatView = (sessionId) => {
    chatActive = true;
    updateToggleState();
    document.querySelectorAll(".terminal-container").forEach((el2) => el2.classList.remove("visible"));
    const view = ensureChatView();
    view.classList.add("visible");
    loadAndRenderChat(sessionId);
  };
  var hideChatView = () => {
    chatActive = false;
    currentChatSessionId = null;
    stopTailing();
    updateToggleState();
    syncPromptState();
    if (chatViewEl) chatViewEl.classList.remove("visible");
  };
  var isChatViewActive = () => chatActive;
  var getChatToggle = () => {
    if (!toggleEl) toggleEl = createToggle();
    return toggleEl;
  };
  var shouldDefaultToChat = (sessionId) => {
    return !activePtyIds.has(sessionId);
  };

  // src/renderer/index.ts
  initWebShim();
  var sidebarCallbacks = {
    openSession: (session) => {
      hideChatView();
      openSession(session).then(() => {
        if (shouldDefaultToChat(session.sessionId)) {
          showChatView(session.sessionId);
        }
      });
    },
    launchNewSession: (project, options) => launchNewSession(project, options),
    launchTerminalSession: (project) => launchTerminalSession(project),
    forkSession: (session, project) => forkSession(session, project),
    openSettingsViewer: (scope, projectPath) => openSettingsViewer(scope, projectPath),
    hidePlanViewer: () => hidePlanViewer(),
    showJsonlViewer: (session) => showJsonlViewer(session),
    resolveDefaultSessionOptions: (project) => resolveDefaultSessionOptions(project)
  };
  var terminalCallbacks = {
    refreshSidebar: (opts) => refreshSidebar(opts),
    loadProjects: (opts) => loadProjects(opts),
    setSessionMcpActive: (sessionId, active) => setSessionMcpActive(sessionId, active),
    rekeyFilePanelState: (oldId, newId) => rekeyFilePanelState(oldId, newId),
    hidePlanViewer: () => hidePlanViewer(),
    switchPanel: (sessionId) => switchPanel(sessionId)
  };
  var chatCallbacks = {
    refreshSidebar: (opts) => refreshSidebar(opts)
  };
  var settingsCallbacks = {
    refreshSidebar: () => refreshSidebar(),
    loadProjects: () => loadProjects()
  };
  initPlans();
  initMemory();
  initJsonl();
  initChat(chatCallbacks);
  initSettings(settingsCallbacks);
  initSidebar(sidebarCallbacks);
  initTerminal(terminalCallbacks);
  initFilePanel();
  var terminalHeaderInfo = document.getElementById("terminal-header-info");
  if (terminalHeaderInfo) {
    terminalHeaderInfo.appendChild(getChatToggle());
  }
  document.querySelectorAll(".sidebar-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset["tab"];
      if (tabName === activeTab) return;
      setActiveTab(tabName);
      document.querySelectorAll(".sidebar-tab").forEach(
        (t) => t.classList.toggle("active", t.dataset["tab"] === tabName)
      );
      const searchInput3 = document.getElementById("search-input");
      const searchBar2 = document.getElementById("search-bar");
      searchInput3.value = "";
      searchBar2.classList.remove("has-query");
      setSearchMatchIds(null);
      document.getElementById("sidebar-content").style.display = "none";
      document.getElementById("plans-content").style.display = "none";
      document.getElementById("stats-content").style.display = "none";
      document.getElementById("memory-content").style.display = "none";
      document.getElementById("session-filters").style.display = "none";
      searchBar2.style.display = "none";
      if (isChatViewActive()) hideChatView();
      if (tabName === "sessions") {
        document.getElementById("session-filters").style.display = "";
        searchBar2.style.display = "";
        document.getElementById("sidebar-content").style.display = "";
        hidePlanViewer();
        if (!activeSessionId) {
          document.getElementById("placeholder").style.display = "";
        }
        if (projectsChangedWhileAway) {
          setProjectsChangedWhileAway(false);
          loadProjects();
        }
      } else if (tabName === "plans") {
        searchBar2.style.display = "";
        document.getElementById("plans-content").style.display = "";
        loadPlans();
      } else if (tabName === "stats") {
        document.getElementById("stats-content").style.display = "";
        document.getElementById("placeholder").style.display = "none";
        document.getElementById("terminal-area").style.display = "none";
        document.getElementById("plan-viewer").style.display = "none";
        document.getElementById("memory-viewer").style.display = "none";
        document.getElementById("settings-viewer").style.display = "none";
        document.getElementById("stats-viewer").style.display = "flex";
        loadStats();
      } else if (tabName === "memory") {
        searchBar2.style.display = "";
        document.getElementById("memory-content").style.display = "";
        loadMemories();
      }
    });
  });
  var searchInput2 = document.getElementById("search-input");
  var searchDebounceTimer2 = null;
  searchInput2.addEventListener("input", () => {
    const searchBar2 = document.getElementById("search-bar");
    searchBar2.classList.toggle("has-query", searchInput2.value.length > 0);
    if (searchDebounceTimer2) clearTimeout(searchDebounceTimer2);
    searchDebounceTimer2 = setTimeout(async () => {
      searchDebounceTimer2 = null;
      const query = searchInput2.value.trim();
      if (!query) return;
      try {
        if (activeTab === "plans") {
          const results = await window.api.search("plan", query);
          const matchIds = new Set(results.map((r) => r.id));
          renderPlans(cachedPlans.filter((p) => matchIds.has(p.filename)));
        } else if (activeTab === "memory") {
          const results = await window.api.search("memory", query);
          const matchIds = new Set(results.map((r) => r.id));
          renderMemories(cachedMemories.filter((m2) => matchIds.has(m2.filePath)));
        }
      } catch {
      }
    }, 200);
  });
  var projectsChangedTimer = null;
  window.api.onProjectsChanged(() => {
    if (projectsChangedTimer) clearTimeout(projectsChangedTimer);
    if (activeTab !== "sessions") {
      setProjectsChangedWhileAway(true);
      return;
    }
    projectsChangedTimer = setTimeout(() => {
      projectsChangedTimer = null;
      loadProjects();
    }, 300);
  });
  var activityTimer = null;
  var statusBarActivity = document.getElementById("status-bar-activity");
  window.api.onStatusUpdate((text, type) => {
    if (activityTimer) clearTimeout(activityTimer);
    statusBarActivity.textContent = text;
    statusBarActivity.className = type === "done" ? "status-done" : "";
    if (!text || type === "done") {
      activityTimer = setTimeout(() => {
        statusBarActivity.textContent = "";
        statusBarActivity.className = "";
      }, type === "done" ? 3e3 : 0);
    }
  });
  var statusBarUpdater = document.getElementById("status-bar-updater");
  var updaterStatusTimer = null;
  var setUpdaterStatus = (text, duration) => {
    if (updaterStatusTimer) clearTimeout(updaterStatusTimer);
    statusBarUpdater.textContent = text;
    if (duration) {
      updaterStatusTimer = setTimeout(() => {
        statusBarUpdater.textContent = "";
      }, duration);
    }
  };
  window.api.onUpdaterEvent((type, data) => {
    switch (type) {
      case "checking":
        setUpdaterStatus("Checking for updates\u2026");
        break;
      case "update-available":
        setUpdaterStatus(`Downloading v${data["version"]}\u2026`);
        break;
      case "update-not-available":
        setUpdaterStatus("Up to date", 3e3);
        break;
      case "download-progress":
        setUpdaterStatus(`Updating\u2026 ${Math.round(data["percent"])}%`);
        break;
      case "update-downloaded": {
        setUpdaterStatus(`v${data["version"]} ready \u2014 restart to update`);
        const dismissed = localStorage.getItem("update-dismissed");
        if (dismissed === data["version"]) return;
        const toast = document.getElementById("update-toast");
        const msg = document.getElementById("update-toast-msg");
        msg.innerHTML = `New Version Ready<br><span class="update-version">v${data["version"]}</span>`;
        toast.classList.remove("hidden");
        document.getElementById("update-restart-btn").onclick = () => window.api.updaterInstall();
        document.getElementById("update-dismiss-btn").onclick = () => {
          toast.classList.add("hidden");
          localStorage.setItem("update-dismissed", data["version"]);
        };
        break;
      }
      case "error":
        setUpdaterStatus("Update check failed", 5e3);
        break;
    }
  });
  (async () => {
    const global = await window.api.getSetting("global");
    if (global) {
      if (global["sidebarWidth"]) {
        document.getElementById("sidebar").style.width = global["sidebarWidth"] + "px";
      }
      if (global["visibleSessionCount"]) {
        setVisibleSessionCount(global["visibleSessionCount"]);
      }
      if (global["sessionMaxAgeDays"]) {
        setSessionMaxAgeDays(global["sessionMaxAgeDays"]);
      }
      if (global["terminalTheme"]) {
        setTerminalTheme(global["terminalTheme"]);
      }
    }
  })();
  loadProjects().then(() => {
    if (activeSessionId && !openSessions.has(activeSessionId)) {
      const session = sessionMap.get(activeSessionId);
      if (session) openSession(session);
    }
  });
  setInterval(() => {
    for (const [sessionId, time] of lastActivityTime) {
      const item = document.getElementById("si-" + sessionId);
      if (!item) continue;
      const meta = item.querySelector(".session-meta");
      if (!meta) continue;
      const session = sessionMap.get(sessionId);
      const msgSuffix = session?.messageCount ? " \xB7 " + session.messageCount + " msgs" : "";
      meta.textContent = formatDate(time) + msgSuffix;
    }
  }, 3e4);
})();
//# sourceMappingURL=app.bundle.js.map
