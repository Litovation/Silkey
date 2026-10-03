import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, Loader2 } from "lucide-react";
import { commands } from "@/bindings";
import SilktoneWordmark from "../icons/SilktoneWordmark";
import { Button } from "../ui/Button";
import { AuroraBackdrop } from "../ui/AuroraBackdrop";
import { ShortcutInput } from "../settings/ShortcutInput";
import { TrackpadDoubleTap } from "../settings/TrackpadDoubleTap";
import { useSettings } from "../../hooks/useSettings";
import {
  keyMatchesKeycap,
  useShortcutKeycaps,
} from "../../hooks/useShortcutKeycaps";
import type { EngineStatus } from "../../hooks/useAutoModelSetup";
import { useModelTierStore, type ModelTier } from "../../stores/modelTierStore";

type Step = "performance" | "shortcut" | "practice" | "done";
const STEPS: Step[] = ["performance", "shortcut", "practice", "done"];
const TIERS: ModelTier[] = ["standard", "light"];

/** Enough of the practice sentence came through to call it a success. */
const matchesPractice = (typed: string, sentence: string) => {
  const words = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  const heard = new Set(words(typed));
  const wanted = words(sentence);
  const found = wanted.filter((word) => heard.has(word)).length;
  return wanted.length > 0 && found / wanted.length >= 0.6;
};

interface FirstRunSetupProps {
  engine: EngineStatus;
  onRetryEngine: () => void;
  onComplete: () => void;
  preview?: boolean;
}

const EngineLine: React.FC<{ engine: EngineStatus; onRetry: () => void }> = ({
  engine,
  onRetry,
}) => {
  const { t } = useTranslation();
  if (engine.state === "ready") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-text/60">
        <Check className="w-3.5 h-3.5 text-green-500" />
        {t("firstRun.engine.ready")}
      </p>
    );
  }
  if (engine.state === "error") {
    return (
      <p className="flex items-center gap-2 text-xs text-red-500">
        {t("firstRun.engine.failed")}
        <button
          type="button"
          onClick={onRetry}
          className="underline font-medium cursor-pointer"
        >
          {t("firstRun.engine.retry")}
        </button>
      </p>
    );
  }
  return (
    <div className="w-full space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-text/60">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {engine.state === "downloading"
          ? t("firstRun.engine.downloading", { percent: engine.percent })
          : t("firstRun.engine.preparing")}
      </p>
      <div className="h-1 rounded-full bg-mid-gray/20 overflow-hidden">
        <div
          className="h-full bg-logo-primary transition-all duration-300"
          style={{
            width: `${engine.state === "downloading" ? engine.percent : 100}%`,
          }}
        />
      </div>
    </div>
  );
};

const Keycaps: React.FC<{ keys: string[]; pressed?: Set<string> }> = ({
  keys,
  pressed,
}) => (
  <span className="inline-flex flex-wrap items-center gap-1.5">
    {keys.map((key, index) => {
      const lit = pressed?.has(key) ?? false;
      return (
        <React.Fragment key={`${key}-${index}`}>
          {index > 0 && <span aria-hidden="true">{"+"}</span>}
          <kbd
            className={`rounded-md border px-2.5 py-1 text-sm font-semibold transition-all duration-150 ${
              lit
                ? "border-logo-primary bg-logo-primary/25 ring-4 ring-logo-primary/30 scale-105"
                : "border-mid-gray/40 bg-mid-gray/10"
            }`}
          >
            {key}
          </kbd>
        </React.Fragment>
      );
    })}
  </span>
);

