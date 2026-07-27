/** Logger — thin wrapper so domain/application never import electron-log. */
export interface LoggerPort {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
