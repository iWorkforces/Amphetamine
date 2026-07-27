/**
 * Compatibility façade over createAppComposition().
 * Prefer composition-root from index; tests may still use these entrypoints.
 */
import {
  createAppComposition,
  type AppComposition,
} from "./composition-root.js";
import type { TrayDeps } from "./tray.js";

let composition: AppComposition | null = null;

export async function initCoordinator(): Promise<void> {
  composition = createAppComposition();
  await composition.init();
}

export function cleanupCoordinator(): void {
  composition?.cleanup();
  composition = null;
}

export function getTrayDeps(): TrayDeps {
  if (composition === null || !composition.ready) {
    throw new Error(
      "[composition] getTrayDeps() called before initCoordinator() / composition.init()",
    );
  }
  return composition.getTrayDeps();
}

/** Access the live composition (for index/tests). Null when not initialized. */
export function getComposition(): AppComposition | null {
  return composition;
}
