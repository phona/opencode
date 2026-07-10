# Task 1: Create swipe-gesture utility

**Files:**
- Create: `packages/app/src/utils/swipe-gesture.ts`
- Test: `packages/app/src/utils/swipe-gesture.test.ts`

**Interfaces:**
- Produces: `createSwipeGesture(target: HTMLElement, options: SwipeOptions): SwipeGesture` where `SwipeOptions` has `onSwipeLeft`, `onSwipeRight`, `edgeWidth`, `threshold`, `velocity`.

## Implementation Steps

### Step 1: Write the failing test

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

### Step 2: Run test to verify it fails

```bash
bun test src/utils/swipe-gesture.test.ts
```

Expected: `FAIL` — `createSwipeGesture` is not defined.

### Step 3: Implement the utility

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

### Step 4: Run test to verify it passes

```bash
bun test src/utils/swipe-gesture.test.ts
```

Expected: `PASS`.

### Step 5: Commit

```bash
git add packages/app/src/utils/swipe-gesture.ts packages/app/src/utils/swipe-gesture.test.ts
git commit -m "feat(app): add swipe gesture utility for mobile drawers"
```
