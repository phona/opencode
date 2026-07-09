# Session Questions Panel Design

## Summary

Add a **Questions** panel inside the app session page's right-hand side panel. It lists every user question in the current session and lets the user jump directly to the corresponding message in the main timeline. This provides a fast way to "go back in time" through previous prompts without manually scrolling through the full message history.

## Context

The OpenCode app already has a rich session timeline (`MessageTimeline`) and a right-hand `SessionSidePanel` with tabs for Review, Context, and file tabs. The new feature fits naturally as another tab in that panel.

- Current timeline: virtual-scrolled, shows all messages, supports revert/unrevert.
- Current side panel: `SessionSidePanel` uses a `Tabs` component for Review/Context/File tabs.
- Existing data: `createTimelineModel` already exposes `userMessages` and `visibleUserMessages` (filtered by revert state), and the page already has `setActiveMessage` / `scrollToMessage`.

## Goals

1. Let users see all their previous questions in the current session at a glance.
2. One-click jump from any question to its position in the timeline.
3. Keep the implementation minimal by reusing existing data and scroll logic.
4. Respect revert state: only show questions that are still visible in the timeline.

## Non-Goals

1. Cross-session question search.
2. Re-send or edit historical questions.
3. Timeline scrubber / minimap.
4. Mobile entry point (the side panel is hidden on mobile).

## Proposed Approach

### Selected: Option A — Integrate as a new tab in the existing Session Side Panel

Add a `questions` tab to `SessionSidePanel` alongside Review, Context, and file tabs. Render the list in a new `SessionQuestionsPanel` component. Reuse `visibleUserMessages`, `activeMessageID`, and `scrollToMessage` from the existing session page.

**Why this option:**
- Low implementation cost.
- Consistent with the existing tab model.
- Users can switch between Questions and Review/Files without learning a new layout.

**Rejected options:**
- **B. Independent left/right sidebar:** Adds layout complexity and fights for space with the file tree / review panel.
- **C. Compact top dropdown:** Poor experience for long sessions; limited space for search and previews.

## Architecture

```
SessionPage
│
├─ MessageTimeline (existing)
│
├─ SessionSidePanel (existing)
│  └─ Tabs
│     ├─ review (existing)
│     ├─ context (existing)
│     ├─ file tabs (existing)
│     └─ questions (NEW)
│        └─ SessionQuestionsPanel
│           ├─ search input
│           └─ QuestionList
│              └─ QuestionItem
```

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| `SessionQuestionsPanel` | `packages/app/src/pages/session/session-questions-panel.tsx` | Top-level panel: search, list, empty/loading states. |
| `QuestionList` | inline or same file | Renders filtered questions. |
| `QuestionItem` | inline or same file | Single question row with summary, hover tooltip, active highlight. |

### Props for `SessionQuestionsPanel`

```ts
export interface SessionQuestionsPanelProps {
  userMessages: Accessor<UserMessage[]>
  activeMessageID: Accessor<string | undefined>
  loading: Accessor<boolean>
  onSelectMessage: (messageID: string) => void
}
```

All data comes from the parent (`session.tsx`). No new server queries.

## Data Flow

1. `session.tsx` computes `visibleUserMessages` from `createTimelineModel` and passes it to `SessionQuestionsPanel`.
2. `SessionQuestionsPanel` extracts a searchable text summary from each `UserMessage` (reusing existing prompt-text helpers where possible).
3. A local `query` signal filters the list client-side.
4. When a user clicks a question:
   - `onSelectMessage(message.id)` is called.
   - `session.tsx` calls `setActiveMessage(message)` and `scrollToMessage(message.id)`.
   - The main timeline scrolls to and highlights the target message.
5. The active item in the panel is derived from `activeMessageID` / `store.messageId`.

## UI/UX Details

### Tab Entry

- Add a `questions` tab in `SessionSidePanel`'s `Tabs.List`.
- i18n key: `session.tab.questions` = `"Questions"` (added to `en.ts`, parity test covers other locales).
- Tab is shown only when there is at least one user question.

### List Item

- Sequential number (`1.`, `2.`, ...).
- One or two-line summary of the question text, truncated with ellipsis.
- Optional relative timestamp on the second line (same format as the timeline).
- Hover tooltip shows the full question text.
- Active item is highlighted with a primary-color left border.

### Search

- Sticky search input at the top of the panel.
- i18n key: `session.questions.search`.
- Filters locally by question text.
- Empty-search state: "No questions match your search".

### Click Behavior

- Clicking a question jumps to the message in the timeline.
- On mobile, if the user is on the Review/Changes tab, switch back to the Session tab first.
- Right-click menu is out of scope for the first version.

### Keyboard

- When the panel is focused, `↑/↓` moves through items and `Enter` jumps.
- `Ctrl/Cmd + F` focuses the search input when the panel is visible.

### Empty & Loading States

- No questions yet: show "No questions yet".
- History loading: show 3 skeleton rows.
- Search no-match: show "No questions match your search".

## Error Handling

- If the target message is deleted or no longer visible (e.g., after a revert), the click fails silently and the current viewport is preserved. No toast.
- Loading older history before scrolling is delegated to the existing `useSessionHashScroll` logic; no new network error handling is added.
- Questions with no extractable text (e.g., only attachments) are still listed so the anchor is not lost, but the summary line is empty.

## Edge Cases

| Case | Behavior |
|------|----------|
| Revert active | List uses `visibleUserMessages`, so only questions before the revert point appear. |
| New user message arrives | Appended to the end of the list; active item stays unchanged. |
| Virtual scrolling | `MessageTimeline` already virtualizes; we call `scrollToMessage` and let it handle the rest. |
| Mobile | `SessionSidePanel` is hidden on mobile; feature is desktop-only until a mobile entry point is designed. |
| Blank questions | Filtered out; empty list shows the empty state. |

## Performance

- Render the list with a simple `For` — question count is typically far smaller than total message count.
- Cache the filtered list with `createMemo`.
- No new server queries.
- Virtualization can be added later if a session has thousands of questions.

## Testing

### Unit tests for `SessionQuestionsPanel`

- Renders `userMessages` in order with correct numbering.
- Search filters by question text.
- Clicking an item calls `onSelectMessage` with the correct ID.
- Active item is highlighted.
- Empty and loading states render correctly.

### Integration tests

- In `session.tsx`, verify that selecting a question triggers `scrollToMessage` with the expected ID.

### End-to-end (optional, follow-up)

- Clicking a question item scrolls the timeline to the corresponding message.

## i18n Keys to Add

- `session.tab.questions`: `"Questions"`
- `session.questions.search`: `"Search questions..."`
- `session.questions.empty`: `"No questions yet"`
- `session.questions.noResults`: `"No questions match your search"`

All keys must be added to `en.ts` and covered by the parity test; other locales will be synced by the usual translation workflow.

## Files to Touch

1. `packages/app/src/pages/session/session-side-panel.tsx` — add the `questions` tab and render the panel.
2. `packages/app/src/pages/session/session-questions-panel.tsx` — new component.
3. `packages/app/src/pages/session.tsx` — wire `visibleUserMessages`, `activeMessageID`, `scrollToMessage`, and `setActiveMessage` into the panel.
4. `packages/app/src/i18n/en.ts` — add new keys.
5. `packages/app/src/pages/session/session-questions-panel.test.tsx` — new unit tests.

## Rollout

This is a pure UI feature with no protocol or server changes. It can be shipped behind the existing `settings.general.newLayoutDesigns()` flag or enabled by default for all desktop users.
