import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useModelStore } from "../../stores/modelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { PORTAL_ROOT_ID } from "../../lib/portalRoot";
import "./WindowFrame.css";

type ResizeDirection = Parameters<
  ReturnType<typeof getCurrentWindow>["startResizeDragging"]
>[0];

/**
 * The main window's own frame on Windows and Linux: a see-through window with
 * a rounded shape whose bottom right steps down into a "ledge" carrying the
 * status (ready, quality, language, version). The ledge is translucent, so the
 * desktop shows through it, while its text sits on small solid chips that stay
 * readable over any wallpaper. The window draws its own title bar buttons,
 * drag strip and resize edges, since the native ones are switched off
 * (lib.rs). On macOS the native window is kept and children render as is.
 */

/** Transparent margin around the shape, room for its soft shadow. */
const MARGIN = 14;
/** Height of the ledge below the content. */
export const LEDGE_HEIGHT = 40;
/** Height of the drag strip with the window buttons. */
export const TITLEBAR_HEIGHT = 32;
const RADIUS = 16;
const STEP_RADIUS = 14;
/** Horizontal run of the curve from the content down onto the ledge. */
const STEP_RUN = 36;

type Point = [x: number, y: number, radius: number];

/** A closed path through `points`, each corner rounded by its own radius. */
const roundedPath = (points: Point[]): string => {
  const n = points.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const [x, y, r] = points[i];
    const [px, py] = points[(i - 1 + n) % n];
    const [nx, ny] = points[(i + 1) % n];
    const toPrev = Math.hypot(px - x, py - y);
    const toNext = Math.hypot(nx - x, ny - y);
    const rr = Math.min(r, toPrev / 2, toNext / 2);
    const ax = x + ((px - x) / toPrev) * rr;
    const ay = y + ((py - y) / toPrev) * rr;
    const bx = x + ((nx - x) / toNext) * rr;
    const by = y + ((ny - y) / toNext) * rr;
    d += `${i === 0 ? "M" : "L"}${ax.toFixed(1)},${ay.toFixed(1)} `;
    if (rr) d += `Q${x},${y} ${bx.toFixed(1)},${by.toFixed(1)} `;
  }
  return `${d}Z`;
};

/** The ledge's width for a shape this wide. */
const ledgeWidth = (width: number) =>
  Math.round(Math.min(440, Math.max(300, width * 0.52)));

export const shapePath = (width: number, height: number, square: boolean) => {
  const r = square ? 0 : RADIUS;
  const step = width - ledgeWidth(width);
  return roundedPath([
    [0, 0, r],
    [width, 0, r],
    [width, height, r],
    [step + STEP_RUN, height, STEP_RADIUS],
    [step, height - LEDGE_HEIGHT, STEP_RADIUS],
    [0, height - LEDGE_HEIGHT, r],
  ]);
};

/** Frameless on Windows and Linux; native window on macOS. */
const usesOwnFrame = () =>
  document.documentElement.dataset.platform !== "macos";

const tauriWindow = () => {
  try {
    return getCurrentWindow();
  } catch {
    // Browser previews (dev/mock-preview.html) have no Tauri window.
    return null;
  }
};

/** Low / Medium / High for the three tiers, as the tray menu names them. */
const qualityKey = (modelId: string): string | null => {
  const id = modelId.toLowerCase();
  if (id.includes("canary-180m")) return "tray.qualityLow";
  if (id.includes("nemotron")) return "tray.qualityMedium";
  if (id.includes("parakeet-unified")) return "tray.qualityHigh";
  return null;
};

const languageName = (code: string, locale: string): string | null => {
  try {
    const base = code.replace("_", "-");
    return (
      new Intl.DisplayNames([locale], { type: "language" }).of(base) ?? null
    );
  } catch {
    return null;
  }
};

const LedgeStatus: React.FC = () => {
  const { t, i18n } = useTranslation();
  const currentModel = useModelStore((state) => state.currentModel);
  const models = useModelStore((state) => state.models);
  const language = useSettingsStore(
    (state) => state.settings?.selected_language,
  );
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  const ready = currentModel !== "";
  const levelKey = qualityKey(currentModel);
  const modelName = models.find((m) => m.id === currentModel)?.name;
  const quality = levelKey
    ? t("tray.quality", { level: t(levelKey) })
    : modelName;
  const languageLabel =
    !language || language === "auto"
      ? t("windowFrame.autoLanguage")
      : (languageName(language, i18n.language) ?? language);

  return (
    <div className="silk-ledge-status" data-tauri-drag-region>
      <span className="silk-chip">
        <span className={`silk-dot ${ready ? "" : "silk-dot-idle"}`} />
        {ready ? t("windowFrame.ready") : t("windowFrame.noModel")}
      </span>
      {quality && <span className="silk-chip">{quality}</span>}
      <span className="silk-chip">{languageLabel}</span>
      {version && (
        <span className="silk-chip silk-chip-quiet">
          {t("windowFrame.version", { version })}
        </span>
      )}
    </div>
  );
};

