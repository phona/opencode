import { createEffect, createMemo, createResource, createSignal, Match, onMount, Show, Switch, untrack } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { KeybindV2 } from "@opencode-ai/ui/v2/keybind-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"

import { LayoutRoute, useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { WindowsAppMenu } from "./windows-app-menu"
import { applyPath, backPath, forwardPath } from "./titlebar-history"
import { TitlebarTabStrip } from "@/components/titlebar-tab-strip"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createMediaQuery } from "@solid-primitives/media"
import { readSessionTabsRemovedDetail, SESSION_TABS_REMOVED_EVENT, notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import { useGlobal } from "@/context/global"
import { ServerConnection, useServer } from "@/context/server"
import { tabKey, useTabs } from "@/context/tabs"
import "./titlebar.css"
import { newTabTooltipKeybind } from "./command-tooltip-keybind"
import { useMobileShell } from "@/components/mobile-shell"
import { sessionTitle as formatSessionTitle } from "@/utils/session-title"
import { showToast } from "@/utils/toast"

type TauriDesktopWindow = {
  startDragging?: () => Promise<void>
  toggleMaximize?: () => Promise<void>
}

type TauriThemeWindow = {
  setTheme?: (theme?: "light" | "dark" | null) => Promise<void>
}

type TauriApi = {
  window?: {
    getCurrentWindow?: () => TauriDesktopWindow
  }
  webviewWindow?: {
    getCurrentWebviewWindow?: () => TauriThemeWindow
  }
}

const tauriApi = () => (window as unknown as { __TAURI__?: TauriApi }).__TAURI__
const currentDesktopWindow = () => tauriApi()?.window?.getCurrentWindow?.()
const currentThemeWindow = () => tauriApi()?.webviewWindow?.getCurrentWebviewWindow?.()
const legacyTitlebarHeight = 40
const v2TitlebarHeight = 36
const minTitlebarZoom = 0.25
const windowsControlsBaseWidth = 138 // 3 native Windows caption buttons at 46px each.

export type TitlebarUpdate = {
  version: () => string | undefined
  installing: () => boolean
  install: () => void
}

export function useTitlebarRightMount() {
  const [mount, setMount] = createSignal<HTMLElement | null>(null)
  onMount(() => setMount(document.getElementById("opencode-titlebar-right")))
  return mount
}

export function Titlebar(props: { update?: TitlebarUpdate }) {
  const layout = useLayout()
  const platform = usePlatform()
  const command = useCommand()
  const language = useLanguage()
  const settings = useSettings()
  const theme = useTheme()
  const server = useServer()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const useV2Titlebar = createMemo(() => settings.general.newLayoutDesigns())
  const mobile = createMediaQuery("(max-width: 767px)")
  const bottom = createMemo(() => useV2Titlebar() && mobile() && settings.general.mobileTitlebarPosition() === "bottom")

  const mac = createMemo(() => platform.platform === "desktop" && platform.os === "macos")
  const windows = createMemo(() => platform.platform === "desktop" && platform.os === "windows")
  const electronWindows = createMemo(() => windows() && !tauriApi())
  const linux = createMemo(() => platform.platform === "desktop" && platform.os === "linux")
  const web = createMemo(() => platform.platform === "web")
  const zoom = () => platform.webviewZoom?.() ?? 1
  const titlebarZoom = () => (windows() ? Math.max(zoom(), minTitlebarZoom) : zoom())
  const counterZoom = () => (windows() && titlebarZoom() < 1 ? 1 / titlebarZoom() : 1)
  const minHeight = () => {
    const height = useV2Titlebar() ? v2TitlebarHeight : legacyTitlebarHeight
    if (mac()) return `${height / zoom()}px`
    if (windows()) return `${height / Math.min(titlebarZoom(), 1)}px`
    return `calc(${height}px + env(safe-area-inset-top, 0px))`
  }
  const windowsControlsWidth = () => `${windowsControlsBaseWidth / Math.max(titlebarZoom(), 1)}px`

  const [history, setHistory] = createStore({
    stack: [] as string[],
    index: 0,
    action: undefined as "back" | "forward" | undefined,
  })

  const path = () => `${location.pathname}${location.search}${location.hash}`
  const creating = createMemo(() => {
    const route = layout.route()
    if (route.type === "draft" || route.type === "dir-new-sesssion") return true
    if (!params.dir) return false
    if (params.id) return false
    const parts = location.pathname.replace(/\/+$/, "").split("/")
    return parts.at(-1) === "session"
  })

  createEffect(() => {
    const current = path()

    untrack(() => {
      const next = applyPath(history, current)
      if (next === history) return
      setHistory(next)
    })
  })

  const canBack = createMemo(() => history.index > 0)
  const canForward = createMemo(() => history.index < history.stack.length - 1)
  const hasProjects = createMemo(() => layout.projects.list().length > 0)
  const nav = createMemo(() => (useV2Titlebar() ? settings.general.showNavigation() : true))
  const updateState = createMemo<TitlebarUpdatePillState>(() => {
    const installing = props.update?.installing() ?? false
    const version = props.update?.version()
    return {
      visible: version !== undefined || installing,
      installing,
      label: "Update",
      ariaLabel: language.t("toast.update.action.installRestart"),
      title: version ? `Update ${version}` : undefined,
      onInstall: () => props.update?.install(),
    }
  })
  const v2RightState = createMemo<TitlebarV2RightState>(() => ({
    update: updateState(),
  }))

  const back = () => {
    const next = backPath(history)
    if (!next) return
    setHistory(next.state)
    navigate(next.to)
  }

  const forward = () => {
    const next = forwardPath(history)
    if (!next) return
    setHistory(next.state)
    navigate(next.to)
  }

  command.register(() => [
    {
      id: "common.goBack",
      title: language.t("common.goBack"),
      category: language.t("command.category.view"),
      keybind: "mod+[",
      onSelect: back,
    },
    {
      id: "common.goForward",
      title: language.t("common.goForward"),
      category: language.t("command.category.view"),
      keybind: "mod+]",
      onSelect: forward,
    },
  ])

  const getWin = () => {
    if (platform.platform !== "desktop") return
    return currentDesktopWindow()
  }

  createEffect(() => {
    if (platform.platform !== "desktop") return

    const scheme = theme.colorScheme()
    const value = scheme === "system" ? null : scheme

    const win = currentThemeWindow()
    if (!win?.setTheme) return

    void win.setTheme(value).catch(() => undefined)
  })

  const interactive = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false

    const selector =
      "button, a, input, textarea, select, option, [role='button'], [role='menuitem'], [contenteditable='true'], [contenteditable='']"

    return !!target.closest(selector)
  }

  const drag = (e: MouseEvent) => {
    if (platform.platform !== "desktop") return
    if (e.buttons !== 1) return
    if (interactive(e.target)) return

    const win = getWin()
    if (!win?.startDragging) return

    e.preventDefault()
    void win.startDragging().catch(() => undefined)
  }

  const maximize = (e: MouseEvent) => {
    if (platform.platform !== "desktop") return
    if (interactive(e.target)) return
    if (e.target instanceof Element && e.target.closest("[data-tauri-decorum-tb]")) return

    const win = getWin()
    if (!win?.toggleMaximize) return

    e.preventDefault()
    void win.toggleMaximize().catch(() => undefined)
  }

  return (
    <header
      data-slot={useV2Titlebar() ? "titlebar-v2" : undefined}
      classList={{
        "shrink-0 relative flex flex-row": true,
        "h-9 bg-v2-background-bg-deep overflow-visible": useV2Titlebar(),
        "h-10 bg-background-base overflow-hidden": !useV2Titlebar(),
        "order-last": bottom(),
      }}
      style={{
        "min-height": minHeight(),
        // Keep native macOS traffic lights clear even when the desktop window is narrow.
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-left": mac() ? `${84 / zoom()}px` : "env(safe-area-inset-left, 0px)",
        "padding-right": "env(safe-area-inset-right, 0px)",
        width: electronWindows() ? `env(titlebar-area-width, calc(100vw - ${windowsControlsWidth()}))` : undefined,
        "max-width": electronWindows()
          ? `env(titlebar-area-width, calc(100vw - ${windowsControlsWidth()}))`
          : undefined,
        "align-self": electronWindows() ? "flex-start" : undefined,
      }}
      data-tauri-drag-region
      onMouseDown={drag}
      onDblClick={maximize}
    >
      <Switch>
        <Match when={useV2Titlebar()}>
          {(_) => {
            const layout = useLayout()
            const global = useGlobal()

            const tabs = useTabs()
            const tabsStore = tabs.store
            const tabsStoreActions = tabs
            const [session] = createResource(
              () => {
                const route = layout.route()
                if (route.type !== "session") return undefined
                const conn = global.servers
                  .list()
                  .find((item) => ServerConnection.key(item) === (route.server ?? server.key))
                return conn ? { route, sdk: global.ensureServerCtx(conn).sdk } : undefined
              },
              ({ route, sdk }) =>
                sdk.client.session
                  .get({ sessionID: route.sessionId })
                  .then((x) => x.data)
                  .catch(() => {}),
            )

            const matchRoute = (route: LayoutRoute) => {
              if (route.type === "home") return
              if (route.type === "draft") {
                return tabsStore.find((item) => item.type === "draft" && item.draftID === route.draftID)
              }
              if (route.type === "session") {
                const main = tabsStore.find(
                  (item) =>
                    item.type === "session" && item.server === route.server && item.sessionId === route.sessionId,
                )
                if (main) return main
                const s = session()
                if (s?.parentID) {
                  const parentID = s.parentID
                  const parent = tabsStore.find(
                    (item) => item.type === "session" && item.server === route.server && item.sessionId === parentID,
                  )
                  if (parent) return parent
                }
              }
            }

            const currentTab = () => matchRoute(layout.route())

            createEffect(() => {
              const route = layout.route()
              if (!tabs.ready()) return
              const tab = currentTab()
              if (tab) {
                tabs.remember(tab)
                return
              }

              if (route.type === "session") {
                const s = session()
                if (!s) return
                const sessionId = s.parentID ?? s.id
                const next = { server: route.server ?? server.key, sessionId }
                tabsStoreActions.addSessionTab(next)
              }
            })

            makeEventListener(window, SESSION_TABS_REMOVED_EVENT, (event) => {
              const detail = readSessionTabsRemovedDetail(event)
              if (!detail) return
              tabsStoreActions.removeSessions(detail)
            })

            const openNewTab = () => {
              const route = layout.route()
              const activeSession = session()
              if (route.type === "session" && activeSession) {
                tabs.newDraft({ server: route.server ?? server.key, directory: activeSession.directory }, "")
                return
              }

              const activeTab = currentTab()
              if (activeTab?.type === "draft") {
                tabs.newDraft({ server: activeTab.server, directory: activeTab.directory }, "")
                return
              }

              if (route.type === "home") {
                const selection = layout.home.selection()
                const conn = global.servers.list().find((item) => ServerConnection.key(item) === selection.server)
                const project = conn
                  ? global
                      .ensureServerCtx(conn)
                      .projects.list()
                      .find((item) => item.worktree === selection.directory)
                  : undefined
                if (conn && project) {
                  tabs.newDraft({ server: ServerConnection.key(conn), directory: project.worktree }, "")
                  return
                }
              }

              const current = layout.projects.list()[0]
              if (current) {
                tabs.newDraft({ server: server.key, directory: current.worktree }, "")
                return
              }

              const fallback = global.servers.list().flatMap((conn) => {
                const project = global.ensureServerCtx(conn).projects.list()[0]
                return project ? [{ server: ServerConnection.key(conn), project }] : []
              })[0]
              if (!fallback) return

              tabs.newDraft({ server: fallback.server, directory: fallback.project.worktree }, "")
            }
            const toggleHome = () => tabs.toggleHome({ home: layout.route().type === "home", current: currentTab() })

            command.register("titlebar-home", () => [
              {
                id: "home.toggle",
                title: language.t("home.title"),
                category: language.t("command.category.view"),
                keybind: "mod+b",
                hidden: true,
                onSelect: toggleHome,
              },
            ])

            command.register("tabs", () => {
              const current = currentTab()

              return [
                {
                  id: "tab.new",
                  category: "tab",
                  title: language.t("command.session.new"),
                  keybind: "mod+t",
                  hidden: true,
                  onSelect: openNewTab,
                },
                current && {
                  id: "tab.close",
                  category: "tab",
                  title: language.t("command.tab.close"),
                  keybind: "mod+w",
                  hidden: true,
                  onSelect: () => {
                    tabsStoreActions.closeTab(tabsStore.findIndex((tab) => current === tab))
                  },
                },
                {
                  id: "tab.reopenClosed",
                  category: language.t("command.category.file"),
                  title: language.t("command.tab.reopenClosed"),
                  keybind: "mod+shift+t",
                  onSelect: () => tabsStoreActions.reopenClosedTab(),
                },
                {
                  id: `tab.prev`,
                  category: "tab",
                  title: "",
                  keybind: `mod+option+ArrowLeft,ctrl+shift+tab`,
                  hidden: true,
                  onSelect: () => {
                    let index = tabsStore.findIndex((tab) => tab === currentTab())
                    if (index === -1) return

                    index -= 1
                    if (index === -1) index = tabsStore.length - 1

                    const next = tabsStore[index]
                    if (next) tabs.select(next)
                  },
                },
                {
                  id: `tab.next`,
                  category: "tab",
                  title: "",
                  keybind: `mod+option+ArrowRight,ctrl+tab`,
                  hidden: true,
                  onSelect: () => {
                    let index = tabsStore.findIndex((tab) => tab === currentTab())
                    if (index === -1) return

                    index += 1
                    if (index === tabsStore.length) index = 0

                    const next = tabsStore[index]
                    if (next) tabs.select(next)
                  },
                },
              ].filter((v) => v !== undefined)
            })

            const [tabsAreOverflowing, setTabsAreOverflowing] = createSignal(false)

            const mobileShell = useMobileShell()
            const dialog = useDialog()
            const mobileSessionTitle = createMemo(() => {
              const s = session()
              if (!s) return language.t("command.session.new")
              return formatSessionTitle(s.title) || language.t("command.session.new")
            })
            const mobileSessionId = createMemo(() => {
              const route = layout.route()
              if (route.type !== "session") return undefined
              return route.sessionId
            })

            const mobileSDK = createMemo(() => {
              const route = layout.route()
              if (route.type !== "session") return undefined
              const conn = global.servers.list().find((item) => ServerConnection.key(item) === (route.server ?? server.key))
              if (!conn) return undefined
              return global.ensureServerCtx(conn)
            })

            const mobileErrorMessage = (err: unknown) => {
              if (err && typeof err === "object" && "data" in err) {
                const data = (err as { data?: { message?: string } }).data
                if (data?.message) return data.message
              }
              if (err instanceof Error) return err.message
              return language.t("common.requestFailed")
            }

            const archiveMobileSession = async () => {
              const id = mobileSessionId()
              const ctx = mobileSDK()
              if (!id || !ctx) return

              const sessionData = ctx.sync.session.get(id)
              if (!sessionData) return

              const [store, setStore] = ctx.sync.child(sessionData.directory)
              const sessions = store.session ?? []
              const index = sessions.findIndex((s) => s.id === id)
              const nextSession = index === -1 ? undefined : (sessions[index + 1] ?? sessions[index - 1])

              await ctx.sdk.client.session
                .update({ sessionID: id, time: { archived: Date.now() } })
                .then(() => {
                  setStore(
                    produce((draft) => {
                      const idx = draft.session.findIndex((s) => s.id === id)
                      if (idx !== -1) draft.session.splice(idx, 1)
                    }),
                  )
                  ctx.sync.session.evict(id)
                  notifySessionTabsRemoved({ directory: sessionData.directory, sessionIDs: [id] })
                  navigate(`/${params.dir}/session`)
                })
                .catch((err) => {
                  showToast({
                    title: language.t("common.requestFailed"),
                    description: mobileErrorMessage(err),
                  })
                })
            }

            const renameMobileSession = async (title: string) => {
              const id = mobileSessionId()
              const ctx = mobileSDK()
              if (!id || !ctx) return

              await ctx.sdk.client.session
                .update({ sessionID: id, title })
                .catch((err) => {
                  showToast({
                    title: language.t("common.requestFailed"),
                    description: mobileErrorMessage(err),
                  })
                })
            }

            const deleteMobileSession = async (sessionID: string) => {
              const ctx = mobileSDK()
              if (!ctx) return

              const sessionData = ctx.sync.session.get(sessionID)
              if (!sessionData) return

              const [store, setStore] = ctx.sync.child(sessionData.directory)
              const sessions = (store.session ?? []).filter((s) => !s.parentID && !s.time?.archived)
              const index = sessions.findIndex((s) => s.id === sessionID)
              const nextSession = index === -1 ? undefined : (sessions[index + 1] ?? sessions[index - 1])

              const result = await ctx.sdk.client.session
                .delete({ sessionID })
                .then((x) => x.data)
                .catch((err) => {
                  showToast({
                    title: language.t("session.delete.failed.title"),
                    description: mobileErrorMessage(err),
                  })
                  return false
                })

              if (!result) return

              const removed = new Set<string>([sessionID])
              const byParent = new Map<string, string[]>()
              for (const item of store.session) {
                const parentID = item.parentID
                if (!parentID) continue
                const existing = byParent.get(parentID)
                if (existing) {
                  existing.push(item.id)
                  continue
                }
                byParent.set(parentID, [item.id])
              }

              const stack = [sessionID]
              while (stack.length) {
                const parentID = stack.pop()
                if (!parentID) continue

                const children = byParent.get(parentID)
                if (!children) continue

                for (const child of children) {
                  if (removed.has(child)) continue
                  removed.add(child)
                  stack.push(child)
                }
              }

              setStore(
                produce((draft) => {
                  draft.session = draft.session.filter((s) => !removed.has(s.id))
                }),
              )

              for (const id of removed) {
                ctx.sync.session.evict(id)
              }
              notifySessionTabsRemoved({ directory: sessionData.directory, sessionIDs: [...removed] })
              navigate(`/${params.dir}/session`)
            }

            return (
              <Show
                when={!mobile()}
                fallback={
                  <div class="h-full flex-1 flex items-center justify-between px-2">
                    <IconButtonV2
                      variant="ghost-muted"
                      icon={<IconV2 name="grid-plus" />}
                      onClick={mobileShell.openHome}
                      aria-label={language.t("home.title")}
                    />
                    <button
                      type="button"
                      class="flex-1 truncate text-center text-[13px] leading-4 font-medium text-text-base"
                      onClick={() => {
                        const id = mobileSessionId()
                        if (!id) return
                        dialog.show(() => (
                          <MobileSessionInfoSheet
                            sessionID={id}
                            onClose={() => dialog.close()}
                            labels={{
                              rename: language.t("common.rename"),
                              archive: language.t("common.archive"),
                              delete: language.t("common.delete"),
                            }}
                            onRename={() => {
                              const currentTitle = session()?.title ?? ""
                              dialog.show(() => (
                                <MobileRenameDialog
                                  currentTitle={currentTitle}
                                  onRename={renameMobileSession}
                                  onClose={() => dialog.close()}
                                  labels={{
                                    title: language.t("common.rename"),
                                    cancel: language.t("common.cancel"),
                                    save: language.t("common.save"),
                                  }}
                                />
                              ))
                            }}
                            onArchive={() => void archiveMobileSession()}
                            onDelete={() => {
                              dialog.show(() => (
                                <MobileDeleteDialog
                                  sessionID={id}
                                  name={mobileSessionTitle()}
                                  onDelete={deleteMobileSession}
                                  onClose={() => dialog.close()}
                                  labels={{
                                    title: language.t("session.delete.title"),
                                    confirm: language.t("session.delete.confirm", { name: mobileSessionTitle() }),
                                    cancel: language.t("common.cancel"),
                                    button: language.t("session.delete.button"),
                                  }}
                                />
                              ))
                            }}
                          />
                        ))
                      }}
                    >
                      {mobileSessionTitle()}
                    </button>
                    <div class="flex items-center gap-1">
                      <IconButtonV2
                        variant="ghost-muted"
                        icon={<IconV2 name="review" />}
                        onClick={mobileShell.openChanges}
                        aria-label={language.t("session.tab.review")}
                      />
                      <MenuV2 gutter={6} placement="bottom-end" modal={false}>
                        <MenuV2.Trigger
                          as={IconButtonV2}
                          icon={<IconV2 name="outline-dots" />}
                          variant="ghost-muted"
                          aria-label={language.t("common.moreOptions")}
                        />
                        <MenuV2.Portal>
                          <MenuV2.Content style={{ "min-width": "120px" }}>
                            <MenuV2.Item onSelect={() => {
                              const currentTitle = session()?.title ?? ""
                              dialog.show(() => (
                                <MobileRenameDialog
                                  currentTitle={currentTitle}
                                  onRename={renameMobileSession}
                                  onClose={() => dialog.close()}
                                  labels={{
                                    title: language.t("common.rename"),
                                    cancel: language.t("common.cancel"),
                                    save: language.t("common.save"),
                                  }}
                                />
                              ))
                            }}>
                              {language.t("common.rename")}
                            </MenuV2.Item>
                            <MenuV2.Item onSelect={() => void archiveMobileSession()}>
                              {language.t("common.archive")}
                            </MenuV2.Item>
                            <MenuV2.Separator />
                            <MenuV2.Item onSelect={() => {
                              const id = mobileSessionId()
                              if (!id) return
                              dialog.show(() => (
                                <MobileDeleteDialog
                                  sessionID={id}
                                  name={mobileSessionTitle()}
                                  onDelete={deleteMobileSession}
                                  onClose={() => dialog.close()}
                                  labels={{
                                    title: language.t("session.delete.title"),
                                    confirm: language.t("session.delete.confirm", { name: mobileSessionTitle() }),
                                    cancel: language.t("common.cancel"),
                                    button: language.t("session.delete.button"),
                                  }}
                                />
                              ))
                            }}>
                              {language.t("common.delete")}
                            </MenuV2.Item>
                          </MenuV2.Content>
                        </MenuV2.Portal>
                      </MenuV2>
                    </div>
                  </div>
                }
              >
              <div
                class="h-full flex-1 overflow-hidden flex flex-row items-center gap-1.5 px-2 md:pr-3"
                classList={{
                  "pt-2": !bottom(),
                  "pb-2": bottom(),
                  "md:pl-2": mac(),
                  "md:pl-4": !mac(),
                }}
              >
                <ChannelIndicator />
                <Show when={windows() || linux()}>
                  <WindowsAppMenu command={command} platform={platform} variant="v2" />
                </Show>
                <TooltipV2
                  placement="bottom"
                  value={
                    <>
                      {language.t("home.title")}
                      <KeybindV2 keys={command.keybindParts("home.toggle")} variant="neutral" />
                    </>
                  }
                  class="shrink-0"
                >
                  <IconButtonV2
                    type="button"
                    variant="ghost-muted"
                    size="large"
                    class="!w-9 shrink-0"
                    icon={<IconV2 name="grid-plus" />}
                    state={layout.route().type === "home" ? "pressed" : undefined}
                    onClick={toggleHome}
                    aria-label={language.t("home.title")}
                    aria-pressed={layout.route().type === "home"}
                  />
                </TooltipV2>

                <TitlebarTabStrip
                  tabs={tabsStore}
                  currentTab={currentTab}
                  forceTruncate={tabsAreOverflowing()}
                  onOverflowChange={setTabsAreOverflowing}
                  onNavigate={(tab, el) => {
                    tabs.select(tab)
                    el?.scrollIntoView({ behavior: "instant" })
                  }}
                  onClose={(tab) => {
                    const index = tabsStore.findIndex((item) => tabKey(item) === tabKey(tab))
                    if (index !== -1) tabsStoreActions.closeTab(index)
                  }}
                  onReorder={(keys) => tabsStoreActions.reorder(keys)}
                />
                <Show when={!creating()}>
                  <TooltipV2
                    placement="bottom"
                    value={
                      <>
                        {language.t("command.session.new")}
                        <KeybindV2 keys={newTabTooltipKeybind(command)} variant="neutral" />
                      </>
                    }
                  >
                    <IconButtonV2
                      type="button"
                      variant="ghost-muted"
                      size="large"
                      class="shrink-0"
                      icon={<IconV2 name="plus" />}
                      onClick={openNewTab}
                      aria-label={language.t("command.session.new")}
                    />
                  </TooltipV2>
                </Show>
                <div class="flex-1" />
                <TitlebarV2Right state={v2RightState()} />
                <Show when={windows() && !electronWindows()}>
                  <div data-tauri-decorum-tb class="flex flex-row" />
                </Show>
              </div>
              </Show>
            )
          }}
        </Match>
        <Match when>
          <div
            class="grid h-full min-h-full w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
            style={{ zoom: counterZoom() }}
          >
            <div
              classList={{
                "flex items-center min-w-0": true,
                "pl-2": !mac(),
              }}
            >
              <Show when={windows() || linux()}>
                <WindowsAppMenu command={command} platform={platform} />
              </Show>
              <Show when={mac()}>
                {/*<div class="h-full shrink-0" style={{ width: `${72 / zoom()}px` }} />*/}
                <div class="xl:hidden w-10 shrink-0 flex items-center justify-center">
                  <IconButton
                    icon="menu"
                    variant="ghost"
                    class="titlebar-icon rounded-md"
                    onClick={layout.mobileSidebar.toggle}
                    aria-label={language.t("sidebar.menu.toggle")}
                    aria-expanded={layout.mobileSidebar.opened()}
                  />
                </div>
              </Show>
              <Show when={!mac()}>
                <div class="xl:hidden w-[48px] shrink-0 flex items-center justify-center">
                  <IconButton
                    icon="menu"
                    variant="ghost"
                    class="titlebar-icon rounded-md"
                    onClick={layout.mobileSidebar.toggle}
                    aria-label={language.t("sidebar.menu.toggle")}
                    aria-expanded={layout.mobileSidebar.opened()}
                  />
                </div>
              </Show>
              <div class="flex items-center gap-1 shrink-0">
                <TooltipKeybind
                  class={web() ? "hidden xl:flex shrink-0 ml-14" : "hidden xl:flex shrink-0 ml-2"}
                  placement="bottom"
                  title={language.t("command.sidebar.toggle")}
                  keybind={command.keybind("sidebar.toggle")}
                >
                  <Button
                    variant="ghost"
                    class="group/sidebar-toggle titlebar-icon w-8 h-6 p-0 box-border"
                    onClick={layout.sidebar.toggle}
                    aria-label={language.t("command.sidebar.toggle")}
                    aria-expanded={layout.sidebar.opened()}
                  >
                    <Icon size="small" name={layout.sidebar.opened() ? "sidebar-active" : "sidebar"} />
                  </Button>
                </TooltipKeybind>
                <div class="hidden xl:flex items-center shrink-0">
                  <Show when={params.dir}>
                    <div
                      class="flex items-center shrink-0 w-8 mr-1"
                      aria-hidden={layout.sidebar.opened() ? "true" : undefined}
                    >
                      <div
                        class="transition-opacity"
                        classList={{
                          "opacity-100 duration-120 ease-out": !layout.sidebar.opened(),
                          "opacity-0 duration-120 ease-in delay-0 pointer-events-none": layout.sidebar.opened(),
                        }}
                      >
                        <TooltipKeybind
                          placement="bottom"
                          title={language.t("command.session.new")}
                          keybind={command.keybind("session.new")}
                          openDelay={800}
                        >
                          <Button
                            variant="ghost"
                            class="titlebar-icon w-8 h-6 p-0 box-border"
                            disabled={layout.sidebar.opened()}
                            tabIndex={layout.sidebar.opened() ? -1 : undefined}
                            onClick={() => {
                              if (!params.dir) return
                              navigate(`/${params.dir}/session`)
                            }}
                            aria-label={language.t("command.session.new")}
                            aria-current={creating() ? "page" : undefined}
                          >
                            <IconV2 name="edit" size="small" />
                          </Button>
                        </TooltipKeybind>
                      </div>
                    </div>
                  </Show>
                  <div
                    class="flex items-center shrink-0"
                    classList={{
                      "-translate-x-[36px]": layout.sidebar.opened() && !!params.dir,
                      "duration-180 ease-out": !layout.sidebar.opened(),
                      "duration-180 ease-in": layout.sidebar.opened(),
                    }}
                  >
                    <Show when={hasProjects() && nav()}>
                      <div class="flex items-center gap-0 transition-transform">
                        <Tooltip placement="bottom" value={language.t("common.goBack")} openDelay={800}>
                          <Button
                            variant="ghost"
                            icon="chevron-left"
                            class="titlebar-icon w-6 h-6 p-0 box-border"
                            disabled={!canBack()}
                            onClick={back}
                            aria-label={language.t("common.goBack")}
                          />
                        </Tooltip>
                        <Tooltip placement="bottom" value={language.t("common.goForward")} openDelay={800}>
                          <Button
                            variant="ghost"
                            icon="chevron-right"
                            class="titlebar-icon w-6 h-6 p-0 box-border"
                            disabled={!canForward()}
                            onClick={forward}
                            aria-label={language.t("common.goForward")}
                          />
                        </Tooltip>
                      </div>
                    </Show>
                    <div id="opencode-titlebar-left" class="flex items-center gap-3 min-w-0 px-2" />
                    <ChannelIndicator />
                  </div>
                </div>
              </div>
            </div>

            <div class="min-w-0 flex items-center justify-center pointer-events-none">
              <div
                id="opencode-titlebar-center"
                class="pointer-events-auto min-w-0 flex justify-center w-fit max-w-full"
              />
            </div>

            <div
              classList={{
                "flex items-center min-w-0 justify-end": true,
                "pr-2": !windows(),
              }}
              data-tauri-drag-region
              onMouseDown={drag}
            >
              <div id="opencode-titlebar-right" class="flex items-center gap-1 shrink-0 justify-end" />
              <Show when={windows()}>
                {!tauriApi() && <div class="shrink-0" style={{ width: windowsControlsWidth() }} />}
                <div data-tauri-decorum-tb class="flex flex-row" />
              </Show>
            </div>
          </div>
        </Match>
      </Switch>
    </header>
  )
}

