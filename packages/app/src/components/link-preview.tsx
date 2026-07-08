import { Component, createSignal, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"

interface LinkPreviewProps {
  url: string
}

export const LinkPreview: Component<LinkPreviewProps> = (props) => {
  const [loadState, setLoadState] = createSignal<"loading" | "loaded" | "blocked">("loading")

  return (
    <Dialog title="Link Preview">
      <div class="flex flex-col h-[70vh] min-h-0">
        <div class="flex items-center gap-2 px-4 py-2 border-b border-border-muted shrink-0">
          <span class="text-sm text-text-muted truncate flex-1 min-w-0">{props.url}</span>
          <a
            href={props.url}
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-text-interactive-base hover:underline shrink-0"
          >
            Open in new tab
          </a>
        </div>
        <div class="flex-1 min-h-0 relative">
          <Show when={loadState() !== "blocked"}>
            <iframe
              src={props.url}
              sandbox="allow-same-origin allow-scripts"
              class="w-full h-full border-0"
              onLoad={() => setLoadState("loaded")}
              onError={() => setLoadState("blocked")}
            />
          </Show>
          <Show when={loadState() === "blocked"}>
            <div class="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
              <p class="text-text-muted">This site does not allow being embedded.</p>
              <a
                href={props.url}
                target="_blank"
                rel="noopener noreferrer"
                class="text-sm text-text-interactive-base hover:underline"
              >
                Open in new tab
              </a>
            </div>
          </Show>
          <Show when={loadState() === "loading"}>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-text-muted text-sm">Loading...</span>
            </div>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}
