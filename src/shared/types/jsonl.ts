// Discriminated union for all .jsonl entry types produced by Claude Code sessions.

// ── Content Blocks ───────────────────────────────────────────────────

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  output?: string;
  is_error?: boolean;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface ImageBlock {
  type: 'image';
  source: {
    type: string;
    media_type: string;
    data: string;
  };
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | ImageBlock;

// ── Message wrapper ──────────────────────────────────────────────────

export interface MessageContent {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

// ── JSONL Entry Types ────────────────────────────────────────────────

interface BaseEntry {
  uuid?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  slug?: string;
}

/** Init entry — first line of a session file. */
export interface InitEntry extends BaseEntry {
  type: 'init';
  cwd: string;
  sessionId: string;
  version?: string;
  parentSessionId?: string;
  forkedFrom?: string;
}

/** User message entry. */
export interface UserEntry extends BaseEntry {
  type: 'user';
  message: MessageContent;
}

/** Assistant message entry. */
export interface AssistantEntry extends BaseEntry {
  type: 'assistant';
  message: MessageContent;
  costUSD?: number;
  durationMs?: number;
}

/** Result entry (tool execution result). */
export interface ResultEntry extends BaseEntry {
  type: 'result';
  message: MessageContent;
  costUSD?: number;
}

/** System entry (slash commands, etc.). */
export interface SystemEntry extends BaseEntry {
  type: 'system';
  content?: string;
  subtype?: string;
}

/** Summary entry. */
export interface SummaryEntry extends BaseEntry {
  type: 'summary';
  summary: string;
  costUSD?: number;
}

/** Custom title entry. */
export interface CustomTitleEntry extends BaseEntry {
  type: 'custom-title';
  customTitle: string;
}

/** Progress entry (bash output progress, etc.). */
export interface ProgressEntry extends BaseEntry {
  type: 'progress';
  data: BashProgressData | GenericProgressData;
}

export interface BashProgressData {
  type: 'bash_progress';
  output?: string;
  fullOutput?: string;
  elapsedTimeSeconds?: number;
  totalLines?: number;
}

export interface GenericProgressData {
  type: string;
  [key: string]: unknown;
}

/**
 * Legacy `message` entry type — older Claude Code versions used a single
 * `type: 'message'` with a `role` discriminator instead of separate
 * `type: 'user'` / `type: 'assistant'`.
 */
export interface LegacyMessageEntry extends BaseEntry {
  type: 'message';
  role: 'user' | 'assistant';
  message?: MessageContent;
  content?: string | ContentBlock[];
  costUSD?: number;
}

/** Discriminated union of all known JSONL entry types. */
export type JsonlEntry =
  | InitEntry
  | UserEntry
  | AssistantEntry
  | ResultEntry
  | SystemEntry
  | SummaryEntry
  | CustomTitleEntry
  | ProgressEntry
  | LegacyMessageEntry;

// ── Tool input shapes ────────────────────────────────────────────────
// These represent the `input` field of ToolUseBlock for known tools.

export interface ReadToolInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

export interface WriteToolInput {
  file_path: string;
  content: string;
}

export interface EditToolInput {
  file_path: string;
  old_string: string;
  new_string: string;
}

export interface BashToolInput {
  command: string;
  timeout?: number;
}

export interface GlobToolInput {
  pattern: string;
  path?: string;
}

export interface GrepToolInput {
  pattern: string;
  path?: string;
  include?: string;
}

export interface WebSearchToolInput {
  query: string;
  allowed_domains?: string[];
}

export interface WebFetchToolInput {
  url: string;
  prompt?: string;
}

export interface AgentToolInput {
  prompt: string;
  model?: string;
}

export type KnownToolInput =
  | ReadToolInput
  | WriteToolInput
  | EditToolInput
  | BashToolInput
  | GlobToolInput
  | GrepToolInput
  | WebSearchToolInput
  | WebFetchToolInput
  | AgentToolInput;
