/** User-visible feedback that is not a renderer push (OS notification, tray toast, etc.). */
export interface UserNotifierPort {
  notify(message: {
    title: string;
    body: string;
  }): void;
}
