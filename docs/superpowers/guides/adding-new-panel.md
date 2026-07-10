# 添加新 Panel 开发指南

本文档描述如何在 OpenCode app 中添加新的 side panel（如 Questions、Review、File Tree 等）。

## 概述

OpenCode 的 side panel 系统基于 SolidJS 的响应式状态和 tab 管理。每个 panel 都需要：
- 独立的组件文件
- 在 tab 系统中注册
- 在布局系统中集成
- 连接数据源
- 添加国际化支持

## 步骤

### 1. 创建组件文件

在 `packages/app/src/pages/session/` 下创建：

```
packages/app/src/pages/session/
├── your-panel.tsx          # 主组件
├── your-panel-utils.ts     # 工具函数（可选）
└── your-panel.test.ts      # 单元测试
```

**your-panel.tsx 示例：**

```tsx
import { For, Show, createMemo, createSignal, type Accessor } from "solid-js"
import type { UserMessage } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { filterItems, itemSummary } from "./your-panel-utils"

export interface YourPanelProps {
  items: Accessor<ItemType[]>
  activeItemID: Accessor<string | undefined>
  loading: Accessor<boolean>
  onSelectItem: (itemID: string) => void
}

export function YourPanel(props: YourPanelProps) {
  const language = useLanguage()
  const sync = useSync()
  const [query, setQuery] = createSignal("")

  const dataByItem = createMemo(() => sync().data.item)

  const filtered = createMemo(() =>
    filterItems(props.items(), dataByItem(), query()),
  )

  const empty = createMemo(() => props.items().length === 0 && !props.loading())
  const noResults = createMemo(() =>
    filtered().length === 0 && query().trim().length > 0 && !props.loading() && !empty(),
  )

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="shrink-0 p-3 border-b border-border-weaker-base">
        <input
          type="text"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder={language.t("session.yourPanel.search")}
          disabled={empty()}
          class="w-full bg-background-stronger text-13-regular text-text placeholder:text-text-weaker rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
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
            <div class="text-13-regular text-text-weak">{language.t("session.yourPanel.empty")}</div>
          </div>
        </Show>

        <Show when={noResults()}>
          <div class="h-full flex items-center justify-center text-center p-6">
            <div class="text-13-regular text-text-weak">{language.t("session.yourPanel.noResults")}</div>
          </div>
        </Show>

        <Show when={!props.loading() && !empty() && !noResults()}>
          <div class="space-y-1" role="list">
            <For each={filtered()}>
              {(item, index) => {
                const isActive = createMemo(() => props.activeItemID() === item.id)
                const summary = createMemo(() =>
                  itemSummary(item, dataByItem()[item.id] ?? []),
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
                    onClick={() => props.onSelectItem(item.id)}
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
                          {new Date(item.time.created).toLocaleTimeString([], {
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

### 2. 扩展 Tab 系统

**修改 `packages/app/src/pages/session/helpers.ts`：**

```ts
type TabsInput = {
  tabs: Accessor<Tabs>
  pathFromTab: (tab: string) => string | undefined
  normalizeTab: (tab: string) => string
  review?: Accessor<boolean>
  hasReview?: Accessor<boolean>
  questions?: Accessor<boolean>
  hasQuestions?: Accessor<boolean>
  fileBrowser?: Accessor<boolean>
  // 新增
  yourPanel?: Accessor<boolean>
  hasYourPanel?: Accessor<boolean>
}