type TitlebarUpdatePillState = {
  visible: boolean
  installing: boolean
  label: string
  ariaLabel: string
  title?: string
  onInstall: () => void
}

type TitlebarV2RightState = {
  update: TitlebarUpdatePillState
}

function TitlebarV2Right(props: { state: TitlebarV2RightState }) {
  return (
    <div class="relative z-20 flex shrink-0 items-center justify-end gap-0 overflow-visible">
      <Show when={props.state.update.visible}>
        <TitlebarUpdateIconButton state={props.state.update} />
      </Show>
      <div id="opencode-titlebar-right" class="flex shrink-0 items-center justify-end gap-0" />
    </div>
  )
}

function TitlebarUpdateIconButton(props: { state: TitlebarUpdatePillState }) {
  return (
    <div class="group relative mr-3 h-5 w-5 shrink-0 rounded-full bg-v2-background-bg-deep transition-[width] duration-150 ease-out hover:z-30 hover:w-[68px] focus-within:z-30 focus-within:w-[68px] motion-reduce:transition-none">
      <button
        type="button"
        class="absolute right-0 top-0 z-10 flex h-5 w-5 items-center justify-end overflow-hidden rounded-full bg-v2-icon-icon-accent/20 text-v2-icon-icon-accent transition-[width,background-color] duration-150 ease-out group-hover:w-[68px] group-hover:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] group-focus-within:w-[68px] group-focus-within:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] focus-visible:outline-none disabled:opacity-60 motion-reduce:transition-none"
        onClick={props.state.onInstall}
        disabled={props.state.installing}
        aria-busy={props.state.installing}
        aria-label={props.state.ariaLabel}
      >
        <span class="shrink-0 ml-[8px] mr-px text-[11px] text-v2-text-text-accent [font-weight:530] opacity-0 translate-x-2 motion-safe:transition-all duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0 motion-reduce:translate-x-0">
          Update
        </span>
        <span class="flex size-5 shrink-0 items-center justify-center">
          <Show
            when={!props.state.installing}
            fallback={<span data-slot="titlebar-update-loader" aria-hidden="true" />}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 11V3M3.5 7.63128L7 11L10.5 7.63128" stroke="currentColor" />
            </svg>
          </Show>
        </span>
      </button>
    </div>
  )
}

