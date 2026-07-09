# Session Questions Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Questions" tab to the app session page's right-hand side panel that lists every visible user question in the current session and scrolls the timeline to it on click.

**Architecture:** Reuse the existing `SessionSidePanel` tab system and `createTimelineModel` data. Add a small optional `questions` flag to `createSessionTabs` so the tab state manager recognizes the new tab. Build a new `SessionQuestionsPanel` component that renders a searchable list of user questions, derives question text from `message.summary` or `sync().data.part`, and delegates scroll/jump to the existing `scrollToMessage` in `session.tsx`.

**Tech Stack:** TypeScript, SolidJS, TailwindCSS, Bun test, tsgo typecheck.

## Global Constraints

- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server; this is a UI-only app change.
- Use Bun APIs when possible.
- Prefer `const` over `let`, ternaries or early returns over reassignment, and avoid `else`.
- Avoid star imports and import aliases.
- Use snake_case for Drizzle schema fields (not applicable here).
- Tests cannot run from repo root; run from `packages/app`.
- Always run `bun typecheck` from package directories, never `tsc` directly.
- The default branch is `dev`; use conventional commits (`type(scope): summary`).

---

## Task 1: Add i18n keys

**Files:**
- Modify: `packages/app/src/i18n/en.ts`
- Modify: `packages/app/src/i18n/ar.ts`, `br.ts`, `bs.ts`, `da.ts`, `de.ts`, `es.ts`, `fr.ts`, `ja.ts`, `ko.ts`, `no.ts`, `pl.ts`, `ru.ts`, `th.ts`, `tr.ts`, `uk.ts`, `zh.ts`, `zht.ts`
- Test: `packages/app/src/i18n/parity.test.ts`

**Interfaces:**
- Consumes: existing app i18n dictionary shape.
- Produces: new keys `"session.tab.questions"`, `"session.questions.search"`, `"session.questions.empty"`, `"session.questions.noResults"` present in `en.ts` and all locales.

- [ ] **Step 1: Add keys to `en.ts`**

Open `packages/app/src/i18n/en.ts` and insert the new keys near the existing `session.tab.*` block (around line 629):

```ts
"session.tab.questions": "Questions",
"session.questions.search": "Search questions...",
"session.questions.empty": "No questions yet",
"session.questions.noResults": "No questions match your search",
```

- [ ] **Step 2: Add the same four English strings to every non-English locale**

For each locale file in `packages/app/src/i18n/` (all except `en.ts`), add the same four lines in the same alphabetical/key position. Translation is handled by the normal sync workflow; placeholder English copy is acceptable here to pass parity.

```ts
"session.tab.questions": "Questions",
"session.questions.search": "Search questions...",
"session.questions.empty": "No questions yet",
"session.questions.noResults": "No questions match your search",
```

- [ ] **Step 3: Run the parity test**

Run:

```bash
bun test --preload ./happydom.ts ./src/i18n/parity.test.ts
```

