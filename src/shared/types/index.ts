// Barrel re-export of all shared types.

export type {
  // IPC channel maps
  IpcInvokeChannelMap,
  IpcSendChannelMap,
  IpcPushChannelMap,
  InvokeChannel,
  SendChannel,
  PushChannel,
  InvokeArgs,
  InvokeReturn,
  SendArgs,
  PushArgs,
} from './ipc';

export type {
  // Session & project types
  SessionMeta,
  CachedSession,
  CacheMeta,
  SearchMapRow,
  SearchResult,
  Session,
  Project,
  Plan,
  Memory,
  ActiveTerminal,
  SessionOptions,
  OpenTerminalResult,
  McpDiffData,
  McpFileData,
  DiffAction,
  ScannedFolder,
  ScannedSession,
  WorkerProgress,
  WorkerResult,
  SearchEntry,
} from './session';

export type {
  // JSONL types
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  ImageBlock,
  ContentBlock,
  MessageContent,
  InitEntry,
  UserEntry,
  AssistantEntry,
  ResultEntry,
  SystemEntry,
  SummaryEntry,
  CustomTitleEntry,
  ProgressEntry,
  BashProgressData,
  GenericProgressData,
  LegacyMessageEntry,
  JsonlEntry,
  ReadToolInput,
  WriteToolInput,
  EditToolInput,
  BashToolInput,
  GlobToolInput,
  GrepToolInput,
  WebSearchToolInput,
  WebFetchToolInput,
  AgentToolInput,
  KnownToolInput,
} from './jsonl';

export type {
  // Settings types
  SettingDefaults,
  EffectiveSettings,
  PartialSettings,
  GlobalSettings,
  WindowBounds,
} from './settings';
