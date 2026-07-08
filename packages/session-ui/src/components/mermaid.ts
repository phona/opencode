// Lazy loading & initialization

let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null
let idCounter = 0
const renderedCache = new Map<string, string>()

function detectTheme(): "dark" | "default" {
  if (typeof window === "undefined") return "default"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default"
}

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        fontFamily: "inherit",
        suppressErrorRendering: true,
        theme: detectTheme(),
      })
      return m.default
    })
  }
  return mermaidPromise
}

function generateId(): string {
  return `mermaid-${Date.now()}-${++idCounter}`
}

// SVG icon paths

const icons = {
  zoomIn: '<path d="M10 4V16M4 10H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  zoomOut: '<path d="M4 10H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  reset: '<circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M10 7v3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  fullscreen:
    '<path d="M4 4H9M4 4V9M16 4H11M16 4V9M4 16H9M4 16V11M16 16H11M16 16V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  download:
    '<path d="M10 3V13M10 13L6 9M10 13L14 9M3 17H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  copy: '<rect x="5" y="5" width="10" height="12" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 3h6a1 1 0 011 1v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  check: '<path d="M5 11.9657L8.37838 14.7529L15 5.83398" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>',
  close: '<path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
}

function createSvgIcon(path: string, size = 16): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("fill", "none")
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`)
  svg.setAttribute("width", String(size))
  svg.setAttribute("height", String(size))
  svg.setAttribute("aria-hidden", "true")
  svg.innerHTML = path
  return svg
}

// Zoom & pan

interface PanZoomState {
  zoom: number
  panX: number
  panY: number
  isPanning: boolean
  startX: number
  startY: number
  startPanX: number
  startPanY: number
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 100) / 100))
}

function applyTransform(transformEl: HTMLElement, state: PanZoomState) {
  transformEl.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`
}

function setupPanZoom(viewport: HTMLElement, transformEl: HTMLElement, state: PanZoomState) {
  viewport.addEventListener("wheel", (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    state.zoom = clampZoom(state.zoom + delta)
    applyTransform(transformEl, state)
  }, { passive: false })

  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return
    state.isPanning = true
    state.startX = e.clientX
    state.startY = e.clientY
    state.startPanX = state.panX
    state.startPanY = state.panY
    viewport.setPointerCapture(e.pointerId)
    viewport.style.cursor = "grabbing"
  })

  viewport.addEventListener("pointermove", (e) => {
    if (!state.isPanning) return
    state.panX = state.startPanX + (e.clientX - state.startX)
    state.panY = state.startPanY + (e.clientY - state.startY)
    applyTransform(transformEl, state)
  })

  viewport.addEventListener("pointerup", (e) => {
    state.isPanning = false
    viewport.releasePointerCapture(e.pointerId)
    viewport.style.cursor = "grab"
  })
}

function createPanZoomState(): PanZoomState {
  return { zoom: 1, panX: 0, panY: 0, isPanning: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 }
}

// Control buttons

function createControlButton(iconPath: string, title: string, action: string): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.className = "mermaid-control-btn"
  btn.setAttribute("data-action", action)
  btn.setAttribute("title", title)
  btn.setAttribute("aria-label", title)
  btn.appendChild(createSvgIcon(iconPath))
  return btn
}

function createDivider(): HTMLSpanElement {
  const span = document.createElement("span")
  span.className = "mermaid-divider"
  return span
}

function createControls(): HTMLDivElement {
  const bar = document.createElement("div")
  bar.className = "mermaid-controls"

  bar.appendChild(createControlButton(icons.zoomIn, "Zoom in", "zoom-in"))
  bar.appendChild(createControlButton(icons.zoomOut, "Zoom out", "zoom-out"))
  bar.appendChild(createControlButton(icons.reset, "Reset", "reset"))
  bar.appendChild(createDivider())
  bar.appendChild(createControlButton(icons.fullscreen, "Fullscreen", "fullscreen"))
  bar.appendChild(createDivider())
  bar.appendChild(createControlButton(icons.download, "Download SVG", "download"))
  bar.appendChild(createControlButton(icons.copy, "Copy source", "copy"))

  return bar
}

// Download