const WindowButtons: React.FC<{ maximized: boolean }> = ({ maximized }) => {
  const { t } = useTranslation();
  const win = tauriWindow();
  return (
    <div className="silk-window-buttons">
      <button
        type="button"
        className="silk-wbtn"
        aria-label={t("windowFrame.minimize")}
        title={t("windowFrame.minimize")}
        onClick={() => void win?.minimize()}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1.5 5h7" />
        </svg>
      </button>
      <button
        type="button"
        className="silk-wbtn"
        aria-label={t(
          maximized ? "windowFrame.restore" : "windowFrame.maximize",
        )}
        title={t(maximized ? "windowFrame.restore" : "windowFrame.maximize")}
        onClick={() => void win?.toggleMaximize()}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          {maximized ? (
            <>
              <rect x="1.5" y="3" width="5.5" height="5.5" rx="1.2" />
              <path d="M3.5 3V2.2c0-.4.3-.7.7-.7h3.6c.4 0 .7.3.7.7v3.6c0 .4-.3.7-.7.7H7" />
            </>
          ) : (
            <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" />
          )}
        </svg>
      </button>
      <button
        type="button"
        className="silk-wbtn silk-wbtn-close"
        aria-label={t("windowFrame.close")}
        title={t("windowFrame.close")}
        // Closing hides the window to the tray (CloseRequested in lib.rs).
        onClick={() => void win?.close()}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </button>
    </div>
  );
};

const RESIZE_EDGES: { direction: ResizeDirection; className: string }[] = [
  { direction: "North", className: "silk-rz-n" },
  { direction: "South", className: "silk-rz-s" },
  { direction: "East", className: "silk-rz-e" },
  { direction: "West", className: "silk-rz-w" },
  { direction: "NorthWest", className: "silk-rz-nw" },
  { direction: "NorthEast", className: "silk-rz-ne" },
  { direction: "SouthWest", className: "silk-rz-sw" },
  { direction: "SouthEast", className: "silk-rz-se" },
];

interface WindowFrameProps {
  children: React.ReactNode;
  /**
   * The children leave room at the top for the drag strip themselves (the
   * main layout pads its content column), so the strip floats over them.
   * Otherwise the children start below it.
   */
  titlebarOverlay?: boolean;
}

export const WindowFrame: React.FC<WindowFrameProps> = ({
  children,
  titlebarOverlay = false,
}) => {
  const framed = usesOwnFrame();
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);

  useLayoutEffect(() => {
    if (!framed) return;
    const root = document.documentElement;
    root.dataset.framed = "true";
    return () => {
      delete root.dataset.framed;
    };
  }, [framed]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!framed || !el) return;
    const measure = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [framed]);

  useEffect(() => {
    if (!framed) return;
    const win = tauriWindow();
    if (!win) return;
    let disposed = false;
    const unlisten: (() => void)[] = [];
    const sync = () => {
      win
        .isMaximized()
        .then((value) => !disposed && setMaximized(value))
        .catch(() => {});
    };
    sync();
    win
      .onResized(sync)
      .then((stop) => (disposed ? stop() : unlisten.push(stop)))
      .catch(() => {});
    win
      .onFocusChanged(({ payload }) => setFocused(payload))
      .then((stop) => (disposed ? stop() : unlisten.push(stop)))
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten.forEach((stop) => stop());
    };
  }, [framed]);

  if (!framed) return <>{children}</>;

  const margin = maximized ? 0 : MARGIN;
  const width = Math.max(0, size.width - margin * 2);
  const height = Math.max(0, size.height - margin * 2);
  const path = width && height ? shapePath(width, height, maximized) : "";

  return (
    <div
      ref={rootRef}
      className={`silk-frame ${maximized ? "silk-frame-max" : ""} ${
        focused ? "" : "silk-frame-blurred"
      }`}
    >
      {path && (
        <>
          <svg
            className="silk-frame-shadow"
            style={{ left: margin, top: margin }}
            width={width}
            height={height}
            aria-hidden="true"
          >
            <path d={path} />
          </svg>
          <div
            className="silk-shape"
            style={{
              inset: margin,
              clipPath: `path("${path}")`,
            }}
          >
            <div className="silk-ledge-fill" style={{ height: LEDGE_HEIGHT }} />
            <div
              className="silk-content"
              style={{
                bottom: LEDGE_HEIGHT,
                paddingTop: titlebarOverlay ? 0 : TITLEBAR_HEIGHT,
              }}
            >
              <div
                className="silk-titlebar"
                style={{ height: TITLEBAR_HEIGHT }}
                data-tauri-drag-region
              >
                <WindowButtons maximized={maximized} />
              </div>
              <div className="silk-content-body">{children}</div>
              <div id={PORTAL_ROOT_ID} />
            </div>
            <LedgeStatus />
          </div>
          <svg
            className="silk-frame-edge"
            style={{ left: margin, top: margin }}
            width={width}
            height={height}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="silk-edge-glow" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#8b5cf6" />
                <stop offset="0.55" stopColor="#c34fd6" />
                <stop offset="1" stopColor="#f650ae" />
              </linearGradient>
            </defs>
            <path className="silk-edge-base" d={path} />
            <path
              className="silk-edge-flow"
              d={path}
              pathLength={1000}
              stroke="url(#silk-edge-glow)"
            />
          </svg>
          {!maximized &&
            RESIZE_EDGES.map(({ direction, className }) => (
              <div
                key={direction}
                className={`silk-rz ${className}`}
                style={{ ["--m" as string]: `${margin}px` }}
                onMouseDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  void tauriWindow()?.startResizeDragging(direction);
                }}
              />
            ))}
        </>
      )}
    </div>
  );
};

export default WindowFrame;
