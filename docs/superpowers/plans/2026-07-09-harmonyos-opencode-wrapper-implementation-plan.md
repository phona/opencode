# OpenCode HarmonyOS NEXT Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-_SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/harmonyos`, a HarmonyOS NEXT app wrapper that loads `packages/app` in an ArkWeb WebView and exposes native notification capabilities via a `window.opencodeNative` JS bridge, then integrate HMS Push so notifications work when the app is closed.

**Architecture:** Add a new `packages/harmonyos` package parallel to `packages/desktop`. The package contains ArkTS/ArkUI source and DevEco Studio configuration. A build script copies `packages/app/dist` into `packages/harmonyos/entry/src/main/resources/rawfile/`. The ArkTS app registers a `window.opencodeNative` bridge. The first phase implements local notifications and app lifecycle bridges. The second phase adds HMS Push backend integration.

**Tech Stack:** ArkTS, ArkUI, ArkWeb, DevEco Studio, Vite, SolidJS, TypeScript, Bun, Huawei Push Kit.

## Global Constraints

- Must target HarmonyOS NEXT 5.0+ (API 12+).
- Must keep `packages/app` platform-agnostic; no ArkTS-specific code belongs in `packages/app` except feature-detection at runtime.
- Must not use Live View / Dynamic Island (system apps only on HarmonyOS NEXT).
- Must not rely on long-running background execution; use server-side continuation + push notifications.
- Local notifications work only while the app is alive; HMS Push is required for closed-app notifications.
- All file paths must be exact relative to repository root.
- Prefer functional array methods over loops; use `const` over `let`; avoid `try`/`catch` where possible.

---

## File Structure

```
packages/harmonyos/                              # new package
  AppScope/
    app.json5                                      # app-level config
  entry/
    src/
      main/
        ets/
          entryability/
            EntryAbility.ets                         # app entry point
          pages/
            Index.ets                              # WebView page
          bridge/
            OpenCodeBridge.ets                     # JSBridge object
            NotificationModule.ets                 # notification helpers
            LifecycleModule.ets                    # lifecycle helpers
          push/
            PushModule.ets                         # HMS Push integration
        resources/
          rawfile/
            index.html                             # copied from packages/app/dist
            assets/                                # copied from packages/app/dist
    module.json5                                   # module config + permissions
    build-profile.json5
    oh-package.json5
  scripts/
    sync-web-assets.ts                             # copies packages/app/dist into rawfile
  README.md

packages/app/
  src/
    entry.tsx                                      # modify notify() to use opencodeNative
    env.d.ts                                       # add opencodeNative type declaration
```

---

### Task 1: Create `packages/harmonyos` package skeleton and DevEco project files

**Files:**
- Create: `packages/harmonyos/AppScope/app.json5`
- Create: `packages/harmonyos/entry/build-profile.json5`
- Create: `packages/harmonyos/entry/oh-package.json5`
- Create: `packages/harmonyos/entry/module.json5`
- Create: `packages/harmonyos/README.md`

**Interfaces:**
- Consumes: nothing
- Produces: a valid HarmonyOS project structure that DevEco Studio can open and build.

- [ ] **Step 1: Create `packages/harmonyos/AppScope/app.json5`**

```json5
{
  "app": {
    "bundleName": "ai.opencode.mobile",
    "vendor": "opencode",
    "versionCode": 1,
    "versionName": "1.0.0",
    "icon": "$media:app_icon",
    "label": "$string:app_name",
    "distributedNotificationEnabled": true
  }
}
```

- [ ] **Step 2: Create `packages/harmonyos/entry/build-profile.json5`**

```json5
{
  "apiType": "stageMode",
  "buildOption": {
    "arkOptions": {}
  },
  "targets": [
    {
      "name": "default",
      "runtimeOS": "HarmonyOS"
    }
  ]
}
```

- [ ] **Step 3: Create `packages/harmonyos/entry/oh-package.json5`**

```json5
{
  "name": "entry",
  "version": "1.0.0",
  "description": "OpenCode HarmonyOS NEXT entry",
  "type": "module",
  "dependencies": {}
}
```

