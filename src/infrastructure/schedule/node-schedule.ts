import type { SchedulePort } from "../../application/ports/schedule.port.js";

/**
 * SchedulePort via Node/Electron setTimeout.
 * unref so timers do not pin the event loop during tests/cleanup.
 */
export function createNodeSchedule(): SchedulePort {
  return {
    schedule(ms: number, cb: () => void): { cancel: () => void } {
      const timer = setTimeout(cb, ms);
      timer.unref();
      return {
        cancel: () => {
          clearTimeout(timer);
        },
      };
    },
  };
}
