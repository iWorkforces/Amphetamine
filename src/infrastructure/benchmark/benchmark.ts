import { app, type BrowserWindow } from "electron";
import { createHook, type AsyncHook } from "node:async_hooks";
import {
  isRendererCountdownTimerCounters,
  type RendererCountdownTimerCounters,
} from "../../shared/benchmark-types.js";
import {
  BENCHMARK_LABEL_ENV_NAME,
  BENCHMARK_USER_DATA_ENV_NAME,
  isBenchmarkMode,
} from "./benchmark-env.js";
import {
  buildRuntimeInfo,
  round,
  summarize,
  summarizeIdle,
  sumCpuPercent,
  sumIdleWakeups,
  type BenchmarkArtifact,
  type BenchmarkContext,
  type BenchmarkTimerCounters,
  type IdleSample,
  type LoadResult,
  type MainTimerCounters,
} from "./benchmark-metrics.js";

const RESULT_PREFIX = "AMPHETAMINE_BENCHMARK_RESULT:";
const RENDERER_COUNTER_SCRIPT =
  "globalThis.__AMPHETAMINE_BENCHMARK__?.getRendererCountdownTimerCounters?.() ?? null";
const LOAD_TIMEOUT_MS = 7000;
const RESPONSIVENESS_SAMPLE_COUNT = 5;
const IDLE_SAMPLE_COUNT = 6;
const IDLE_SAMPLE_INTERVAL_MS = 250;

type MutableTimerState = {
  timerResourcesCreated: number;
  timerCallbacks: number;
  timerResourcesDestroyed: number;
};

class InvalidRendererBenchmarkCountersError extends Error {
  override readonly name = "InvalidRendererBenchmarkCountersError";

  constructor() {
    super("Renderer benchmark countdown counters are unavailable or invalid.");
  }
}

const timerState: MutableTimerState = {
  timerResourcesCreated: 0,
  timerCallbacks: 0,
  timerResourcesDestroyed: 0,
};
const activeTimerIds = new Set<number>();
let timerHook: AsyncHook | null = null;

export function configureBenchmarkEnvironment(): void {
  if (!isBenchmarkMode()) return;
  const userDataPath = process.env[BENCHMARK_USER_DATA_ENV_NAME];
  if (typeof userDataPath === "string" && userDataPath.length > 0) {
    app.setPath("userData", userDataPath);
  }
}

export function installBenchmarkTimerCounters(): void {
  if (!isBenchmarkMode() || timerHook !== null) return;
  timerHook = createHook({
    init(asyncId, type) {
      if (type !== "Timeout") return;
      timerState.timerResourcesCreated += 1;
      activeTimerIds.add(asyncId);
    },
    before(asyncId) {
      if (!activeTimerIds.has(asyncId)) return;
      timerState.timerCallbacks += 1;
    },
    destroy(asyncId) {
      if (!activeTimerIds.delete(asyncId)) return;
      timerState.timerResourcesDestroyed += 1;
    },
  });
  timerHook.enable();
}

