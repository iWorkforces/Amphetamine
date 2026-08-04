/**
 * Aurora utility dialog renderer — Check for Updates and similar alerts.
 * Privileged access via window.utilityDialogApi (dedicated preload).
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

function startOpenAnimation(root: HTMLElement): void {
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
  window.setTimeout(finish, 500);
}

function clampIndex(index: number, length: number, fallback: number): number {
  if (length <= 0) return 0;
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    return fallback;
  }
  return index;
}

/**
 * Measure intrinsic content height (not min-height: 100% stretch) and shrink-wrap.
 * Uses a temporary height:auto override so we don't measure the current window size.
 */
function reportContentHeight(root: HTMLElement): void {
  const measure = (): void => {
    const prevMinHeight = root.style.minHeight;
    const prevHeight = root.style.height;
    root.style.minHeight = "0";
    root.style.height = "auto";
    // Force layout with unconstrained height.
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
    requestAnimationFrame(() => {
      requestAnimationFrame(measure);
    });
  } else {
    measure();
  }
}

async function bootstrap(): Promise<void> {
  if (window.utilityDialogApi.os === "win32") {
    document.body.classList.add("platform-win32");
  }

  const root = requireEl<HTMLDivElement>("app");
  startOpenAnimation(root);

  const icon = requireEl<HTMLImageElement>("dialog-icon");
  const messageEl = requireEl<HTMLHeadingElement>("dialog-message");
  const detailEl = requireEl<HTMLParagraphElement>("dialog-detail");
  const actionsEl = requireEl<HTMLDivElement>("dialog-actions");

  icon.src = heroIcon;

  const payload = await window.utilityDialogApi.getPayload();
  document.title = payload.title;
  messageEl.textContent = payload.message;
  detailEl.textContent = payload.detail;

  const buttons = payload.buttons.length > 0 ? payload.buttons : ["OK"];
  const defaultId = clampIndex(payload.defaultId, buttons.length, buttons.length - 1);
  const cancelId = clampIndex(payload.cancelId, buttons.length, 0);

  /**
   * Single dismiss-only alerts (OK / Check for Updates info): no in-content button.
   * System Close traffic light / caption + Esc close the window (main maps to cancelId).
   * Multi-button alerts (Open Releases, Restart, …) keep their action row.
   */
  const showActionButtons = buttons.length > 1;

  let responded = false;
  const respond = (index: number): void => {
    if (responded) return;
    responded = true;
    void window.utilityDialogApi.respond(index).catch((err: unknown) => {
      console.error("[utility-dialog] respond failed:", err);
    });
  };

  const buttonEls: HTMLButtonElement[] = [];
  if (showActionButtons) {
    buttons.forEach((label, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      const isPrimary = index === defaultId;
      btn.className = isPrimary ? "dialog-btn-primary" : "dialog-btn-secondary";
      btn.addEventListener("click", () => {
        respond(index);
      });
      actionsEl.appendChild(btn);
      buttonEls.push(btn);
    });
  } else {
    actionsEl.hidden = true;
    root.classList.add("no-actions");
  }

  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      respond(cancelId);
      return;
    }
    if (e.key === "Enter" && showActionButtons) {
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && actionsEl.contains(active)) {
        return;
      }
      e.preventDefault();
      respond(defaultId);
    }
  });

  if (showActionButtons) {
    const focusTarget = buttonEls[defaultId] ?? buttonEls[0];
    focusTarget?.focus();
  }

  // After icon + text (+ optional buttons) paint, size the window to the content.
  if (icon.complete) {
    reportContentHeight(root);
  } else {
    icon.addEventListener(
      "load",
      () => {
        reportContentHeight(root);
      },
      { once: true },
    );
    // Fallback if load never fires (cached broken path, etc.).
    window.setTimeout(() => {
      reportContentHeight(root);
    }, 120);
  }
}

void bootstrap().catch((err: unknown) => {
  console.error("[utility-dialog] bootstrap failed:", err);
  const root = document.getElementById("app");
  if (root !== null) {
    root.classList.remove("pre-animate");
    root.classList.add("ready");
  }
  // Best-effort dismiss so the main process is never stuck waiting.
  void window.utilityDialogApi.respond(0).catch(() => {
    // Preload may be unavailable if bootstrap failed very early.
  });
});