Expected: all tests pass with no missing or extra keys.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/i18n/*.ts
git commit -m "chore(app): add session questions panel i18n keys"
```

---

## Task 2: Create question summary and filtering utilities

**Files:**
- Create: `packages/app/src/pages/session/session-questions-panel.ts`
- Create: `packages/app/src/pages/session/session-questions-panel.test.ts`

**Interfaces:**
- Consumes: `UserMessage` from `@opencode-ai/sdk/v2`, `Part` from `@opencode-ai/sdk/v2`.
- Produces: `questionSummary(message, parts)` returning `string`, and `filterQuestions(messages, parts, query)` returning `UserMessage[]`.

- [ ] **Step 1: Write the failing utility test**

Create `packages/app/src/pages/session/session-questions-panel.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import type { Part, UserMessage } from "@opencode-ai/sdk/v2"
import { filterQuestions, questionSummary } from "./session-questions-panel"

const userMessage = (id: string, summary?: { title?: string; body?: string }): UserMessage =>
  ({
    id,
    role: "user",
    sessionID: "ses_1",
    time: { created: 0 },
    agent: "default",
    model: { providerID: "openai", modelID: "gpt-4" },
    summary: summary ? { ...summary, diffs: [] } : undefined,
  }) as UserMessage

const textPart = (text: string): Part =>
  ({
    type: "text",
    text,
    id: "part_1",
    sessionID: "ses_1",
    messageID: "msg_1",
  }) as Part

describe("session questions panel", () => {
  test("uses summary title when available", () => {
    const message = userMessage("msg_1", { title: "Refactor auth" })
    expect(questionSummary(message, [])).toBe("Refactor auth")
  })

  test("falls back to summary body", () => {
    const message = userMessage("msg_1", { body: "Clean up token logic" })
    expect(questionSummary(message, [])).toBe("Clean up token logic")
  })

  test("falls back to text parts", () => {
    const message = userMessage("msg_1")
    expect(questionSummary(message, [textPart("Hello world")])).toBe("Hello world")
  })

  test("ignores synthetic and ignored text parts", () => {
    const message = userMessage("msg_1")
    const ignored = { ...textPart("ignored"), ignored: true } as Part
    expect(questionSummary(message, [ignored, textPart("real")])).toBe("real")
  })

  test("returns empty string when no text exists", () => {
    const message = userMessage("msg_1")
    expect(questionSummary(message, [])).toBe("")
  })

  test("filters questions by query", () => {
    const a = userMessage("msg_1", { title: "Refactor auth" })
    const b = userMessage("msg_2", { title: "Update tests" })
    const parts: Record<string, Part[] | undefined> = { msg_1: [], msg_2: [] }
    expect(filterQuestions([a, b], parts, "auth").map((m) => m.id)).toEqual(["msg_1"])
  })

  test("filter is case-insensitive and trims whitespace", () => {
    const a = userMessage("msg_1", { title: "Refactor auth" })
    const parts: Record<string, Part[] | undefined> = { msg_1: [] }
    expect(filterQuestions([a], parts, "  AUTH  ").map((m) => m.id)).toEqual(["msg_1"])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test --preload ./happydom.ts ./src/pages/session/session-questions-panel.test.ts
```

Expected: FAIL with errors like "Cannot find module" or "questionSummary is not a function".

- [ ] **Step 3: Implement the utility module**

Create `packages/app/src/pages/session/session-questions-panel.ts`:

```ts
import type { Part, UserMessage } from "@opencode-ai/sdk/v2"

export function questionSummary(message: UserMessage, parts: Part[]): string {
  if (message.summary?.title) return message.summary.title
  if (message.summary?.body) return message.summary.body

  const candidates = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .filter((part) => !part.synthetic && !part.ignored)

  const best = candidates.reduce((longest, part) => {
    if (!longest || part.text.length > longest.text.length) return part
    return longest
  }, undefined as Extract<Part, { type: "text" }> | undefined)

  return best?.text ?? ""
}

export function filterQuestions(
  messages: UserMessage[],
  partsByMessage: Record<string, Part[] | undefined>,
  query: string,
): UserMessage[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return messages

  return messages.filter((message) => {
    const summary = questionSummary(message, partsByMessage[message.id] ?? [])
    return summary.toLowerCase().includes(trimmed)
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
bun test --preload ./happydom.ts ./src/pages/session/session-questions-panel.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/pages/session/session-questions-panel.ts packages/app/src/pages/session/session-questions-panel.test.ts
git commit -m "feat(app): add session questions summary and filtering utilities"
```

---

## Task 3: Build the `SessionQuestionsPanel` component

**Files:**
- Create: `packages/app/src/pages/session/session-questions-panel.tsx`
- Test: `packages/app/src/pages/session/session-questions-panel.test.ts` (extend from Task 2)

**Interfaces:**
- Consumes: `SessionQuestionsPanelProps` from this file; `questionSummary` and `filterQuestions` from Task 2; `useLanguage` from `@/context/language`; `useSync` from `@/context/sync`.
- Produces: `SessionQuestionsPanel` SolidJS component that renders a searchable, clickable list of user questions and calls `onSelectMessage` when a question is clicked.

- [ ] **Step 1: Implement the component**

Create `packages/app/src/pages/session/session-questions-panel.tsx`:

```tsx
import { For, Show, createMemo, createSignal, type Accessor } from "solid-js"
import type { UserMessage } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { filterQuestions, questionSummary } from "./session-questions-panel"

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
```

- [ ] **Step 2: Run typecheck on the new file**

Run:

```bash
bun typecheck
```

Expected: `tsgo -b` completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/pages/session/session-questions-panel.tsx
git commit -m "feat(app): add SessionQuestionsPanel component"
```

---

## Task 4: Teach `createSessionTabs` about the `questions` tab

**Files:**
- Modify: `packages/app/src/pages/session/helpers.ts`
- Modify: `packages/app/src/pages/session/helpers.test.ts`

**Interfaces:**
- Consumes: optional `questions` and `hasQuestions` accessors.
- Produces: `activeTab` returns `"questions"` when appropriate; `openedTabs` excludes `"questions"` like it excludes `"review"` and `"context"`.

- [ ] **Step 1: Add a failing test for the new tab state**

Append to `packages/app/src/pages/session/helpers.test.ts`:

```ts
import { createRoot, createSignal } from "solid-js"
import { createSessionTabs } from "./helpers"

test("questions tab is active when requested and available", () => {
  createRoot((dispose) => {
    const [tabs] = createSignal({ active: () => "questions", all: () => [] as string[] })
    const state = createSessionTabs({
      tabs,
      pathFromTab: () => undefined,
      normalizeTab: (tab) => tab,
      questions: () => true,
      hasQuestions: () => true,
    })
    expect(state.activeTab()).toBe("questions")
    dispose()
  })
})

test("questions tab is not active when questions are unavailable", () => {
  createRoot((dispose) => {
    const [tabs] = createSignal({ active: () => "questions", all: () => [] as string[] })
    const state = createSessionTabs({
      tabs,
      pathFromTab: () => undefined,
      normalizeTab: (tab) => tab,
      questions: () => true,
      hasQuestions: () => false,
    })
    expect(state.activeTab()).toBe("empty")
    dispose()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test --preload ./happydom.ts ./src/pages/session/helpers.test.ts
```

Expected: two new tests fail because `createSessionTabs` does not recognize `questions`.

- [ ] **Step 3: Update `createSessionTabs`**

Modify `packages/app/src/pages/session/helpers.ts`:

```ts
type TabsInput = {
  tabs: Accessor<Tabs>
  pathFromTab: (tab: string) => string | undefined
  normalizeTab: (tab: string) => string
  review?: Accessor<boolean>
  hasReview?: Accessor<boolean>
  questions?: Accessor<boolean>
  hasQuestions?: Accessor<boolean>
}

export const createSessionTabs = (input: TabsInput) => {
  const review = input.review ?? (() => false)
  const hasReview = input.hasReview ?? (() => false)
  const questions = input.questions ?? (() => false)
  const hasQuestions = input.hasQuestions ?? (() => false)
  const contextOpen = createMemo(() => input.tabs().active() === "context" || input.tabs().all().includes("context"))
  const openedTabs = createMemo(
    () => {
      const seen = new Set<string>()
      return input
        .tabs()
        .all()
        .flatMap((tab) => {
          if (tab === "context" || tab === "review" || tab === "questions") return []
          const value = input.pathFromTab(tab) ? input.normalizeTab(tab) : tab
          if (seen.has(value)) return []
          seen.add(value)
          return [value]
        })
    },
    emptyTabs,
    { equals: same },
  )
  const activeTab = createMemo(() => {
    const active = input.tabs().active()
    if (active === "context") return active
    if (active === "questions" && questions()) return active
    if (active === "review" && review()) return active
    if (active && input.pathFromTab(active)) return input.normalizeTab(active)

    const first = openedTabs()[0]
    if (first) return first
    if (contextOpen()) return "context"
    if (questions() && hasQuestions()) return "questions"
    if (review() && hasReview()) return "review"
    return "empty"
  })
  // ... rest unchanged
}
```

- [ ] **Step 4: Run the tests**

Run:

```bash
bun test --preload ./happydom.ts ./src/pages/session/helpers.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/pages/session/helpers.ts packages/app/src/pages/session/helpers.test.ts
git commit -m "feat(app): support questions tab in createSessionTabs"
```

---

## Task 5: Integrate the panel into `SessionSidePanel`

**Files:**
- Modify: `packages/app/src/pages/session/session-side-panel.tsx`

**Interfaces:**
- Consumes: `SessionQuestionsPanel` from Task 3; `createSessionTabs` updated in Task 4.
- Produces: `SessionSidePanel` renders a `questions` tab trigger and content area when the session has questions.

- [ ] **Step 1: Add the questions tab trigger and content**

Modify `packages/app/src/pages/session/session-side-panel.tsx`:

1. Import the new component near the top:

```tsx
import { SessionQuestionsPanel } from "@/pages/session/session-questions-panel"
```

2. Add the props to the component interface:

```tsx
export function SessionSidePanel(props: {
  // ... existing props
  userMessages: () => UserMessage[]
  activeMessageID: () => string | undefined
  questionsLoading: () => boolean
  onSelectQuestion: (messageID: string) => void
  hasQuestions: () => boolean
})
```

3. Update `createSessionTabs` call:

```tsx
const tabState = createSessionTabs({
  tabs,
  pathFromTab: file.pathFromTab,
  normalizeTab,
  review: reviewTab,
  hasReview: props.canReview,
  questions: () => props.hasQuestions(),
  hasQuestions: () => props.hasQuestions(),
})
```

4. In the `Tabs.List`, after the `context` trigger (around line 317), add:

```tsx
<Show when={props.hasQuestions()}>
  <Tabs.Trigger value="questions">
    {language.t("session.tab.questions")}
  </Tabs.Trigger>
</Show>
```

5. In the `Tabs.Content` area, after the `context` content block (around line 381), add:

```tsx
<Show when={props.hasQuestions()}>
  <Tabs.Content value="questions" class="flex flex-col h-full overflow-hidden contain-strict">
    <Show when={activeTab() === "questions"}>
      <SessionQuestionsPanel
        userMessages={props.userMessages}
        activeMessageID={props.activeMessageID}
        loading={props.questionsLoading}
        onSelectMessage={props.onSelectQuestion}
      />
    </Show>
  </Tabs.Content>
</Show>
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/pages/session/session-side-panel.tsx
git commit -m "feat(app): wire Questions tab into SessionSidePanel"
```

---

## Task 6: Connect data and scrolling in `session.tsx`

**Files:**
- Modify: `packages/app/src/pages/session.tsx`

**Interfaces:**
- Consumes: `visibleUserMessages`, `store.messageId`, `scrollToMessage`, `setActiveMessage`, `setStore` from `session.tsx`.
- Produces: `SessionSidePanel` receives `userMessages`, `activeMessageID`, `questionsLoading`, `onSelectQuestion`, and `hasQuestions`.

- [ ] **Step 1: Compute the questions tab visibility and handler**

Near the `SessionSidePanel` render site in `session.tsx`, add:

```tsx
const hasQuestions = createMemo(() => visibleUserMessages().length > 0)

const onSelectQuestion = (messageID: string) => {
  const message = visibleUserMessages().find((m) => m.id === messageID)
  if (!message) return

  if (!isDesktop() && store.mobileTab !== "session") {
    setStore("mobileTab", "session")
  }

  setActiveMessage(message)
  scrollToMessage(message)
}
```

- [ ] **Step 2: Pass the new props to `SessionSidePanel`**

Find the `<SessionSidePanel ... />` JSX and add the new props:

```tsx
<SessionSidePanel
  // ... existing props
  userMessages={visibleUserMessages}
  activeMessageID={() => store.messageId}
  questionsLoading={historyLoading}
  onSelectQuestion={onSelectQuestion}
  hasQuestions={hasQuestions}
/>
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun typecheck
```

Expected: no errors.

- [ ] **Step 4: Verify the integration with a manual app run (optional)**

From `packages/opencode`:

```bash
bun run --conditions=browser ./src/index.ts serve --port 4096
```

From `packages/app` in another terminal:

```bash
bun dev -- --port 4444
```

Open `http://localhost:4444`, start or open a session, and confirm:
- The "Questions" tab appears in the right panel once a user message exists.
- Clicking a question scrolls the timeline to that message and highlights the active question.
- Search filters the list.
- Revert state hides questions after the revert point.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/pages/session.tsx
git commit -m "feat(app): connect questions panel data and scroll behavior"
```

---

## Task 7: Run full test suite and typecheck

**Files:**
- All touched files above.

**Interfaces:**
- N/A — verification task.

- [ ] **Step 1: Run unit tests**

Run from `packages/app`:

```bash
bun test:unit
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run from `packages/app`:

```bash
bun typecheck
```

Expected: no errors.

- [ ] **Step 3: (Optional) run i18n parity test**

```bash
bun test --preload ./happydom.ts ./src/i18n/parity.test.ts
```

Expected: passes.

- [ ] **Step 4: Commit any final fixes**

If any tests or typecheck required fixes, commit them with a `fix(app): ...` message.

---

## Self-Review Checklist

- [x] **Spec coverage:** Every design section has a corresponding task — tab entry (Task 5), list rendering (Task 3), search (Task 2/3), jump (Task 6), revert respect (Task 6 via `visibleUserMessages`), i18n (Task 1), tests (Task 2, 4, 7).
- [x] **Placeholder scan:** No "TBD", "TODO", or vague steps. Each code block is concrete.
- [x] **Type consistency:** `UserMessage`, `Part`, `Accessor<T>` types match the codebase. Props and handler signatures are consistent across Task 3, 5, and 6.
- [x] **Scope check:** This is a single UI feature; no decomposition needed.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-09-session-questions-panel.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

**Which approach?**