export async function runBenchmarkIfRequested(context: BenchmarkContext): Promise<void> {
  if (!isBenchmarkMode()) return;

  const startedAt = new Date().toISOString();
  const startMs = performance.now();
  const popoverDomReady = await waitForWindowLoad(context.mainWindow);
  const idleSamples = await collectIdleSamples(startMs, context.mainWindow);
  const popoverShowHide = sampleSync(() => {
    context.mainWindow.showInactive();
    context.mainWindow.hide();
  });
  const trayMenuProxy = await sampleTrayMenuProxy();
  const settingsWindowReady = await sampleSettingsWindowReady();
  const rendererCountdownCounters = await readRendererCountdownTimerCounters(context.mainWindow);

  const artifact: BenchmarkArtifact = {
    schemaVersion: 1,
    label: process.env[BENCHMARK_LABEL_ENV_NAME] ?? "benchmark",
    timestamps: { startedAt, completedAt: new Date().toISOString() },
    runtime: buildRuntimeInfo(),
    launchReadiness: {
      appReadyMs: round(context.appReadyMs),
      bootstrapReadyMs: round(context.bootstrapReadyMs),
      popoverDomReadyMs: round(popoverDomReady.elapsedMs),
    },
    responsiveness: {
      popoverShowHide: summarize(popoverShowHide),
      trayMenuProxy: summarize(trayMenuProxy),
      settingsWindowReady: summarize(settingsWindowReady),
    },
    idle: {
      sampleIntervalMs: IDLE_SAMPLE_INTERVAL_MS,
      summary: summarizeIdle(idleSamples),
      samples: idleSamples,
    },
    timerCounters: snapshotTimerCounters(rendererCountdownCounters),
  };

  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(artifact)}\n`);
  app.quit();
}

function snapshotMainTimerCounters(): MainTimerCounters {
  return {
    timerResourcesCreated: timerState.timerResourcesCreated,
    timerCallbacks: timerState.timerCallbacks,
    timerResourcesDestroyed: timerState.timerResourcesDestroyed,
    activeTimerResources: activeTimerIds.size,
  };
}

function snapshotTimerCounters(
  rendererCountdown: RendererCountdownTimerCounters,
): BenchmarkTimerCounters {
  return {
    main: snapshotMainTimerCounters(),
    rendererCountdown,
  };
}

function sampleSync(action: () => void): readonly number[] {
  const samples: number[] = [];
  for (let index = 0; index < RESPONSIVENESS_SAMPLE_COUNT; index += 1) {
    const started = performance.now();
    action();
    samples.push(round(performance.now() - started));
  }
  return samples;
}

async function sampleTrayMenuProxy(): Promise<readonly number[]> {
  const { measureBenchmarkTrayMenuProxy } = await import("../../main/tray.js");
  return sampleSync(() => {
    measureBenchmarkTrayMenuProxy();
  });
}

async function sampleSettingsWindowReady(): Promise<readonly number[]> {
  const { createSettingsWindow, closeSettingsWindow } = await import(
    "../../main/settings-window.js"
  );
  const samples: number[] = [];
  for (let index = 0; index < RESPONSIVENESS_SAMPLE_COUNT; index += 1) {
    const win = createSettingsWindow();
    const result = await waitForWindowReadyToShow(win);
    samples.push(round(result.elapsedMs));
    closeSettingsWindow();
    await sleep(25);
  }
  return samples;
}

async function collectIdleSamples(
  startMs: number,
  win: BrowserWindow,
): Promise<readonly IdleSample[]> {
  const samples: IdleSample[] = [];
  for (let index = 0; index < IDLE_SAMPLE_COUNT; index += 1) {
    await sleep(IDLE_SAMPLE_INTERVAL_MS);
    const appMetrics = app.getAppMetrics();
    const memoryUsage = process.memoryUsage();
    const rendererCountdownCounters = await readRendererCountdownTimerCounters(win);
    samples.push({
      elapsedMs: round(performance.now() - startMs),
      totalCpuPercent: round(sumCpuPercent(appMetrics)),
      totalIdleWakeups: sumIdleWakeups(appMetrics),
      rssBytes: memoryUsage.rss,
      heapUsedBytes: memoryUsage.heapUsed,
      appMetrics,
      timerCounters: snapshotTimerCounters(rendererCountdownCounters),
    });
  }
  return samples;
}

async function readRendererCountdownTimerCounters(
  win: BrowserWindow,
): Promise<RendererCountdownTimerCounters> {
  const result: unknown = await win.webContents.executeJavaScript(RENDERER_COUNTER_SCRIPT, true);
  if (isRendererCountdownTimerCounters(result)) {
    return result;
  }
  throw new InvalidRendererBenchmarkCountersError();
}

async function waitForWindowLoad(win: BrowserWindow): Promise<LoadResult> {
  if (!win.webContents.isLoading()) {
    return { kind: "already-loaded", elapsedMs: 0 };
  }
  return waitForWebContentsEvent(win, "did-finish-load");
}

async function waitForWindowReadyToShow(win: BrowserWindow): Promise<LoadResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    const timeout = setTimeout(() => {
      resolve({ kind: "timeout", elapsedMs: performance.now() - started });
    }, LOAD_TIMEOUT_MS);
    timeout.unref();
    win.once("ready-to-show", () => {
      clearTimeout(timeout);
      resolve({ kind: "loaded", elapsedMs: performance.now() - started });
    });
  });
}

async function waitForWebContentsEvent(
  win: BrowserWindow,
  successEvent: "did-finish-load",
): Promise<LoadResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    const timeout = setTimeout(() => {
      resolve({ kind: "timeout", elapsedMs: performance.now() - started });
    }, LOAD_TIMEOUT_MS);
    timeout.unref();
    win.webContents.once(successEvent, () => {
      clearTimeout(timeout);
      resolve({ kind: "loaded", elapsedMs: performance.now() - started });
    });
    win.webContents.once("did-fail-load", () => {
      clearTimeout(timeout);
      resolve({ kind: "failed", elapsedMs: performance.now() - started });
    });
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
