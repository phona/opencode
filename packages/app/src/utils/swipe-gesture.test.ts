import { describe, expect, it } from "bun:test"
import { createSwipeGesture } from "./swipe-gesture"

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