const FirstRunSetup: React.FC<FirstRunSetupProps> = ({
  engine,
  onRetryEngine,
  onComplete,
  preview = false,
}) => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const keys = useShortcutKeycaps();
  const isWindows = type() === "windows";
  const tier = useModelTierStore((state) => state.tier);
  const setTier = useModelTierStore((state) => state.setTier);
  const [step, setStep] = useState<Step>("performance");
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [practiceText, setPracticeText] = useState("");

  const engineReady = engine.state === "ready";
  const practiceSentence = t("firstRun.practice.sentence");
  const practiceDone = matchesPractice(practiceText, practiceSentence);

  // Shortcuts and typing go live for the practice step, so the user's own
  // dictation lands in the practice box. Both calls are idempotent.
  useEffect(() => {
    if (preview || step !== "practice") return;
    Promise.all([
      commands.initializeEnigo(),
      commands.initializeShortcuts(),
    ]).catch((e) => console.warn("Failed to initialize:", e));
  }, [step, preview]);

  // Light up each keycap while its key is held.
  useEffect(() => {
    if (step !== "practice") return;
    const update = (event: KeyboardEvent, down: boolean) => {
      setPressed((current) => {
        const next = new Set(current);
        for (const key of keys) {
          if (keyMatchesKeycap(event, key)) {
            if (down) next.add(key);
            else next.delete(key);
          }
        }
        return next;
      });
    };
    const onDown = (event: KeyboardEvent) => update(event, true);
    const onUp = (event: KeyboardEvent) => update(event, false);
    const clear = () => setPressed(new Set());
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
    };
  }, [step, keys]);

  const finish = async () => {
    if (preview) return;
    onComplete();
    // Closing hides the window to the tray; without a tray it would quit.
    if (getSetting("show_tray_icon") ?? true) {
      try {
        await getCurrentWindow().close();
      } catch (e) {
        console.warn("Failed to hide window after setup:", e);
      }
    }
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="fixed inset-0 overflow-hidden flex items-center justify-center p-6 select-none cursor-default">
      <AuroraBackdrop />
      <div className="glass-panel relative flex w-full max-w-[880px] max-h-full min-h-[440px] overflow-hidden rounded-3xl">
        <aside className="flex w-56 shrink-0 flex-col gap-8 border-e border-mid-gray/15 p-7">
          <SilktoneWordmark width={150} className="text-text" />
          <ol className="flex flex-col gap-4">
            {STEPS.map((s, index) => (
              <li
                key={s}
                aria-current={index === stepIndex ? "step" : undefined}
                className={`flex items-center gap-3 text-sm transition-colors ${
                  index === stepIndex
                    ? "font-semibold text-text"
                    : index < stepIndex
                      ? "text-text/70"
                      : "text-text/40"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    index === stepIndex
                      ? "bg-logo-primary text-white"
                      : index < stepIndex
                        ? "bg-logo-primary/20 text-logo-primary"
                        : "bg-mid-gray/15"
                  }`}
                >
                  {index < stepIndex ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                {t(`firstRun.steps.${s}`)}
              </li>
            ))}
          </ol>
          {(tier !== null || engine.state === "ready") && (
            <div className="mt-auto">
              <EngineLine engine={engine} onRetry={onRetryEngine} />
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-5 overflow-y-auto p-8">
          {step === "performance" && (
            <>
              <div className="space-y-1.5 text-center">
                <h1 className="text-xl font-semibold">
                  {t("performance.chooseTitle")}
                </h1>
                <p className="text-sm text-text/70">
                  {t("performance.chooseDescription")}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {TIERS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTier(option)}
                    aria-pressed={tier === option}
                    className={`rounded-xl border p-4 text-start cursor-pointer transition-colors ${
                      tier === option
                        ? "border-logo-primary bg-logo-primary/10"
                        : "border-mid-gray/20 hover:border-logo-primary/60"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                      {t(`performance.${option}.title`)}
                      {tier === option && (
                        <Check className="w-4 h-4 text-logo-primary" />
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-text/70">
                      {t(`performance.${option}.description`)}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  disabled={tier === null && !preview}
                  onClick={() => setStep("shortcut")}
                >
                  {t("firstRun.next")}
                </Button>
              </div>
            </>
          )}

          {step === "shortcut" && (
            <>
              <div className="space-y-1.5 text-center">
                <h1 className="text-xl font-semibold">
                  {t("firstRun.shortcut.title")}
                </h1>
                <p className="text-sm text-text/70">
                  {t("firstRun.shortcut.description")}
                </p>
              </div>
              <div className="flex justify-center">
                <Keycaps keys={keys} />
              </div>
              <div className="rounded-xl border border-mid-gray/20 overflow-hidden">
                <ShortcutInput shortcutId="transcribe" grouped={true} />
                {isWindows && (
                  <TrackpadDoubleTap descriptionMode="inline" grouped={true} />
                )}
              </div>
              {isWindows && (
                <p className="text-xs text-text/60 text-center">
                  {t("firstRun.shortcut.trackpadHint")}
                </p>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep("performance")}>
                  {t("firstRun.back")}
                </Button>
                <Button onClick={() => setStep("practice")}>
                  {t("firstRun.next")}
                </Button>
              </div>
            </>
          )}

          {step === "practice" && (
            <>
              <div className="space-y-1.5 text-center">
                <h1 className="text-xl font-semibold">
                  {t("firstRun.practice.title")}
                </h1>
                <p className="text-sm text-text/70">
                  {t("firstRun.practice.description")}
                </p>
              </div>
              <div className="flex justify-center">
                <Keycaps keys={keys} pressed={pressed} />
              </div>
              <p className="text-center text-lg font-medium">
                {t("firstRun.practice.quote", { sentence: practiceSentence })}
              </p>
              <textarea
                autoFocus
                value={practiceText}
                onChange={(event) => setPracticeText(event.target.value)}
                disabled={!engineReady && !preview}
                placeholder={
                  engineReady || preview
                    ? t("firstRun.practice.placeholder")
                    : t("firstRun.practice.waiting")
                }
                className="w-full h-28 resize-none rounded-xl border border-mid-gray/30 bg-mid-gray/5 p-3 text-sm focus:outline-none focus:border-logo-primary disabled:opacity-60"
              />
              {practiceDone && (
                <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-green-600">
                  <Check className="w-4 h-4" />
                  {t("firstRun.practice.success")}
                </p>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep("shortcut")}>
                  {t("firstRun.back")}
                </Button>
                <Button
                  variant={practiceDone ? "primary" : "secondary"}
                  onClick={() => setStep("done")}
                >
                  {practiceDone ? t("firstRun.next") : t("firstRun.skip")}
                </Button>
              </div>
            </>
          )}

          {step === "done" && (
            <>
              <div className="space-y-2 text-center">
                <h1 className="text-xl font-semibold">
                  {t("firstRun.done.title")}
                </h1>
                <p className="text-sm text-text/70">
                  {t("firstRun.done.description")}
                </p>
              </div>
              <div className="flex justify-center">
                <Keycaps keys={keys} />
              </div>
              {!engineReady && (
                <p className="text-xs text-text/60 text-center">
                  {t("firstRun.done.stillDownloading")}
                </p>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep("practice")}>
                  {t("firstRun.back")}
                </Button>
                <Button onClick={finish}>{t("firstRun.done.finish")}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FirstRunSetup;
