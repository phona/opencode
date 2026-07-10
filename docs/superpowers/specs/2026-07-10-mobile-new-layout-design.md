# Mobile New Layout Design

**Date:** 2026-07-10
**Scope:** `packages/app` — mobile experience for the new layout (`settings.general.newLayoutDesigns()`)
**Status:** Design approved

## Summary

The new layout in `packages/app` was designed primarily for desktop. On mobile it feels cramped and awkward because desktop visual patterns (rounded panels, shadows, nested tabs, resizable panes) were scaled down rather than re-imagined for a small touchscreen.

This design refactors the mobile new-layout experience to follow the pattern used by mainstream mobile chat apps (ChatGPT, Claude): a full-screen chat as the main surface, with project/session switching reachable via a left-edge swipe and code-review/changes reachable via a right-edge swipe.

## Problem Statement

Current mobile new-layout pain points observed in the code:

- `pages/session.tsx` adds `gap-2 p-2` around the session surface and keeps `rounded-[10px]` shadows on `SessionPanelFrame`, wasting space and creating a card-in-card look.
- A `session/changes` tab bar is rendered at the top or bottom of the session panel, competing with the titlebar and composer.
- `ResizeHandle` is still rendered on mobile even though phone widths make dragging impossible.
- The composer contains a model selector, which is a session-level concern and clutters the input area.
- Home page (`pages/home.tsx`) keeps outer margins and shadows and shows the project column before the session list, pushing the most common action (resume a recent chat) below the fold.

## Goals

1. On mobile + new layout, the primary screen is always a full-screen chat session.
2. Switching projects/sessions is reachable in one left-edge swipe.
3. Reviewing changes is reachable in one right-edge swipe.
4. The composer contains only typing and attachments; model/agent selection moves to a session-level menu.
5. Desktop new layout remains unchanged.

## Non-Goals

- Rebuilding the legacy layout mobile experience.
- Changing the underlying chat, sync, or model-resolution logic.
- Adding completely new features (e.g., push notifications, voice input).

## Overall Structure

```
[ ← Home Drawer ]  ← left-edge swipe right
         ↓
[ Session View ]    ← main screen, full-bleed chat
         ↓
[ Changes Drawer ]  → right-edge swipe left
```

## Detailed Design

### 1. Home Drawer (Left)

- **Trigger:** left-edge swipe right, or the Home button in the titlebar.
- **Content:** a mobile-optimized view of the existing `NewHome` component.
  - Project list shown as a compact, collapsible list.
  - Session list grouped by time (today, yesterday, older) is the primary content.
  - Search bar at the top.
  - New-session button.
- **Excluded:** model switching and agent switching. Those are session-level concerns and do not belong in the project/session switcher.
- **Behavior:** selecting a project or session closes the drawer and navigates to the selected session. The system back gesture closes the drawer first.
- **Visual:** full-bleed within the drawer; no outer margins, no rounded corners, no shadows.

### 2. Changes Drawer (Right)

- **Trigger:** right-edge swipe left, or the Changes button in the titlebar, or an action in the composer’s `+` menu.
- **Content:** existing `ReviewPanelV2` / `SessionReviewTab` rendered inside a right-side drawer.
- **Behavior:** selecting a file or diff opens the file in the existing tab system. The system back gesture closes the drawer.
- **Visual:** slides in from the right, occupies most of the screen width.

### 3. Session View

- **Layout:** full-bleed, flush to the viewport edges.
- **Removed on mobile:**
  - `gap-2 p-2` outer spacing (`session.tsx`).
  - `rounded-[10px]` and shadows on `SessionPanelFrame`.
  - The `session/changes` tab bar.
  - The `ResizeHandle`.
- **Content:** `MessageTimeline` + `PromptInput` only.
- **Scroll behavior:** vertical panning is unrestricted; horizontal swipe is reserved for drawers.

### 4. Composer

- **Position:** fixed to the bottom of the screen, full-width.
- **Elements:**
  - Left: `+` button for attachments (files, images, code snippets).
  - Center: multi-line text input, auto-growing up to 5–6 lines.
  - Right: send button, disabled when empty.
- **Removed on mobile:**
  - Model selector.
  - Agent selector.
- **Context chips:** files/code already attached to the prompt render as small removable chips above the input.
- **Keyboard behavior:** composer sticks above the virtual keyboard; chat scrolls to the bottom when the input height changes.

### 5. Titlebar

- **Layout:**
  ```
  [Home] [Current Session Title] [Changes] [⋯]
  ```
