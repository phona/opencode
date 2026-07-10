# OpenCode HarmonyOS NEXT Wrapper Design

**Status:** Draft  
**Date:** 2026-07-09  
**Scope:** Wrap `packages/app` in a HarmonyOS NEXT (ArkTS/ArkUI) shell with native system integration and push notifications.

---

## 1. Background

OpenCode (`packages/app`) is a SolidJS/Vite PWA that communicates with an OpenCode server over HTTP and SSE. The user wants to use OpenCode on a HarmonyOS NEXT phone with reliable notifications, without having to keep the app open.

PWA installation is not usable on HarmonyOS: the native browser only creates a shortcut that opens the page in the browser, and Chrome on HarmonyOS does not show an install prompt. Therefore, a native app wrapper is required to provide:

- A home-screen icon that opens a standalone app.
- Push notifications when the app is closed.
- Access to system pickers, sharing, and file I/O.
- Optional service widgets on the home screen.

Live View / Dynamic Island is intentionally out of scope because HarmonyOS NEXT only allows system apps to publish Live View notifications.

---

## 2. Goals

1. **App Shell**: Provide a HarmonyOS NEXT app whose main UI is the existing `packages/app` web frontend running in an ArkWeb WebView.
2. **Notifications**: Show local notifications when the app is running, and push notifications (via HMS Push) when the app is closed.
3. **System Integration**: Expose system file picker, photo picker, audio picker, and system share to the web frontend via a JS bridge.
4. **Lifecycle Handling**: Pause and resume the SSE event stream when the app moves between foreground and background.
5. **Service Widget (Optional)**: Provide a simple home-screen widget showing recent sessions or quick actions.

## 3. Non-Goals

1. **Live View / Dynamic Island**: Not available to third-party apps on HarmonyOS NEXT.
2. **True Background Execution**: The app will not keep running AI tasks in the background. Long-running work continues on the server.
3. **Full ArkUI Rewrite**: Core UI remains the web frontend; only native glue and small widgets are written in ArkUI/ArkTS.
4. **Cross-Device Hop**: Not required for this phase.

---

## 4. Constraints

- **HarmonyOS NEXT 5.0+**: No Android app compatibility; must use ArkTS/ArkUI and ArkWeb.
- **Background Limits**: Third-party apps cannot run code indefinitely in the background. Continuous background tasks are limited to audio, navigation, VoIP, data transfer, etc. OpenCode does not fit these categories.
- **Live View Restricted**: System apps only.
- **HMS Push Required**: Standard Web Push is not available as a standalone PWA on HarmonyOS, so push notifications must go through Huawei Push Kit from the backend.
- **OpenHarmony Docs**: The open-source docs confirm the APIs and restrictions above. Huawei-specific commercial docs (HMS Push pricing, exact quotas, etc.) could not be fetched and must be verified in DevEco Studio / Huawei Developer Console.

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HarmonyOS NEXT Phone                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ArkTS App Shell (EntryAbility)                      │   │
│  │  ├─ ArkWeb WebView loading packages/app dist         │   │
│  │  ├─ JSBridge: window.opencodeNative                 │   │
│  │  ├─ NotificationKit wrapper                         │   │
│  │  ├─ CoreFileKit wrapper (file I/O, picker, share)     │   │
│  │  ├─ BackgroundTasks wrapper (transient task)         │   │
│  │  └─ HMS Push receiver + click handler               │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                               │
│  ┌───────────────────────────┴───────────────────────────┐    │
│  │          OpenCode Server (HTTP + SSE)               │    │
│  │  ├─ Existing session/chat API                        │    │
│  │  └─ HMS Push server-side sender (new)               │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 6. Project Layout

The HarmonyOS wrapper lives in its own package, parallel to `packages/desktop`, both consuming the same `packages/app` web frontend.

```
packages/
  app/                  # Core OpenCode frontend (SolidJS/Vite)
  desktop/              # Electron wrapper around packages/app
  harmonyos/            # HarmonyOS NEXT wrapper around packages/app  ← new
  web/                  # Marketing/docs website
```

### Why a separate package?

- `packages/app` remains platform-agnostic web code.
- `packages/harmonyos` contains ArkTS/ArkUI-specific code, DevEco Studio configuration, and native bridge implementations.
- The build pipeline copies `packages/app/dist` into `packages/harmonyos/entry/src/main/resources/rawfile/` before the HarmonyOS app is built.

### Build pipeline

