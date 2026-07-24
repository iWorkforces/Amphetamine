# Preload - Context Bridge

Sandboxed Electron preload script. Exposes the only renderer API surface through `contextBridge.exposeInMainWorld("api", api)`. Security-critical boundary: no Node.js APIs are exposed to renderer code.

## File

| File | Role |
|------|------|
| `index.ts` | Defines typed `window.api`, `invoke<K>()`, push subscriptions, benchmark env helper, channel exhaustiveness check |

## API Shape

| Namespace | Methods | Pattern |
|-----------|---------|---------|
| `window` | `setHeight(n)` | validated fire-and-forget send |
| `app` | `getVersion()`, `quit()` | `ipcRenderer.invoke` |
| `settings` | `get()`, `set(partial)`, `open()` | `ipcRenderer.invoke` |
| `session` | `start(durationMinutes)`, `cancel()`, `getStatus()` | `ipcRenderer.invoke` |
| `autoUpdater` | `checkForUpdates()`, `onStatus(cb)` | invoke + push subscription |
| `benchmark` | `isEnabled()` | reads benchmark env bridge value |
| root callbacks | `onSettingsChanged`, `onWindowHide`, `onSessionStatusUpdate`, `onShortcutRegistrationFailed` | push subscriptions |

## Push Subscription Pattern

```typescript
onXxx: (callback: (data: T) => void) => {
  const listener = (_event: IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(CHANNEL, listener);
  return () => ipcRenderer.removeListener(CHANNEL, listener);
};
```

- Always return an unsubscribe function.
- Listener payload types come from `IpcChannelMap` or push-channel response types.
- Renderer owns cleanup; preload owns narrow exposure.
- Settings UI must subscribe to `onShortcutRegistrationFailed` for registration failures from main.

## Type Safety

- The exported `Api` type is derived from the concrete `api` object.
- `invoke<K>()` is parameterized by shared `IpcChannelMap`; never hand-write request/response shapes.
- `WiredChannels` plus `_ExhaustivenessCheck` intentionally fails typecheck if shared channels are not wired here.
- `benchmark.isEnabled()` should remain read-only and side-effect free.
- `settings.set` accepts `Partial<AppSettings>`; response is `{ settings, rejectedKeys }`.

## Anti-Patterns

- Never expose `ipcRenderer`, `shell`, `fs`, `process`, or arbitrary channel names.
- Never disable `contextIsolation` to simplify renderer code.
- Never add a push listener without a cleanup return.
- Never make renderer import Electron directly; fix preload API instead.
