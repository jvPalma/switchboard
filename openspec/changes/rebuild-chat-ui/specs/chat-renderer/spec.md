## ADDED Requirements

### Requirement: .jsonl Session Parser
The system SHALL parse Claude Code `.jsonl` session files into typed message blocks, handling all known entry types and gracefully falling back for unknown types.

#### Scenario: Parse a complete session
- **WHEN** a `.jsonl` file is loaded containing init, user, assistant, and result entries
- **THEN** the parser produces an ordered list of typed `ChatBlock` objects
- **AND** each block includes the source entry type, timestamp, and rendered content

#### Scenario: Unknown entry types are preserved
- **WHEN** an entry with an unrecognized `type` field is encountered
- **THEN** the parser produces a `RawJsonBlock` containing the serialized entry
- **AND** parsing continues without error

### Requirement: Chat Message Rendering
The system SHALL render `.jsonl` session data as a structured chat conversation, showing every element that Claude Code's TUI displays.

#### Scenario: User messages
- **WHEN** a `type: 'user'` entry is parsed
- **THEN** the chat renders a user message block with the prompt text
- **AND** images attached to the message are displayed inline

#### Scenario: Assistant text responses
- **WHEN** a `type: 'assistant'` entry contains `text` content blocks
- **THEN** the chat renders the text as formatted Markdown with syntax-highlighted code blocks
- **AND** a cost/token summary is displayed at the end of the message

#### Scenario: Tool use — Read file
- **WHEN** an assistant message contains a `tool_use` block with `name: 'Read'`
- **THEN** the chat renders a collapsible "Read file_path" header
- **AND** the corresponding `tool_result` shows the file contents with syntax highlighting

#### Scenario: Tool use — Write file
- **WHEN** a `tool_use` block has `name: 'Write'`
- **THEN** the chat renders a "Write file_path" header
- **AND** the content is shown as a syntax-highlighted code block

#### Scenario: Tool use — Edit file
- **WHEN** a `tool_use` block has `name: 'Edit'`
- **THEN** the chat renders an "Edit file_path" header
- **AND** the old_string → new_string change is shown as a unified diff with red/green highlighting

#### Scenario: Tool use — Bash command
- **WHEN** a `tool_use` block has `name: 'Bash'`
- **THEN** the chat renders the command in a monospace block with the description
- **AND** the `tool_result` shows stdout/stderr output in a scrollable container

#### Scenario: Tool use — Glob/Grep/WebSearch/Agent
- **WHEN** a `tool_use` block has a recognized tool name
- **THEN** the chat renders an appropriate header with the key input parameters
- **AND** the `tool_result` is displayed in a format suitable for the tool type

#### Scenario: Thinking blocks
- **WHEN** an assistant message contains a `thinking` content block
- **THEN** the chat renders a collapsible "Thinking..." section
- **AND** the thinking text is shown in italic when expanded

#### Scenario: Error blocks
- **WHEN** a `tool_result` contains an `is_error: true` flag
- **THEN** the block is rendered with a red error style
- **AND** the error message is displayed prominently

#### Scenario: Loading state for live sessions
- **WHEN** the live session's last entry is an assistant message with no result yet
- **THEN** a loading spinner is shown after the last tool_use block
- **AND** the spinner is removed when the result entry appears

### Requirement: Real-Time .jsonl Tailing
For live sessions with an active PTY, the chat view SHALL tail the corresponding `.jsonl` file and render new entries as they are written.

#### Scenario: New messages appear in real-time
- **WHEN** Claude Code writes a new entry to the `.jsonl` file
- **THEN** the chat view appends the new block within 500ms
- **AND** the view auto-scrolls to the bottom if the user was already at the bottom

#### Scenario: User scrolled up — no auto-scroll
- **WHEN** a new entry appears and the user has scrolled up from the bottom
- **THEN** the new block is appended but the scroll position is preserved
- **AND** a "scroll to bottom" indicator appears

### Requirement: Chat/Terminal Toggle
The session view SHALL provide a toggle to switch between the terminal (xterm.js) view and the chat (structured) view.

#### Scenario: Toggle between views
- **WHEN** the user clicks the chat/terminal toggle
- **THEN** the active view switches without losing state in either view
- **AND** both views remain synced to the same session

#### Scenario: Default to chat for completed sessions
- **WHEN** the user opens a completed (non-running) session
- **THEN** the chat view is shown by default
- **AND** the terminal toggle is available but not active
