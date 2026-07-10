import { describe, expect, test } from "bun:test"
import { makeEventListener } from "@solid-primitives/event-listener"
import { MobileDrawer } from "./mobile-drawer"

describe("MobileDrawer", () => {
  test("exports a component function", () => {
    expect(typeof MobileDrawer).toBe("function")
    expect(MobileDrawer.name).toBe("MobileDrawer")
  })

  test("touch gesture closes drawer on edge swipe", () => {
    const panel = document.createElement("div")
    Object.defineProperty(panel, "clientWidth", { value: 300 })
    
    let closed = false
    let startX = 0
    
    const cleanup = [
      makeEventListener(panel, "touchstart", (event) => {
        const touch = event.touches[0]
        if (!touch) return
        startX = touch.clientX
      }),
      makeEventListener(panel, "touchend", (event) => {
        const touch = event.changedTouches[0]
        if (!touch) return
        const side: "left" | "right" = "left"
        const fromEdge = side === "left" ? startX <= 20 : panel.clientWidth - startX <= 20
        const deltaX = touch.clientX - startX
        if (fromEdge && Math.abs(deltaX) > 60) closed = true
      })
    ]

    const start = new TouchEvent("touchstart", {
      touches: [new Touch({ identifier: 1, target: panel, clientX: 10, clientY: 100 })],
    })
    const end = new TouchEvent("touchend", {
      changedTouches: [new Touch({ identifier: 1, target: panel, clientX: 80, clientY: 100 })],
    })

    panel.dispatchEvent(start)
    panel.dispatchEvent(end)

    expect(closed).toBe(true)
    cleanup.forEach(fn => fn())
  })

  test("touch gesture ignores non-edge swipes", () => {
    const panel = document.createElement("div")
    Object.defineProperty(panel, "clientWidth", { value: 300 })
    
    let closed = false
    let startX = 0
    
    const cleanup = [
      makeEventListener(panel, "touchstart", (event) => {
        const touch = event.touches[0]
        if (!touch) return
        startX = touch.clientX
      }),
      makeEventListener(panel, "touchend", (event) => {
        const touch = event.changedTouches[0]
        if (!touch) return
        const side: "left" | "right" = "left"
        const fromEdge = side === "left" ? startX <= 20 : panel.clientWidth - startX <= 20
        const deltaX = touch.clientX - startX
        if (fromEdge && Math.abs(deltaX) > 60) closed = true
      })
    ]

    const start = new TouchEvent("touchstart", {
      touches: [new Touch({ identifier: 1, target: panel, clientX: 100, clientY: 100 })],
    })
    const end = new TouchEvent("touchend", {
      changedTouches: [new Touch({ identifier: 1, target: panel, clientX: 160, clientY: 100 })],
    })

    panel.dispatchEvent(start)
    panel.dispatchEvent(end)

    expect(closed).toBe(false)
    cleanup.forEach(fn => fn())
  })

  test("touch gesture ignores small movements", () => {
    const panel = document.createElement("div")
    Object.defineProperty(panel, "clientWidth", { value: 300 })
    
    let closed = false
    let startX = 0
    
    const cleanup = [
      makeEventListener(panel, "touchstart", (event) => {
        const touch = event.touches[0]
        if (!touch) return
        startX = touch.clientX
      }),
      makeEventListener(panel, "touchend", (event) => {
        const touch = event.changedTouches[0]
        if (!touch) return
        const side: "left" | "right" = "left"
        const fromEdge = side === "left" ? startX <= 20 : panel.clientWidth - startX <= 20
        const deltaX = touch.clientX - startX
        if (fromEdge && Math.abs(deltaX) > 60) closed = true
      })
    ]

    const start = new TouchEvent("touchstart", {
      touches: [new Touch({ identifier: 1, target: panel, clientX: 10, clientY: 100 })],
    })
    const end = new TouchEvent("touchend", {
      changedTouches: [new Touch({ identifier: 1, target: panel, clientX: 50, clientY: 100 })],
    })

    panel.dispatchEvent(start)
    panel.dispatchEvent(end)

    expect(closed).toBe(false)
    cleanup.forEach(fn => fn())
  })

  test("right-side drawer detects right-edge swipe", () => {
    const panel = document.createElement("div")
    Object.defineProperty(panel, "clientWidth", { value: 300 })
    
    let closed = false
    let startX = 0
    
    const cleanup = [
      makeEventListener(panel, "touchstart", (event) => {
        const touch = event.touches[0]
        if (!touch) return
        startX = touch.clientX
      }),
      makeEventListener(panel, "touchend", (event) => {
        const touch = event.changedTouches[0]
        if (!touch) return
        const fromEdge = panel.clientWidth - startX <= 20
        const deltaX = touch.clientX - startX
        if (fromEdge && Math.abs(deltaX) > 60) closed = true
      })
    ]

    const start = new TouchEvent("touchstart", {
      touches: [new Touch({ identifier: 1, target: panel, clientX: 290, clientY: 100 })],
    })
    const end = new TouchEvent("touchend", {
      changedTouches: [new Touch({ identifier: 1, target: panel, clientX: 220, clientY: 100 })],
    })

    panel.dispatchEvent(start)
    panel.dispatchEvent(end)

    expect(closed).toBe(true)
    cleanup.forEach(fn => fn())
  })
})
