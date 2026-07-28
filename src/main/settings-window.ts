/**
 * Settings window façade — stable import path for composition/IPC.
 * Implementation lives in the process WindowGraph.
 */
export {
  createSettingsWindow,
  closeSettingsWindow,
  isSettingsWindowOpen,
} from "./process/window-graph.js";