function downloadSvg(svgEl: SVGSVGElement, filename: string) {
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svgEl)
  const blob = new Blob([svgStr], { type: "image/svg+xml" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Fullscreen

function openFullscreen(container: HTMLElement, svgEl: SVGSVGElement) {
  const overlay = document.createElement("div")
  overlay.className = "mermaid-fullscreen-overlay"

  const fsViewport = document.createElement("div")
  fsViewport.className = "mermaid-fullscreen-viewport"

  const fsTransform = document.createElement("div")
  fsTransform.className = "mermaid-transform"

  const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement
  clonedSvg.style.maxWidth = "none"
  clonedSvg.style.maxHeight = "90vh"
  fsTransform.appendChild(clonedSvg)
  fsViewport.appendChild(fsTransform)
  overlay.appendChild(fsViewport)

  const state = createPanZoomState()
  setupPanZoom(fsViewport, fsTransform, state)

  const closeBtn = document.createElement("button")
  closeBtn.className = "mermaid-fullscreen-close"
  closeBtn.appendChild(createSvgIcon(icons.close, 20))
  closeBtn.addEventListener("click", () => overlay.remove())
  overlay.appendChild(closeBtn)

  const controls = document.createElement("div")
  controls.className = "mermaid-fullscreen-controls"
  const zoomInBtn = createControlButton(icons.zoomIn, "Zoom in", "zoom-in")
  const zoomOutBtn = createControlButton(icons.zoomOut, "Zoom out", "zoom-out")
  const resetBtn = createControlButton(icons.reset, "Reset", "reset")
  const dlBtn = createControlButton(icons.download, "Download SVG", "download")
  controls.appendChild(zoomInBtn)
  controls.appendChild(zoomOutBtn)
  controls.appendChild(resetBtn)
  controls.appendChild(createDivider())
  controls.appendChild(dlBtn)
  overlay.appendChild(controls)

  zoomInBtn.addEventListener("click", () => {
    state.zoom = clampZoom(state.zoom + ZOOM_STEP)
    applyTransform(fsTransform, state)
  })
  zoomOutBtn.addEventListener("click", () => {
    state.zoom = clampZoom(state.zoom - ZOOM_STEP)
    applyTransform(fsTransform, state)
  })
  resetBtn.addEventListener("click", () => {
    state.zoom = 1
    state.panX = 0
    state.panY = 0
    applyTransform(fsTransform, state)
  })
  dlBtn.addEventListener("click", () => downloadSvg(clonedSvg, "mermaid-diagram.svg"))

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") overlay.remove()
  })

  document.body.appendChild(overlay)
  overlay.focus()
}

// Render

export async function renderMermaidDiagrams(container: HTMLElement) {
  const placeholders = container.querySelectorAll<HTMLElement>('[data-component="mermaid-diagram"]:not([data-mermaid-rendered])')
  if (placeholders.length === 0) return

  const mermaid = await loadMermaid()

  for (const placeholder of Array.from(placeholders)) {
    const content = placeholder.getAttribute("data-mermaid-content")
    if (!content) continue

    let code: string
    try {
      code = decodeURIComponent(content)
    } catch {
      continue
    }

    const cacheKey = code
    placeholder.setAttribute("data-mermaid-rendered", "true")

    // Build the diagram container
    const viewport = document.createElement("div")
    viewport.className = "mermaid-viewport"

    const transformEl = document.createElement("div")
    transformEl.className = "mermaid-transform"

    const controls = createControls()

    try {
      let svgStr: string
      const cached = renderedCache.get(cacheKey)
      if (cached) {
        svgStr = cached
      } else {
        const id = generateId()
        const result = await mermaid.render(id, code)
        svgStr = result.svg
        renderedCache.set(cacheKey, svgStr)
      }

      transformEl.innerHTML = svgStr
      viewport.appendChild(transformEl)
      placeholder.appendChild(viewport)
      placeholder.appendChild(controls)

      // Fix SVG sizing
      const svgEl = transformEl.querySelector("svg")
      if (svgEl) {
        if (svgEl.getAttribute("width") === "100%") {
          svgEl.removeAttribute("width")
        }
        svgEl.style.maxWidth = "100%"
        svgEl.style.height = "auto"
      }

      // Setup interactivity
      const state = createPanZoomState()
      setupPanZoom(viewport, transformEl, state)

      controls.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-action]")
        if (!btn) return
        const action = btn.getAttribute("data-action")

        if (action === "zoom-in") {
          state.zoom = clampZoom(state.zoom + ZOOM_STEP)
          applyTransform(transformEl, state)
        } else if (action === "zoom-out") {
          state.zoom = clampZoom(state.zoom - ZOOM_STEP)
          applyTransform(transformEl, state)
        } else if (action === "reset") {
          state.zoom = 1
          state.panX = 0
          state.panY = 0
          applyTransform(transformEl, state)
        } else if (action === "fullscreen") {
          const svg = transformEl.querySelector("svg")
          if (svg) openFullscreen(placeholder, svg)
        } else if (action === "download") {
          const svg = transformEl.querySelector("svg")
          if (svg) downloadSvg(svg, "mermaid-diagram.svg")
        } else if (action === "copy") {
          navigator.clipboard.writeText(code).then(() => {
            btn.setAttribute("data-copied", "true")
            const icon = btn.querySelector("svg")
            if (icon) {
              const original = icon.innerHTML
              icon.innerHTML = icons.check
              setTimeout(() => {
                icon.innerHTML = original
                btn.removeAttribute("data-copied")
              }, 2000)
            }
          })
        }
      })
    } catch (error) {
      placeholder.setAttribute("data-mermaid-error", "true")
      const errorBar = document.createElement("div")
      errorBar.className = "mermaid-error-bar"
      errorBar.textContent = `Mermaid error: ${error instanceof Error ? error.message : String(error)}`
      placeholder.appendChild(errorBar)

      const pre = document.createElement("pre")
      pre.textContent = code
      placeholder.appendChild(pre)
    }
  }
}
