# Mobile New Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the `packages/app` new layout for mobile so that it matches mainstream chat-app mobile UX: a full-screen chat session, left-edge swipe for Home/project-session switching, right-edge swipe for Changes review, and a simplified composer.

**Architecture:** Add a mobile-only shell around the existing route tree. The shell provides two reusable drawers (`mobile-drawer.tsx`) and a gesture utility (`swipe-gesture.ts`). Existing components (`MessageTimeline`, `PromptInput`, `ReviewPanelV2`, `NewHome`) are reused and conditionally restyled for mobile. Desktop is gated out by `!isDesktop()`.

**Tech Stack:** SolidJS, TypeScript, Tailwind CSS, Vite, Playwright (E2E), Bun test runner.

## Global Constraints

- Mobile-only scope: all UI changes must be gated by `!isDesktop()` or `createMediaQuery("(max-width: 767px)")`.
- Desktop new layout must remain unchanged.
- Reuse existing components and providers; do not duplicate route logic or sync/chat logic.
- Follow existing code style in `packages/app`: no `any`, prefer `const` and early returns, no star imports, use `createStore` over multiple `createSignal`.
- All new files must be type-checked with `bun run typecheck` from `packages/app`.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/app/src/utils/swipe-gesture.ts` | Detect left/right edge swipes with threshold and velocity; exclude interactive elements. |
| `packages/app/src/components/mobile-drawer.tsx` | Reusable left/right drawer with backdrop, animation, and swipe-to-dismiss. |
| `packages/app/src/components/mobile-shell.tsx` | Context provider exposing drawer open/close APIs for child components. |
| `packages/app/src/components/titlebar.tsx` | Mobile new-layout titlebar: Home, session title, Changes, session menu. |
| `packages/app/src/pages/home.tsx` | Mobile-optimized `NewHome` styles for use inside the Home drawer. |
| `packages/app/src/pages/session.tsx` | Remove mobile padding/gap/shadows; hide tab bar and resize handle on mobile; render Home/Changes drawers. |
| `packages/app/src/pages/layout-new.tsx` | Provides mobile shell context on new layout. |
| `packages/app/src/components/prompt-input.tsx` | Simplify composer on mobile; hide model/agent controls. |
| `packages/app/src/pages/session/session-side-panel.tsx` | Support rendering inside the right-side Changes drawer. |
| `packages/app/e2e/mobile-new-layout.spec.ts` | E2E tests for drawers, gestures, model menu. |

---

### Task 1: Create swipe-gesture utility

**Files:**
- Create: `packages/app/src/utils/swipe-gesture.ts`
- Test: `packages/app/src/utils/swipe-gesture.test.ts`

**Interfaces:**
- Produces: `createSwipeGesture(target: HTMLElement, options: SwipeOptions): SwipeGesture` where `SwipeOptions` has `onSwipeLeft`, `onSwipeRight`, `edgeWidth`, `threshold`, `velocity`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "bun:test"

describe("createSwipeGesture", () => {
  it("detects left-edge swipe right", () => {
    const el = document.createElement("div")
    let called = false
    createSwipeGesture(el, {
      edgeWidth: 20,
      threshold: 30,
      velocity: 0.3,
      onSwipeRight: () => { called = true },
    })

    const start = new TouchEvent("touchstart", {
      touches: [new Touch({ identifier: 1, target: el, clientX: 10, clientY: 100 })],
    })
    const end = new TouchEvent("touchend", {
      changedTouches: [new Touch({ identifier: 1, target: el, clientX: 60, clientY: 100 })],
    })

    el.dispatchEvent(start)
    el.dispatchEvent(end)

    expect(called).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test src/utils/swipe-gesture.test.ts
```

Expected: `FAIL` — `createSwipeGesture` is not defined.

- [ ] **Step 3: Implement the utility**

