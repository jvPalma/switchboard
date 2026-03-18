// Chat block types — the intermediate representation between .jsonl parsing and rendering.
// The parser produces ChatBlock[], each renderer consumes one block type.

export type ChatBlockType =
  | 'user-message'
  | 'assistant-text'
  | 'tool-use'
  | 'tool-result'
  | 'thinking'
  | 'error'
  | 'image'
  | 'system'
  | 'cost-summary';

export interface UserMessageBlock {
  type: 'user-message';
  id: string;
  text: string;
  images: ImageData[];
  timestamp?: string;
}

export interface AssistantTextBlock {
  type: 'assistant-text';
  id: string;
  text: string;
  costUSD?: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ToolUseBlockData {
  type: 'tool-use';
  id: string;
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  /** Matched tool result, populated after pairing */
  result?: ToolResultBlockData;
}

export interface ToolResultBlockData {
  type: 'tool-result';
  id: string;
  toolUseId: string;
  toolName: string;
  content: string;
  isError: boolean;
  /** For Edit tool: parsed old/new strings for diff rendering */
  editDiff?: { filePath: string; oldString: string; newString: string };
  /** For Read/Write tool: file path */
  filePath?: string;
}

export interface ThinkingBlockData {
  type: 'thinking';
  id: string;
  text: string;
  durationMs?: number;
}

export interface ErrorBlock {
  type: 'error';
  id: string;
  message: string;
  details?: string;
}

export interface ImageData {
  mediaType: string;
  base64: string;
}

export interface ImageBlockData {
  type: 'image';
  id: string;
  mediaType: string;
  base64: string;
}

export interface SystemBlock {
  type: 'system';
  id: string;
  text: string;
  subtype?: string;
}

export interface CostSummaryBlock {
  type: 'cost-summary';
  id: string;
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  messageCount: number;
}

export type ChatBlock =
  | UserMessageBlock
  | AssistantTextBlock
  | ToolUseBlockData
  | ToolResultBlockData
  | ThinkingBlockData
  | ErrorBlock
  | ImageBlockData
  | SystemBlock
  | CostSummaryBlock;

/** Render function signature — each block renderer implements this. */
export type BlockRenderer<T extends ChatBlock = ChatBlock> = (block: T) => HTMLElement;
