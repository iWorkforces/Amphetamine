import { vi, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Mock instance shapes (returned by constructor mocks)
// ---------------------------------------------------------------------------

export interface MockBrowserWindowInstance {
  loadURL: Mock<(url: string) => void>;
  loadFile: Mock<(file: string) => void>;
  show: Mock<() => void>;
  hide: Mock<() => void>;
  focus: Mock<() => void>;
  destroy: Mock<() => void>;
  isVisible: Mock<() => boolean>;
  getBounds: Mock<() => { x: number; y: number; width: number; height: number }>;
  setPosition: Mock<(x: number, y: number) => void>;
  setSize: Mock<(width: number, height: number) => void>;
  setAlwaysOnTop: Mock<(flag: boolean) => void>;
  on: Mock<(event: string, listener: (...args: unknown[]) => void) => void>;
  removeListener: Mock<(event: string, listener: (...args: unknown[]) => void) => void>;
  isDestroyed: Mock<() => boolean>;
  webContents: {
    send: Mock<(channel: string, ...args: unknown[]) => void>;
    on: Mock<(event: string, listener: (...args: unknown[]) => void) => void>;
    setWindowOpenHandler: Mock<(handler: (details: unknown) => unknown) => void>;
  };
}

export interface MockNotificationInstance {
  show: Mock<() => void>;
}

export interface MockTrayInstance {
  setToolTip: Mock<(tip: string) => void>;
  setTitle: Mock<(title: string) => void>;
  setImage: Mock<(image: unknown) => void>;
  on: Mock<(event: string, listener: (...args: unknown[]) => void) => void>;
  getBounds: Mock<() => { x: number; y: number; width: number; height: number }>;
  popUpContextMenu: Mock<(menu?: unknown) => void>;
}

export interface MockNativeImage {
  toPNG: Mock<() => Buffer>;
  isEmpty: Mock<() => boolean>;
}

export interface MockEmptyNativeImage {
  addRepresentation: Mock<(opts: unknown) => void>;
  setTemplateImage: Mock<(flag: boolean) => void>;
}

// ---------------------------------------------------------------------------
// Top-level mock surface
// ---------------------------------------------------------------------------

export interface MockBrowserWindowConstructor extends Mock<() => MockBrowserWindowInstance> {
  getAllWindows: Mock<() => MockBrowserWindowInstance[]>;
}

export interface MockElectronAPI {
  app: {
    getVersion: Mock<() => string>;
    quit: Mock<() => void>;
    dock: { hide: Mock<() => void>; show: Mock<() => Promise<void>> };
    isPackaged: boolean;
    setAboutPanelOptions: Mock<(opts: unknown) => void>;
    whenReady: Mock<() => Promise<void>>;
    on: Mock<(event: string, listener: (...args: unknown[]) => void) => void>;
    showAboutPanel: Mock<() => void>;
    getPath: Mock<(name: string) => string>;
    getAppPath: Mock<() => string>;
  };
  ipcMain: {
    handle: Mock<(channel: string, listener: (...args: unknown[]) => unknown) => void>;
    on: Mock<(channel: string, listener: (...args: unknown[]) => void) => void>;
    off: Mock<(channel: string, listener: (...args: unknown[]) => void) => void>;
  };
  shell: {
    openExternal: Mock<(url: string) => Promise<void>>;
  };
  dialog: {
    showErrorBox: Mock<(title: string, content: string) => void>;
    showMessageBox: Mock<(opts: unknown) => Promise<{ response: number }>>;
  };
  nativeTheme: {
    shouldUseDarkColors: boolean;
    on: Mock<(event: string, listener: (...args: unknown[]) => void) => void>;
  };
  BrowserWindow: MockBrowserWindowConstructor;
  Notification: Mock<() => MockNotificationInstance>;
  Tray: Mock<() => MockTrayInstance>;
  Menu: {
    buildFromTemplate: Mock<(template: unknown) => Record<string, unknown>>;
  };
  screen: {
    getDisplayNearestPoint: Mock<
      () => { workArea: { x: number; y: number; width: number; height: number } }
    >;
  };
  nativeImage: {
    createFromPath: Mock<(path: string) => MockNativeImage>;
    createEmpty: Mock<() => MockEmptyNativeImage>;
  };
  powerSaveBlocker: {
    start: Mock<(type: string) => number>;
    stop: Mock<(id: number) => void>;
    isStarted: Mock<(id: number) => boolean>;
  };
  powerMonitor: {
    on: Mock<(event: string, listener: (...args: unknown[]) => void) => void>;
    off: Mock<(event: string, listener: (...args: unknown[]) => void) => void>;
    isOnBatteryPower: Mock<() => boolean>;
  };
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

const electronMock: MockElectronAPI = {
  app: {
    getVersion: vi.fn<() => string>().mockReturnValue("1.0.0"),
    quit: vi.fn<() => void>(),
    dock: { hide: vi.fn<() => void>(), show: vi.fn<() => Promise<void>>() },
    isPackaged: false,
    setAboutPanelOptions: vi.fn<(opts: unknown) => void>(),
    whenReady: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
    showAboutPanel: vi.fn<() => void>(),
    getPath: vi.fn<(name: string) => string>().mockReturnValue("/tmp/test-user-data"),
    getAppPath: vi.fn<() => string>().mockReturnValue("/path/to/app.asar"),
  },
  ipcMain: {
    handle: vi.fn<(channel: string, listener: (...args: unknown[]) => unknown) => void>(),
    on: vi.fn<(channel: string, listener: (...args: unknown[]) => void) => void>(),
    off: vi.fn<(channel: string, listener: (...args: unknown[]) => void) => void>(),
  },
  shell: {
    openExternal: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
  },
  dialog: {
    showErrorBox: vi.fn<(title: string, content: string) => void>(),
    showMessageBox: vi
      .fn<(opts: unknown) => Promise<{ response: number }>>()
      .mockResolvedValue({ response: 0 }),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
  },
  BrowserWindow: Object.assign(
    vi.fn<() => MockBrowserWindowInstance>().mockImplementation(() => ({
      loadURL: vi.fn<(url: string) => void>(),
      loadFile: vi.fn<(file: string) => void>(),
      show: vi.fn<() => void>(),
      hide: vi.fn<() => void>(),
      focus: vi.fn<() => void>(),
      destroy: vi.fn<() => void>(),
      isVisible: vi.fn<() => boolean>().mockReturnValue(false),
      getBounds: vi
        .fn<() => { x: number; y: number; width: number; height: number }>()
        .mockReturnValue({ x: 0, y: 0, width: 360, height: 480 }),
      setPosition: vi.fn<(x: number, y: number) => void>(),
      setSize: vi.fn<(width: number, height: number) => void>(),
      setAlwaysOnTop: vi.fn<(flag: boolean) => void>(),
      on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
      removeListener:
        vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
      isDestroyed: vi.fn<() => boolean>().mockReturnValue(false),
      webContents: {
        send: vi.fn<(channel: string, ...args: unknown[]) => void>(),
        on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
        setWindowOpenHandler: vi.fn<(handler: (details: unknown) => unknown) => void>(),
      },
    })),
    {
      getAllWindows: vi.fn<() => MockBrowserWindowInstance[]>().mockReturnValue([]),
    },
  ) as MockBrowserWindowConstructor,
  Notification: vi.fn<() => MockNotificationInstance>().mockImplementation(() => ({
    show: vi.fn<() => void>(),
  })),
  Tray: vi.fn<() => MockTrayInstance>().mockImplementation(() => ({
    setToolTip: vi.fn<(tip: string) => void>(),
    setTitle: vi.fn<(title: string) => void>(),
    setImage: vi.fn<(image: unknown) => void>(),
    on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
    getBounds: vi
      .fn<() => { x: number; y: number; width: number; height: number }>()
      .mockReturnValue({ x: 100, y: 0, width: 22, height: 22 }),
    popUpContextMenu: vi.fn<(menu?: unknown) => void>(),
  })),
  Menu: {
    buildFromTemplate: vi
      .fn<(template: unknown) => Record<string, unknown>>()
      .mockReturnValue({}),
  },
  screen: {
    getDisplayNearestPoint: vi
      .fn<() => { workArea: { x: number; y: number; width: number; height: number } }>()
      .mockReturnValue({
        workArea: { x: 0, y: 0, width: 1440, height: 900 },
      }),
  },
  nativeImage: {
    createFromPath: vi.fn<(path: string) => MockNativeImage>().mockReturnValue({
      toPNG: vi.fn<() => Buffer>().mockReturnValue(Buffer.alloc(0)),
      isEmpty: vi.fn<() => boolean>().mockReturnValue(false),
    }),
    createEmpty: vi.fn<() => MockEmptyNativeImage>().mockReturnValue({
      addRepresentation: vi.fn<(opts: unknown) => void>(),
      setTemplateImage: vi.fn<(flag: boolean) => void>(),
    }),
  },
  powerSaveBlocker: {
    start: vi.fn<(type: string) => number>().mockReturnValue(1),
    stop: vi.fn<(id: number) => void>(),
    isStarted: vi.fn<(id: number) => boolean>().mockReturnValue(true),
  },
  powerMonitor: {
    on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
    off: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
    isOnBatteryPower: vi.fn<() => boolean>().mockReturnValue(false),
  },
};

// electron/main + electron/common → electron via vitest project alias
vi.mock("electron", () => electronMock);
// electron/main and electron/common resolve to "electron" via vitest alias (see vitest.workspace.ts).