- **Home button:** opens the Home drawer.
- **Current session title:** centered, truncated if too long. Tapping it opens a session actions/info sheet.
- **Changes button:** opens the Changes drawer.
- **⋯ menu:** opens a session-level bottom sheet containing:
  - Model selector (session-level).
  - Agent selector if available (session-level).
  - Session details (project name, creation time).
  - Rename / archive / delete session actions.
- **Model name is not shown permanently** in the titlebar because model switching is infrequent.

### 6. Gestures

| Gesture | Action |
|--------|--------|
| Left-edge swipe right | Open Home drawer |
| Right-edge swipe left | Open Changes drawer |
| Back gesture while drawer is open | Close drawer |
| Back gesture with no drawer open | Normal router back |

- **Threshold:** horizontal drag must exceed ~60 px or a velocity threshold to trigger a drawer.
- **Conflict prevention:** the chat scroll area uses `touch-action: pan-y` so horizontal swipes do not conflict with vertical scrolling. Text selection and interactive elements are excluded from the gesture recognizer.

## Components and Files

### New Components

1. `packages/app/src/components/mobile-drawer.tsx`
   - A reusable full-height drawer wrapper with enter/exit animations, backdrop, and swipe-to-dismiss.
   - Props: `side: "left" | "right"`, `open`, `onClose`, `children`.

2. `packages/app/src/utils/swipe-gesture.ts`
   - Hook/utility that attaches touch handlers to an element and reports left/right edge swipes with threshold and velocity checks.

### Modified Files

| File | Change |
|------|--------|
| `packages/app/src/pages/session.tsx` | Remove mobile padding/gap/rounded corners; hide tab bar and resize handle on mobile; render inside mobile shell. |
| `packages/app/src/pages/layout-new.tsx` | Wrap children in the mobile drawer shell when `!isDesktop()`; attach edge-swipe handlers. |
| `packages/app/src/components/titlebar.tsx` | On mobile + new layout, render simplified titlebar with Home, session title, Changes, and session menu. |
| `packages/app/src/pages/home.tsx` | Optimize `NewHome` for drawer use: remove outer margins/shadows, compact project list, sessions as primary content. |
| `packages/app/src/components/prompt-input.tsx` | Simplify composer on mobile: hide model and agent controls; keep only input, attachment, and send. |
| `packages/app/src/pages/session/session-side-panel.tsx` | Allow rendering in the right-side Changes drawer on mobile. |

## Data Flow

- Drawer open/close state is local UI state managed by the mobile shell component.
- Selecting a project/session in the Home drawer calls the existing `navigate` and `tabs.select` APIs, then closes the drawer.
- Selecting a model/agent in the session menu updates the existing session-level model/agent selection stores.
- No new global state is introduced; drawers are overlays on the existing route tree.

## Error Handling and Edge Cases

- **Desktop is unaffected:** all mobile-specific changes are gated by `!isDesktop()` or `createMediaQuery("(max-width: 767px)")`.
- **No active session:** if the user is on a draft/new-session route, the Changes button is disabled/hidden and the session title area shows the draft state.
- **Keyboard open:** drawers auto-close when the composer receives focus to avoid layout conflicts.
- **Landscape phones:** the same mobile logic applies; drawer width may be capped to avoid overly wide panels.
- **Conflicting gestures:** swipes that start on interactive elements (buttons, links, selected text) are ignored by the drawer gesture recognizer.

## Testing Plan

- **E2E:** left-edge swipe opens Home drawer; selecting a session navigates and closes the drawer.
- **E2E:** right-edge swipe opens Changes drawer; selecting a file closes the drawer and opens the file tab.
- **E2E:** titlebar ⋯ menu opens and switches the model.
- **Visual regression:** mobile session page full-height screenshot.
- **Desktop regression:** verify no UI or behavior changes on desktop new layout.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Gesture conflicts with horizontal scroll inside chat content | Use `touch-action: pan-y` and element hit-testing. |
| Drawer animations hurt performance on low-end devices | Use `transform: translateX` and `will-change` sparingly; respect `prefers-reduced-motion`. |
| Home page reused in drawer may still feel desktop-like | Make the mobile Home drawer styling changes explicit in the spec; do not rely on existing styles. |

## Alternatives Considered

1. **Add a tab bar inside the drawer.** Rejected because it duplicates the project/session hierarchy already present in the Home page and adds complexity.
2. **Put model/agent switches in the Home drawer.** Rejected because they are session-level concerns, not project-level or global.
3. **Build a completely separate mobile route tree.** Rejected because it would duplicate route logic and make maintenance harder; the current approach reuses existing components with a mobile shell.

## Open Questions

None. All design decisions have been resolved during the brainstorming session.
