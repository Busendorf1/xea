import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";

describe("Feed Smoothness, Video Startup & Fetch Performance (Web)", () => {
  const originalFetch = globalThis.fetch;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }
  });

  it("GET /api/media/[...path] uses cache: 'no-store' for byte-Range requests, preserves 206 streaming headers, and revalidates full fetches", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      fetchCalls.push({ url, init });
      const headers = new Headers(init?.headers);
      if (headers.get("Range")) {
        return new Response("partial-chunk", {
          status: 206,
          headers: {
            "content-type": "video/mp4",
            "content-range": "bytes 0-12/1024",
            "content-length": "13",
            etag: '"abc123"',
          },
        });
      }
      return new Response("full-body", {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "9",
        },
      });
    }) as typeof fetch;

    const { GET } = await import("../../app/api/media/[...path]/route");

    const rangeReq = new NextRequest("http://localhost:3000/api/media/ad-media/demo/clip.mp4", {
      method: "GET",
      headers: { range: "bytes=0-12" },
    });
    const rangeRes = await GET(rangeReq, {
      params: Promise.resolve({ path: ["ad-media", "demo", "clip.mp4"] }),
    });

    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers.get("Content-Range")).toBe("bytes 0-12/1024");
    expect(rangeRes.headers.get("Accept-Ranges")).toBe("bytes");
    expect(fetchCalls[0].url).toBe("https://proj.supabase.co/storage/v1/object/public/ad-media/demo/clip.mp4");
    expect(fetchCalls[0].init?.cache).toBe("no-store");
    expect((fetchCalls[0].init as any)?.next).toBeUndefined();

    const fullReq = new NextRequest("http://localhost:3000/api/media/ad-media/demo/poster.jpg", {
      method: "GET",
    });
    const fullRes = await GET(fullReq, {
      params: Promise.resolve({ path: ["ad-media", "demo", "poster.jpg"] }),
    });

    expect(fullRes.status).toBe(200);
    expect(fetchCalls[1].init?.cache).toBeUndefined();
    expect((fetchCalls[1].init as any)?.next).toEqual({ revalidate: 86400 });
  });

  it("Feed caches client state on mount, limits virtualizer overscan, preloads FullscreenVideoPlayer chunk, and caps metadata probes without row opacity flash", () => {
    const rootDir = path.resolve(__dirname, "../..");
    const feedTsx = fs.readFileSync(path.join(rootDir, "components/Feed/page.tsx"), "utf8");
    const feedCss = fs.readFileSync(path.join(rootDir, "components/Feed/page.module.css"), "utf8");

    // Client cache hydration when initialAds is absent
    expect(feedTsx).toMatch(/const cached = readFeedClientCache\(userEmail\)/);
    expect(feedTsx).toMatch(/setAds\(cached\.ads\)/);
    expect(feedTsx).toMatch(/fetchRelevantAds\(0,\s*false,\s*true\)/);

    // Idle preload of FullscreenVideoPlayer chunk
    expect(feedTsx).toMatch(/import\(["']@\/components\/MyAds\/FullscreenVideoPlayer["']\)/);

    // Virtualizer overscan reduced and .virtualRow avoids opacity flicker keyframes
    expect(feedTsx).toMatch(/overscan:\s*3/);
    expect(feedCss).not.toMatch(/feedRowEaseIn/);

    // Bounded metadata prewarming with cleanup
    expect(feedTsx).toMatch(/MAX_CONCURRENT_VIDEO_PROBES\s*=\s*2/);
    expect(feedTsx).toMatch(/probe\.preload\s*=\s*["']metadata["']/);
    expect(feedTsx).toMatch(/releaseProbe/);
    expect(feedTsx).not.toMatch(/probe\.preload\s*=\s*["']auto["']/);
  });

  it("HlsVideoPlayer, MediaCarousel, FullscreenVideoPlayer, and AdCard/Modals eliminate seek stalls, double plays, and offscreen carousel decoder churn", () => {
    const rootDir = path.resolve(__dirname, "../..");
    const hlsSrc = fs.readFileSync(path.join(rootDir, "components/ui/HlsVideoPlayer.tsx"), "utf8");
    const carouselSrc = fs.readFileSync(path.join(rootDir, "components/ui/MediaCarousel.tsx"), "utf8");
    const fsPlayerSrc = fs.readFileSync(path.join(rootDir, "components/MyAds/FullscreenVideoPlayer.tsx"), "utf8");
    const adCardSrc = fs.readFileSync(path.join(rootDir, "components/ui/AdCard.tsx"), "utf8");
    const modalsSrc = fs.readFileSync(path.join(rootDir, "components/ui/AdCardModals.tsx"), "utf8");
    const adCardCss = fs.readFileSync(path.join(rootDir, "components/ui/AdCard.module.css"), "utf8");

    // HlsVideoPlayer: destructured controlled props before spread, no idle currentTime = 0.001 seek, stable deps
    expect(hlsSrc).toMatch(/onLoadedMetadata:\s*callerOnLoadedMetadata/);
    expect(hlsSrc).toMatch(/\.\.\.passThroughProps[\s\S]*?<video[\s\S]*?\{\.\.\.passThroughProps\}[\s\S]*?onLoadedMetadata=\{handleLoadedMetadata\}/);
    expect(hlsSrc).not.toMatch(/currentTime\s*=\s*0\.001/);
    expect(hlsSrc).toMatch(/preload=\{callerPreload \|\| ["']metadata["']\}/);
    expect(hlsSrc).toMatch(/\},\s*\[targetSource,\s*fallbackSource,\s*src\]\)/);

    // MediaCarousel: adaptive preload based on visibility & warm zone, no duplicate Image() probe, passes currentTime
    expect(carouselSrc).toMatch(/const videoPreload:\s*"auto"\s*\|\s*"metadata"\s*\|\s*"none"/);
    expect(carouselSrc).not.toMatch(/new Image\(\)/);
    expect(carouselSrc).toMatch(/onMediaClick\(index,\s*ct\)/);

    // FullscreenVideoPlayer: initialTime handoff, single play lifecycle, buffering + first-frame fade-in
    expect(fsPlayerSrc).toMatch(/initialTime\?: number/);
    expect(fsPlayerSrc).toMatch(/hasFirstFrame/);
    expect(fsPlayerSrc).toMatch(/isBuffering/);
    const metaMatch = fsPlayerSrc.match(/const handleLoadedMetadata\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\n\s*\};/);
    expect(metaMatch).toBeTruthy();
    expect(metaMatch![0]).not.toMatch(/\.play\(/);

    // AdCard + AdCardModals: active-slide-only fullscreen player, chunk preload, no animated backdrop-filter will-change
    expect(adCardSrc).toMatch(/preloadFullscreenVideoPlayer/);
    expect(adCardSrc).toMatch(/initialVideoTime=\{lightboxInitialVideoTime\}/);
    expect(adCardSrc).toMatch(/handleSetLightboxIndex\(/);
    expect(modalsSrc).toMatch(/isSlideActive\s*\?\s*\(\s*<FullscreenVideoPlayer/);
    expect(modalsSrc).toMatch(/autoPlay=\{!isLightboxClosing\}/);
    expect(modalsSrc).toMatch(/lightboxVideoPlaceholder/);
    expect(adCardCss).not.toMatch(/will-change:\s*opacity,\s*backdrop-filter/);
  });

  it("HEAD /api/media/[...path] rejects path traversal, fails closed without SUPABASE_URL, and forwards Range/ETag headers", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init });
      return new Response(null, {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-length": "512",
          "content-range": "bytes 0-511/2048",
          etag: '"head-etag"',
        },
      });
    }) as typeof fetch;

    const { HEAD } = await import("../../app/api/media/[...path]/route");

    const traversalReq = new NextRequest("http://localhost:3000/api/media/ad-media/../secret.mp4", { method: "HEAD" });
    const traversalRes = await HEAD(traversalReq, { params: Promise.resolve({ path: ["ad-media", "..", "secret.mp4"] }) });
    expect(traversalRes.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);

    const rangeHeadReq = new NextRequest("http://localhost:3000/api/media/ad-media/demo/clip.mp4", {
      method: "HEAD",
      headers: { range: "bytes=0-511" },
    });
    const rangeHeadRes = await HEAD(rangeHeadReq, { params: Promise.resolve({ path: ["ad-media", "demo", "clip.mp4"] }) });
    expect(rangeHeadRes.status).toBe(206);
    expect(rangeHeadRes.headers.get("content-range")).toBe("bytes 0-511/2048");
    expect(rangeHeadRes.headers.get("etag")).toBe('"head-etag"');
    expect(fetchCalls[0].init?.cache).toBe("no-store");

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const missingEnvRes = await HEAD(rangeHeadReq, { params: Promise.resolve({ path: ["ad-media", "demo", "clip.mp4"] }) });
    expect(missingEnvRes.status).toBe(503);
  });

  it("Runtime: MediaCarousel updates baseAspectRatio for portrait 9:16 single videos, HlsVideoPlayer defers load when preload='none', and FullscreenVideoPlayer stops pointer/touch drag propagation", async () => {
    const React = await import("react");
    const ts = await import("typescript");
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const rootDir = path.resolve(__dirname, "../..");

    const prevDocument = (globalThis as any).document;
    const prevWindow = (globalThis as any).window;
    const docStub = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      hidden: false,
      visibilityState: "visible",
    };
    const winStub = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { href: "http://localhost:3000/logged-in" },
      IntersectionObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    };
    (globalThis as any).document = docStub;
    (globalThis as any).window = winStub;

    try {
      const hlsInstances: any[] = [];
      class MockHls {
        static isSupported() {
          return true;
        }
        static Events = { MANIFEST_PARSED: "hlsManifestParsed", ERROR: "hlsError" };
        config: any;
        startLoad = vi.fn();
        loadSource = vi.fn();
        attachMedia = vi.fn();
        on = vi.fn();
        destroy = vi.fn();
        constructor(config: any) {
          this.config = config;
          hlsInstances.push(this);
        }
      }

      const moduleCache = new Map<string, any>();
      const customMocks: Record<string, any> = {
        react: React,
        "react/jsx-runtime": req("react/jsx-runtime"),
        "hls.js": { default: MockHls, __esModule: true },
        "next/dynamic": () => () => null,
        "lucide-react": new Proxy({}, { get: (_t, k) => (k === "__esModule" ? true : () => null) }),
      };

      const resolveTsxPath = (spec: string, fromDir: string): string | null => {
        const base = spec.startsWith("@/")
          ? path.join(rootDir, spec.slice(2))
          : path.resolve(fromDir, spec);
        for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
          if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
        }
        return null;
      };

      const loadWebTsx = (relPath: string): any => {
        const absPath = path.join(rootDir, relPath);
        if (moduleCache.has(absPath)) return moduleCache.get(absPath).exports;
        const mod = { exports: {} };
        moduleCache.set(absPath, mod);
        const source = fs.readFileSync(absPath, "utf8");
        const transpiled = ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
          },
        });
        const localRequire = (spec: string): any => {
          if (spec in customMocks) return customMocks[spec];
          if (spec.endsWith(".module.css") || spec.endsWith(".css")) {
            const cssProxy: any = new Proxy(
              {},
              {
                get: (_t, prop) => {
                  if (prop === "__esModule") return true;
                  if (prop === "default") return cssProxy;
                  return String(prop);
                },
              }
            );
            return cssProxy;
          }
          if (spec.startsWith("@/") || spec.startsWith(".")) {
            const resolved = resolveTsxPath(spec, path.dirname(absPath));
            if (resolved) {
              if (resolved.endsWith(".ts") || resolved.endsWith(".tsx")) {
                return loadWebTsx(path.relative(rootDir, resolved));
              }
              return req(resolved);
            }
          }
          return req(spec);
        };
        const fn = new Function("exports", "require", "module", "__filename", "__dirname", transpiled.outputText);
        fn(mod.exports, localRequire, mod, absPath, path.dirname(absPath));
        return mod.exports;
      };

      // Minimal stateful React 19 hook runner for client components in Node tests
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      function mountComponent<P = any>(Component: (props: P) => any, initialProps: P) {
        const slots: any[] = [];
        const pendingEffects: Array<() => void> = [];
        let props = initialProps;
        let lastTree: any = null;

        const makeH = () => {
          let idx = 0;
          return {
            useState: (init: any) => {
              const i = idx++;
              if (!(i in slots)) slots[i] = typeof init === "function" ? init() : init;
              return [
                slots[i],
                (upd: any) => {
                  slots[i] = typeof upd === "function" ? upd(slots[i]) : upd;
                },
              ];
            },
            useReducer: (r: any, init: any, arg: any) => {
              const i = idx++;
              if (!(i in slots)) slots[i] = arg !== undefined ? arg(init) : init;
              return [slots[i], (a: any) => { slots[i] = r(slots[i], a); }];
            },
            useRef: (init: any) => {
              const i = idx++;
              if (!(i in slots)) slots[i] = { current: init };
              return slots[i];
            },
            useEffect: (fn: () => any, deps?: any[]) => {
              const i = idx++;
              const prev = slots[i];
              const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d: any, k: number) => !Object.is(d, prev.deps[k]));
              if (changed) {
                pendingEffects.push(() => {
                  prev?.cleanup?.();
                  const c = fn();
                  slots[i] = { deps, cleanup: typeof c === "function" ? c : undefined };
                });
              }
            },
            useLayoutEffect: () => {},
            useInsertionEffect: () => {},
            useMemo: (fn: () => any, deps?: any[]) => {
              const i = idx++;
              const prev = slots[i];
              const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d: any, k: number) => !Object.is(d, prev.deps[k]));
              if (changed) slots[i] = { val: fn(), deps };
              return slots[i].val;
            },
            useCallback: (fn: any, deps?: any[]) => {
              const i = idx++;
              const prev = slots[i];
              const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length || deps.some((d: any, k: number) => !Object.is(d, prev.deps[k]));
              if (changed) slots[i] = { val: fn, deps };
              return slots[i].val;
            },
            useContext: (c: any) => c?._currentValue,
            useImperativeHandle: () => {},
            useDebugValue: () => {},
            useDeferredValue: (v: any) => v,
            useTransition: () => [false, (cb: () => void) => cb()],
            useId: () => ":r0:",
            useSyncExternalStore: (_s: any, g: () => any) => g(),
          };
        };

        const render = (nextProps: P = props) => {
          props = nextProps;
          const prevH = internals.H;
          internals.H = makeH();
          try {
            lastTree = Component(props);
          } finally {
            internals.H = prevH;
          }
          while (pendingEffects.length > 0) {
            pendingEffects.shift()!();
          }
          return lastTree;
        };

        const findNode = (node: any, pred: (n: any) => boolean): any => {
          if (!node || typeof node !== "object") return null;
          if (Array.isArray(node)) {
            for (const child of node) {
              const f = findNode(child, pred);
              if (f) return f;
            }
            return null;
          }
          if (pred(node)) return node;
          return node.props?.children ? findNode(node.props.children, pred) : null;
        };

        return { render, findNode };
      }

      // 1) MediaCarousel single portrait 9:16 video must NOT remain stuck at 16/9 on first loadedmetadata
      const { default: MediaCarousel } = loadWebTsx("components/ui/MediaCarousel.tsx");
      const MediaCarouselFn = (MediaCarousel as any).type || MediaCarousel;
      const carousel = mountComponent<any>(MediaCarouselFn, {
        adMedia: "https://proj.supabase.co/storage/v1/object/public/ad-media/portrait-clip.mp4",
        isCardVisible: false,
        isPreloadWarm: true,
      });
      let tree = carousel.render();
      const firstSlideEl = carousel.findNode(tree, (n) => n.props?.style?.aspectRatio !== undefined);
      expect(Number(firstSlideEl?.props?.style?.aspectRatio)).toBeCloseTo(16 / 9, 4);

      const videoNode = carousel.findNode(tree, (n) => typeof n.props?.onLoadedMetadata === "function");
      expect(videoNode).toBeTruthy();
      expect(videoNode.props.preload).toBe("metadata");

      videoNode.props.onLoadedMetadata({
        currentTarget: { duration: 15, videoWidth: 720, videoHeight: 1280 },
      });
      tree = carousel.render();
      const updatedSlideEl = carousel.findNode(tree, (n) => n.props?.style?.aspectRatio !== undefined);
      expect(Number(updatedSlideEl?.props?.style?.aspectRatio)).toBeCloseTo(0.5625, 4);

      // 2) HlsVideoPlayer defers startLoad when preload='none' && !autoPlay, then calls startLoad when warmed
      const { default: HlsVideoPlayer } = loadWebTsx("components/ui/HlsVideoPlayer.tsx");
      const HlsFn = (HlsVideoPlayer as any).render || HlsVideoPlayer;
      const hlsMount = mountComponent<any>(
        (p: any) => HlsFn(p, { current: null }),
        {
          src: "https://proj.supabase.co/storage/v1/object/public/ad-media/stream.mp4",
          hlsSrc: "https://proj.supabase.co/storage/v1/object/public/ad-media/stream.m3u8",
          autoPlay: false,
          preload: "none",
        }
      );
      const hlsTree = hlsMount.render();
      const vidEl = hlsMount.findNode(hlsTree, (n) => n.type === "video");
      expect(vidEl).toBeTruthy();
      expect(vidEl.props.preload).toBe("none");

      // Simulate ref attachment + load .m3u8 with preload='none'
      const vidRef = vidEl.props.ref || vidEl.ref;
      vidRef.current = {
        canPlayType: () => "",
        paused: true,
        readyState: 0,
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        setAttribute: vi.fn(),
        src: "",
        currentSrc: "",
      };
      hlsMount.render({
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/stream2.mp4",
        hlsSrc: "https://proj.supabase.co/storage/v1/object/public/ad-media/stream2.m3u8",
        autoPlay: false,
        preload: "none",
      });
      expect(hlsInstances.length).toBe(1);
      expect(hlsInstances[0].config.autoStartLoad).toBe(false);
      expect(hlsInstances[0].startLoad).not.toHaveBeenCalled();

      // Warm preload -> "metadata": startLoad triggers without recreating Hls
      hlsMount.render({
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/stream2.mp4",
        hlsSrc: "https://proj.supabase.co/storage/v1/object/public/ad-media/stream2.m3u8",
        autoPlay: false,
        preload: "metadata",
      });
      expect(hlsInstances.length).toBe(1);
      expect(hlsInstances[0].startLoad).toHaveBeenCalledTimes(1);

      // 3) FullscreenVideoPlayer controlsOverlay stops touch/mouse/pointer drag propagation
      const { default: FullscreenVideoPlayer } = loadWebTsx("components/MyAds/FullscreenVideoPlayer.tsx");
      const fsMount = mountComponent<any>(FullscreenVideoPlayer as any, {
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/clip.mp4",
        autoPlay: true,
        initialTime: 4.5,
      });
      const fsTree = fsMount.render();
      const controlsEl = fsMount.findNode(fsTree, (n) => typeof n.props?.className === "string" && n.props.className.includes("controlsOverlay"));
      expect(controlsEl).toBeTruthy();
      const touchEvt = { stopPropagation: vi.fn() };
      const mouseEvt = { stopPropagation: vi.fn() };
      const pointerEvt = { stopPropagation: vi.fn() };
      controlsEl.props.onTouchStart(touchEvt);
      controlsEl.props.onMouseDown(mouseEvt);
      controlsEl.props.onPointerDown(pointerEvt);
      expect(touchEvt.stopPropagation).toHaveBeenCalledTimes(1);
      expect(mouseEvt.stopPropagation).toHaveBeenCalledTimes(1);
      expect(pointerEvt.stopPropagation).toHaveBeenCalledTimes(1);

      // 4) Feed/page.tsx guards: stable primitive visible bounds for probes + 4xx no-retry + profile cache preserved
      const feedTsx = fs.readFileSync(path.resolve(__dirname, "../../components/Feed/page.tsx"), "utf8");
      expect(feedTsx).toMatch(/\[visibleStartIndex,\s*visibleEndIndex,\s*displayFeed\]/);
      expect(feedTsx).toMatch(/response\.status\s*>=\s*500/);
      expect(feedTsx).not.toMatch(/profiles:\s*\{\s*\}/);

      // 5) AdInteractionHandler monitors capture-phase scroll on document for container scroll (.feedArea)
      const interactionSrc = fs.readFileSync(path.resolve(__dirname, "../../components/ui/AdInteractionHandler.tsx"), "utf8");
      expect(interactionSrc).toMatch(/document\.addEventListener\("scroll",\s*handleAnyScroll,\s*\{\s*passive:\s*true,\s*capture:\s*true\s*\}\)/);
    } finally {
      (globalThis as any).document = prevDocument;
      (globalThis as any).window = prevWindow;
    }
  });

  it("Runtime: HlsVideoPlayer #t=0.001 hint & autoPlay transitions, MediaCarousel pre-warm canplay trigger, and FullscreenVideoPlayer close keeps hasFirstFrame without blanking", async () => {
    const React = await import("react");
    const ts = await import("typescript");
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const rootDir = path.resolve(__dirname, "../..");

    const prevDocument = (globalThis as any).document;
    const prevWindow = (globalThis as any).window;
    (globalThis as any).document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      hidden: false,
      visibilityState: "visible",
    };
    (globalThis as any).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { href: "http://localhost:3000/logged-in" },
    };

    try {
      const hlsInstances: any[] = [];
      type AnyFn = (...args: any[]) => void;
      class MockHls {
        static isSupported() {
          return true;
        }
        static Events = { MANIFEST_PARSED: "hlsManifestParsed", ERROR: "hlsError" };
        handlers: Record<string, AnyFn> = {};
        startLoad = vi.fn();
        loadSource = vi.fn();
        attachMedia = vi.fn();
        on = vi.fn((evt: string, fn: AnyFn) => {
          this.handlers[evt] = fn;
        });
        destroy = vi.fn();
        constructor() {
          hlsInstances.push(this);
        }
      }

      const moduleCache = new Map<string, any>();
      const customMocks: Record<string, any> = {
        react: React,
        "react/jsx-runtime": req("react/jsx-runtime"),
        "hls.js": { default: MockHls, __esModule: true },
        "next/dynamic": () => () => null,
        "lucide-react": new Proxy({}, { get: (_t, k) => (k === "__esModule" ? true : () => null) }),
      };

      const resolveTsxPath = (spec: string, fromDir: string): string | null => {
        const base = spec.startsWith("@/")
          ? path.join(rootDir, spec.slice(2))
          : path.resolve(fromDir, spec);
        for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
          if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
        }
        return null;
      };

      const loadWebTsx = (relPath: string): any => {
        const absPath = path.join(rootDir, relPath);
        if (moduleCache.has(absPath)) return moduleCache.get(absPath).exports;
        const mod = { exports: {} };
        moduleCache.set(absPath, mod);
        const source = fs.readFileSync(absPath, "utf8");
        const transpiled = ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
          },
        });
        const localRequire = (spec: string): any => {
          if (spec in customMocks) return customMocks[spec];
          if (spec.endsWith(".module.css") || spec.endsWith(".css")) {
            const cssProxy: any = new Proxy(
              {},
              {
                get: (_t, prop) => (prop === "__esModule" ? true : prop === "default" ? cssProxy : String(prop)),
              }
            );
            return cssProxy;
          }
          if (spec.startsWith("@/") || spec.startsWith(".")) {
            const resolved = resolveTsxPath(spec, path.dirname(absPath));
            if (resolved) {
              return resolved.endsWith(".ts") || resolved.endsWith(".tsx")
                ? loadWebTsx(path.relative(rootDir, resolved))
                : req(resolved);
            }
          }
          return req(spec);
        };
        const fn = new Function("exports", "require", "module", "__filename", "__dirname", transpiled.outputText);
        fn(mod.exports, localRequire, mod, absPath, path.dirname(absPath));
        return mod.exports;
      };

      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      function mountComponent<P = any>(Component: (props: P) => any, initialProps: P) {
        const slots: any[] = [];
        const pendingEffects: Array<() => void> = [];
        let props = initialProps;
        let lastTree: any = null;

        const makeH = () => {
          let idx = 0;
          return {
            useState: (init: any) => {
              const i = idx++;
              if (!(i in slots)) slots[i] = typeof init === "function" ? init() : init;
              return [
                slots[i],
                (upd: any) => {
                  slots[i] = typeof upd === "function" ? upd(slots[i]) : upd;
                },
              ];
            },
            useReducer: (r: any, init: any, arg: any) => {
              const i = idx++;
              if (!(i in slots)) slots[i] = arg !== undefined ? arg(init) : init;
              return [slots[i], (a: any) => { slots[i] = r(slots[i], a); }];
            },
            useRef: (init: any) => {
              const i = idx++;
              if (!(i in slots)) slots[i] = { current: init };
              return slots[i];
            },
            useEffect: (fn: () => any, deps?: any[]) => {
              const i = idx++;
              const prev = slots[i];
              const changed =
                !prev ||
                !deps ||
                !prev.deps ||
                deps.length !== prev.deps.length ||
                deps.some((d: any, k: number) => !Object.is(d, prev.deps[k]));
              if (changed) {
                pendingEffects.push(() => {
                  prev?.cleanup?.();
                  const c = fn();
                  slots[i] = { deps, cleanup: typeof c === "function" ? c : undefined };
                });
              }
            },
            useLayoutEffect: () => {},
            useInsertionEffect: () => {},
            useMemo: (fn: () => any, deps?: any[]) => {
              const i = idx++;
              const prev = slots[i];
              const changed =
                !prev ||
                !deps ||
                !prev.deps ||
                deps.length !== prev.deps.length ||
                deps.some((d: any, k: number) => !Object.is(d, prev.deps[k]));
              if (changed) slots[i] = { val: fn(), deps };
              return slots[i].val;
            },
            useCallback: (fn: any, deps?: any[]) => {
              const i = idx++;
              const prev = slots[i];
              const changed =
                !prev ||
                !deps ||
                !prev.deps ||
                deps.length !== prev.deps.length ||
                deps.some((d: any, k: number) => !Object.is(d, prev.deps[k]));
              if (changed) slots[i] = { val: fn, deps };
              return slots[i].val;
            },
            useContext: (c: any) => c?._currentValue,
            useImperativeHandle: () => {},
            useDebugValue: () => {},
            useDeferredValue: (v: any) => v,
            useTransition: () => [false, (cb: () => void) => cb()],
            useId: () => ":r0:",
            useSyncExternalStore: (_s: any, g: () => any) => g(),
          };
        };

        const render = (nextProps: P = props) => {
          props = nextProps;
          const prevH = internals.H;
          internals.H = makeH();
          try {
            lastTree = Component(props);
          } finally {
            internals.H = prevH;
          }
          while (pendingEffects.length > 0) {
            pendingEffects.shift()!();
          }
          return lastTree;
        };

        const findNode = (node: any, pred: (n: any) => boolean): any => {
          if (!node || typeof node !== "object") return null;
          if (Array.isArray(node)) {
            for (const child of node) {
              const f = findNode(child, pred);
              if (f) return f;
            }
            return null;
          }
          if (pred(node)) return node;
          return node.props?.children ? findNode(node.props.children, pred) : null;
        };

        const findAllNodes = (node: any, pred: (n: any) => boolean, out: any[] = []): any[] => {
          if (!node || typeof node !== "object") return out;
          if (Array.isArray(node)) {
            node.forEach((c) => findAllNodes(c, pred, out));
            return out;
          }
          if (pred(node)) out.push(node);
          if (node.props?.children) findAllNodes(node.props.children, pred, out);
          return out;
        };

        return { render, findNode, findAllNodes };
      }

      // A) HlsVideoPlayer: #t=0.001 hint without poster, omitted with poster; autoPlay false->true->false
      const { default: HlsVideoPlayer } = loadWebTsx("components/ui/HlsVideoPlayer.tsx");
      const HlsFn = (HlsVideoPlayer as any).render || HlsVideoPlayer;

      const directNoPoster = mountComponent<any>((p: any) => HlsFn(p, { current: null }), {
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/clip.mp4",
        autoPlay: false,
        preload: "metadata",
      });
      const noPosterEl = directNoPoster.findNode(directNoPoster.render(), (n) => n.type === "video");
      expect(noPosterEl.props.src).toBe("https://proj.supabase.co/storage/v1/object/public/ad-media/clip.mp4#t=0.001");

      const directWithPoster = mountComponent<any>((p: any) => HlsFn(p, { current: null }), {
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/clip.mp4",
        poster: "https://proj.supabase.co/storage/v1/object/public/ad-media/clip.jpg",
        autoPlay: false,
        preload: "metadata",
      });
      const withPosterEl = directWithPoster.findNode(directWithPoster.render(), (n) => n.type === "video");
      expect(withPosterEl.props.src).toBe("https://proj.supabase.co/storage/v1/object/public/ad-media/clip.mp4");

      // Offscreen HLS pre-warmed (readyState=1) then scrolled into view -> starts playback & pauses cleanly
      const videoListeners: Record<string, AnyFn[]> = {};
      const mockVideoDom: any = {
        canPlayType: () => "",
        paused: true,
        readyState: 1,
        src: "",
        currentSrc: "",
        setAttribute: vi.fn(),
        addEventListener: vi.fn((evt: string, fn: AnyFn) => {
          (videoListeners[evt] = videoListeners[evt] || []).push(fn);
        }),
        removeEventListener: vi.fn((evt: string, fn: AnyFn) => {
          videoListeners[evt] = (videoListeners[evt] || []).filter((f) => f !== fn);
        }),
        play: vi.fn(() => {
          mockVideoDom.paused = false;
          return Promise.resolve();
        }),
        pause: vi.fn(() => {
          mockVideoDom.paused = true;
        }),
      };

      const hlsScrollMount = mountComponent<any>((p: any) => HlsFn(p, { current: null }), {
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/init.mp4",
        autoPlay: false,
        preload: "none",
      });
      const initialVid = hlsScrollMount.findNode(hlsScrollMount.render(), (n) => n.type === "video");
      (initialVid.props.ref || initialVid.ref).current = mockVideoDom;
      // Attach HLS stream with preload="none" -> deferred load
      hlsScrollMount.render({
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/warm.mp4",
        hlsSrc: "https://proj.supabase.co/storage/v1/object/public/ad-media/warm.m3u8",
        autoPlay: false,
        preload: "none",
      });
      expect(hlsInstances.length).toBeGreaterThanOrEqual(1);
      expect(hlsInstances[hlsInstances.length - 1].startLoad).not.toHaveBeenCalled();

      // Warm metadata offscreen
      hlsScrollMount.render({
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/warm.mp4",
        hlsSrc: "https://proj.supabase.co/storage/v1/object/public/ad-media/warm.m3u8",
        autoPlay: false,
        preload: "metadata",
      });
      expect(hlsInstances[hlsInstances.length - 1].startLoad).toHaveBeenCalled();
      expect(mockVideoDom.play).not.toHaveBeenCalled();

      // Scroll into view: autoPlay=true while readyState=1 -> plays cleanly
      hlsScrollMount.render({
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/warm.mp4",
        hlsSrc: "https://proj.supabase.co/storage/v1/object/public/ad-media/warm.m3u8",
        autoPlay: true,
        preload: "auto",
      });
      expect(mockVideoDom.play).toHaveBeenCalledTimes(1);

      // Scroll away: autoPlay=false -> pauses cleanly
      hlsScrollMount.render({
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/warm.mp4",
        hlsSrc: "https://proj.supabase.co/storage/v1/object/public/ad-media/warm.m3u8",
        autoPlay: false,
        preload: "metadata",
      });
      expect(mockVideoDom.pause).toHaveBeenCalledTimes(1);

      // B) MediaCarousel: pre-warmed video (readyState === 1) + Bento video autoPlay
      const { default: MediaCarousel } = loadWebTsx("components/ui/MediaCarousel.tsx");
      const CarouselFn = (MediaCarousel as any).type || MediaCarousel;
      const bentoMediaStr =
        "https://proj.supabase.co/storage/v1/object/public/ad-media/img0.jpg,https://proj.supabase.co/storage/v1/object/public/ad-media/vid1.mp4";
      const carouselBento = mountComponent<any>(CarouselFn, {
        adMedia: bentoMediaStr,
        isCardVisible: false,
        isPreloadWarm: true,
      });
      let bentoTree = carouselBento.render();
      let gridNode = carouselBento.findNode(bentoTree, (n) => typeof n.props?.renderCellContent === "function");
      expect(gridNode).toBeTruthy();
      let vidCell = gridNode.props.renderCellContent({
        url: "https://proj.supabase.co/storage/v1/object/public/ad-media/vid1.mp4",
        index: 1,
      });
      let hlsNodes = carouselBento.findAllNodes(vidCell, (n) => typeof n.props?.onLoadedMetadata === "function");
      expect(hlsNodes.length).toBe(1);
      expect(hlsNodes[0].props.preload).toBe("metadata");
      expect(hlsNodes[0].props.autoPlay).toBe(false);

      // Attach mock <video> ref with readyState === 1 at index 1 and simulate scroll-in
      const carouselListeners: Record<string, AnyFn[]> = {};
      const carouselVidStub: any = {
        paused: true,
        readyState: 1,
        muted: true,
        defaultMuted: true,
        addEventListener: vi.fn((e: string, fn: AnyFn) => {
          (carouselListeners[e] = carouselListeners[e] || []).push(fn);
        }),
        removeEventListener: vi.fn((e: string, fn: AnyFn) => {
          carouselListeners[e] = (carouselListeners[e] || []).filter((f) => f !== fn);
        }),
        play: vi.fn(() => {
          carouselVidStub.paused = false;
          return Promise.resolve();
        }),
        pause: vi.fn(() => {
          carouselVidStub.paused = true;
        }),
      };
      hlsNodes[0].props.ref(carouselVidStub);
      bentoTree = carouselBento.render({
        adMedia: bentoMediaStr,
        isCardVisible: true,
        isPreloadWarm: false,
      });
      gridNode = carouselBento.findNode(bentoTree, (n) => typeof n.props?.renderCellContent === "function");
      vidCell = gridNode.props.renderCellContent({
        url: "https://proj.supabase.co/storage/v1/object/public/ad-media/vid1.mp4",
        index: 1,
      });
      hlsNodes = carouselBento.findAllNodes(vidCell, (n) => typeof n.props?.onLoadedMetadata === "function");
      expect(hlsNodes[0].props.autoPlay).toBe(true);
      expect(hlsNodes[0].props.preload).toBe("auto");
      expect(carouselVidStub.play).toHaveBeenCalled();

      // C) FullscreenVideoPlayer: poster -> immediate hasFirstFrame, close transition preserves hasFirstFrame without blanking
      const { default: FullscreenVideoPlayer } = loadWebTsx("components/MyAds/FullscreenVideoPlayer.tsx");
      const posterPlayer = mountComponent<any>(FullscreenVideoPlayer as any, {
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/clip.mp4",
        poster: "https://proj.supabase.co/storage/v1/object/public/ad-media/clip.jpg",
        autoPlay: true,
        initialTime: 3.25,
      });
      const posterTree = posterPlayer.render();
      const posterVideoNode = posterPlayer.findNode(posterTree, (n) => typeof n.props?.onLoadedMetadata === "function");
      expect(posterVideoNode.props.className).toContain("videoElementReady");
      const posterSpinner = posterPlayer.findNode(posterTree, (n) => n.props?.["aria-label"] === "Loading video");
      expect(posterSpinner).toBeNull();

      // Without poster: simulate playback open -> onCanPlay -> close (autoPlay: true -> false)
      const fsListeners: Record<string, AnyFn[]> = {};
      const fsDom: any = {
        readyState: 1,
        duration: 20,
        currentTime: 0,
        paused: true,
        muted: false,
        volume: 1,
        addEventListener: vi.fn((e: string, fn: AnyFn) => {
          (fsListeners[e] = fsListeners[e] || []).push(fn);
        }),
        removeEventListener: vi.fn((e: string, fn: AnyFn) => {
          fsListeners[e] = (fsListeners[e] || []).filter((f) => f !== fn);
        }),
        play: vi.fn(() => {
          fsDom.paused = false;
          return Promise.resolve();
        }),
        pause: vi.fn(() => {
          fsDom.paused = true;
        }),
      };
      const closeTestMount = mountComponent<any>(FullscreenVideoPlayer as any, {
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/clip.mp4",
        autoPlay: true,
        initialTime: 6.5,
      });
      let fsTree = closeTestMount.render();
      let fsHlsNode = closeTestMount.findNode(fsTree, (n) => typeof n.props?.onLoadedMetadata === "function");
      fsHlsNode.props.ref.current = fsDom;
      fsHlsNode.props.onLoadedMetadata();
      expect(fsDom.currentTime).toBe(6.5);
      fsHlsNode.props.onCanPlay();
      fsTree = closeTestMount.render();
      fsHlsNode = closeTestMount.findNode(fsTree, (n) => typeof n.props?.onLoadedMetadata === "function");
      expect(fsHlsNode.props.className).toContain("videoElementReady");

      // Trigger lightbox closing transition (autoPlay -> false): video stays opaque/ready without spinner!
      fsTree = closeTestMount.render({
        src: "https://proj.supabase.co/storage/v1/object/public/ad-media/clip.mp4",
        autoPlay: false,
        initialTime: 6.5,
      });
      fsHlsNode = closeTestMount.findNode(fsTree, (n) => typeof n.props?.onLoadedMetadata === "function");
      expect(fsDom.pause).toHaveBeenCalled();
      expect(fsHlsNode.props.className).toContain("videoElementReady");
      const closeSpinner = closeTestMount.findNode(fsTree, (n) => n.props?.["aria-label"] === "Loading video");
      expect(closeSpinner).toBeNull();
    } finally {
      (globalThis as any).document = prevDocument;
      (globalThis as any).window = prevWindow;
    }
  });

  it("getUserProfileForDashboard overlaps touchUserActivity with SSR highlights/Redis preload and preserves isDeMonetized", async () => {
    let resolveActivity!: (v: { touched: boolean; isDeMonetized: boolean }) => void;
    let highlightsCalledBeforeActivityResolved = false;
    let activitySettled = false;

    const activityPromise = new Promise<{ touched: boolean; isDeMonetized: boolean }>((res) => {
      resolveActivity = (v) => {
        activitySettled = true;
        res(v);
      };
    });

    vi.doMock("@/lib/utils/parsers", () => ({
      safeParseArray: vi.fn((val: unknown) => {
        if (Array.isArray(val)) return val.map(String);
        if (typeof val === "string") {
          try {
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            return val ? [val] : [];
          }
        }
        return [];
      }),
    }));
    vi.doMock("@/lib/utils/avatar", () => ({
      isDefaultProviderAvatar: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/components/DashboardClient/page", () => ({}));
    vi.doMock("@/types/ads", () => ({}));
    vi.doMock("@/components/MyNews/types", () => ({}));
    vi.doMock("@/lib/authHelper", () => ({
      isAdminEmail: vi.fn().mockReturnValue(false),
      isEmailDeactivated: vi.fn().mockResolvedValue(false),
      isEmailPermanentlyBanned: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock("@/lib/adminHelper", () => ({
      getSpecialRoleProfile: vi.fn().mockReturnValue({ isCareer: false, isAffiliate: false, affiliateRole: null }),
      isExemptFromBarriersAndInactivity: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/utils/activityTracker", () => ({
      touchUserActivity: vi.fn(() => activityPromise),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn().mockResolvedValue({
        email: "viewer@paayh.com",
        country: "Nigeria",
        state: "Lagos",
        interest: '["Tech"]',
        gender: "all",
        monetized: true,
        monetization_clicks: 42,
        last_active_at: new Date().toISOString(),
        has_updated_profile: true,
      }),
      setCachedProfile: vi.fn().mockResolvedValue(undefined),
      invalidateCachedProfile: vi.fn().mockResolvedValue(undefined),
      getCachedHighlights: vi.fn(async () => {
        highlightsCalledBeforeActivityResolved = !activitySettled;
        return [{ id: "hl-1", expires_at: new Date(Date.now() + 86400_000).toISOString(), is_active: true }];
      }),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {
        mget: vi.fn(async (keys: string[]) => {
          if (keys[0]?.startsWith("user:profile:")) {
            return [null, null, JSON.stringify(["ad-ssr-1"]), JSON.stringify({}), null];
          }
          if (keys[0]?.startsWith("ad:detail:")) {
            return [
              JSON.stringify({
                id: "ad-ssr-1",
                ad_content: "SSR Ad",
                ad_type: "business",
                user_email: "adv@paayh.com",
                country: "Nigeria",
                impressions: 100,
                impression_count: 1,
                cost_per_impression: 10,
              }),
            ];
          }
          return [];
        }),
        smembers: vi.fn().mockResolvedValue([]),
        smismember: vi.fn().mockResolvedValue([0]),
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [] }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      },
    }));
    vi.doMock("@/lib/targetingEngine", () => ({
      evaluateAdTargeting: vi.fn().mockReturnValue({ matches: true }),
      signAdImpressionToken: vi.fn().mockReturnValue("ssr-tok"),
    }));
    vi.doMock("@/lib/highlights/highlightLifecycle", () => ({
      isHighlightCurrentlyActive: vi.fn().mockReturnValue(true),
      sortHighlightsByBidAndRecency: vi.fn(() => 0),
    }));
    vi.doMock("@/lib/security/piiCrypto", () => ({
      decryptProfilePII: vi.fn((u: any) => u),
      encryptSensitiveField: vi.fn((v: any) => v),
    }));

    const { getUserProfileForDashboard } = await import("../../lib/getUserProfileForDashboard");
    const dashboardPromise = getUserProfileForDashboard({ user: { email: "viewer@paayh.com" } });

    // Allow microtasks for SSR highlights/Redis preload to kick off while touchUserActivity is still pending
    await new Promise((r) => setTimeout(r, 15));
    expect(highlightsCalledBeforeActivityResolved).toBe(true);

    resolveActivity({ touched: true, isDeMonetized: true });
    const res = await dashboardPromise;

    expect(res.user?.monetized).toBe(false);
    expect(res.user?.monetization_clicks).toBe(0);
    expect(res.initialAds).toHaveLength(1);
    expect(res.initialHighlights).toHaveLength(1);
  });

  it("GET /api/feed executes per-user checkRateLimit and getCachedProfile concurrently and degrades gracefully if Redis stalls", async () => {
    let rateLimitSettled = false;
    let profileCalledBeforeRateLimitResolved = false;
    let releaseRateLimit!: (v: { allowed: boolean }) => void;
    const rateLimitPromise = new Promise<{ allowed: boolean }>((res) => {
      releaseRateLimit = (v) => {
        rateLimitSettled = true;
        res(v);
      };
    });

    vi.doMock("@/lib/utils/parsers", () => ({
      safeParseArray: vi.fn((val: unknown) => {
        if (Array.isArray(val)) return val.map(String);
        if (typeof val === "string") {
          try {
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            return val ? [val] : [];
          }
        }
        return [];
      }),
    }));
    vi.doMock("@/lib/utils/avatar", () => ({
      isDefaultProviderAvatar: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/components/DashboardClient/page", () => ({}));
    vi.doMock("@/types/ads", () => ({}));
    vi.doMock("@/components/MyNews/types", () => ({}));
    vi.doMock("@/lib/authHelper", () => ({
      getAuthenticatedEmail: vi.fn().mockResolvedValue("viewer@paayh.com"),
      isAdminEmail: vi.fn().mockReturnValue(false),
    }));
    let callNum = 0;
    vi.doMock("@/lib/edgeRateLimit", () => ({
      checkRateLimit: vi.fn(() => {
        callNum += 1;
        if (callNum === 1) return Promise.resolve({ allowed: true }); // IP guard
        return rateLimitPromise; // Per-user guard
      }),
    }));
    vi.doMock("@/lib/utils/cache", () => ({
      getCachedProfile: vi.fn(async () => {
        profileCalledBeforeRateLimitResolved = !rateLimitSettled;
        return {
          email: "viewer@paayh.com",
          country: "Nigeria",
          state: "Lagos",
          interest: ["Tech"],
          gender: "all",
        };
      }),
      setCachedProfile: vi.fn().mockResolvedValue(undefined),
      registerL1FeedEvictionHandler: vi.fn(),
    }));
    vi.doMock("@/lib/redis", () => ({
      default: {
        pipeline: vi.fn(() => ({
          get: vi.fn(),
          set: vi.fn(),
          del: vi.fn(),
          sadd: vi.fn(),
          expire: vi.fn(),
          smembers: vi.fn(),
          hgetall: vi.fn(),
          exec: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
        })),
        mget: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
        set: vi.fn().mockResolvedValue("OK"),
        smismember: vi.fn().mockResolvedValue([]),
      },
      isRedisReady: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/utils/cdnUrl", () => ({
      transformMediaUrlsToCdn: vi.fn((u: unknown) => u),
    }));
    vi.doMock("@/lib/ads/publicAdResolver", () => ({
      isAdRowActiveAndAvailable: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/targetingEngine", () => ({
      computeCampaignBroadeningPlan: vi.fn(() => ({
        isScheduledFuture: false,
        broadeningStage: 0,
        effectiveUserCap: 5,
        dailyUserCap: 5,
        minSpacingMs: 0,
      })),
      evaluateAdTargeting: vi.fn().mockReturnValue({ matches: true }),
      rankAndFilterTargetedAds: vi.fn((ads: unknown[]) => ads),
      signAdImpressionToken: vi.fn().mockReturnValue("tok"),
    }));
    const makeFeedDb = () => ({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    });
    const feedDbMock = makeFeedDb();
    vi.doMock("@/lib/utils/dbAdmin", () => ({
      default: feedDbMock,
      supabaseReadOnly: feedDbMock,
    }));
    vi.doMock("@/types/ads", () => ({}));

    const { GET } = await import("../../app/api/feed/route");
    const req = new NextRequest("https://paayh.com/api/feed?refresh=true");
    const resPromise = GET(req);

    await new Promise((r) => setTimeout(r, 15));
    expect(profileCalledBeforeRateLimitResolved).toBe(true);

    releaseRateLimit({ allowed: true });
    const res = await resPromise;
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.ads)).toBe(true);
  });
});
