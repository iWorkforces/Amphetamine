import { defineConfig } from "@rslib/core";
import { createElectronLibConfig } from "./rslib.config.base.js";

export default defineConfig({
  lib: [
    // CRITICAL: electron and runtime dependencies must never be bundled in preload
    createElectronLibConfig({
      entry: {
        index: "./src/preload/index.ts",
        // Dedicated preload for the aurora utility dialog (private channels).
        "utility-dialog": "./src/preload/utility-dialog.ts",
      },
      distRoot: "./lib/preload",
      filename: "[name].cjs",
      electronTarget: "electron-preload",
      tsconfigPath: "./src/preload/tsconfig.json",
    }),
  ],
  source: {
    tsconfigPath: "./src/preload/tsconfig.json",
  },
});
