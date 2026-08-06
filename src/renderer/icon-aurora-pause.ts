/**
 * Pause fancy icon-aurora leaf animations while a warm-cache utility shell is hidden.
 *
 * Electron often loads BrowserWindows with `show: false` (visibilityState=hidden)
 * and can miss `visibilitychange` on hide()/show(). Re-sync on focus/blur/pageshow
 * and short delayed timeouts after bind.
 *
 * Pure DOM — no Electron imports (renderer-safe).
 */

/** Bootstrap re-sync delays (ms) after first bind — covers show:false → ready-to-show. */
const AURORA_PAUSE_RESYNC_MS = [0, 100] as const;

function isDocumentHidden(): boolean {
  return document.visibilityState === "hidden" || document.hidden;
}

/**
 * Wire pause/unpause for a single `.icon-aurora-stage` element.
 * @returns cleanup (remove listeners + clear timeouts)
 */
export function wireIconAuroraPause(stage: HTMLElement): () => void {
  const syncPause = (): void => {
    stage.classList.toggle("is-paused", isDocumentHidden());
  };

  document.addEventListener("visibilitychange", syncPause);
  window.addEventListener("focus", syncPause);
  window.addEventListener("blur", syncPause);
  window.addEventListener("pageshow", syncPause);

  syncPause();

  const timers: number[] = [];
  for (const ms of AURORA_PAUSE_RESYNC_MS) {
    timers.push(window.setTimeout(syncPause, ms));
  }

  return (): void => {
    document.removeEventListener("visibilitychange", syncPause);
    window.removeEventListener("focus", syncPause);
    window.removeEventListener("blur", syncPause);
    window.removeEventListener("pageshow", syncPause);
    for (const id of timers) {
      window.clearTimeout(id);
    }
  };
}

/**
 * Find `.icon-aurora-stage` under `root` and wire pause if present.
 * @returns cleanup (no-op when stage is missing)
 */
export function bindIconAuroraStagePause(root: ParentNode = document): () => void {
  const stage = root.querySelector(".icon-aurora-stage");
  if (!(stage instanceof HTMLElement)) {
    return (): void => {
      /* no stage */
    };
  }
  return wireIconAuroraPause(stage);
}