function ChannelIndicator() {
  return (
    <>
      {["beta", "dev"].includes(import.meta.env.VITE_OPENCODE_CHANNEL) && (
        <div class="bg-icon-interactive-base text-[#FFF] font-medium px-2 rounded-sm uppercase font-mono">
          {import.meta.env.VITE_OPENCODE_CHANNEL.toUpperCase()}
        </div>
      )}
    </>
  )
}

function MobileSessionInfoSheet(props: {
  sessionID: string
  onClose: () => void
  labels: { rename: string; archive: string; delete: string }
  onRename: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  return (
    <div class="flex flex-col gap-1 p-2">
      <MenuV2.Item onSelect={() => { props.onClose(); setTimeout(() => props.onRename(), 0) }}>
        {props.labels.rename}
      </MenuV2.Item>
      <MenuV2.Item onSelect={() => { props.onClose(); setTimeout(() => props.onArchive(), 0) }}>
        {props.labels.archive}
      </MenuV2.Item>
      <MenuV2.Separator />
      <MenuV2.Item onSelect={() => { props.onClose(); setTimeout(() => props.onDelete(), 0) }}>
        {props.labels.delete}
      </MenuV2.Item>
    </div>
  )
}

function MobileDeleteDialog(props: {
  sessionID: string
  name: string
  onDelete: (id: string) => Promise<void>
  onClose: () => void
  labels: { title: string; confirm: string; cancel: string; button: string }
}) {
  const handleDelete = async () => {
    await props.onDelete(props.sessionID)
    props.onClose()
  }
  return (
    <div class="flex flex-col gap-4 p-4">
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium text-text-strong">{props.labels.title}</span>
        <span class="text-sm text-text-base">{props.labels.confirm}</span>
      </div>
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="large" onClick={props.onClose}>
          {props.labels.cancel}
        </Button>
        <Button variant="primary" size="large" onClick={handleDelete}>
          {props.labels.button}
        </Button>
      </div>
    </div>
  )
}

function MobileRenameDialog(props: {
  currentTitle: string
  onRename: (title: string) => Promise<void>
  onClose: () => void
  labels: { title: string; cancel: string; save: string }
}) {
  const [value, setValue] = createSignal(props.currentTitle)
  const handleRename = async () => {
    const next = value().trim()
    if (!next || next === props.currentTitle) {
      props.onClose()
      return
    }
    await props.onRename(next)
    props.onClose()
  }
  return (
    <div class="flex flex-col gap-4 p-4">
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium text-text-strong">{props.labels.title}</span>
      </div>
      <input
        type="text"
        value={props.currentTitle}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleRename()
        }}
        class="w-full rounded-md border border-border-base bg-background-base px-3 py-2 text-sm text-text-base outline-none focus:border-border-interactive"
        autofocus
      />
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="large" onClick={props.onClose}>
          {props.labels.cancel}
        </Button>
        <Button variant="primary" size="large" onClick={handleRename}>
          {props.labels.save}
        </Button>
      </div>
    </div>
  )
}