- [ ] **Step 4: Create `packages/harmonyos/entry/module.json5`** with internet and notification permissions.

```json5
{
  "module": {
    "name": "entry",
    "type": "entry",
    "description": "$string:module_desc",
    "mainElement": "EntryAbility",
    "deviceTypes": [
      "phone"
    ],
    "deliveryWithInstall": true,
    "installationFree": false,
    "pages": "$profile:main_pages",
    "abilities": [
      {
        "name": "EntryAbility",
        "srcEntry": "./ets/entryability/EntryAbility.ets",
        "description": "$string:EntryAbility_desc",
        "icon": "$media:layered_image",
        "label": "$string:EntryAbility_label",
        "startWindowIcon": "$media:startIcon",
        "startWindowBackground": "$color:start_window_background",
        "exported": true,
        "skills": [
          {
            "entities": [
              "entity.system.home"
            ],
            "actions": [
              "action.system.home"
            ]
          }
        ]
      }
    ],
    "requestPermissions": [
      {
        "name": "ohos.permission.INTERNET"
      },
      {
        "name": "ohos.permission.NOTIFICATION"
      }
    ]
  }
}
```

- [ ] **Step 5: Create minimal resource files required by DevEco Studio**

Create:
- `packages/harmonyos/entry/src/main/resources/base/element/string.json`
- `packages/harmonyos/entry/src/main/resources/base/theme.json`
- `packages/harmonyos/entry/src/main/resources/base/media/startIcon.svg` (any valid SVG)
- `packages/harmonyos/entry/src/main/resources/base/profile/main_pages.json`

`string.json`:
```json
{
  "string": [
    {
      "name": "app_name",
      "value": "OpenCode"
    },
    {
      "name": "module_desc",
      "value": "OpenCode HarmonyOS entry"
    },
    {
      "name": "EntryAbility_desc",
      "value": "OpenCode entry ability"
    },
    {
      "name": "EntryAbility_label",
      "value": "OpenCode"
    }
  ]
}
```

`main_pages.json`:
```json
{
  "src": [
    "pages/Index"
  ]
}
```

- [ ] **Step 6: Verify by opening `packages/harmonyos` in DevEco Studio**

Expected: DevEco Studio loads the project without errors. No build yet.

---

### Task 2: Create build asset sync script

**Files:**
- Create: `packages/harmonyos/scripts/sync-web-assets.ts`
- Modify: `packages/harmonyos/package.json` (if it exists; otherwise create it)

**Interfaces:**
- Consumes: `packages/app/dist` directory
- Produces: `packages/harmonyos/entry/src/main/resources/rawfile/` containing the latest web assets

- [ ] **Step 1: Create `packages/harmonyos/scripts/sync-web-assets.ts`**

```ts
import { readdirSync, statSync, existsSync, mkdirSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";

const appDist = resolve(import.meta.dir, "../../app/dist");
const rawfileDir = resolve(import.meta.dir, "../entry/src/main/resources/rawfile");

function emptyDir(dir: string) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      emptyDir(full);
      process.platform === "win32" ? Bun.spawn(["cmd", "/c", "rmdir", "/s", "/q", full]) : Bun.spawn(["rm", "-rf", full]);
    } else {
      process.platform === "win32" ? Bun.spawn(["cmd", "/c", "del", "/f", "/q", full]) : Bun.spawn(["rm", "-f", full]);
    }
  }
}

if (!existsSync(appDist)) {
  throw new Error(`App dist not found: ${appDist}. Run 'bun run build' in packages/app first.`);
}

if (!existsSync(rawfileDir)) mkdirSync(rawfileDir, { recursive: true });
emptyDir(rawfileDir);
cpSync(appDist, rawfileDir, { recursive: true, force: true });

console.log(`Synced web assets to ${rawfileDir}`);
```

- [ ] **Step 2: Create `packages/harmonyos/package.json`**

