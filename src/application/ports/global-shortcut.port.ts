/**
 * Global shortcut registration.
 * On register failure, adapter/use case publishes SHORTCUT_REGISTRATION_FAILED
 * via MainToRendererNotifierPort.
 */
export interface GlobalShortcutPort {
  register(
    accelerator: string,
    onToggle: () => void,
  ): { ok: true } | { ok: false; accelerator: string };
  unregisterAll(): void;
}
