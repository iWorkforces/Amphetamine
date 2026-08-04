/**
 * About window renderer — classic macOS-style About panel.
 * All privileged access goes through window.api (preload).
 */
import "./styles.css";

const heroIcon = new URL("../../assets/settings-hero-icon.png", import.meta.url).toString();

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`[about] Missing element #${id}`);
  }
  return el as T;
}

function openRepository(url: string): void {
  // Main process setWindowOpenHandler allowlists the package repository URL.
  window.open(url, "_blank", "noopener,noreferrer");
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

/** Opt-in open animation; default paint is always visible (safe if bootstrap fails). */
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

async function bootstrap(): Promise<void> {
  if (window.api.platform.os === "win32") {
    document.body.classList.add("platform-win32");
  }

  const root = requireEl<HTMLDivElement>("app");
  // Materialize immediately so a failed getAbout() never leaves a blank window.
  startOpenAnimation(root);

  const icon = requireEl<HTMLImageElement>("app-icon");
  const productNameEl = requireEl<HTMLHeadingElement>("product-name");
  const versionEl = requireEl<HTMLDivElement>("version");
  const descriptionEl = requireEl<HTMLDivElement>("description");
  const copyrightEl = requireEl<HTMLDivElement>("copyright");
  const closeBtn = requireEl<HTMLButtonElement>("close-btn");

  icon.src = heroIcon;

  try {
    const info = await window.api.app.getAbout();
    productNameEl.textContent = info.productName;
    document.title = `About ${info.productName}`;
    icon.alt = "";
    versionEl.textContent = `Version ${info.version}`;
    descriptionEl.textContent = info.description;
    const author = info.author.trim().length > 0 ? info.author.trim() : info.productName;
    copyrightEl.textContent = `Copyright © ${new Date().getFullYear()} ${author}. All rights reserved.`;

    const openRepo = (): void => {
      openRepository(info.repository);
    };
    icon.addEventListener("click", openRepo);
    icon.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openRepo();
      }
    });
  } catch (err: unknown) {
    console.error("[about] getAbout failed:", err);
    versionEl.textContent = "Version unknown";
    descriptionEl.textContent = "Could not load package information.";
    copyrightEl.textContent = `Copyright © ${new Date().getFullYear()}`;
  }

  const close = (): void => {
    window.close();
  };
  closeBtn.addEventListener("click", close);
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  closeBtn.focus();

  // Pause aurora while the warm-cache window is hidden.
  const auroraStage = document.querySelector(".icon-aurora-stage");
  if (auroraStage instanceof HTMLElement) {
    const syncPause = (): void => {
      auroraStage.classList.toggle("is-paused", document.visibilityState !== "visible");
    };
    document.addEventListener("visibilitychange", syncPause);
    syncPause();
  }
}

void bootstrap().catch((err: unknown) => {
  console.error("[about] bootstrap failed:", err);
  const root = document.getElementById("app");
  if (root !== null) {
    root.classList.remove("pre-animate");
    root.classList.add("ready");
  }
});