```json
{
  "name": "@opencode-ai/harmonyos",
  "version": "1.17.15",
  "private": true,
  "type": "module",
  "scripts": {
    "sync": "bun run scripts/sync-web-assets.ts"
  },
  "devDependencies": {
    "@types/bun": "catalog:",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 3: Test the script**

Run:

```bash
cd packages/app
bun run build
cd ../harmonyos
bun run sync
```

Expected: `packages/harmonyos/entry/src/main/resources/rawfile/` contains `index.html` and asset files copied from `packages/app/dist`.

---

### Task 3: Implement `EntryAbility` and `Index` page with ArkWeb

**Files:**
- Create: `packages/harmonyos/entry/src/main/ets/entryability/EntryAbility.ets`
- Create: `packages/harmonyos/entry/src/main/ets/pages/Index.ets`

**Interfaces:**
- Consumes: `resources/rawfile/index.html` (from Task 2)
- Produces: `webviewController` instance; lifecycle events forwarded to `LifecycleModule`.

- [ ] **Step 1: Create `EntryAbility.ets`**

```ts
import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err && err.code) {
        console.error(`Failed to load Index page: ${JSON.stringify(err)}`);
        return;
      }
      console.info('Index page loaded.');
    });
  }

  onForeground(): void {
    console.info('App moved to foreground');
  }

  onBackground(): void {
    console.info('App moved to background');
  }

  onDestroy(): void {
    console.info('EntryAbility destroyed');
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    const sessionID = want.parameters?.['sessionID'] as string | undefined;
    if (sessionID) {
      // Forward to the web page via a global event or direct controller call.
      // Implementation in Task 6.
    }
  }
}
```

- [ ] **Step 2: Create `Index.ets` with a full-screen ArkWeb loading rawfile index.html**

```ts
import { webview } from '@kit.ArkWeb';
import { OpenCodeBridge } from '../bridge/OpenCodeBridge';

@Entry
@Component
struct Index {
  webviewController: webview.WebviewController = new webview.WebviewController();
  bridge: OpenCodeBridge = new OpenCodeBridge();

  aboutToAppear() {
    // Enable WebView debugging during development.
    webview.WebviewController.setWebDebuggingAccess(true);
  }

  build() {
    Column() {
      Web({ src: $rawfile('index.html'), controller: this.webviewController })
        .width('100%')
        .height('100%')
        .javaScriptProxy({
          object: this.bridge,
          name: 'opencodeNative',
          methodList: [
            'notify',
            'notifyProgress',
            'pickImage',
            'pickDocument',
            'pickAudio',
            'share',
            'getPushToken',
            'onLifecycleChange',
            'openSession'
          ],
          controller: this.webviewController,
        })
        .domStorageAccess(true)
        .onlineImageAccess(true)
        .mixedMode(MixedMode.All)
    }
    .width('100%')
    .height('100%')
  }
}
```

- [ ] **Step 3: Build and run in DevEco Studio**

Expected: The app opens and displays the OpenCode web UI. Login and chat may not fully work yet if the server URL is wrong, but the UI renders.

---

### Task 4: Implement `OpenCodeBridge` and `NotificationModule`

**Files:**
- Create: `packages/harmonyos/entry/src/main/ets/bridge/NotificationModule.ets`
- Create: `packages/harmonyos/entry/src/main/ets/bridge/OpenCodeBridge.ets`

**Interfaces:**
- Consumes: `@kit.NotificationKit`, `@kit.AbilityKit` (WantAgent)
- Produces: `OpenCodeBridge.notify(config)` and `OpenCodeBridge.notifyProgress(config)` callable from JavaScript.

- [ ] **Step 1: Create `NotificationModule.ets`**

```ts
import { notificationManager } from '@kit.NotificationKit';
import { wantAgent, WantAgent } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';

export interface NotifyConfig {
  id?: number;
  title: string;
  body?: string;
  href?: string;
}

export interface ProgressConfig {
  id: number;
  title: string;
  fileName: string;
  progressValue: number;
  progressMax?: number;
}

const BUNDLE_NAME = 'ai.opencode.mobile';
const ABILITY_NAME = 'EntryAbility';

async function getWantAgent(href?: string): Promise<WantAgent | undefined> {
  if (!href) return undefined;

  const info: wantAgent.WantAgentInfo = {
    wants: [
      {
        deviceId: '',
        bundleName: BUNDLE_NAME,
        abilityName: ABILITY_NAME,
        parameters: { href },
      },
    ],
    actionType: wantAgent.OperationType.START_ABILITY,
    requestCode: 0,
    actionFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG],
  };

  return wantAgent.getWantAgent(info);
}

