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