```bash
# 1. Build the web frontend
cd packages/app
bun run build

# 2. Copy the build output into the HarmonyOS shell
cp -r packages/app/dist/* packages/harmonyos/entry/src/main/resources/rawfile/

# 3. Open packages/harmonyos in DevEco Studio and build/run
```

This mirrors the existing `packages/desktop` pattern, where the desktop shell packages the same web frontend inside a platform-specific runtime.

## 7. Components

### 7.1 ArkTS App Shell (`EntryAbility`)

- Entry point of the app.
- Creates a full-screen ArkWeb component.
- Registers the JS bridge object.
- Handles `UIAbility` lifecycle (`onForeground`, `onBackground`, `onWindowStageEvent`) and forwards foreground/background changes to the WebView.
- Receives HMS Push intents and tells the WebView to navigate to the relevant session.

### 7.2 ArkWeb WebView

- Loads the OpenCode frontend from `resources/rawfile/index.html` (fastest path) or from a sandbox path for dynamic updates.
- Uses `javaScriptProxy()` to inject the native bridge.
- Uses `createWebMessagePorts()` for optional high-throughput messaging.
- DevTools can be enabled for debugging.

### 7.3 JS Bridge (`window.opencodeNative`)

A single namespaced object exposed to the web frontend. All methods are asynchronous and return Promises where needed.

| Method | Purpose |
|--------|---------|
| `notify(config)` | Show a local text/multi-line/progress notification. |
| `pickImage()` | Open the system photo picker and return a URI/base64. |
| `pickDocument()` | Open the system document picker and return a URI. |
| `pickAudio()` | Open the system audio picker and return a URI. |
| `readFile(uri)` | Read an application-scoped file and return contents. |
| `writeFile(path, data)` | Write data to the app sandbox. |
| `share(text?, uri?)` | Open the system share sheet. |
| `getPushToken()` | Returns the HMS Push token (for backend registration). |
| `openSession(sessionID)` | Called from push click handler to focus a session. |
| `onLifecycleChange(callback)` | Register a callback invoked when the app enters foreground or background. |

### 7.4 Native Modules

- **NotificationKit**: Publish local text, multi-line, and progress notifications. Add `WantAgent` so tapping opens the app to the right session.
- **CoreFileKit**: Sandbox file I/O, system pickers, file sharing via `startAbility` with grant flags.
- **BackgroundTasksKit**: Request a transient task when moving to background so the app can gracefully finish the current SSE message or send a local notification before suspension.
- **HMS Push SDK**: Register for push token, receive push messages, handle notification clicks.

### 7.5 Backend HMS Push Integration (New)

- Store per-device push tokens (HMS tokens) in the user's profile/session store.
- When a new message or task event occurs for a user whose active client is the HarmonyOS app, call the Huawei Push Kit server API to send a push.
- The push payload contains the session ID, message ID, and a short summary so the app can open the correct session.
- If the user has no push token registered, fall back to the existing SSE/local notification path (when the app is open).

---

## 8. JSBridge Protocol

### 8.1 Bridge Object

```ts
// Web side (existing packages/app code)
declare global {
  interface Window {
    opencodeNative?: OpenCodeNativeBridge
  }
}

interface OpenCodeNativeBridge {
  notify(config: NotifyConfig): void
  notifyProgress(config: ProgressConfig): void
  pickImage(): Promise<PickerResult>
  pickDocument(): Promise<PickerResult>
  pickAudio(): Promise<PickerResult>
  share(options: ShareOptions): Promise<void>
  getPushToken(): Promise<string | null>
  onLifecycleChange(callback: (state: "foreground" | "background") => void): () => void
}
```

### 8.2 ArkTS Registration

```ts
import { webview } from '@kit.ArkWeb';

class OpenCodeBridge {
  notify(config: NotifyConfig): void { /* ... */ }
  async pickImage(): Promise<PickerResult> { /* ... */ }
  // ...
}

Web({ src: $rawfile('index.html'), controller: this.webviewController })
  .javaScriptProxy({
    object: new OpenCodeBridge(),
    name: 'opencodeNative',
    methodList: [
      'notify',
      'pickImage',
      'pickDocument',
      'pickAudio',
      'share',
      'getPushToken',
      'onLifecycleChange'
    ],
    controller: this.webviewController,
  })
```

### 8.3 Lifecycle Messages

When the app transitions, the ArkTS shell calls into the web frontend:

```ts
this.webviewController.runJavaScript(
  `window.dispatchEvent(new CustomEvent('opencode:lifecycle', { detail: 'background' }))`
);
```

The web frontend listens and pauses/resumes the SSE stream accordingly.

---