export const createSessionTabs = (input: TabsInput) => {
  const review = input.review ?? (() => false)
  const hasReview = input.hasReview ?? (() => false)
  const questions = input.questions ?? (() => false)
  const hasQuestions = input.hasQuestions ?? (() => false)
  const fileBrowser = input.fileBrowser ?? (() => false)
  // 新增
  const yourPanel = input.yourPanel ?? (() => false)
  const hasYourPanel = input.hasYourPanel ?? (() => false)
  
  const contextOpen = createMemo(() => input.tabs().active() === "context" || input.tabs().all().includes("context"))
  
  const panelTabs = createMemo(
    () => {
      const seen = new Set<string>()
      return input
        .tabs()
        .all()
        .flatMap((tab) => {
          // 排除特殊 tab
          if (tab === "context" || tab === "review" || tab === "questions" || tab === "your-panel") return []
          if (tab === SESSION_OPEN_FILE_TAB && !fileBrowser()) return []
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
    if (active === "questions" && questions() && hasQuestions()) return active
    if (active === "your-panel" && yourPanel() && hasYourPanel()) return active
    if (active === SESSION_OPEN_FILE_TAB && openFileOpen()) return active
    if (active === "review" && review()) return active
    if (active && input.pathFromTab(active)) return input.normalizeTab(active)

    const first = openedTabs()[0]
    if (first) return first
    if (contextOpen()) return "context"
    if (questions() && hasQuestions()) return "questions"
    if (yourPanel() && hasYourPanel()) return "your-panel"
    if (review() && hasReview()) return "review"
    return "empty"
  })
  
  // ... 其余代码
}
```

### 3. 集成到 Side Panel

**修改 `packages/app/src/pages/session/session-side-panel.tsx`：**

```tsx
// 1. 导入组件
import { YourPanel } from "@/pages/session/your-panel"

// 2. 添加 props
export function SessionSidePanel(props: {
  // ... 现有 props
  yourPanelData: () => ItemType[]
  activeYourPanelItemID: () => string | undefined
  yourPanelLoading: () => boolean
  onSelectYourPanelItem: (itemID: string) => void
  hasYourPanel: () => boolean
}) {
  // 3. 添加计算属性
  const yourPanelOpen = createMemo(
    () => isDesktop() && props.hasYourPanel() && tabs().active() === "your-panel"
  )

  // 4. 更新 open 逻辑
  const open = createMemo(() => reviewOpen() || fileOpen() || questionsOpen() || yourPanelOpen())

  // 5. 更新 panelWidth
  const panelWidth = createMemo(() => {
    if (!open()) return "0px"
    if (reviewOpen() || questionsOpen() || yourPanelOpen()) return "auto"
    return `${layout.fileTree.width()}px`
  })

  // 6. 更新 flex-1 classList
  <aside
    classList={{
      // ... 现有 classes
      "flex-1": reviewOpen() || questionsOpen() || yourPanelOpen(),
    }}
  >
    // 7. 更新 Show when
    <Show when={reviewOpen() || questionsOpen() || yourPanelOpen()}>
      // ... 内容
    </Show>
  </aside>

  // 8. 在 createSessionTabs 中传入参数
  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab,
    review: reviewTab,
    hasReview: props.canReview,
    questions: () => props.hasQuestions(),
    hasQuestions: () => props.hasQuestions(),
    fileBrowser: () => !!props.fileBrowserState,
    yourPanel: () => props.hasYourPanel(),
    hasYourPanel: () => props.hasYourPanel(),
  })

  // 9. 添加 Tab 触发器（在 Tabs.List 中）
  <Show when={props.hasYourPanel()}>
    <Tabs.Trigger value="your-panel">
      {language.t("session.tab.yourPanel")}
    </Tabs.Trigger>
  </Show>

  // 10. 添加 Tab 内容（在 Tabs 中）
  <Show when={props.hasYourPanel() && activeTab() === "your-panel"}>
    <Tabs.Content value="your-panel" class="flex flex-col h-full overflow-hidden contain-strict">
      <YourPanel
        items={props.yourPanelData}
        activeItemID={props.activeYourPanelItemID}
        loading={props.yourPanelLoading}
        onSelectItem={props.onSelectYourPanelItem}
      />
    </Tabs.Content>
  </Show>
}
```

### 4. 连接数据

**修改 `packages/app/src/pages/session.tsx`：**

```tsx
// 1. 添加状态计算
const desktopYourPanelOpen = createMemo(
  () => newSessionDesign() && isDesktop() && hasYourPanel() && tabs().active() === "your-panel"
)

// 2. 更新 desktopSessionResizeOpen
const desktopSessionResizeOpen = createMemo(() =>
  newSessionDesign()
    ? desktopV2ReviewOpen() || desktopTerminalOpen() || desktopQuestionsOpen() || desktopYourPanelOpen()
    : desktopReviewOpen()
)

// 3. 更新 desktopSidePanelOpen
const desktopSidePanelOpen = createMemo(() =>
  desktopSessionResizeOpen() || desktopFileTreeOpen() || desktopQuestionsOpen() || desktopYourPanelOpen()
)

