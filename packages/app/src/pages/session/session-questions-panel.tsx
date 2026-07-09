import { For, Show, createMemo, createSignal, type Accessor } from "solid-js"
import type { UserMessage } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { filterQuestions, questionSummary } from "./session-questions-utils"

export interface SessionQuestionsPanelProps {
  userMessages: Accessor<UserMessage[]>
  activeMessageID: Accessor<string | undefined>
  loading: Accessor<boolean>
  onSelectMessage: (messageID: string) => void
}

export function SessionQuestionsPanel(props: SessionQuestionsPanelProps) {
  const language = useLanguage()
  const sync = useSync()
  const [query, setQuery] = createSignal("")

  const partsByMessage = createMemo(() => sync().data.part)

  const filtered = createMemo(() =>
    filterQuestions(props.userMessages(), partsByMessage(), query()),
  )

  const empty = createMemo(() => props.userMessages().length === 0 && !props.loading())
  const noResults = createMemo(() => filtered().length === 0 && query().trim().length > 0)

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 p-3 border-b border-border-weaker-base">
        <div class="relative">
          <input
            type="text"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder={language.t("session.questions.search")}
            class="w-full bg-background-stronger text-13-regular text-text placeholder:text-text-weaker rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-2">
        <Show when={props.loading()}>
          <div class="space-y-2 p-1">
            <div class="h-12 bg-background-stronger rounded-lg animate-pulse" />
            <div class="h-12 bg-background-stronger rounded-lg animate-pulse" />
            <div class="h-12 bg-background-stronger rounded-lg animate-pulse" />
          </div>
        </Show>

        <Show when={empty()}>
          <div class="h-full flex items-center justify-center text-center p-6">
            <div class="text-13-regular text-text-weak">{language.t("session.questions.empty")}</div>
          </div>
        </Show>

        <Show when={noResults()}>
          <div class="h-full flex items-center justify-center text-center p-6">
            <div class="text-13-regular text-text-weak">{language.t("session.questions.noResults")}</div>
          </div>
        </Show>

        <Show when={!props.loading() && !empty() && !noResults()}>
          <div class="space-y-1" role="list">
            <For each={filtered()}>
              {(message, index) => {
                const isActive = createMemo(() => props.activeMessageID() === message.id)
                const summary = createMemo(() =>
                  questionSummary(message, partsByMessage()[message.id] ?? []),
                )

                return (
                  <button
                    type="button"
                    role="listitem"
                    class="w-full text-left rounded-lg px-3 py-2.5 transition-colors group"
                    classList={{
                      "bg-background-base hover:bg-background-stronger": !isActive(),
                      "bg-background-stronger border-l-2 border-primary": isActive(),
                      "border-l-2 border-transparent": !isActive(),
                    }}
                    onClick={() => props.onSelectMessage(message.id)}
                  >
                    <div class="flex gap-2 min-w-0">
                      <span class="text-12-regular text-text-weak mt-0.5 shrink-0">{index() + 1}.</span>
                      <div class="flex-1 min-w-0">
                        <p
                          class="text-13-regular text-text leading-snug line-clamp-2"
                          classList={{ "font-medium text-text": isActive() }}
                        >
                          {summary() || "\u00A0"}
                        </p>
                        <p class="text-11-regular text-text-weaker mt-0.5">
                          {new Date(message.time.created).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