## 9. Native Capability Mapping

| Feature | OpenHarmony API | Notes |
|---------|-----------------|-------|
| Local text notification | `notificationManager.publish()` | `ContentType.NOTIFICATION_CONTENT_BASIC_TEXT` |
| Local multi-line notification | `notificationManager.publish()` | `ContentType.NOTIFICATION_CONTENT_MULTILINE` |
| Local progress notification | `notificationManager.publish()` with `template: { name: 'downloadTemplate' }` | Progress updates by republishing with the same ID. |
| Notification click | `WantAgent` with `OperationType.START_ABILITY` | Open app to a specific session. |
| Photo picker | `PhotoAccessHelper.PhotoViewPicker` | Replaces the deprecated CoreFileKit PhotoViewPicker. |
| Document picker | `DocumentViewPicker` from CoreFileKit | Returns temporary URI. |
| Audio picker | `AudioViewPicker` from CoreFileKit | Returns temporary URI. |
| File I/O | `fileIo` from CoreFileKit | Read/write in app sandbox only. |
| Share | `startAbility` with `wantConstant.Flags.FLAG_GRANT_READ_URI_PERMISSION` | Grant temporary URI access to receiver. |
| Transient background task | `backgroundTaskManager.requestSuspendDelay()` | Max 3 minutes per request, daily quota ~10 minutes. |
| HMS Push | Huawei Push Kit SDK | Requires backend integration and Huawei developer account. |
| Service widget | Form Kit / ArkTS widget | Optional; widget opens app via `router` event. |

---

## 10. Permissions

Declared in `module.json5`:

```json5
"requestPermissions": [
  { "name": "ohos.permission.INTERNET" },
  { "name": "ohos.permission.NOTIFICATION" },
  // File pickers do not require a permission, but reading user-selected files
  // via URI requires the temporary grant from the picker.
]
```

For HMS Push, the app also needs the Huawei Push Kit permission entries generated by the Huawei SDK and configured in the Huawei Developer Console.

---

## 11. Development Phases

### Phase 1: Minimal Native Shell (2–3 weeks)

1. Create a new HarmonyOS project in DevEco Studio.
2. Add ArkWeb component loading `packages/app` build output from `resources/rawfile`.
3. Register the `opencodeNative` JS bridge with stub methods.
4. Implement `notify` and `notifyProgress`.
5. Implement `pickImage`, `pickDocument`, `pickAudio`.
6. Implement `share`.
7. Forward lifecycle events to the WebView so SSE pauses/resumes.
8. Test on a HarmonyOS NEXT device or simulator.

### Phase 2: HMS Push Backend (1–2 weeks)

1. Create or extend backend endpoints to store HMS push tokens per device.
2. Integrate Huawei Push Kit server SDK (e.g., `hms-push-serverdemo-java` as reference) to send push messages.
3. Trigger pushes on: new message, task completion, task failure, permission request.
4. Handle push notification clicks to open the correct session.

### Phase 3: Service Widget (Optional, 2–3 days)

1. Add a Form Kit widget showing recent sessions.
2. Tapping a session opens the app and navigates to it.
3. Widget refresh is triggered when the app is opened or via a passive update.

---

## 12. Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| WebView compatibility issues with SolidJS | High | Test on real HarmonyOS device; use DevTools; fall back to static rendering if needed. |
| HMS Push setup complexity | Medium | Use Huawei Push Kit sample code; verify with Huawei console. |
| HMS Push cost/quota uncertainty | Medium | Check Huawei Push Kit pricing before production; design fallback when push unavailable. |
| Background SSE not pausing cleanly | Medium | Use lifecycle bridge + app-side `forceReconnect` on resume. |
| File picker URI permissions expire | Low | Copy selected files into app sandbox immediately if long-term access needed. |
| ArkTS strict typing slows development | Medium | Keep native glue code small; use AI generation but always compile-check. |

---

## 13. Open Questions

1. Is the user self-hosting OpenCode or using the official cloud service? This determines who implements the backend HMS Push sender.
2. What is the exact HMS Push pricing and quota for the target account type? Must be verified in Huawei Developer Console.
3. Should the frontend build be bundled into `rawfile` or downloaded dynamically to the sandbox?
4. Should the service widget display recent sessions, or only a static "New chat" shortcut?

---

## 14. Recommendation

Proceed with **Phase 1** immediately because it provides a usable app shell with notifications and system integration without backend changes. Begin **Phase 2** in parallel once the Huawei Push Kit account and credentials are ready. Defer Live View and full ArkUI rewrite until there is a clear business need.