// 4. 更新 Show when 条件
<Show when={isDesktop() && (desktopV2ReviewOpen() || desktopFileTreeOpen() || desktopQuestionsOpen() || desktopYourPanelOpen())}>
  <SessionSidePanel
    // ... 现有 props
    yourPanelData={yourPanelData}
    activeYourPanelItemID={() => store.yourPanelItemId}
    yourPanelLoading={yourPanelLoading}
    onSelectYourPanelItem={onSelectYourPanelItem}
    hasYourPanel={hasYourPanel}
  />
</Show>

// 5. 在 sessionPanelLayout 中传入参数
const desktopV2PanelLayout = createMemo(() =>
  sessionPanelLayout({
    review: desktopV2ReviewOpen(),
    terminal: desktopTerminalOpen(),
    files: desktopFileTreeOpen(),
    questions: desktopQuestionsOpen(),
    yourPanel: desktopYourPanelOpen(),
  })
)
```

### 5. 更新布局函数

**修改 `packages/app/src/pages/session/session-panel-layout.ts`：**

```ts
export function sessionPanelLayout(input: {
  review: boolean
  terminal: boolean
  files: boolean
  questions: boolean
  yourPanel: boolean  // 新增
}) {
  return {
    visible: input.review || input.terminal || input.files || input.questions || input.yourPanel,
    stacked: input.review && input.terminal,
  }
}
```

### 6. 添加国际化

**修改 `packages/app/src/i18n/en.ts`：**

```ts
"session.tab.yourPanel": "Your Panel",
"session.yourPanel.search": "Search items...",
"session.yourPanel.empty": "No items yet",
"session.yourPanel.noResults": "No items match your search",
```

**同步到所有 locale 文件**（ar, br, bs, da, de, es, fr, ja, ko, no, pl, ru, th, tr, uk, zh, zht）。

### 7. 测试

**更新 `packages/app/src/pages/session/session-panel-layout.test.ts`：**

```ts
test("keeps one V2 owner while changing panel geometry", () => {
  expect(sessionPanelLayout({ review: false, terminal: false, files: false, questions: false, yourPanel: false })).toEqual({
    visible: false,
    stacked: false,
  })
  expect(sessionPanelLayout({ review: false, terminal: false, files: false, questions: false, yourPanel: true })).toEqual({
    visible: true,
    stacked: false,
  })
})
```

**更新 `packages/app/src/pages/session/helpers.test.ts`：**

```ts
test("your-panel tab is active when requested and available", () => {
  createRoot((dispose) => {
    const [tabs] = createSignal({ active: () => "your-panel", all: () => [] as string[] })
    const state = createSessionTabs({
      tabs,
      pathFromTab: () => undefined,
      normalizeTab: (tab) => tab,
      yourPanel: () => true,
      hasYourPanel: () => true,
    })
    expect(state.activeTab()).toBe("your-panel")
    dispose()
  })
})
```

## 检查点

- [ ] 面板能独立打开（不依赖 review/file tree）
- [ ] Tab 能正确切换
- [ ] 数据正确传递
- [ ] 移动端适配（如果需要）
- [ ] 所有测试通过
- [ ] 国际化 key 已添加到所有 locale 文件
- [ ] 组件有加载态、空态、无结果态
- [ ] 搜索功能正常工作（如果有）

## 常见问题

### Q: 面板打不开？
A: 检查以下几点：
1. `yourPanelOpen` 计算属性是否正确
2. `open` 逻辑是否包含 `yourPanelOpen()`
3. `desktopSidePanelOpen` 是否包含 `desktopYourPanelOpen()`
4. `Show when` 条件是否正确

### Q: Tab 不显示？
A: 检查：
1. `hasYourPanel()` 是否返回 true
2. Tab 触发器是否在 `Tabs.List` 中
3. `createSessionTabs` 是否传入了 `yourPanel` 和 `hasYourPanel` 参数

### Q: 数据不更新？
A: 检查：
1. Props 是否正确传递
2. Accessor 函数是否正确
3. 响应式状态是否正确连接

### Q: 样式不对？
A: 检查：
1. `panelWidth` 逻辑是否正确
2. `flex-1` classList 是否包含 `yourPanelOpen()`
3. `Show when` 条件是否正确

## 参考实现

- Questions Panel: `packages/app/src/pages/session/session-questions-panel.tsx`
- Review Panel: `packages/app/src/pages/session/review-panel.tsx`
- File Tree: `packages/app/src/components/file-tree.tsx`