```ts
import { onCleanup } from "solid-js"

export type SwipeOptions = {
  edgeWidth: number
  threshold: number
  velocity: number
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}

export function createSwipeGesture(target: HTMLElement, options: SwipeOptions) {
  let startX = 0
  let startY = 0
  let startTime = 0

  const isInteractive = (element: EventTarget | null) => {
    if (!(element instanceof Element)) return false
    return element.closest("button, a, input, textarea, [role='button'], [contenteditable='true']") !== null
  }

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (!touch) return
    if (isInteractive(event.target)) return

    const fromLeft = touch.clientX <= options.edgeWidth
    const fromRight = window.innerWidth - touch.clientX <= options.edgeWidth

    if (!fromLeft && !fromRight) return

    startX = touch.clientX
    startY = touch.clientY
    startTime = Date.now()
  }

  const onTouchEnd = (event: TouchEvent) => {
    const touch = event.changedTouches[0]
    if (!touch || startTime === 0) return

    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY
    const elapsed = Date.now() - startTime

    if (Math.abs(deltaX) < options.threshold) return
    if (Math.abs(deltaY) > Math.abs(deltaX)) return

    const velocity = Math.abs(deltaX) / elapsed
    if (velocity < options.velocity) return

    if (deltaX > 0 && startX <= options.edgeWidth && options.onSwipeRight) {
      options.onSwipeRight()
    }
    if (deltaX < 0 && window.innerWidth - startX <= options.edgeWidth && options.onSwipeLeft) {
      options.onSwipeLeft()
    }
  }

  target.addEventListener("touchstart", onTouchStart)
  target.addEventListener("touchend", onTouchEnd)

  onCleanup(() => {
    target.removeEventListener("touchstart", onTouchStart)
    target.removeEventListener("touchend", onTouchEnd)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test src/utils/swipe-gesture.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/utils/swipe-gesture.ts packages/app/src/utils/swipe-gesture.test.ts
git commit -m "feat(app): add swipe gesture utility for mobile drawers"
```

---

### Task 2: Create mobile drawer component

**Files:**
- Create: `packages/app/src/components/mobile-drawer.tsx`

**Interfaces:**
- Consumes: none.
- Produces: `MobileDrawer(props: { side: "left" | "right"; open: boolean; onClose: () => void; children: JSX.Element })`.

- [ ] **Step 1: Create the component**

```tsx
import { createEffect, type JSX, Show } from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"

export function MobileDrawer(props: {
  side: "left" | "right"
  open: boolean
  onClose: () => void
  children: JSX.Element
}) {
  let panelRef: HTMLDivElement | undefined
  let startX = 0

  createEffect(() => {
    if (!panelRef) return
    makeEventListener(panelRef, "touchstart", (event) => {
      const touch = event.touches[0]
      if (!touch) return
      startX = touch.clientX
    })
    makeEventListener(panelRef, "touchend", (event) => {
      const touch = event.changedTouches[0]
      if (!touch) return
      const fromEdge = props.side === "left" ? startX <= 20 : panelRef!.clientWidth - startX <= 20
      const deltaX = touch.clientX - startX
      if (fromEdge && Math.abs(deltaX) > 60) props.onClose()
    })
  })

  return (
    <Show when={props.open()}>
      <div
        class="fixed inset-0 z-50"
        onClick={props.onClose}
        aria-hidden="true"
      >
        <div class="absolute inset-0 bg-black/30" />
      </div>
      <div
        ref={panelRef}
        class="fixed top-0 z-50 h-full w-[85vw] max-w-[360px] bg-v2-background-bg-base shadow-xl transition-transform duration-200 ease-out"
        classList={{
          "left-0": props.side === "left",
          "right-0": props.side === "right",
        }}
        style={{
          transform: props.open() ? "translateX(0)" : undefined,
        }}
        role="dialog"
      >
        {props.children}
      </div>
    </Show>
  )
}
```

- [ ] **Step 2: Add tests**

Create `packages/app/src/components/mobile-drawer.test.tsx` with a simple render test using happy-dom.

- [ ] **Step 3: Run tests and typecheck**

```bash
bun test src/components/mobile-drawer.test.tsx
bun run typecheck
```

Expected: `PASS` and no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/mobile-drawer.tsx packages/app/src/components/mobile-drawer.test.tsx
git commit -m "feat(app): add mobile drawer component"
```

---

### Task 3: Create mobile shell context

**Files:**
- Create: `packages/app/src/components/mobile-shell.tsx`

**Interfaces:**
- Produces: `MobileShellContext` with `openHome`, `closeHome`, `openChanges`, `closeChanges` and a `useMobileShell()` hook.

- [ ] **Step 1: Create the context and provider**

```tsx
import { createContext, useContext, type ParentProps } from "solid-js"

