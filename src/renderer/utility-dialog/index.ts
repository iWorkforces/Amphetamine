/**
 * Aurora utility dialog renderer — Check for Updates and similar alerts.
 * Privileged access via window.utilityDialogApi (dedicated preload).
 * Supports warm-cache re-present via onApply (no full page reload).
 */
import "./styles.css";
import type { UtilityDialogPayload } from "../../shared/utility-dialog.js";

const heroIcon = new URL("../../assets/settings-hero-icon.png", import.meta.url).toString();

declare global {
  interface Window {
    utilityDialogApi: {
      getPayload: () => Promise<UtilityDialogPayload>;
      respond: (response: number) => Promise<void>;
      setHeight: (height: number) => Promise<void>;
      onApply: (callback: (payload: UtilityDialogPayload) => void) => () => void;
      os: string;
    };
  }
}

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`[utility-dialog] Missing element #${id}`);
  }
  return el as T;
}

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/** Opacity-only open (no scale) so height shrink-wrap does not fight transform. */
function startOpenAnimation(root: HTMLElement): void {
  root.classList.remove("pre-animate", "ready");
  if (prefersReducedMotion()) {
    root.classList.add("ready");
    return;
  }
  root.classList.add("pre-animate");
  const finish = (): void => {
    root.classList.remove("pre-animate");
    root.classList.add("ready");
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
  } else {
    finish();
  }
  window.setTimeout(finish, 400);
}

function clampIndex(index: number, length: number, fallback: number): number {
  if (length <= 0) return 0;
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    return fallback;
  }
  return index;
}

/**
 * Measure intrinsic content height and shrink-wrap.
 * Single rAF; does not wait on icon (stage size is reserved in CSS).
 */
function reportContentHeight(root: HTMLElement): void {
  const measure = (): void => {
    const prevMinHeight = root.style.minHeight;
    const prevHeight = root.style.height;
    root.style.minHeight = "0";
    root.style.height = "auto";
    const height = Math.ceil(root.scrollHeight);
    root.style.minHeight = prevMinHeight;
    root.style.height = prevHeight;
    if (height <= 0) {
      return;
    }
    void window.utilityDialogApi.setHeight(height).catch((err: unknown) => {
      console.error("[utility-dialog] setHeight failed:", err);
    });
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(measure);
  } else {
    measure();
  }
}

function bootstrap(): void {
  if (window.utilityDialogApi.os === "win32") {
    document.body.classList.add("platform-win32");
  }

  const root = requireEl<HTMLDivElement>("app");
  const icon = requireEl<HTMLImageElement>("dialog-icon");
  const messageEl = requireEl<HTMLHeadingElement>("dialog-message");
  const detailEl = requireEl<HTMLParagraphElement>("dialog-detail");
  const actionsEl = requireEl<HTMLDivElement>("dialog-actions");
  const auroraStage = document.querySelector(".icon-aurora-stage");

  icon.src = heroIcon;
  // Icon is decorative for layout; height measure does not wait on decode.

  let defaultId = 0;
  let cancelId = 0;
  let showActionButtons = false;
  let responded = false;

  const respond = (index: number): void => {
    if (responded) return;
    responded = true;
    void window.utilityDialogApi.respond(index).catch((err: unknown) => {
      console.error("[utility-dialog] respond failed:", err);
    });
  };

  const applyPayload = (payload: UtilityDialogPayload): void => {
    responded = false;
    document.title = payload.title;
    messageEl.textContent = payload.message;
    detailEl.textContent = payload.detail;

    const buttons = payload.buttons.length > 0 ? payload.buttons : ["OK"];
    defaultId = clampIndex(payload.defaultId, buttons.length, buttons.length - 1);
    cancelId = clampIndex(payload.cancelId, buttons.length, 0);
    showActionButtons = buttons.length > 1;

    // Wipe previous action row (warm-cache re-present).
    actionsEl.replaceChildren();
    root.classList.remove("no-actions");
    actionsEl.hidden = false;

    if (showActionButtons) {
      buttons.forEach((label, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        btn.className =
          index === defaultId ? "dialog-btn-primary" : "dialog-btn-secondary";
        btn.addEventListener("click", () => {
          respond(index);
        });
        actionsEl.appendChild(btn);
      });
      const focusTarget =
        actionsEl.children[defaultId] ?? actionsEl.children[0];
      if (focusTarget instanceof HTMLButtonElement) {
        focusTarget.focus();
      }
    } else {
      actionsEl.hidden = true;
      root.classList.add("no-actions");
      // Focus the dialog surface for screen readers (info-only, no action row).
      if (!root.hasAttribute("tabindex")) {
        root.tabIndex = -1;
      }
      root.focus({ preventScroll: true });
    }

    // Height first, then fade in (avoids empty chrome + resize fighting scale).
    reportContentHeight(root);
    startOpenAnimation(root);
  };

  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      respond(cancelId);
      return;
    }
    if (e.key === "Enter") {
      if (!showActionButtons) {
        e.preventDefault();
        respond(cancelId);
        return;
      }
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && actionsEl.contains(active)) {
        return;
      }
      e.preventDefault();
      respond(defaultId);
    }
  });

  // Pause aurora paint work while the warm shell is hidden.
  if (auroraStage instanceof HTMLElement) {
    const syncPause = (): void => {
      auroraStage.classList.toggle("is-paused", document.visibilityState !== "visible");
    };
    document.addEventListener("visibilitychange", syncPause);
    syncPause();
  }

  // Warm-cache re-present: main pushes a fresh payload without reloading.
  window.utilityDialogApi.onApply(applyPayload);

  // First paint: pull payload if main already stored one (race with APPLY).
  void window.utilityDialogApi
    .getPayload()
    .then(applyPayload)
    .catch(() => {
      // Idle warm shell may have no payload yet — wait for onApply.
    });
}

try {
  bootstrap();
} catch (err: unknown) {
  console.error("[utility-dialog] bootstrap failed:", err);
  const root = document.getElementById("app");
  if (root !== null) {
    root.classList.remove("pre-animate");
    root.classList.add("ready");
  }
  void window.utilityDialogApi.respond(0).catch(() => {
    // Preload may be unavailable if bootstrap failed very early.
  });
}
