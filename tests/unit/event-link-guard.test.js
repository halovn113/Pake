import fs from "fs";
import path from "path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function loadEventHelpers({
  withTauri = false,
  userAgent = "Mozilla/5.0",
  initialZoom = null,
  downloadError = null,
  appWindowError = null,
  nativeDownloads = false,
  topWindow = null,
} = {}) {
  const source = ["link_policy.js", "event.js"]
    .map((file) =>
      fs.readFileSync(
        path.join(process.cwd(), "src-tauri/src/inject", file),
        "utf-8",
      ),
    )
    .join("\n");

  const invokeCalls = [];
  const nativeDownloadClicks = [];
  const invoke = (command, payload) => {
    invokeCalls.push([command, payload]);
    if (command === "open_app_link" && appWindowError) return Promise.reject(appWindowError);
    if (command === "download_file" && downloadError)
      return Promise.reject(downloadError);
    return Promise.resolve();
  };
  const eventListeners = {};
  const elementsById = new Map();
  const localStorageValues = new Map();
  if (initialZoom !== null) {
    localStorageValues.set("htmlZoom", initialZoom);
  }
  const registerListener = (type, handler, options) => {
    eventListeners[type] = eventListeners[type] || [];
    eventListeners[type].push({ handler, options });
  };
  const createElement = (tagName = "div") => ({
    tagName: tagName.toUpperCase(),
    style: {},
    children: [],
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    getBoundingClientRect: () => ({
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
    }),
    appendChild(child) {
      this.children.push(child);
      if (child.id) elementsById.set(child.id, child);
    },
    removeChild(child) {
      this.children = this.children.filter((item) => item !== child);
      if (child.id) elementsById.delete(child.id);
    },
    click() {
      nativeDownloadClicks.push([this.href, this.download]);
      // A transient native-download anchor still passes through document capture.
      getClickGuard({ eventListeners })(makeClickEvent(this));
    },
    closest() {
      return this;
    },
    getAttribute(name) {
      return name === "href" ? this.href : "";
    },
    set id(value) {
      this._id = value;
      elementsById.set(value, this);
    },
    get id() {
      return this._id;
    },
  });
  const body = createElement("body");
  body.scrollHeight = 0;

  const context = {
    console,
    URL,
    Event,
    EventTarget,
    Notification: function Notification() {},
    setTimeout,
    clearTimeout,
    scrollTo: () => {},
    navigator: {
      userAgent,
      language: "en-US",
    },
    window: {
      frames: [],
      innerWidth: 1024,
      innerHeight: 768,
      matchMedia: () => ({ matches: false }),
      history: {
        back: () => {},
        forward: () => {},
      },
      location: {
        href: "https://example.com/app",
        protocol: "https:",
        origin: "https://example.com",
        pathname: "/app",
        reload: () => {},
      },
      localStorage: {
        getItem: (key) => localStorageValues.get(key) ?? null,
        setItem: (key, value) => {
          localStorageValues.set(key, value);
        },
      },
      addEventListener: registerListener,
      dispatchEvent: () => {},
      open: () => ({}),
      isAuthLink: () => false,
      isAuthPopup: () => false,
      pakeConfig: {},
      pakeNativeDownloads: nativeDownloads,
    },
    document: {
      addEventListener: registerListener,
      createElement,
      getElementById: (id) => elementsById.get(id) || null,
      getElementsByTagName: () => [{ style: {} }],
      body,
      execCommand: () => {},
    },
  };
  context.window.navigator = context.navigator;
  context.window.top = topWindow || context.window;
  if (withTauri) {
    context.window.__TAURI__ = {
      core: { invoke },
      window: {
        getCurrentWindow: () => ({
          startDragging: () => {},
          isFullscreen: () => Promise.resolve(false),
          setFullscreen: () => {},
        }),
      },
    };
  }

  runInNewContext(source, context);
  return {
    ...context,
    eventListeners,
    invokeCalls,
    localStorageValues,
    nativeDownloadClicks,
  };
}

function runDomReady(context) {
  context.eventListeners.DOMContentLoaded[0].handler();
}

function getClickGuard(context) {
  return context.eventListeners.click.find(
    ({ handler }) => handler.name === "detectAnchorElementClick",
  ).handler;
}

function makeAnchor(href, target = "_blank") {
  return {
    href,
    target,
    download: "",
    getAttribute: (name) => (name === "href" ? href : ""),
  };
}

function makeClickEvent(anchor) {
  return {
    target: {
      closest: () => anchor,
    },
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  };
}

