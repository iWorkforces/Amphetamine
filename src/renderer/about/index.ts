/**
 * About window renderer — package metadata + close.
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

async function bootstrap(): Promise<void> {
  const icon = requireEl<HTMLImageElement>("app-icon");
  const productNameEl = requireEl<HTMLHeadingElement>("product-name");
  const versionEl = requireEl<HTMLDivElement>("version");
  const descriptionEl = requireEl<HTMLDivElement>("description");
  const closeBtn = requireEl<HTMLButtonElement>("close-btn");

  icon.src = heroIcon;

  const info = await window.api.app.getAbout();
  productNameEl.textContent = info.productName;
  document.title = `About ${info.productName}`;
  icon.alt = `${info.productName} icon`;
  versionEl.textContent = `Version ${info.version}`;
  descriptionEl.textContent = info.description;

  icon.addEventListener("click", () => {
    // Main process setWindowOpenHandler allowlists the repository URL.
    window.open(info.repository, "_blank", "noopener,noreferrer");
  });

  closeBtn.addEventListener("click", () => {
    window.close();
  });
}

void bootstrap().catch((err: unknown) => {
  console.error("[about] bootstrap failed:", err);
});
