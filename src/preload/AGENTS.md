# Preload — Context Bridge

Sandboxed Electron preload. Exposes the only renderer API through `contextBridge.exposeInMainWorld("api", api)`. Security-critical: no Node APIs to renderer.

## File

| File | Role |
|------|------|
| `index.ts` | Typed `window.api`, `invoke<K>()`, push subscriptions, benchmark env helper, channel exhaustiveness |

## API shape

| Namespace | Methods | Pattern |
|-----------|---------|---------|
| `window` | `setHeight(n)` | validated fire-and-forget send |
| `app` | `getVersion()`, `quit()` | `ipcRenderer.invoke` |
| `settings` | `get()`, `set(partial)`, `open()` | invoke |
| `session` | `start`, `cancel`, `getStatus` | invoke |
| `autoUpdater` | `checkForUpdates()`, `onStatus(cb)` | invoke + push |
| `benchmark` | `isEnabled()` | env bridge read-only |
| `platform` | `os` (and related) | host identity for UI labels |
| root | `onSettingsChanged`, `onWindowHide`, `onSessionStatusUpdate`, `onShortcutRegistrationFailed` | push subscriptions |

## Push subscription pattern

```typescript
onXxx: (callback: (data: T) => void) => {
  const listener = (_event: IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(CHANNEL, listener);
  return () => ipcRenderer.removeListener(CHANNEL, listener);
};
```

Always return unsubscribe. Payload types from `IpcChannelMap` / push responses.

## Type safety

- Exported `Api` derived from concrete `api` object.
- `invoke<K>()` parameterized by shared `IpcChannelMap`.
- `WiredChannels` exhaustiveness fails typecheck if shared channels are not wired.
- Imports: **shared** contracts only — never `application`, `infrastructure`, or `main`.

## Anti-Patterns

- Never expose `ipcRenderer`, `shell`, `fs`, `process`, or arbitrary channel names.
- Never disable `contextIsolation` to simplify renderer code.
- Never add a push listener without cleanup return.
- Never make renderer import Electron; extend preload instead.
