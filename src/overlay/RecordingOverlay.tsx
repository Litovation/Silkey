import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./RecordingOverlay.css";
import { commands, events } from "@/bindings";
import type {
  StreamPhase,
  StreamPhaseEvent,
  StreamTextEvent,
  StreamWorkKind,
} from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";
import { K_MARK_PATH, K_MARK_VIEWBOX } from "@/components/icons/brandPaths";
import { type } from "@tauri-apps/plugin-os";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { toKeycaps } from "@/hooks/useShortcutKeycaps";

type OverlayState =
  | "recording"
  | "streaming"
  | "transcribing"
  | "processing"
  | "command"
  // The Silktone bar: resting pill, hover hint, typing nudge.
  | "idle"
  | "hover"
  | "nudge"
  // Voice AI: the Ask answer card and the "Edited. Undo" notice.
  | "answer"
  | "edited";

/** The Ask card's content (voice_ai::AiAnswer). */
interface AiAnswer {
  question: string;
  answer: string;
}

/** The Ask card closes after this long without the pointer on it. */
const ANSWER_TIMEOUT_MS = 30_000;

// Number of reactive bars in the waveform (the simple, smoothed style shared by
// every overlay form). Mic levels arrive as 16 FFT buckets; we take the first N.
const WAVE_BARS = 9;

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  // `Stream::play()` returning does not mean hardware callbacks are flowing.
  // Stay visually in an arming state until the backend processes the first
  // actual microphone sample chunk.
  const [captureReady, setCaptureReady] = useState(false);
  const [levels, setLevels] = useState<number[]>(Array(WAVE_BARS).fill(0));
  const [streamText, setStreamText] = useState<StreamTextEvent>({
    committed: "",
    tentative: "",
  });
  const [phase, setPhase] = useState<StreamPhase>("listening");
  // Voice Commands (beta): what Silktone did with the last command.
  const [commandLabel, setCommandLabel] = useState("");
  const [workKind, setWorkKind] = useState<StreamWorkKind>("transcribing");
  const [elapsed, setElapsed] = useState(0);
  // Bumped on each new streaming session so the Live card remounts fresh (replays
  // the pop-in, and never animates in from the previous panel's open size).
  const [session, setSession] = useState(0);
  // Overlay placement (top vs bottom of the screen). The Live panel grows downward
  // from a top overlay (oldest line under the pill) and upward from a bottom one.
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  // True once live text overflows the cap. A top overlay fades its top edge only
  // while overflowing, so the resting first line stays crisp flush under the pill.
  const [overflowing, setOverflowing] = useState(false);
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [answerCopied, setAnswerCopied] = useState(false);
  const [answerHovered, setAnswerHovered] = useState(false);
  // The dictation shortcut, for the bar's hint ("Ctrl + Windows").
  const [keys, setKeys] = useState<string[]>(["Ctrl", "Windows"]);

  const smoothedLevelsRef = useRef<number[]>(Array(16).fill(0));
  // Live-text scroll-back: the text region "sticks" to the newest line while the
  // user is at the bottom; if they scroll up to read history, auto-follow pauses
  // until they scroll back down.
  const capRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const direction = getLanguageDirection(i18n.language);

  useEffect(() => {
    const setupEventListeners = async () => {
      const unlistenShow = await listen("show-overlay", async (event) => {
        const overlayState = event.payload as OverlayState;
        // Reset synchronously before settings I/O. A fast microphone can emit
        // recording-ready while the awaits below are in flight; resetting after
        // them would overwrite that event and leave the overlay stuck arming.
        if (overlayState === "recording" || overlayState === "streaming") {
          setCaptureReady(false);
          smoothedLevelsRef.current = Array(16).fill(0);
          setLevels(Array(WAVE_BARS).fill(0));
          setStreamText({ committed: "", tentative: "" });
        }

        await syncLanguageFromSettings();
        // The Live panel flows downward from a top overlay and upward from a
        // bottom one; read the placement so the layout can flip to match.
        try {
          const settings = await commands.getAppSettings();
          if (settings.status === "ok") {
            setPosition(
              settings.data.overlay_position === "top" ? "top" : "bottom",
            );
            const binding =
              settings.data.bindings?.transcribe?.current_binding ?? "";
            if (binding) {
              const os = type();
              setKeys(
                toKeycaps(
                  formatKeyCombination(
                    binding,
                    os === "macos" || os === "windows" || os === "linux"
                      ? os
                      : "unknown",
                  ),
                ),
              );
            }
          }
        } catch {
          // Keep the previous/default placement if settings can't be read.
        }
        setState(overlayState);
        if (overlayState === "streaming") {
          setPhase("listening");
          setWorkKind("transcribing");
          setElapsed(0);
          setSession((s) => s + 1); // remount the card fresh for this session
        }
        setIsVisible(true);
      });

      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
        setCaptureReady(false);
      });

      const unlistenReady = await listen("recording-ready", () => {
        setElapsed(0);
        setCaptureReady(true);
      });

      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];
        // Exponential smoothing across the 16 buckets, then take the first N
        // bars for the shared waveform.
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = newLevels[i] || 0;
          return prev * 0.7 + target * 0.3;
        });
        smoothedLevelsRef.current = smoothed;
        setLevels(smoothed.slice(0, WAVE_BARS));
      });

      const unlistenAnswer = await listen<AiAnswer>("ai-answer", (event) => {
        setAnswer(event.payload);
        setAnswerCopied(false);
      });

      const unlistenCommand = await listen<string>(
        "command-feedback",
        (event) => setCommandLabel(event.payload),
      );

      const unlistenStream = await events.streamTextEvent.listen((event) => {
        setStreamText(event.payload);
      });

      const unlistenPhase = await events.streamPhaseEvent.listen((event) => {
        const payload: StreamPhaseEvent = event.payload;
        setPhase(payload.phase);
        if (payload.kind) setWorkKind(payload.kind);
      });

      // Listening now: ask for the bar, which may have been shown before the
      // page could hear it.
      commands.silktoneBarRefresh().catch(() => {});

      return () => {
        unlistenShow();
        unlistenHide();
        unlistenReady();
        unlistenLevel();
        unlistenStream();
        unlistenPhase();
        unlistenCommand();
        unlistenAnswer();
      };
    };

    setupEventListeners();
  }, []);

  // The answer card closes itself after a while unless the pointer is on it.
  useEffect(() => {
    if (state !== "answer" || !isVisible || answerHovered) return;
    const id = setTimeout(() => {
      commands.voiceAiDismiss().catch(() => {});
    }, ANSWER_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [state, isVisible, answerHovered, answer]);

  // Elapsed capture timer starts only once microphone samples are flowing.
  useEffect(() => {
    if (state !== "streaming" || !isVisible || !captureReady) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [state, isVisible, captureReady]);

  // Stick to the bottom as text streams in — but only while pinned, so a user who
  // has scrolled up to read history isn't yanked back down by the next chunk.
  useLayoutEffect(() => {
    const el = capRef.current;
    if (!el) return;
    // Fade the top edge only once text actually overflows the cap.
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  // Each fresh streaming session starts pinned to the bottom, fade cleared.
  useEffect(() => {
    pinnedRef.current = true;
    setOverflowing(false);
  }, [session]);

  if (!isVisible) return null;

  // Re-pin when the user is within ~a line of the bottom; unpin otherwise.
  const handleStreamScroll = () => {
    const el = capRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 16;
  };

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ---- Shared building blocks (one visual language for every overlay form) ----

  // The Silktone "k" mark. It pops in when the shortcut fires, breathes with the
  // voice level while listening, and pulses while the model is working.
  const voiceLevel =
    levels.reduce((sum, v) => sum + v, 0) / Math.max(1, levels.length);
  const kMark = (mode: "arming" | "ready" | "working" | "done") => (
    <span
      className={`smark ${mode}`}
      style={
        mode === "ready"
          ? ({
              "--lvl": Math.min(1, Math.pow(voiceLevel, 0.6)).toFixed(3),
            } as React.CSSProperties)
          : undefined
      }
    >
      <svg viewBox={K_MARK_VIEWBOX} aria-hidden="true">
        <path d={K_MARK_PATH} />
      </svg>
    </span>
  );
  const waveform = (
    <div className={`swave ${captureReady ? "ready" : "arming"}`}>
      {levels.map((v, i) => (
        <i
          key={i}
          style={{
            height: `${Math.max(3, Math.min(18, 3 + Math.pow(v, 0.7) * 15))}px`,
          }}
        />
      ))}
    </div>
  );

  const cancelBtn = (
    <button
      className="sx"
      aria-label="cancel"
      onClick={() => commands.cancelOperation()}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 4 L12 12 M12 4 L4 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  // dot (left) | waveform (center) | timer + cancel (right) — same structure for
  // the compact pill and the Live island.
  const listeningRow = (showTimer: boolean, showCancel: boolean) => (
    <div className="sbase">
      <div className="sbase-l">{kMark(captureReady ? "ready" : "arming")}</div>
      {waveform}
      <div className="sbase-r">
        {showTimer && <span className="stimer">{fmtTime(elapsed)}</span>}
        {showCancel && cancelBtn}
      </div>
    </div>
  );

  // spinner (left) | label (center) | cancel (right) — same 3-zone grid as the
  // listening row, so the label is centered.
  const workingRow = (label: string, showCancel: boolean) => (
    <div className="sbase">
      <div className="sbase-l">{kMark("working")}</div>
      <span className="swork-label">{label}</span>
      <div className="sbase-r">{showCancel && cancelBtn}</div>
    </div>
  );

  // ---- Live overlay: a fixed control island riding on a text box ----
  if (state === "streaming") {
    const hasText =
      streamText.committed.length > 0 || streamText.tentative.length > 0;
    const working = phase === "working";
    // Keep the text box open whenever there's text — even while finalizing — so
    // the transcript stays put under the working island instead of collapsing
    // mid-stream. With no text there is only the island.
    const open = hasText;

    return (
      <div dir={direction} className={`ov-stage ${position}`}>
        <div key={session} className={`slive ${open ? "open" : ""}`}>
          <div className="stext">
            <div className="stext-clip">
              <div
                className={`stext-cap ${overflowing ? "overflowing" : ""}`}
                ref={capRef}
                onScroll={handleStreamScroll}
              >
                <p>
                  <span className="committed">
                    {streamText.committed ? streamText.committed + " " : ""}
                  </span>
                  <span className="tentative">{streamText.tentative}</span>
                  {/* Drop the blinking caret once finalizing — it's no longer
                      capturing, and a static spinner conveys the work. */}
                  {!working && <span className="scaret" />}
                </p>
              </div>
            </div>
          </div>
          <div className={`scard ${working ? "working" : ""}`}>
            {working
              ? workingRow(
                  workKind === "polishing"
                    ? t("overlay.processing")
                    : t("overlay.transcribing"),
                  true,
                )
              : listeningRow(open, true)}
          </div>
        </div>
      </div>
    );
  }

  // ---- Silktone bar: a slim resting pill, a hint on hover, a typing nudge ----
  if (state === "idle" || state === "hover" || state === "nudge") {
    const start = () => {
      commands.silktoneBarStartDictation().catch(() => {});
    };
    const fold = () => {
      commands.silktoneBarHover(false).catch(() => {});
    };
    const micIcon = (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="5.5" y="1.75" width="5" height="8" rx="2.5" />
        <path d="M3.25 7.5a4.75 4.75 0 0 0 9.5 0M8 12.25v2" />
      </svg>
    );
    return (
      <div
        dir={direction}
        className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
        onMouseEnter={() => {
          if (state === "idle") {
            commands.silktoneBarHover(true).catch(() => {});
          }
        }}
        onMouseLeave={() => {
          if (state === "hover") fold();
        }}
      >
        {state === "idle" && (
          <button
            type="button"
            className="sbar-rest"
            aria-label={t("overlay.bar.start")}
            onClick={start}
          />
        )}
        {state === "hover" && (
          <button
            type="button"
            className="scard compact sbar-hint"
            onClick={start}
          >
            <div className="sbase">
              <div className="sbase-l">{kMark("done")}</div>
              <span className="sbar-label">
                {t("overlay.bar.hint", { keys: keys.join(" + ") })}
              </span>
              <div className="sbase-r">
                <span className="sbar-mic">{micIcon}</span>
              </div>
            </div>
          </button>
        )}
        {state === "nudge" && (
          <div className="scard sbar-nudge" role="status">
            <div className="sbar-nudge-row">
              {kMark("done")}
              <div className="sbar-nudge-text">
                <p className="sbar-nudge-title">{t("overlay.nudge.title")}</p>
                <p className="sbar-nudge-body">
                  {t("overlay.nudge.body", { keys: keys.join(" + ") })}
                </p>
              </div>
              <button
                type="button"
                className="sx"
                aria-label={t("overlay.nudge.dismiss")}
                onClick={fold}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M4 4 L12 12 M12 4 L4 12"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <button type="button" className="sbar-try" onClick={start}>
              {micIcon}
              {t("overlay.nudge.try")}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- Voice AI: Ask answer card ----
  if (state === "answer" && answer) {
    const closeIcon = (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 4 L12 12 M12 4 L4 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
    return (
      <div
        dir={direction}
        className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
      >
        <div
          className="scard sanswer"
          role="dialog"
          aria-label={t("overlay.answer.title")}
          onMouseEnter={() => setAnswerHovered(true)}
          onMouseLeave={() => setAnswerHovered(false)}
        >
          <div className="sanswer-head">
            {kMark("done")}
            <p className="sanswer-question">{answer.question}</p>
            <button
              type="button"
              className="sx"
              aria-label={t("overlay.answer.close")}
              onClick={() => commands.voiceAiDismiss().catch(() => {})}
            >
              {closeIcon}
            </button>
          </div>
          <div className="sanswer-body">{answer.answer}</div>
          <div className="sanswer-actions">
            <button
              type="button"
              className="sbtn"
              onClick={() => {
                commands
                  .voiceAiCopy(answer.answer)
                  .then(() => setAnswerCopied(true))
                  .catch(() => {});
              }}
            >
              {answerCopied
                ? t("overlay.answer.copied")
                : t("overlay.answer.copy")}
            </button>
            <button
              type="button"
              className="sbtn primary"
              onClick={() =>
                commands.voiceAiInsert(answer.answer).catch(() => {})
              }
            >
              {t("overlay.answer.insert")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Voice AI: "Edited. Undo" after Command Mode ----
  if (state === "edited") {
    return (
      <div
        dir={direction}
        className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
      >
        <div className="scard compact sedited">
          <div className="sbase">
            <div className="sbase-l">{kMark("done")}</div>
            <span className="sbar-label">{t("overlay.edited.label")}</span>
            <div className="sbase-r">
              <button
                type="button"
                className="sbtn"
                onClick={() => commands.voiceAiUndo().catch(() => {})}
              >
                {t("overlay.edited.undo")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Voice command result: the k mark and what Silktone did ----
  if (state === "command") {
    return (
      <div
        dir={direction}
        className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
      >
        <div className="scard compact cworking">
          <div className="sbase">
            <div className="sbase-l">{kMark("done")}</div>
            <span className="swork-label">{commandLabel}</span>
            <div className="sbase-r" />
          </div>
        </div>
      </div>
    );
  }

  // ---- Minimal overlay: exactly one row at a time — waveform (recording), or a
  // spinner + label (transcribing / processing). Never both. The pill animates its
  // width between them; the cancel button is in both rows so it stays put.
  const working = state === "transcribing" || state === "processing";
  const workLabel =
    state === "processing"
      ? t("overlay.processing")
      : t("overlay.transcribing");

  return (
    <div
      dir={direction}
      className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
    >
      <div
        className={`scard compact ${working && isVisible ? "cworking" : ""}`}
      >
        {working ? workingRow(workLabel, true) : listeningRow(false, true)}
      </div>
    </div>
  );
};

export default RecordingOverlay;
