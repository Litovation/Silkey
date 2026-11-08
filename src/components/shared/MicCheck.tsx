import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Mic, TriangleAlert } from "lucide-react";
import { commands, type MicCheckResult } from "@/bindings";
import { Button } from "../ui/Button";
import { MicrophoneSelector } from "../settings/MicrophoneSelector";
import { useSettings } from "../../hooks/useSettings";

const CHECK_MS = 5000;

type Phase =
  | { state: "idle" }
  | { state: "listening"; startedAt: number }
  | { state: "done"; result: MicCheckResult }
  | { state: "error" };

interface MicCheckProps {
  /** Called once a check finishes with a usable microphone. */
  onPassed?: () => void;
  /** Disables the check (e.g. in a browser preview). */
  preview?: boolean;
  /** Show the microphone picker above the check (off where one is nearby). */
  showSelector?: boolean;
}

/**
 * Listens for a few seconds while the user reads a sentence, then sets the
 * microphone boost so their voice reaches the level the speech model hears
 * best. Too-quiet and too-noisy microphones are the main cause of wrong words.
 */
export const MicCheck: React.FC<MicCheckProps> = ({
  onPassed,
  preview,
  showSelector = true,
}) => {
  const { t } = useTranslation();
  const { updateSetting } = useSettings();
  const [phase, setPhase] = useState<Phase>({ state: "idle" });
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (phase.state !== "listening") return;
    const tick = () => {
      setProgress(Math.min(1, (Date.now() - phase.startedAt) / CHECK_MS));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [phase]);

  const run = async () => {
    if (preview) {
      setPhase({
        state: "done",
        result: {
          verdict: "good",
          suggested_gain_percent: 180,
          speech_level: 0.06,
          noise_floor: 0.002,
        },
      });
      return;
    }
    setProgress(0);
    setPhase({ state: "listening", startedAt: Date.now() });
    try {
      const response = await commands.checkMicrophone(CHECK_MS);
      if (response.status !== "ok") {
        setPhase({ state: "error" });
        return;
      }
      const result = response.data;
      if (result.verdict !== "silent" && result.verdict !== "no_speech") {
        await updateSetting("mic_gain_percent", result.suggested_gain_percent);
      }
      setPhase({ state: "done", result });
      if (result.verdict === "good" || result.verdict === "quiet") {
        onPassed?.();
      }
    } catch (e) {
      console.warn("Microphone check failed:", e);
      setPhase({ state: "error" });
    }
  };

  const verdict = phase.state === "done" ? phase.result.verdict : null;
  const good = verdict === "good";
  // Speech meter: dBFS mapped onto 0–100% between -60 dB and -10 dB.
  const meter = (level: number) =>
    Math.max(
      0,
      Math.min(100, ((20 * Math.log10(Math.max(level, 1e-6)) + 60) / 50) * 100),
    );

  return (
    <div className="space-y-4">
      {showSelector && (
        <div className="rounded-xl border border-mid-gray/20">
          <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
        </div>
      )}

      <div className="rounded-2xl border border-mid-gray/15 bg-mid-gray/5 p-4 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text/50">
          {t("micCheck.readAloud")}
        </p>
        <p className="mt-1.5 text-base font-medium leading-snug">
          {t("micCheck.sentence")}
        </p>

        <div className="mt-4 flex items-center justify-center">
          {phase.state === "listening" ? (
            <div className="flex w-full max-w-xs flex-col items-center gap-2">
              <div className="flex h-8 items-end gap-1" aria-hidden="true">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-logo-primary mic-check-bar"
                    style={{ animationDelay: `${i * 90}ms` }}
                  />
                ))}
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-mid-gray/15">
                <div
                  className="h-full rounded-full bg-logo-primary"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="text-xs text-text/60">{t("micCheck.listening")}</p>
            </div>
          ) : (
            <Button onClick={run} variant={good ? "secondary" : "primary"}>
              <span className="flex items-center gap-1.5">
                <Mic className="h-4 w-4" />
                {phase.state === "idle"
                  ? t("micCheck.start")
                  : t("micCheck.again")}
              </span>
            </Button>
          )}
        </div>
      </div>

      {phase.state === "done" && (
        <div
          role="status"
          className={`flex gap-3 rounded-xl border p-3 ${
            good
              ? "border-green-500/30 bg-green-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          }`}
        >
          {good ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-medium">
              {t(`micCheck.verdict.${phase.result.verdict}.title`)}
            </p>
            <p className="text-xs text-text/70">
              {t(`micCheck.verdict.${phase.result.verdict}.body`, {
                times: (phase.result.suggested_gain_percent / 100).toFixed(1),
              })}
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[11px] text-text/60">
                <span className="w-20 shrink-0">{t("micCheck.voice")}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-mid-gray/15">
                  <div
                    className="h-full rounded-full bg-logo-primary"
                    style={{ width: `${meter(phase.result.speech_level)}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-text/60">
                <span className="w-20 shrink-0">
                  {t("micCheck.background")}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-mid-gray/15">
                  <div
                    className="h-full rounded-full bg-mid-gray/60"
                    style={{ width: `${meter(phase.result.noise_floor)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase.state === "error" && (
        <p className="text-center text-xs text-amber-600">
          {t("micCheck.error")}
        </p>
      )}
    </div>
  );
};