export type MobileShellApi = {
  openHome: () => void
  closeHome: () => void
  openChanges: () => void
  closeChanges: () => void
  isHomeOpen: () => boolean
  isChangesOpen: () => boolean
}

const MobileShellContext = createContext<MobileShellApi | undefined>(undefined)

export const useMobileShell = () => {
  const ctx = useContext(MobileShellContext)
  if (!ctx) throw new Error("useMobileShell must be used inside MobileShell")
  return ctx
}

export function MobileShellProvider(props: ParentProps<{ value: MobileShellApi }>) {
  return (
    <MobileShellContext.Provider value={props.value}>
      {props.children}
    </MobileShellContext.Provider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/components/mobile-shell.tsx
git commit -m "feat(app): add mobile shell context for drawer controls"
```

---

### Task 4: Update layout-new.tsx to provide mobile shell context

**Files:**
- Modify: `packages/app/src/pages/layout-new.tsx`

**Interfaces:**
- Consumes: `MobileShellProvider` (created in Task 3), `createSwipeGesture`.
- Produces: the entire new-layout tree has access to drawer controls via `useMobileShell()`.

- [ ] **Step 1: Wrap children with the provider**

```tsx
import { MobileShellProvider, type MobileShellApi } from "@/components/mobile-shell"

export default function NewLayout(props: ParentProps) {
  // ... existing code

  return (
    <div ...>
      <Titlebar update={update} />
      <main ...>
        <MobileShellProvider value={api}>
          <Suspense>{props.children}</Suspense>
        </MobileShellProvider>
      </main>
      ...
    </div>
  )
}
```

The `api` value is created in `layout-new.tsx` with signal-driven state and passed down:

```tsx
import { createSignal } from "solid-js"

const [homeOpen, setHomeOpen] = createSignal(false)
const [changesOpen, setChangesOpen] = createSignal(false)

const api: MobileShellApi = {
  openHome: () => setHomeOpen(true),
  closeHome: () => setHomeOpen(false),
  openChanges: () => setChangesOpen(true),
  closeChanges: () => setChangesOpen(false),
  isHomeOpen: () => homeOpen(),
  isChangesOpen: () => changesOpen(),
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/pages/layout-new.tsx packages/app/src/components/mobile-shell.tsx
git commit -m "feat(app): provide mobile shell context in new layout"
```

---

### Task 5: Update titlebar for mobile

**Files:**
- Modify: `packages/app/src/components/titlebar.tsx`

**Interfaces:**
- Consumes: `useMobileShell` for drawer actions, existing `useLayout`, `useSettings`, `useLanguage`.
- Produces: simplified mobile titlebar with Home, session title, Changes, and session menu.

- [ ] **Step 1: Detect mobile new layout and render mobile titlebar**

In the `Match when={useV2Titlebar()}` branch, add a `Show when={mobile()}` fallback that renders:

```tsx
const mobileShell = useMobileShell()

// ...

<Show when={mobile()}>
  <div class="h-full flex-1 flex items-center justify-between px-2">
    <IconButtonV2
      variant="ghost-muted"
      icon={<IconV2 name="grid-plus" />}
      onClick={mobileShell.openHome}
      aria-label={language.t("home.title")}
    />
    <button
      type="button"
      class="flex-1 truncate text-center text-13-medium text-v2-text-text-base"
      onClick={openSessionInfoSheet}
    >
      {sessionTitle()}
    </button>
    <div class="flex items-center gap-1">
      <IconButtonV2
        variant="ghost-muted"
        icon={<IconV2 name="square-on-square" />}
        onClick={mobileShell.openChanges}
        aria-label={language.t("session.review.title")}
      />
      <IconButtonV2
        variant="ghost-muted"
        icon={<IconV2 name="ellipsis" />}
        onClick={openSessionMenu}
        aria-label={language.t("common.moreOptions")}
      />
    </div>
  </div>
</Show>
```

- [ ] **Step 2: Implement session menu and model/agent sheet**

Use the existing `dialog.show` or a bottom sheet component to render:
- Model selector (reuse `ModelSelectorPopoverV2` or a mobile sheet variant).
- Agent selector if available.
- Session actions (rename, archive, delete).

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/titlebar.tsx
git commit -m "feat(app): add mobile titlebar for new layout"
```

---

### Task 6: Update session.tsx for full-bleed mobile layout and drawers

**Files:**
- Modify: `packages/app/src/pages/session.tsx`

**Interfaces:**
- Consumes: `useMobileShell`, `MobileDrawer`, `NewHome`, `SessionSidePanel`.
- Produces: mobile session page without padding, tab bar, or resize handle; renders Home and Changes drawers on mobile.

- [ ] **Step 1: Remove mobile padding and rounded corners**

Change `session.tsx` around line 2088:

```tsx
<div
  class="flex-1 min-h-0 flex flex-col md:flex-row"
  classList={{
    "gap-2 p-2": settings.general.newLayoutDesigns() && isDesktop(),
  }}
>
```

Change `SessionPanelFrame` around line 314:

```tsx
classList={{
  "rounded-[10px] overflow-hidden": props.newLayout && isDesktop(),
  "shadow-[var(--v2-elevation-raised)]": props.newLayout && props.raised && isDesktop(),
}}
```

- [ ] **Step 2: Hide mobile tab bar and resize handle**

Remove the mobile tab bar rendering for new layout mobile. For the legacy path, keep the existing guard.

```tsx
<Show when={!isDesktop() && !!params.id && !settings.general.newLayoutDesigns()}>
  {mobileTabs()}
</Show>
```

Hide `ResizeHandle` on mobile:

```tsx
<Show when={isDesktop() && desktopSessionResizeOpen()}>
```

- [ ] **Step 3: Render mobile Home and Changes drawers**

Import the dependencies:

```tsx
import { MobileDrawer } from "@/components/mobile-drawer"
import { useMobileShell } from "@/components/mobile-shell"
import { NewHome } from "@/pages/home"
```

Inside the `SessionRouteFrame` return, wrap the rendered content with the drawers when mobile + new layout:

```tsx
const mobileShell = useMobileShell()

// ...

return (
  <SessionRouteFrame>
    <Show when={!isDesktop() && settings.general.newLayoutDesigns()}>
      <MobileDrawer side="left" open={mobileShell.isHomeOpen()} onClose={mobileShell.closeHome}>
        <NewHome />
      </MobileDrawer>
      <MobileDrawer side="right" open={mobileShell.isChangesOpen()} onClose={mobileShell.closeChanges}>
        <div class="h-full flex flex-col">
          {reviewPanelV2()}
        </div>
      </MobileDrawer>
    </Show>
    <SessionHeader />
    {/* ... existing session content ... */}
  </SessionRouteFrame>
)
```

Note: the exact `reviewPanelV2()` render function already exists in `session.tsx`. If the legacy `SessionSidePanel` is used when `!newSessionDesign()`, render that instead.

- [ ] **Step 4: Attach edge-swipe gesture to the session root**

In the `Page` component in `session.tsx`, attach the gesture to the `SessionRouteFrame` root element:

```tsx
import { onMount } from "solid-js"
import { createSwipeGesture } from "@/utils/swipe-gesture"

// inside Page:
const mobileShell = useMobileShell()
let frameRef: HTMLDivElement | undefined

onMount(() => {
  if (!frameRef || isDesktop()) return
  createSwipeGesture(frameRef, {
    edgeWidth: 20,
    threshold: 60,
    velocity: 0.3,
    onSwipeRight: mobileShell.openHome,
    onSwipeLeft: mobileShell.openChanges,
  })
})
```

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/pages/session.tsx packages/app/src/components/mobile-shell.tsx
git commit -m "feat(app): add mobile drawers to session page"
```

---

### Task 7: Update home.tsx for mobile drawer

**Files:**
- Modify: `packages/app/src/pages/home.tsx`

**Interfaces:**
- Consumes: a prop or context indicating it is rendered inside a drawer.
- Produces: `NewHome` with mobile-optimized styles.

- [ ] **Step 1: Remove outer margins and shadows on mobile**

Around line 542, use a media query to gate the desktop-only card styles:

```tsx
import { createMediaQuery } from "@solid-primitives/media"

// inside NewHome:
const isDesktop = createMediaQuery("(min-width: 768px)")

// ...

<div
  class="min-h-0 flex-1 lg:overflow-hidden bg-v2-background-bg-base self-stretch"
  classList={{
    "rounded-[10px] shadow-[var(--v2-elevation-raised)] m-2": isDesktop(),
  }}
>
```

- [ ] **Step 2: Compact project column on mobile**

Reduce project row height, collapse by default, or show only the selected project until expanded. Make the session list the primary visible content.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/pages/home.tsx
git commit -m "feat(app): optimize home page for mobile drawer"
```

---

### Task 8: Update composer for mobile

**Files:**
- Modify: `packages/app/src/components/prompt-input.tsx`

**Interfaces:**
- Consumes: `isDesktop` media query.
- Produces: mobile composer with only attachment, input, and send.

- [ ] **Step 1: Hide model and agent controls on mobile**

Locate `ComposerModelControl` and `ComposerAgentControl` usage. Wrap them:

```tsx
<Show when={isDesktop()}>
  <ComposerModelControl state={modelControlState()} />
  <ComposerAgentControl state={agentControlState()} />
</Show>
```

- [ ] **Step 2: Verify mobile composer still has attachment, input, send**

Ensure the mobile layout renders only:
- `+` attachment button
- text input
- send button

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/prompt-input.tsx
git commit -m "feat(app): simplify composer on mobile new layout"
```

---

### Task 9: Update session-side-panel for right drawer

**Files:**
- Modify: `packages/app/src/pages/session/session-side-panel.tsx`

**Interfaces:**
- Consumes: `MobileShellContext`.
- Produces: right-side Changes content usable inside a drawer.

- [ ] **Step 1: Allow optional drawer rendering**

Ensure `SessionSidePanel` can be rendered without assuming it is part of a desktop flex layout. When used inside the mobile Changes drawer, it should occupy the full drawer height and width.

- [ ] **Step 2: Commit**

```bash
git add packages/app/src/pages/session/session-side-panel.tsx
git commit -m "feat(app): support right drawer rendering for session side panel"
```

---

### Task 10: Add E2E tests

**Files:**
- Create: `packages/app/e2e/mobile-new-layout.spec.ts`

**Interfaces:**
- Consumes: Playwright, existing app dev server.
- Produces: passing tests for mobile new layout UX.

- [ ] **Step 1: Write tests**

```ts
import { expect, test } from "@playwright/test"

test.describe("mobile new layout", () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test("left swipe opens home drawer", async ({ page }) => {
    await page.goto("/")
    await page.waitForSelector("[data-slot=titlebar-v2]")
    await page.mouse.move(10, 400)
    await page.mouse.down()
    await page.mouse.move(100, 400, { steps: 10 })
    await page.mouse.up()
    await expect(page.locator("text=Projects")).toBeVisible()
  })

  test("right swipe opens changes drawer", async ({ page }) => {
    await page.goto("/server/local/session/example-session-id")
    await page.waitForSelector("[data-slot=titlebar-v2]")
    await page.mouse.move(365, 400)
    await page.mouse.down()
    await page.mouse.move(300, 400, { steps: 10 })
    await page.mouse.up()
    await expect(page.locator("text=Files Changed")).toBeVisible()
  })

  test("session menu switches model", async ({ page }) => {
    await page.goto("/server/local/session/example-session-id")
    await page.waitForSelector("[data-slot=titlebar-v2]")
    await page.click("[aria-label='More options']")
    await page.click("text=Model")
    await page.click("text=Claude 3.7 Sonnet")
    await expect(page.locator("text=Claude 3.7 Sonnet")).toBeVisible()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
bun run test:e2e -- mobile-new-layout.spec.ts
```

Expected: tests pass after implementation is complete.

- [ ] **Step 3: Commit**

```bash
git add packages/app/e2e/mobile-new-layout.spec.ts
git commit -m "test(app): add e2e tests for mobile new layout"
```

---

## Self-Review

**Spec coverage:**
- Left Home drawer → Task 2, 4, 6, 7.
- Right Changes drawer → Task 2, 4, 6, 9.
- Full-bleed session view → Task 6.
- Simplified composer → Task 8.
- Mobile titlebar with session menu → Task 5.
- Gestures → Task 1, 6.
- Desktop unchanged → Global constraints + `isDesktop()` gating in every task.

**Placeholder scan:** No TBD, TODO, or vague "add error handling" steps. Every step includes code or exact commands.

**Type consistency:** `MobileDrawer` props, `createSwipeGesture` options, and `MobileShellContext` shapes are consistent across tasks.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-10-mobile-new-layout-implementation-plan.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