describe("event link guard", () => {
  it.each([
    [
      "blob:https://example.com/abc",
      [
        "Download Image",
        "Save Image As…",
        "Copy Image",
        "Temporary media — no shareable link",
        "Reload page",
      ],
    ],
    [
      "data:image/png;base64,AAAA",
      [
        "Download Image",
        "Save Image As…",
        "Copy Image",
        "Temporary media — no shareable link",
        "Reload page",
      ],
    ],
    [
      "https://cdn.example.com/image.png",
      [
        "Download Image",
        "Save Image As…",
        "Copy Image",
        "Copy Address",
        "Open in Browser",
        "Reload page",
      ],
    ],
  ])("only offers portable address actions for %s", (url, expected) => {
    const context = loadEventHelpers({ withTauri: true });
    runDomReady(context);
    const listener = context.eventListeners.contextmenu[0].handler;
    listener({
      target: { tagName: "IMG", src: url, closest: () => null },
      clientX: 10,
      clientY: 10,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    const menu = context.document.getElementById("pake-context-menu");
    expect(menu.children.map((item) => item.textContent)).toEqual(expected);
  });

  it.each(["A", "IMG"])("opens same-origin %s links in another app window", (tagName) => {
    const context = loadEventHelpers({ withTauri: true });
    context.navigator.platform = "Win32";
    runDomReady(context);
    const link = { href: "https://example.com/watch?v=2" };
    const target = { tagName, src: "https://example.com/image.png", closest: (selector) => selector === "a" ? link : null };
    context.eventListeners.contextmenu[0].handler({ target, clientX: 10, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    const menu = context.document.getElementById("pake-context-menu");
    const action = menu.children.find((item) => item.textContent === "Open in a new app window");
    expect(action).toBeDefined();
    action.listeners.click({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(context.invokeCalls).toContainEqual(["open_app_link", { url: link.href }]);
  });

  it("reports failure when opening a new app window is rejected", async () => {
    const context = loadEventHelpers({ withTauri: true, appWindowError: new Error("unavailable") });
    context.navigator.platform = "Win32";
    context.window.pakeToast = vi.fn();
    runDomReady(context);
    const target = { tagName: "A", href: "https://example.com/watch?v=2", closest: (selector) => selector === "a" ? target : null };
    context.eventListeners.contextmenu[0].handler({ target, clientX: 10, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    const action = context.document.getElementById("pake-context-menu").children.find((item) => item.textContent === "Open in a new app window");
    action.listeners.click({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    await vi.waitFor(() => expect(context.window.pakeToast).toHaveBeenCalledWith("Could not open a new app window"));
  });

  it("does not offer app-window action for a cross-origin link", () => {
    const context = loadEventHelpers({ withTauri: true });
    context.navigator.platform = "Win32";
    runDomReady(context);
    const target = { tagName: "A", href: "https://other.example/", closest: (selector) => selector === "a" ? target : null };
    context.eventListeners.contextmenu[0].handler({ target, clientX: 10, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(context.document.getElementById("pake-context-menu").children.some((item) => item.textContent === "Open in a new app window")).toBe(false);
  });

  it("reloads the current webview from the page context menu", () => {
    const context = loadEventHelpers({ withTauri: true });
    runDomReady(context);
    const listener = context.eventListeners.contextmenu[0].handler;
    listener({ target: { tagName: "IMG", src: "https://example.com/image.png", closest: () => null }, clientX: 10, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    const menu = context.document.getElementById("pake-context-menu");
    const reload = menu.children.find((item) => item.textContent === "Reload page");
    expect(reload).toBeDefined();
    reload.listeners.click({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(context.invokeCalls).toContainEqual(["webview_navigate", { action: "reload" }]);
  });

  it("keeps the native context menu on ordinary page content", () => {
    const context = loadEventHelpers({ withTauri: true });
    runDomReady(context);
    const preventDefault = vi.fn();
    context.eventListeners.contextmenu[0].handler({ target: { tagName: "DIV", closest: () => null }, preventDefault, stopPropagation: vi.fn() });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(context.document.getElementById("pake-context-menu")).toBeNull();
  });

  it("keeps native editing context menus", () => {
    const context = loadEventHelpers({ withTauri: true });
    runDomReady(context);
    const preventDefault = vi.fn();
    context.eventListeners.contextmenu[0].handler({ target: { tagName: "INPUT", closest: (selector) => selector === "a" ? null : {} }, preventDefault, stopPropagation: vi.fn() });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("uses the page address for temporary video streams instead of the blob URL", async () => {
    const context = loadEventHelpers({ withTauri: true });
    context.navigator.clipboard = { writeText: vi.fn().mockResolvedValue() };
    runDomReady(context);
    context.eventListeners.contextmenu[0].handler({ target: { tagName: "VIDEO", src: "blob:https://example.com/stream", closest: () => null }, clientX: 10, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() });
    const items = context.document.getElementById("pake-context-menu").children;
    expect(items.map((item) => item.textContent)).toEqual(["Download Video", "Temporary video stream — download may fail", "Copy page address", "Open page in browser", "Reload page"]);
    const click = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    items[2].listeners.click(click);
    expect(context.navigator.clipboard.writeText).toHaveBeenCalledWith("https://example.com/app");
    items[3].listeners.click(click);
    expect(context.invokeCalls).toContainEqual(["plugin:shell|open", { path: "https://example.com/app" }]);
  });

  it("keeps blob image downloads on the native download path", () => {
    const context = loadEventHelpers({ withTauri: true });
    runDomReady(context);
    const url = "blob:https://example.com/abc";
    context.eventListeners.contextmenu[0].handler({
      target: { tagName: "IMG", src: url, closest: () => null },
      clientX: 10,
      clientY: 10,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    const menu = context.document.getElementById("pake-context-menu");
    menu.children[0].listeners.click({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(context.nativeDownloadClicks).toHaveLength(1);
    expect(context.nativeDownloadClicks[0][0]).toBe(url);
    expect(context.invokeCalls).not.toContainEqual([
      "plugin:shell|open",
      { path: url },
    ]);
  });

  it("shows address-copy success only after the clipboard write resolves", async () => {
    const context = loadEventHelpers({ withTauri: true });
    let finish;
    context.navigator.clipboard = {
      writeText: vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    };
    context.window.pakeToast = vi.fn();
    runDomReady(context);
    context.eventListeners.contextmenu[0].handler({
      target: {
        tagName: "IMG",
        src: "https://example.com/a.png",
        closest: () => null,
      },
      clientX: 10,
      clientY: 10,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    context.document
      .getElementById("pake-context-menu")
      .children[3].listeners.click({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    expect(context.window.pakeToast).not.toHaveBeenCalled();
    finish();
    await Promise.resolve();
    expect(context.window.pakeToast).toHaveBeenCalledWith("Address copied");
  });

  it("saves the image to the chosen file before showing success", async () => {
    const context = loadEventHelpers({ withTauri: true });
    const image = { type: "image/png" };
    const writable = {
      write: vi.fn().mockResolvedValue(),
      close: vi.fn().mockResolvedValue(),
      abort: vi.fn(),
    };
    context.window.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, blob: async () => image });
    context.window.showSaveFilePicker = vi
      .fn()
      .mockResolvedValue({ createWritable: async () => writable });
    context.window.pakeToast = vi.fn();
    runDomReady(context);
    context.eventListeners.contextmenu[0].handler({
      target: {
        tagName: "IMG",
        src: "blob:https://example.com/abc",
        closest: () => null,
      },
      clientX: 10,
      clientY: 10,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    context.document
      .getElementById("pake-context-menu")
      .children[1].listeners.click({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    await vi.waitFor(() =>
      expect(context.window.pakeToast).toHaveBeenCalledWith("Image saved"),
    );
    expect(writable.write).toHaveBeenCalledWith(image);
    expect(writable.close).toHaveBeenCalledOnce();
  });

  it("reports clipboard failures without claiming the image was copied", async () => {
    const context = loadEventHelpers({ withTauri: true });
    context.window.pakeToast = vi.fn();
    context.navigator.clipboard = {};
    runDomReady(context);
    context.eventListeners.contextmenu[0].handler({
      target: {
        tagName: "IMG",
        src: "blob:https://example.com/abc",
        closest: () => null,
      },
      clientX: 10,
      clientY: 10,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    context.document
      .getElementById("pake-context-menu")
      .children[2].listeners.click({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    expect(context.window.pakeToast).toHaveBeenCalledWith(
      "Could not access image or clipboard",
    );
    expect(context.window.pakeToast).not.toHaveBeenCalledWith("Image copied");
  });

  it("copies decoded image data as PNG and reports success after clipboard completion", async () => {
    const context = loadEventHelpers({ withTauri: true });
    const png = { type: "image/png" };
    const bitmap = { width: 4, height: 4, close: vi.fn() };
    const originalCreate = context.document.createElement;
    context.document.createElement = (tag) =>
      tag === "canvas"
        ? {
            getContext: () => ({ drawImage: vi.fn() }),
            toBlob: (callback) => callback(png),
          }
        : originalCreate(tag);
    context.window.fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        blob: async () => ({ type: "image/jpeg" }),
      });
    context.window.createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    context.window.ClipboardItem = class {
      constructor(data) {
        this.data = data;
      }
    };
    context.navigator.clipboard = {
      write: vi.fn(async ([item]) => {
        expect(await item.data["image/png"]).toBe(png);
      }),
    };
    context.window.pakeToast = vi.fn();
    runDomReady(context);
    context.eventListeners.contextmenu[0].handler({
      target: {
        tagName: "IMG",
        src: "blob:https://example.com/abc",
        closest: () => null,
      },
      clientX: 10,
      clientY: 10,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    context.document
      .getElementById("pake-context-menu")
      .children[2].listeners.click({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    await vi.waitFor(() =>
      expect(context.window.pakeToast).toHaveBeenCalledWith("Image copied"),
    );
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it("uses native Windows downloads once for same-origin files without IPC", () => {
    const context = loadEventHelpers({
      withTauri: true,
      nativeDownloads: true,
    });
    runDomReady(context);
    const anchor = makeAnchor("https://example.com/report.pdf", "_self");
    anchor.download = "report.pdf";
    const click = makeClickEvent(anchor);
    getClickGuard(context)(click);
    expect(click.preventDefault).toHaveBeenCalledOnce();
    expect(context.nativeDownloadClicks).toEqual([[anchor.href, "report.pdf"]]);
    expect(
      context.invokeCalls.filter(([command]) => command === "download_file"),
    ).toEqual([]);
  });

  it("keeps cross-origin forced downloads on HTTP when the browser may preview them", () => {
    const context = loadEventHelpers({
      withTauri: true,
      nativeDownloads: true,
    });
    runDomReady(context);
    const anchor = makeAnchor("https://cdn.example.com/report.pdf", "_self");
    anchor.download = "report.pdf";
    getClickGuard(context)(makeClickEvent(anchor));
    expect(context.nativeDownloadClicks).toEqual([]);
    expect(
      context.invokeCalls.filter(([command]) => command === "download_file"),
    ).toEqual([
      [
        "download_file",
        {
          params: {
            url: anchor.href,
            filename: "report.pdf",
            language: "en-US",
            user_agent: "Mozilla/5.0",
            page_url: "https://example.com/app",
          },
        },
      ],
    ]);
  });

  it.each([
    'download_file not allowed on window "pake", webview "pake", URL: https://other.example/',
    "Command download_file not allowed by ACL",
  ])(
    "falls back once to browser downloads on ACL denial: %s",
    async (downloadError) => {
      const context = loadEventHelpers({ withTauri: true, downloadError });
      runDomReady(context);
      const anchor = makeAnchor("https://example.com/report.pdf", "_self");
      anchor.download = "report.pdf";
      getClickGuard(context)(makeClickEvent(anchor));
      await vi.waitFor(() =>
        expect(context.nativeDownloadClicks).toEqual([
          [anchor.href, "report.pdf"],
        ]),
      );
      expect(
        context.invokeCalls.filter(([command]) => command === "download_file"),
      ).toHaveLength(1);
    },
  );

  it("does not retry failed HTTP downloads through the browser", async () => {
    const context = loadEventHelpers({
      withTauri: true,
      downloadError: "Download failed with HTTP status 403 Forbidden",
    });
    runDomReady(context);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      getClickGuard(context)(
        makeClickEvent(makeAnchor("https://example.com/report.pdf", "_self")),
      );
      await vi.waitFor(() => expect(log).toHaveBeenCalled());
      expect(context.nativeDownloadClicks).toEqual([]);
    } finally {
      log.mockRestore();
    }
  });

  it.each([undefined, "", "  ", "about:blank", "about:blank#download"])(
    "preserves a native blank popup proxy for %s",
    (url) => {
      const context = loadEventHelpers({ withTauri: true });
      const popup = { location: { href: "about:blank" } };
      const nativeOpen = vi.fn(() => popup);
      context.window.open = nativeOpen;
      runDomReady(context);
      const result = context.window.open(url, "_blank");
      expect(result).toBe(popup);
      expect(nativeOpen).toHaveBeenCalledWith(
        url === undefined || !url.trim() ? "about:blank" : url,
        "_blank",
        undefined,
      );
      result.location.href = "https://cdn.example.net/attachment";
      expect(context.window.location.href).toBe("https://example.com/app");
      expect(
        context.invokeCalls.filter(([cmd]) => cmd === "plugin:shell|open"),
      ).toEqual([]);
    },
  );

  it.each(["https://outside.example/report", "https://example.com/report"])(
    "retains the default route for a new named context: %s",
    (url) => {
      const context = loadEventHelpers({ withTauri: true });
      context.window.open = vi.fn(() => null);
      runDomReady(context);
      context.window.open(url, "reportWindow");
      if (url.startsWith("https://outside.example/")) {
        expect(context.invokeCalls).toContainEqual([
          "plugin:shell|open",
          { path: url },
        ]);
      } else {
        expect(context.window.location.href).toBe(url);
      }
    },
  );

  it.each([
    ["internal", "https://example.com/forced", {}],
    ["auth", "https://accounts.google.com/o/oauth2/auth", {}],
    [
      "forced internal",
      "https://outside.example/forced",
      { force_internal_navigation: true },
    ],
    [
      "regex internal",
      "https://outside.example/forced",
      { internal_url_regex: "outside\\.example" },
    ],
  ])(
    "rejects forged %s frame messages without navigating or opening windows",
    (_kind, url, config) => {
      const context = loadEventHelpers({
        withTauri: true,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5)",
      });
      context.window.pakeConfig = config;
      context.window.isAuthLink = context.window.isAuthPopup = (value) =>
        value.includes("accounts.google.com");
      const nativeOpen = vi.fn(() => ({}));
      context.window.open = nativeOpen;
      runDomReady(context);
      const frame = { frames: [] };
      context.window.frames.push(frame);
      context.eventListeners.message[0].handler({
        source: frame,
        data: { type: "pake:frame-external-link", url },
      });
      expect(context.window.location.href).toBe("https://example.com/app");
      expect(nativeOpen).not.toHaveBeenCalled();
      expect(
        context.invokeCalls.filter(
          ([command]) => command === "plugin:shell|open",
        ),
      ).toEqual([]);
    },
  );

  it("routes early frame messages once after readiness and rechecks live sources", () => {
    const context = loadEventHelpers({ withTauri: true });
    const live = { frames: [] };
    const removed = { frames: [] };
    context.window.frames.push(live, removed);
    const listener = context.eventListeners.message?.[0]?.handler;
    expect(listener).toBeTypeOf("function");
    for (const [source, suffix] of [
      [live, "first"],
      [live, "second"],
      [removed, "removed"],
    ]) {
      listener({
        source,
        data: {
          type: "pake:frame-external-link",
          url: `https://outside.example/${suffix}`,
        },
      });
    }
    expect(context.invokeCalls).toEqual([]);
    context.window.frames.pop();
    runDomReady(context);
    expect(
      context.invokeCalls.filter(
        ([command]) => command === "plugin:shell|open",
      ),
    ).toEqual([
      ["plugin:shell|open", { path: "https://outside.example/first" }],
      ["plugin:shell|open", { path: "https://outside.example/second" }],
    ]);
    expect(context.eventListeners.DOMContentLoaded).toHaveLength(1);
  });

  it("discards a departing document's queued frame messages", () => {
    const context = loadEventHelpers({ withTauri: true });
    const frame = { frames: [] };
    context.window.frames.push(frame);
    const listener = context.eventListeners.message?.[0]?.handler;
    expect(listener).toBeTypeOf("function");
    listener({
      source: frame,
      data: {
        type: "pake:frame-external-link",
        url: "https://outside.example/old",
      },
    });
    context.eventListeners.pagehide[0].handler();
    runDomReady(context);
    expect(
      context.invokeCalls.filter(
        ([command]) => command === "plugin:shell|open",
      ),
    ).toEqual([]);
  });

  it("routes only descendant-frame messages with supported URL protocols", () => {
    const context = loadEventHelpers({ withTauri: true });
    runDomReady(context);
    const frame = { frames: [] };
    context.window.frames.push(frame);
    const listener = context.eventListeners.message[0].handler;
    const send = (source, url) =>
      listener({ source, data: { type: "pake:frame-external-link", url } });
    send(frame, "https://outside.example/article");
    expect(context.invokeCalls).toContainEqual([
      "plugin:shell|open",
      { path: "https://outside.example/article" },
    ]);
    const count = context.invokeCalls.length;
    send({ frames: [] }, "https://outside.example/unrelated");
    send(frame, "file:///tmp/example");
    send(frame, "javascript:alert(1)");
    send(null, "https://outside.example/opaque");
    expect(context.invokeCalls).toHaveLength(count);
  });
  it("falls back from malformed saved zoom values", () => {
    const context = loadEventHelpers({
      withTauri: true,
      initialZoom: "not-a-zoom",
    });

    context.zoomIn();
    context.zoomOut();

    expect(context.invokeCalls).toEqual([
      ["set_zoom", { percent: 110 }],
      ["set_zoom", { percent: 100 }],
    ]);
    expect(context.localStorageValues.get("htmlZoom")).toBe("100%");
  });

  it("bypasses javascript pseudo-links", () => {
    const { shouldBypassPakeLinkHandling } = loadEventHelpers();

    expect(shouldBypassPakeLinkHandling("javascript:void(0)")).toBe(true);
  });

  it("bypasses hash-only anchors", () => {
    const { shouldBypassPakeLinkHandling } = loadEventHelpers();

    expect(shouldBypassPakeLinkHandling("#captcha-confirm")).toBe(true);
  });

  it("keeps normal navigations under Pake handling", () => {
    const { shouldBypassPakeLinkHandling } = loadEventHelpers();

    expect(shouldBypassPakeLinkHandling("https://example.com/account")).toBe(
      false,
    );
  });

  it("navigates GitHub release pages instead of downloading them as documents", () => {
    const context = loadEventHelpers({ withTauri: true });
    context.window.location.href = "https://github.com/owner/repo/releases";
    runDomReady(context);

    const event = makeClickEvent(
      makeAnchor("https://github.com/owner/repo/releases/tag/v1.28.3", "_self"),
    );
    getClickGuard(context)(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(context.invokeCalls).not.toContainEqual([
      "download_file",
      expect.anything(),
    ]);
  });

  it("still downloads files linked from GitHub releases", () => {
    const context = loadEventHelpers({ withTauri: true });
    context.window.location.href = "https://github.com/owner/repo/releases";
    runDomReady(context);

    const event = makeClickEvent(
      makeAnchor(
        "https://github.com/owner/repo/releases/download/v1.28.3/app.dmg",
        "_self",
      ),
    );
    getClickGuard(context)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(context.invokeCalls).toContainEqual([
      "download_file",
      {
        params: {
          url: "https://github.com/owner/repo/releases/download/v1.28.3/app.dmg",
          filename: "app.dmg",
          language: "en-US",
          page_url: "https://github.com/owner/repo/releases",
          user_agent: "Mozilla/5.0",
        },
      },
    ]);
  });

  it("navigates SPA routes under /assets/ instead of treating them as downloads", () => {
    const context = loadEventHelpers({ withTauri: true });
    context.window.location.href = "https://www.mexc.com/";
    context.window.location.origin = "https://www.mexc.com";
    context.window.location.pathname = "/";
    runDomReady(context);

    const event = makeClickEvent(
      makeAnchor("https://www.mexc.com/assets/future", "_self"),
    );
    getClickGuard(context)(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(context.invokeCalls).not.toContainEqual([
      "download_file",
      expect.anything(),
    ]);
    expect(
      context.isDownloadableFile("https://www.mexc.com/assets/future"),
    ).toBe(false);
  });

  it("still downloads real files that live under /assets/ by extension", () => {
    const { isDownloadableFile } = loadEventHelpers();

    expect(
      isDownloadableFile("https://cdn.example.com/assets/export/report.pdf"),
    ).toBe(true);
    expect(
      isDownloadableFile("https://cdn.example.com/assets/pkg/app.zip"),
    ).toBe(true);
  });

  it("keeps intentional download-path interception for extensionless /download/ links", () => {
    const { isDownloadableFile } = loadEventHelpers();

    expect(isDownloadableFile("https://example.com/download/export")).toBe(
      true,
    );
    // Real files under /files/ still match by extension, not the path root.
    expect(isDownloadableFile("https://example.com/files/report.pdf")).toBe(
      true,
    );
  });

  it("does not treat /files/ SPA routes without a file extension as downloads", () => {
    const { isDownloadableFile } = loadEventHelpers();

    expect(isDownloadableFile("https://drive.example.com/files/inbox")).toBe(
      false,
    );
    expect(
      isDownloadableFile("https://app.example.com/attachments/latest"),
    ).toBe(false);
  });

  it("does not treat static /dist/ SPA paths as downloads without a file extension", () => {
    const { isDownloadableFile } = loadEventHelpers();

    expect(isDownloadableFile("https://example.com/dist/app")).toBe(false);
  });

  it("does not force-download ordinary links on Cmd/Ctrl+click", () => {
    const context = loadEventHelpers({ withTauri: true });
    runDomReady(context);

    const event = makeClickEvent(
      makeAnchor("https://example.com/app/settings", "_self"),
    );
    event.metaKey = true;
    event.ctrlKey = true;
    getClickGuard(context)(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(context.invokeCalls).not.toContainEqual([
      "download_file",
      expect.anything(),
    ]);
  });

  it("still downloads when the anchor has a download attribute", () => {
    const context = loadEventHelpers({ withTauri: true });
    runDomReady(context);

    const anchor = makeAnchor("https://example.com/app/settings", "_self");
    anchor.download = "settings.html";
    const event = makeClickEvent(anchor);
    getClickGuard(context)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(context.invokeCalls).toContainEqual([
      "download_file",
      {
        params: {
          url: "https://example.com/app/settings",
          filename: "settings.html",
          language: "en-US",
          page_url: "https://example.com/app",
          user_agent: "Mozilla/5.0",
        },
      },
    ]);
  });

  it("does not treat navigable web formats as downloads by extension alone", () => {
    const { isDownloadableFile } = loadEventHelpers();

    expect(isDownloadableFile("https://example.com/api/config.json")).toBe(
      false,
    );
    expect(isDownloadableFile("https://example.com/docs/app.js")).toBe(false);
    expect(isDownloadableFile("https://example.com/theme.css")).toBe(false);
    // Binary / archive extensions still download.
    expect(isDownloadableFile("https://example.com/report.pdf")).toBe(true);
    expect(isDownloadableFile("https://example.com/pkg.zip")).toBe(true);
  });

  it("scopes root domains correctly for multi-part public suffixes", () => {
    const { getRootDomain } = loadEventHelpers();

    expect(getRootDomain("www.amazon.co.uk")).toBe("amazon.co.uk");
    expect(getRootDomain("evil.co.uk")).toBe("evil.co.uk");
    expect(getRootDomain("www.amazon.co.uk")).not.toBe(
      getRootDomain("evil.co.uk"),
    );
    expect(getRootDomain("alice.github.io")).toBe("alice.github.io");
    expect(getRootDomain("bob.github.io")).toBe("bob.github.io");
    expect(getRootDomain("m.bilibili.com")).toBe("bilibili.com");
    expect(getRootDomain("www.bilibili.com")).toBe("bilibili.com");
  });

  it("navigates macOS auth URLs in the current window", () => {
    const { openAuthNavigation, window } = loadEventHelpers({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5)",
    });
    const openCalls = [];
    const originalWindowOpen = (url, name, specs) => {
      openCalls.push({ url, name, specs });
      return {};
    };

    const result = openAuthNavigation(
      originalWindowOpen,
      "https://www.linkedin.com/login",
      "_blank",
      "width=1200,height=800",
    );

    expect(openCalls).toEqual([]);
    expect(window.location.href).toBe("https://www.linkedin.com/login");
    expect(result).toBe(window);
  });

  it("navigates Linux auth URLs in the current window", () => {
    const { openAuthNavigation, window } = loadEventHelpers({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    });
    const originalWindowOpen = vi.fn(() => ({}));

    const result = openAuthNavigation(
      originalWindowOpen,
      "https://accounts.google.com/o/oauth2/auth",
      "_blank",
      "width=1200,height=800",
    );

    expect(originalWindowOpen).not.toHaveBeenCalled();
    expect(window.location.href).toBe(
      "https://accounts.google.com/o/oauth2/auth",
    );
    expect(result).toBe(window);
  });

  it("keeps Windows auth URLs on the native popup path", () => {
    const popup = {};
    const { openAuthNavigation, window } = loadEventHelpers({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    const originalWindowOpen = vi.fn(() => popup);

    const result = openAuthNavigation(
      originalWindowOpen,
      "https://accounts.google.com/o/oauth2/auth",
      "_blank",
      "width=1200,height=800",
    );

    expect(originalWindowOpen).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/auth",
      "_blank",
      "width=1200,height=800",
    );
    expect(window.location.href).toBe("https://example.com/app");
    expect(result).toBe(popup);
  });

  it("keeps blank macOS auth popups on the native popup path", () => {
    const popup = {};
    const { openAuthNavigation, window } = loadEventHelpers({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5)",
    });
    const openCalls = [];
    const originalWindowOpen = (url, name, specs) => {
      openCalls.push({ url, name, specs });
      return popup;
    };

    const result = openAuthNavigation(
      originalWindowOpen,
      "about:blank",
      "login",
      "width=1200,height=800",
    );

    expect(openCalls).toEqual([
      {
        url: "about:blank",
        name: "login",
        specs: "width=1200,height=800",
      },
    ]);
    expect(window.location.href).toBe("https://example.com/app");
    expect(result).toBe(popup);
  });

  it("keeps named Apple auth popups on the native popup path on macOS", () => {
    const popup = {};
    const { openAuthNavigation, window } = loadEventHelpers({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5)",
    });
    const openCalls = [];
    const originalWindowOpen = (url, name, specs) => {
      openCalls.push({ url, name, specs });
      return popup;
    };

    const result = openAuthNavigation(
      originalWindowOpen,
      "https://example.com/apple/login",
      "AppleAuthentication",
      "width=1200,height=800",
    );

    expect(openCalls).toEqual([
      {
        url: "https://example.com/apple/login",
        name: "AppleAuthentication",
        specs: "width=1200,height=800",
      },
    ]);
    expect(window.location.href).toBe("https://example.com/app");
    expect(result).toBe(popup);
  });

  it("keeps appleid auth URL popups on the native popup path on macOS", () => {
    const popup = {};
    const { openAuthNavigation, window } = loadEventHelpers({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5)",
    });
    const openCalls = [];
    const originalWindowOpen = (url, name, specs) => {
      openCalls.push({ url, name, specs });
      return popup;
    };

    const result = openAuthNavigation(
      originalWindowOpen,
      "https://appleid.apple.com/auth/authorize",
      "_blank",
      "width=1200,height=800",
    );

    expect(openCalls).toEqual([
      {
        url: "https://appleid.apple.com/auth/authorize",
        name: "_blank",
        specs: "width=1200,height=800",
      },
    ]);
    expect(window.location.href).toBe("https://example.com/app");
    expect(result).toBe(popup);
  });

  it("falls back to current-window navigation if an Apple auth popup is blocked", () => {
    const { openAuthNavigation, window } = loadEventHelpers({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5)",
    });
    const originalWindowOpen = vi.fn(() => null);

    const result = openAuthNavigation(
      originalWindowOpen,
      "https://appleid.apple.com/auth/authorize",
      "_blank",
      "width=1200,height=800",
    );

    expect(originalWindowOpen).toHaveBeenCalledWith(
      "https://appleid.apple.com/auth/authorize",
      "_blank",
      "width=1200,height=800",
    );
    expect(window.location.href).toBe(
      "https://appleid.apple.com/auth/authorize",
    );
    expect(result).toBe(window);
  });

  it("navigates target blank auth links in-place when new-window is disabled", () => {
    const context = loadEventHelpers({ withTauri: true });
    context.window.pakeConfig = { new_window: false };
    context.window.isAuthLink = (url) => url.includes("okta.com");
    runDomReady(context);

    const event = makeClickEvent(
      makeAnchor("https://mycompany.okta.com/sso", "_blank"),
    );
    getClickGuard(context)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(context.window.location.href).toBe("https://mycompany.okta.com/sso");
  });

  it("retargets internal target=_blank links to _self instead of forcing a reload", () => {
    const context = loadEventHelpers({ withTauri: true });
    context.window.pakeConfig = {
      new_window: false,
      internal_url_regex: "^https://app\\.example\\.com",
    };
    runDomReady(context);

    const anchor = makeAnchor("https://app.example.com/callback", "_blank");
    const event = makeClickEvent(anchor);
    getClickGuard(context)(event);

    // The link must be neutralized so the native webview never opens a system
    // browser window, but the page's own click handler (and a normal in-app
    // navigation) should still run -- so we do NOT preventDefault / reload.
    expect(anchor.target).toBe("_self");
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(context.window.location.href).toBe("https://example.com/app");
  });

  it("still opens external target=_blank links in the system browser", () => {
    const context = loadEventHelpers({ withTauri: true });
    context.window.pakeConfig = { new_window: false };
    runDomReady(context);

    const anchor = makeAnchor("https://other.example.org/page", "_blank");
    const event = makeClickEvent(anchor);
    getClickGuard(context)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(context.invokeCalls).toContainEqual([
      "plugin:shell|open",
      { path: "https://other.example.org/page" },
    ]);
  });

  it("hands external links from a subframe to the top page instead of IPC", () => {
    // WebView2 injects event.js into subframes, whose origin has no IPC grant.
    const messages = [];
    const context = loadEventHelpers({
      withTauri: true,
      topWindow: { postMessage: (message) => messages.push(message) },
    });
    runDomReady(context);

    expect(context.window.open("https://outside.example/launch")).toBeNull();
    const event = makeClickEvent(
      makeAnchor("https://outside.example/page", "_new"),
    );
    getClickGuard(context)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(messages).toEqual([
      {
        type: "pake:frame-external-link",
        url: "https://outside.example/launch",
      },
      { type: "pake:frame-external-link", url: "https://outside.example/page" },
    ]);
    expect(
      context.invokeCalls.filter(
        ([command]) => command === "plugin:shell|open",
      ),
    ).toEqual([]);
  });

  it("bridges Web Badging API calls to explicit badge commands", async () => {
    const { navigator, invokeCalls } = loadEventHelpers({ withTauri: true });

    await navigator.setAppBadge(3.8);
    await navigator.setAppBadge();
    await navigator.setAppBadge(0);

    expect(invokeCalls).toEqual([
      ["set_dock_badge", { count: 3 }],
      ["set_dock_badge_label", { label: "•" }],
      ["clear_dock_badge", undefined],
    ]);
  });

  it("keeps notification display separate from badge increment", async () => {
    const { window, invokeCalls } = loadEventHelpers({ withTauri: true });

    new window.Notification("Hello", { body: "World", icon: "/icon.png" });
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeCalls).toEqual([
      [
        "send_notification",
        {
          params: {
            // Correlates the native click callback back to this instance.
            id: expect.stringMatching(/^[A-Za-z0-9_-]{1,64}$/),
            title: "Hello",
            body: "World",
            icon: "https://example.com/icon.png",
            silent: false,
          },
        },
      ],
      ["increment_dock_badge", undefined],
    ]);
  });
});

describe("getFilenameFromUrl data URI extension", () => {
  it("maps a structured image subtype to a real extension (svg+xml -> svg)", () => {
    const context = loadEventHelpers();
    const filename = context.getFilenameFromUrl(
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    );
    expect(filename).toMatch(/^image-.*\.svg$/);
    expect(filename).not.toContain("+");
  });

  it("normalizes jpeg to jpg", () => {
    const context = loadEventHelpers();
    expect(context.getFilenameFromUrl("data:image/jpeg;base64,AAAA")).toMatch(
      /^image-.*\.jpg$/,
    );
  });

  it("does not fold the data payload into the extension when ';' is absent", () => {
    const context = loadEventHelpers();
    const filename = context.getFilenameFromUrl("data:image/png,rawdata");
    expect(filename).toMatch(/^image-.*\.png$/);
    expect(filename).not.toContain("data:image/");
  });
});

describe("getFilenameFromUrl percent-encoded path", () => {
  it("decodes the file name the way browsers name downloads", () => {
    const context = loadEventHelpers();
    expect(
      context.getFilenameFromUrl(
        "https://example.com/files/Annual%20Report%202026.pdf",
      ),
    ).toBe("Annual Report 2026.pdf");
    expect(
      context.getFilenameFromUrl("https://example.com/%E6%8A%A5%E5%91%8A.pdf"),
    ).toBe("报告.pdf");
  });

  it.each(["a%2F..%2Fsecret.pdf", "bad%E0%A4.pdf", "%E2%80%AEfdp.pdf"])(
    "keeps the encoded name when decoding is unsafe or malformed: %s",
    (name) => {
      const context = loadEventHelpers();
      expect(
        context.getFilenameFromUrl(`https://example.com/files/${name}`),
      ).toBe(name);
    },
  );

  it("passes the decoded name to download_file", () => {
    const context = loadEventHelpers({ withTauri: true });
    runDomReady(context);
    const anchor = makeAnchor(
      "https://example.com/files/Annual%20Report.pdf",
      "_self",
    );
    getClickGuard(context)(makeClickEvent(anchor));
    expect(
      context.invokeCalls
        .filter(([command]) => command === "download_file")
        .map(([, payload]) => payload.params.filename),
    ).toEqual(["Annual Report.pdf"]);
  });

  it("names native Windows downloads with the decoded name", () => {
    const context = loadEventHelpers({
      withTauri: true,
      nativeDownloads: true,
    });
    runDomReady(context);
    const anchor = makeAnchor(
      "https://example.com/files/%E6%8A%A5%E5%91%8A%202026.pdf",
      "_self",
    );
    getClickGuard(context)(makeClickEvent(anchor));
    expect(context.nativeDownloadClicks).toEqual([
      [anchor.href, "报告 2026.pdf"],
    ]);
  });
});
