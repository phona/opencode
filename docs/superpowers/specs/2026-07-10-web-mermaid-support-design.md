# Mermaid Support for Web Share Page

## Goal

Add full interactive mermaid diagram rendering to the web share page (`packages/web`), matching the desktop app experience (zoom, pan, fullscreen, download, copy source).

## Problem

The web share page's `ContentMarkdown` component passes all code blocks to shiki for syntax highlighting. Mermaid code blocks are rendered as plain code instead of diagrams.

The desktop app (via `packages/session-ui`) already has complete mermaid support with interactive features.

## Approach: Direct Integration

Add `@opencode-ai/session-ui` as a dependency and reuse its existing mermaid rendering logic.

## Changes

### 1. Package Dependencies

Add `@opencode-ai/session-ui` to `packages/web/package.json`:

```json
"@opencode-ai/session-ui": "workspace:*"
```

This brings in `mermaid` transitively.

### 2. Export mermaid from session-ui

The current session-ui exports map uses `./*` for `.tsx` files only. Add explicit exports for the mermaid module and its CSS:

```json
"./mermaid": "./src/components/mermaid.ts",
"./mermaid.css": "./src/components/mermaid.css"
```

### 3. Modify ContentMarkdown component

In `packages/web/src/components/share/content-markdown.tsx`:

#### 3a. Detect mermaid in highlight callback

Update the `markedShiki` highlight callback to detect `lang === "mermaid"` and emit a placeholder div instead of passing to shiki:

```ts
highlight(code, lang) {
  if (lang === "mermaid") {
    const encoded = encodeURIComponent(code)
    return `<div data-component="mermaid-diagram" data-mermaid-content="${encoded}"></div>`
  }
  return codeToHtml(code, {
    lang: lang || "text",
    themes: { light: "github-light", dark: "github-dark" },
  })
}
```

#### 3b. Call renderMermaidDiagrams after DOM update

Import `renderMermaidDiagrams` from `@opencode-ai/session-ui/mermaid` and call it after the HTML renders:

```ts
import { renderMermaidDiagrams } from "@opencode-ai/session-ui/mermaid"
import { onMount } from "solid-js"

// After the html resource resolves and innerHTML is set:
onMount(() => {
  if (overflow.ref) {
    renderMermaidDiagrams(overflow.ref)
  }
})
```

Since the html is a resource that resolves asynchronously, use an effect that watches the resource state:

```ts
createEffect(() => {
  if (html.state === "ready" && overflow.ref) {
    // Use queueMicrotask to ensure DOM has updated
    queueMicrotask(() => renderMermaidDiagrams(overflow.ref))
  }
})
```

#### 3c. Import mermaid styles

Import the mermaid CSS directly from session-ui:

```ts
import "@opencode-ai/session-ui/mermaid.css"
```

This imports only the mermaid styles without pulling in the full session-ui stylesheet.

## Data Flow

```
Markdown text
  → marked + markedShiki
  → HTML with mermaid placeholder divs
  → innerHTML renders to DOM
  → renderMermaidDiagrams() finds placeholders
  → mermaid.render() generates SVG
  → Interactive controls attached
```

## Error Handling

The existing `renderMermaidDiagrams` function already handles errors gracefully:
- Invalid mermaid syntax shows an error bar with the error message
- The raw code is displayed as a fallback `<pre>` block

No additional error handling needed.

## Testing

- Add a mermaid code block to a shared session
- Verify the diagram renders as SVG
- Test zoom/pan with mouse wheel and drag
- Test fullscreen overlay
- Test download SVG button
- Test copy source button
- Test invalid mermaid syntax shows error state

## Files Modified

1. `packages/web/package.json` - Add session-ui dependency
2. `packages/session-ui/package.json` - Add mermaid and mermaid.css exports
3. `packages/web/src/components/share/content-markdown.tsx` - Detect mermaid, call renderer, import styles