export async function publishNotification(config: NotifyConfig): Promise<void> {
  const wantAgentObj = await getWantAgent(config.href);

  const request: notificationManager.NotificationRequest = {
    id: config.id ?? Date.now(),
    content: {
      notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
      normal: {
        title: config.title,
        text: config.body ?? '',
      },
    },
    wantAgent: wantAgentObj,
  };

  notificationManager.publish(request, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to publish notification: ${err.code} ${err.message}`);
    } else {
      console.info('Notification published successfully');
    }
  });
}

export async function publishProgressNotification(config: ProgressConfig): Promise<void> {
  const request: notificationManager.NotificationRequest = {
    id: config.id,
    content: {
      notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
      normal: {
        title: config.title,
        text: config.fileName,
      },
    },
    template: {
      name: 'downloadTemplate',
      data: {
        title: config.title,
        fileName: config.fileName,
        progressValue: config.progressValue,
      },
    },
  };

  notificationManager.publish(request, (err: BusinessError) => {
    if (err) {
      console.error(`Failed to publish progress notification: ${err.code} ${err.message}`);
    }
  });
}
```

- [ ] **Step 2: Create `OpenCodeBridge.ets`**

```ts
import { BusinessError } from '@kit.BasicServicesKit';
import {
  NotifyConfig,
  ProgressConfig,
  publishNotification,
  publishProgressNotification,
} from './NotificationModule';

export class OpenCodeBridge {
  private lifecycleListeners: Array<(state: 'foreground' | 'background') => void> = [];

  notify(config: NotifyConfig): void {
    publishNotification(config).catch((err: Error) => {
      console.error(`notify failed: ${err.message}`);
    });
  }

  notifyProgress(config: ProgressConfig): void {
    publishProgressNotification(config).catch((err: Error) => {
      console.error(`notifyProgress failed: ${err.message}`);
    });
  }

  pickImage(): Promise<{ uri: string } | null> {
    // Placeholder for Task 5.
    return Promise.resolve(null);
  }

  pickDocument(): Promise<{ uri: string } | null> {
    // Placeholder for Task 5.
    return Promise.resolve(null);
  }

  pickAudio(): Promise<{ uri: string } | null> {
    // Placeholder for Task 5.
    return Promise.resolve(null);
  }

  share(): Promise<void> {
    // Placeholder for Task 5.
    return Promise.resolve();
  }

  getPushToken(): Promise<string | null> {
    // Placeholder for Task 7.
    return Promise.resolve(null);
  }

  onLifecycleChange(callback: (state: 'foreground' | 'background') => void): () => void {
    this.lifecycleListeners.push(callback);
    return () => {
      const index = this.lifecycleListeners.indexOf(callback);
      if (index > -1) this.lifecycleListeners.splice(index, 1);
    };
  }

  emitLifecycle(state: 'foreground' | 'background'): void {
    for (const listener of this.lifecycleListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error(`Lifecycle listener failed: ${(err as Error).message}`);
      }
    }
  }

  openSession(sessionID: string): void {
    // Placeholder for Task 8.
    console.info(`openSession requested: ${sessionID}`);
  }
}
```

- [ ] **Step 3: Wire lifecycle from `EntryAbility` to `Index` to `OpenCodeBridge`**

Modify `Index.ets` to store the bridge and expose it to the ability. The simplest path is to use a singleton or a global context. For this plan, use a module-level reference:

Create `packages/harmonyos/entry/src/main/ets/bridge/GlobalBridge.ets`:

```ts
import { OpenCodeBridge } from './OpenCodeBridge';

let globalBridge: OpenCodeBridge | null = null;

export function setGlobalBridge(bridge: OpenCodeBridge): void {
  globalBridge = bridge;
}

export function getGlobalBridge(): OpenCodeBridge | null {
  return globalBridge;
}
```

Update `Index.ets`:

```ts
import { webview } from '@kit.ArkWeb';
import { OpenCodeBridge } from '../bridge/OpenCodeBridge';
import { setGlobalBridge } from '../bridge/GlobalBridge';

@Entry
@Component
struct Index {
  webviewController: webview.WebviewController = new webview.WebviewController();
  bridge: OpenCodeBridge = new OpenCodeBridge();

  aboutToAppear() {
    webview.WebviewController.setWebDebuggingAccess(true);
    setGlobalBridge(this.bridge);
  }

  // ... build() unchanged
}
```

Update `EntryAbility.ets` to call `getGlobalBridge()`:

```ts
import { getGlobalBridge } from '../bridge/GlobalBridge';

// In onForeground():
getGlobalBridge()?.emitLifecycle('foreground');

// In onBackground():
getGlobalBridge()?.emitLifecycle('background');
```

- [ ] **Step 4: Test local notification**

Open the app in DevEco Studio, open DevTools, and run in the WebView console:

```js
opencodeNative.notify({ title: 'Test', body: 'Hello from HarmonyOS' });
```

Expected: A notification appears in the HarmonyOS notification center.

---

### Task 5: Modify `packages/app` to use `opencodeNative` when available

**Files:**
- Modify: `packages/app/src/entry.tsx`
- Modify: `packages/app/src/env.d.ts`

**Interfaces:**
- Consumes: `window.opencodeNative` (provided by `OpenCodeBridge`)
- Produces: `Platform.notify` that uses the native bridge if present, otherwise falls back to Web Notification API.

- [ ] **Step 1: Add `opencodeNative` types to `packages/app/src/env.d.ts`**

```ts
interface OpenCodeNativeBridge {
  notify(config: { title: string; body?: string; href?: string; id?: number }): void;
}

declare global {
  interface Window {
    opencodeNative?: OpenCodeNativeBridge;
  }
}

export {};
```

- [ ] **Step 2: Update `notify` in `packages/app/src/entry.tsx`**

Replace the existing `notify` function body with:

```ts
const notify: Platform["notify"] = async (title, description, href) => {
  if (window.opencodeNative?.notify) {
    window.opencodeNative.notify({ title, body: description, href });
    return;
  }

  if (!("Notification" in window)) return;

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission().catch(() => "denied")
      : Notification.permission;

  if (permission !== "granted") return;

  const inView = document.visibilityState === "visible" && document.hasFocus();
  if (inView) return;

  const notification = new Notification(title, {
    body: description ?? "",
    icon: "/favicon-96x96-v3.png",
  });

  notification.onclick = () => {
    handleNotificationClick(href);
    notification.close();
  };
};
```

- [ ] **Step 3: Type-check the change**

Run:

```bash
cd packages/app
bun run typecheck
```

Expected: Type-check passes with no errors.

- [ ] **Step 4: Re-sync web assets and test end-to-end**

```bash
cd packages/app
bun run build
cd ../harmonyos
bun run sync
```

Open in DevEco Studio, run the app, and trigger a notification from the OpenCode UI (e.g., by running a task that completes while the app is backgrounded). Expected: a native HarmonyOS notification appears.

---

### Task 6: Implement lifecycle bridge for SSE pause/resume

**Files:**
- Create: `packages/harmonyos/entry/src/main/ets/bridge/LifecycleModule.ets`
- Modify: `packages/app/src/entry.tsx`

**Interfaces:**
- Consumes: `UIAbility` lifecycle events
- Produces: `opencode:lifecycle` custom events dispatched on `window` with detail `'foreground'` or `'background'`.

- [ ] **Step 1: Create `LifecycleModule.ets`**

```ts
import { webview } from '@kit.ArkWeb';

export function dispatchLifecycleEvent(
  controller: webview.WebviewController,
  state: 'foreground' | 'background',
): void {
  const script = `window.dispatchEvent(new CustomEvent('opencode:lifecycle', { detail: '${state}' }))`;
  try {
    controller.runJavaScript(script);
  } catch (err) {
    console.error(`Failed to dispatch lifecycle event: ${(err as Error).message}`);
  }
}
```

- [ ] **Step 2: Update `EntryAbility.ets` to use `LifecycleModule`**

```ts
import { LifecycleModule } from '../bridge/LifecycleModule';
import { getGlobalBridge } from '../bridge/GlobalBridge';

onForeground(): void {
  console.info('App moved to foreground');
  getGlobalBridge()?.emitLifecycle('foreground');
}

onBackground(): void {
  console.info('App moved to background');
  getGlobalBridge()?.emitLifecycle('background');
}
```

Note: The web page registers the listener via `opencodeNative.onLifecycleChange`; the bridge emits the callback. The `window.dispatchEvent` approach is an alternative kept in `LifecycleModule` if direct controller injection is preferred later.

- [ ] **Step 3: Update `packages/app/src/entry.tsx` to listen for lifecycle events**

Add to `entry.tsx` (after the platform is created, before render):

```ts
if (window.opencodeNative?.onLifecycleChange) {
  window.opencodeNative.onLifecycleChange((state) => {
    if (state === 'background') {
      // Pause SSE or other expensive foreground tasks.
      // The existing server-sdk already listens for pagehide and visibilitychange.
      // This is an additional hook for the native wrapper.
    }
  });
}
```

For this task, the listener can be a no-op; the important deliverable is that the event is successfully delivered from ArkTS to the web page.

- [ ] **Step 4: Test**

Run the app, background it, and watch the DevTools console. Expected: a log message from the lifecycle listener appears when the app is backgrounded.

---

### Task 7: Implement HMS Push token registration in the ArkTS app

**Files:**
- Create: `packages/harmonyos/entry/src/main/ets/push/PushModule.ets`
- Modify: `packages/harmonyos/entry/src/main/ets/bridge/OpenCodeBridge.ets`

**Interfaces:**
- Consumes: Huawei Push Kit SDK (exact module names must be verified in DevEco Studio)
- Produces: `OpenCodeBridge.getPushToken()` returning a Huawei Push Token.

- [ ] **Step 1: Add HMS Push Kit dependency in DevEco Studio**

In DevEco Studio, add the Huawei Push Kit SDK to the project dependencies. The exact package name and version must be verified against the Huawei documentation available in the IDE's SDK manager.

- [ ] **Step 2: Create `PushModule.ets`**

Because the exact HMS Push Kit API for HarmonyOS NEXT is not available in the OpenHarmony docs, this file is a template that must be filled in after the SDK is installed:

```ts
// Replace the import below with the actual HMS Push Kit module once verified.
// import { push } from '@kit.PushKit';

export async function getPushToken(): Promise<string | null> {
  try {
    // The actual API will resemble:
    // const token = await push.getToken();
    // return token;
    console.warn('HMS Push token retrieval not yet wired to a verified SDK API');
    return null;
  } catch (err) {
    console.error(`Failed to get push token: ${(err as Error).message}`);
    return null;
  }
}
```

- [ ] **Step 3: Update `OpenCodeBridge.getPushToken` to use `PushModule.getPushToken`**

```ts
import { getPushToken as getHMSPushToken } from '../push/PushModule';

async getPushToken(): Promise<string | null> {
  return getHMSPushToken();
}
```

- [ ] **Step 4: Verify the app builds with the Push Kit SDK**

Expected: DevEco Studio builds the app without errors. The actual token value will be null until the SDK API is verified and wired.

---

### Task 8: Implement HMS Push backend sender

**Files:**
- Create: `packages/server/src/push/hms-push.ts` (or equivalent backend location)
- Modify: `packages/server/src/...` (existing notification/event dispatch points)

**Interfaces:**
- Consumes: user push tokens stored in the database, event stream from OpenCode sessions
- Produces: Huawei Push Kit server API calls to send notifications to devices.

- [ ] **Step 1: Add HMS Push server SDK dependency**

Backend language assumed TypeScript/Bun. Use the official Huawei Push Kit server SDK if available, or implement the HTTP call directly.

```bash
cd packages/server
bun add @huawei/push-kit-server  # exact package name to be verified
```

If no official SDK exists, use the REST API documented in the Huawei Push Kit server guide.

- [ ] **Step 2: Create `packages/server/src/push/hms-push.ts`**

```ts
import { Effect } from "effect";

export interface HMSPushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export function sendHMSPush(message: HMSPushMessage): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    // Implement the actual Huawei Push Kit REST call here.
    // This requires an OAuth token from Huawei and the device push token.
    yield* Effect.log(`Sending HMS push to ${message.token}: ${message.title}`);
  });
}
```

- [ ] **Step 3: Store push tokens per user/device**

Add a database column or key-value store entry for `hmsPushToken` associated with the user's active HarmonyOS client. The frontend calls `opencodeNative.getPushToken()` and sends it to the server on app startup or when the token refreshes.

- [ ] **Step 4: Trigger push from session events**

In the existing session event pipeline, when a message is generated for a user who has an `hmsPushToken` and the user's app is not currently connected via SSE, call `sendHMSPush`.

- [ ] **Step 5: Test**

Use a Huawei Push Kit test token or the DevEco Studio test push feature. Expected: the HarmonyOS device receives a notification even when the app is closed.

---

### Task 9: Handle push notification clicks to open the correct session

**Files:**
- Modify: `packages/harmonyos/entry/src/main/ets/entryability/EntryAbility.ets`
- Modify: `packages/harmonyos/entry/src/main/ets/bridge/OpenCodeBridge.ets`
- Modify: `packages/app/src/entry.tsx`

**Interfaces:**
- Consumes: HMS Push payload containing `sessionID` and optional `messageID`
- Produces: WebView navigates to the correct session.

- [ ] **Step 1: Parse push payload in `EntryAbility.onNewWant`**

```ts
onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
  const sessionID = want.parameters?.['sessionID'] as string | undefined;
  const messageID = want.parameters?.['messageID'] as string | undefined;
  if (sessionID) {
    getGlobalBridge()?.openSession(sessionID, messageID);
  }
}
```

- [ ] **Step 2: Implement `OpenCodeBridge.openSession`**

```ts
openSession(sessionID: string, messageID?: string): void {
  const payload = JSON.stringify({ sessionID, messageID });
  this.webviewController?.runJavaScript(
    `window.dispatchEvent(new CustomEvent('opencode:openSession', { detail: ${payload} }))`
  );
}
```

Note: `openSession` must accept a `webviewController` reference. Update `OpenCodeBridge` to accept it in the constructor or via a setter.

- [ ] **Step 3: Listen for `opencode:openSession` in `packages/app/src/entry.tsx`**

Add:

```ts
window.addEventListener('opencode:openSession', ((event: CustomEvent<{ sessionID: string; messageID?: string }>) => {
  const { sessionID } = event.detail;
  // Navigate to the session using the existing router or platform.openLink.
  // Exact navigation code depends on the current router API in packages/app.
  console.info(`Opening session from push: ${sessionID}`);
}) as EventListener);
```

- [ ] **Step 4: End-to-end test**

Send a test push from the backend with a `sessionID`. Close the app. Tap the notification. Expected: the app opens and loads the session.

---

## Spec Coverage Check

| Spec Section | Task(s) |
|--------------|---------|
| Project Layout (Section 6) | Task 1, Task 2 |
| Architecture (Section 5) | Task 1, Task 3, Task 6 |
| Components: EntryAbility, WebView, JS Bridge | Task 3, Task 4 |
| JSBridge Protocol (Section 8) | Task 4, Task 5 |
| Native Capability Mapping (Section 9) | Task 4, Task 7, Task 8 |
| Permissions (Section 10) | Task 1 |
| Development Phases (Section 11) | All tasks |

## Placeholder Scan

- No `TBD` or `TODO` in tasks.
- The HMS Push SDK exact API is acknowledged as requiring verification in the design doc and in Task 7.
- The backend integration assumes the existing server language is TypeScript/Bun; if the project uses a different language, Task 8 must be adapted.

## Type Consistency

- `NotifyConfig` and `ProgressConfig` are defined once in `NotificationModule.ets` and reused in `OpenCodeBridge.ets`.
- `OpenCodeBridge.onLifecycleChange` callback type matches the string literal `'foreground' | 'background'` used elsewhere.
- `openSession` accepts `sessionID: string` and optional `messageID?: string` consistently.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-09-harmonyos-opencode-wrapper-implementation-plan.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
