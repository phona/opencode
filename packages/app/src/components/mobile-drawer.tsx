import { createEffect, type JSX, Show } from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"

export function MobileDrawer(props: {
  side: "left" | "right"
  open: () => boolean
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
