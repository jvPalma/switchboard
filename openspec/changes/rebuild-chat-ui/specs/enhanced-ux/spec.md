## ADDED Requirements

### Requirement: Clickable File References
Every file path displayed in the chat view SHALL be a clickable link that opens the file in the side panel.

#### Scenario: Click a file path in a Read tool block
- **WHEN** the user clicks a file path in a "Read" tool header
- **THEN** the file panel opens with the current contents of that file
- **AND** the file is syntax-highlighted based on its extension

#### Scenario: Click a file path in a Write/Edit block
- **WHEN** the user clicks a file path in a "Write" or "Edit" block
- **THEN** the file panel opens showing the diff (before/after)

#### Scenario: File no longer exists
- **WHEN** the user clicks a file path and the file has been deleted
- **THEN** a toast notification says "File not found"
- **AND** the file panel does not open

### Requirement: Inline Image Viewing
Images referenced in `.jsonl` entries SHALL be rendered inline in the chat, with a click-to-expand lightbox.

#### Scenario: Base64 image in user message
- **WHEN** a user message contains an `image` content block with base64 data
- **THEN** the image is rendered inline as a thumbnail (max 400px wide)
- **AND** clicking the image opens a full-size lightbox overlay

#### Scenario: Image from tool result
- **WHEN** a tool result contains image data (e.g., from a screenshot tool)
- **THEN** the image is rendered inline in the tool result block
- **AND** clicking opens the lightbox

#### Scenario: Lightbox navigation
- **WHEN** the lightbox is open
- **THEN** pressing Escape or clicking outside closes it
- **AND** the image can be zoomed with scroll/pinch

### Requirement: Sticky Bottom Prompt
The chat view SHALL have a fixed-position input area at the bottom that remains visible regardless of scroll position.

#### Scenario: Typing while scrolled up
- **WHEN** the user has scrolled up to review earlier messages
- **THEN** the input area at the bottom remains visible and focused
- **AND** typing in the input sends keystrokes to the active PTY

#### Scenario: No active session
- **WHEN** no session terminal is running
- **THEN** the input area is disabled with placeholder text "No active session"

#### Scenario: Scroll to bottom button
- **WHEN** the user is scrolled up and new messages arrive
- **THEN** a floating "↓ New messages" button appears above the input
- **AND** clicking it scrolls to the latest message

### Requirement: Rendered Markdown
Assistant text responses SHALL be rendered as formatted Markdown instead of raw text.

#### Scenario: Code blocks with syntax highlighting
- **WHEN** an assistant message contains fenced code blocks
- **THEN** the code is syntax-highlighted by language
- **AND** a "Copy" button appears on hover

#### Scenario: Markdown formatting
- **WHEN** an assistant message contains bold, italic, lists, headers, links, or tables
- **THEN** they are rendered with appropriate HTML formatting

#### Scenario: Markdown in diff context
- **WHEN** a Write/Edit tool targets a `.md` file
- **THEN** the diff view shows both the raw diff and a rendered preview toggle
- **AND** the rendered preview shows the Markdown as it would appear formatted
