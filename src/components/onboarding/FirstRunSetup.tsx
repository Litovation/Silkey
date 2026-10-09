import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, Loader2 } from "lucide-react";
import { commands, events } from "@/bindings";
import SilktoneWordmark from "../icons/SilktoneWordmark";
import { Button } from "../ui/Button";
import { SetupBackdrop } from "../ui/SetupBackdrop";
import { ShortcutInput } from "../settings/ShortcutInput";
import { TrackpadDoubleTap } from "../settings/TrackpadDoubleTap";
import { TrackpadHoldTime } from "../settings/TrackpadHoldTime";
import { ShortcutActivationSetting } from "../settings/ShortcutActivation";
import { TutorialAnimation, type TutorialScene } from "./TutorialAnimation";
import { useSettings } from "../../hooks/useSettings";
import {
  keyMatchesKeycap,
  useShortcutKeycaps,
} from "../../hooks/useShortcutKeycaps";
import type { EngineStatus } from "../../hooks/useAutoModelSetup";
import { useModelTierStore, type ModelTier } from "../../stores/modelTierStore";
import { useAuthStore } from "../../stores/authStore";
import { RequestAccess } from "../account/RequestAccess";

type Step =
  | "performance"
  | "language"
  | "shortcut"
  | "practice1"
  | "modes"
  | "practice2"
  | "practice3"
  | "touchpad"
  | "done";
const STEPS: Step[] = [
  "performance",
  "language",
  "shortcut",
  "practice1",
  "modes",
  "practice2",
  "practice3",
  "touchpad",
  "done",
];
/** Practice rounds; "pad" is the optional touchpad try. */
type Round = 1 | 2 | 3 | "pad";
const ROUND_OF: Partial<Record<Step, Round>> = {
  practice1: 1,
  practice2: 2,
  practice3: 3,
  touchpad: "pad",
};
const SENTENCE_KEY: Record<Round, string> = {
  1: "firstRun.practice.sentence",
  2: "firstRun.practice.sentence2",
  3: "firstRun.practice.sentence3",
  pad: "firstRun.practice.sentencePad",
};
/** After this many dictations in a round, any words count as a success, so
 * a strong accent or a noisy room never traps someone in the tutorial. */
const LENIENT_AFTER = 3;
const TIERS: ModelTier[] = ["standard", "light"];
/** Dictation languages offered in the tutorial; English is the default. */
const LANGUAGES = ["en", "hi", "auto"] as const;

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Enough of the practice sentence came through to call it a success. */
const matchesPractice = (typed: string, sentence: string) => {
  const heard = new Set(words(typed));
  const wanted = words(sentence);
  const found = wanted.filter((word) => heard.has(word)).length;
  return wanted.length > 0 && found / wanted.length >= 0.6;
};

/** One practice round's progress. */
interface RoundState {
  /** What is in the practice box (pasted dictation, or typed). */
  text: string;
  /** The last dictation Silktone finished during this round. */
  heard: string;
  /** Dictations finished during this round. */
  attempts: number;
}
const EMPTY_ROUND: RoundState = { text: "", heard: "", attempts: 0 };

interface FirstRunSetupProps {
  engine: EngineStatus;
  onRetryEngine: () => void;
  onComplete: () => void;
  preview?: boolean;
  /** Shown again from Settings: finishing returns to the app, not the tray. */
  replay?: boolean;
  /** Beta-locked accounts cannot dictate yet, so they may leave the required
   * first try for later; the tutorial comes back once they have access. */
  onLater?: () => void;
  /** Set up before (upgrading to a new tutorial): the speech engine is
   * already chosen and working, so the tutorial starts at the language. */
  returning?: boolean;
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
  replay = false,
  onLater,
  returning = false,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, refreshSettings } = useSettings();
  const verdict = useAuthStore((state) => state.verdict);
  const betaLocked =
    verdict?.state === "blocked" && verdict.reason === "locked";
  const savedLanguage = getSetting("selected_language");
  const language = LANGUAGES.find((code) => code === savedLanguage) ?? "en";
  const activation = getSetting("shortcut_activation") ?? "hold_or_toggle";
  const touchpadOn = getSetting("trackpad_double_tap_enabled") ?? false;
  const keys = useShortcutKeycaps();
  const isWindows = type() === "windows";
  const tier = useModelTierStore((state) => state.tier);
  const setTier = useModelTierStore((state) => state.setTier);
  const [step, setStep] = useState<Step>(
    returning ? "language" : "performance",
  );
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [rounds, setRounds] = useState<Record<Round, RoundState>>({
    1: EMPTY_ROUND,
    2: EMPTY_ROUND,
    3: EMPTY_ROUND,
    pad: EMPTY_ROUND,
  });
  // Someone who already finished this tutorial (a replay) may leave anytime;
  // everyone else has to get the first try through.
  const [alreadyDone] = useState(
    () => (getSetting("tutorial_version") ?? 0) >= 1,
  );
  const completionSaved = useRef(false);

  const engineReady = engine.state === "ready";
  const steps = STEPS.filter(
    (s) =>
      (s !== "touchpad" || (isWindows && touchpadOn)) &&
      (s !== "performance" || !returning),
  );
  const stepIndex = steps.indexOf(step);
  const round = ROUND_OF[step];

  /** How a round asks the user to use their keys, following their setting. */
  const styleOf = (r: Round): TutorialScene => {
    if (r === "pad") return "touchpad";
    if (activation === "toggle") return "tap";
    if (activation === "push_to_talk") return "hold";
    return r === 3 ? "tap" : "hold";
  };

  const passed = (r: Round) => {
    const state = rounds[r];
    const sentence = t(SENTENCE_KEY[r]);
    if (matchesPractice(state.text, sentence)) return true;
    if (matchesPractice(state.heard, sentence)) return true;
    // Hindi or auto-detected speech will not match the English sentence;
    // any real dictation counts there, as it does after a few tries.
    const gotWords = words(state.heard).length >= 2;
    return gotWords && (language !== "en" || state.attempts >= LENIENT_AFTER);
  };
  const firstTryDone = alreadyDone || passed(1) || preview;

  // The first successful try is what unlocks Silktone: save it right away,
  // so leaving the tutorial after that point never locks anyone out.
  const firstPassed = passed(1);
  useEffect(() => {
    if (!firstPassed || preview || completionSaved.current) return;
    completionSaved.current = true;
    commands
      .completeTutorial()
      .then(() => refreshSettings())
      .catch((e) => console.warn("Failed to save tutorial progress:", e));
  }, [firstPassed, preview, refreshSettings]);

  // Shortcuts and typing go live for the practice steps, so the user's own
  // dictation lands in the practice box. Both calls are idempotent.
  useEffect(() => {
    if (preview || round === undefined) return;
    Promise.all([
      commands.initializeEnigo(),
      commands.initializeShortcuts(),
    ]).catch((e) => console.warn("Failed to initialize:", e));
  }, [round, preview]);

  // Every finished dictation counts for the round on screen, even when the
  // paste itself did not land in the box.
  useEffect(() => {
    if (preview || round === undefined) return;
    const unlisten = events.historyUpdatePayload.listen((event) => {
      if (event.payload.action !== "added") return;
      const { entry } = event.payload;
      const heard = (
        entry.post_processed_text ?? entry.transcription_text
      ).trim();
      if (!heard) return;
      setRounds((current) => ({
        ...current,
        [round]: {
          ...current[round],
          heard,
          attempts: current[round].attempts + 1,
        },
      }));
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [round, preview]);

  // Light up each keycap while its key is held.
  useEffect(() => {
    if (round === undefined || round === "pad") return;
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
  }, [round, keys]);

  const go = (offset: number) => {
    const next = steps[stepIndex + offset];
    if (next) setStep(next);
  };

  const finish = async () => {
    if (preview) return;
    onComplete();
    if (replay) return;
    // Closing hides the window to the tray; without a tray it would quit.
    if (getSetting("show_tray_icon") ?? true) {
      try {
        await getCurrentWindow().close();
      } catch (e) {
        console.warn("Failed to hide window after setup:", e);
      }
    }
  };

  // Leaving early is only possible after the first try. It must still leave
  // a speech engine chosen, or nothing downloads.
  const skip = () => {
    if (preview || !firstTryDone) return;
    if (tier === null && !returning) setTier("standard");
    onComplete();
  };

  const scene: TutorialScene =
    round !== undefined
      ? styleOf(round)
      : step === "modes"
        ? activation === "push_to_talk"
          ? "hold"
          : "tap"
        : step === "done"
          ? styleOf(1)
          : "keys";

  const practiceBox = (r: Round) => {
    const state = rounds[r];
    const sentence = t(SENTENCE_KEY[r]);
    const ok = passed(r);
    const style = styleOf(r);
    return (
      <>
        {r !== "pad" && (
          <div className="flex justify-center">
            <Keycaps keys={keys} pressed={pressed} />
          </div>
        )}
        <p className="text-center text-base font-medium">
          {t("firstRun.practice.quote", { sentence })}
        </p>
        <textarea
          autoFocus
          value={state.text}
          onChange={(event) =>
            setRounds((current) => ({
              ...current,
              [r]: { ...current[r], text: event.target.value },
            }))
          }
          disabled={!engineReady && !preview}
          placeholder={
            engineReady || preview
              ? t("firstRun.practice.placeholder")
              : t("firstRun.practice.waiting")
          }
          className="w-full h-20 resize-none rounded-xl border border-mid-gray/30 bg-mid-gray/5 p-3 text-sm focus:outline-none focus:border-logo-primary disabled:opacity-60"
        />
        {ok ? (
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-green-600">
            <Check className="w-4 h-4" />
            {t(
              r === 1
                ? "firstRun.practice.success"
                : "firstRun.practice.successMore",
            )}
          </p>
        ) : state.attempts > 0 ? (
          <p className="text-center text-xs text-text/70">
            {t("firstRun.practice.almost", { text: state.heard })}
          </p>
        ) : (
          style !== "touchpad" && (
            <p className="text-center text-xs text-text/60">
              {t(`firstRun.practice.how.${style}`)}
            </p>
          )
        )}
      </>
    );
  };

  return (
    <div className="fixed inset-0 overflow-hidden flex items-center justify-center p-6 select-none cursor-default">
      <SetupBackdrop />
      <div className="glass-panel relative flex w-full max-w-[880px] max-h-full min-h-[440px] overflow-hidden rounded-3xl">
        <aside className="flex w-52 shrink-0 flex-col gap-4 overflow-y-auto border-e border-mid-gray/15 p-5">
          <SilktoneWordmark width={110} className="text-text" />
          <ol className="flex flex-col gap-1.5">
            {steps.map((s, index) => (
              <li
                key={s}
                aria-current={index === stepIndex ? "step" : undefined}
                className={`flex items-center gap-2.5 text-xs transition-colors ${
                  index === stepIndex
                    ? "font-semibold text-text"
                    : index < stepIndex
                      ? "text-text/70"
                      : "text-text/40"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
                    index === stepIndex
                      ? "bg-logo-primary text-white"
                      : index < stepIndex
                        ? "bg-logo-primary/20 text-logo-primary"
                        : "bg-mid-gray/15"
                  }`}
                >
                  {index < stepIndex ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    index + 1
                  )}
                </span>
                {t(`firstRun.steps.${s}`)}
              </li>
            ))}
          </ol>
          <TutorialAnimation scene={scene} keys={keys} />
          {(tier !== null || engine.state === "ready") && (
            <div className="mt-auto">
              <EngineLine engine={engine} onRetry={onRetryEngine} />
            </div>
          )}
        </aside>

        <div className="relative flex min-w-0 flex-1 flex-col justify-center gap-4 overflow-y-auto p-7">
          {step !== "done" && firstTryDone && (
            <button
              type="button"
              onClick={skip}
              className="absolute end-4 top-4 rounded-md px-2 py-1 text-xs font-medium text-mid-gray hover:bg-mid-gray/10 hover:text-text cursor-pointer"
            >
              {t("firstRun.skipTutorial")}
            </button>
          )}
          {step !== "done" && !firstTryDone && betaLocked && onLater && (
            <button
              type="button"
              onClick={onLater}
              className="absolute end-4 top-4 rounded-md px-2 py-1 text-xs font-medium text-mid-gray hover:bg-mid-gray/10 hover:text-text cursor-pointer"
            >
              {t("firstRun.later")}
            </button>
          )}

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
                  onClick={() => go(1)}
                >
                  {t("firstRun.next")}
                </Button>
              </div>
            </>
          )}

          {step === "language" && (
            <>
              <div className="space-y-1.5 text-center">
                <h1 className="text-xl font-semibold">
                  {t("firstRun.language.title")}
                </h1>
                <p className="text-sm text-text/70">
                  {t("firstRun.language.description")}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {LANGUAGES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() =>
                      !preview && updateSetting("selected_language", option)
                    }
                    aria-pressed={language === option}
                    className={`rounded-xl border p-4 text-start cursor-pointer transition-colors ${
                      language === option
                        ? "border-logo-primary bg-logo-primary/10"
                        : "border-mid-gray/20 hover:border-logo-primary/60"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                      {t(`firstRun.language.${option}.title`)}
                      {language === option && (
                        <Check className="w-4 h-4 text-logo-primary" />
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-text/70">
                      {t(`firstRun.language.${option}.description`)}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-text/60 text-center">
                {t("firstRun.language.changeLater")}
              </p>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => go(-1)}>
                  {t("firstRun.back")}
                </Button>
                <Button onClick={() => go(1)}>{t("firstRun.next")}</Button>
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
                <Button variant="ghost" onClick={() => go(-1)}>
                  {t("firstRun.back")}
                </Button>
                <Button onClick={() => go(1)}>{t("firstRun.next")}</Button>
              </div>
            </>
          )}

          {step === "practice1" && (
            <>
              <div className="space-y-1.5 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-logo-primary">
                  {t("firstRun.practice.round", { n: 1 })}
                </p>
                <h1 className="text-xl font-semibold">
                  {t("firstRun.practice.title")}
                </h1>
                <p className="text-sm text-text/70">
                  {t(`firstRun.practice.description.${styleOf(1)}`)}
                </p>
              </div>
              {betaLocked && (
                <div className="space-y-2 rounded-xl border border-logo-primary/30 bg-logo-primary/5 p-3">
                  <p className="text-xs text-text/80">
                    {t("firstRun.practice.lockedHint")}
                  </p>
                  <RequestAccess />
                </div>
              )}
              {practiceBox(1)}
              {!firstTryDone && (
                <p className="text-center text-xs text-text/60">
                  {t("firstRun.practice.required")}
                </p>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => go(-1)}>
                  {t("firstRun.back")}
                </Button>
                <Button disabled={!firstTryDone} onClick={() => go(1)}>
                  {t("firstRun.next")}
                </Button>
              </div>
            </>
          )}

          {step === "modes" && (
            <>
              <div className="space-y-1.5 text-center">
                <h1 className="text-xl font-semibold">
                  {t("firstRun.modes.title")}
                </h1>
                <p className="text-sm text-text/70">
                  {t("firstRun.modes.description")}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["hold", "tap"] as const).map((mode) => (
                  <div
                    key={mode}
                    className="rounded-xl border border-mid-gray/20 p-3"
                  >
                    <p className="text-sm font-semibold">
                      {t(`firstRun.modes.${mode}.title`)}
                    </p>
                    <p className="mt-1 text-xs text-text/70">
                      {t(`firstRun.modes.${mode}.body`)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-mid-gray/20">
                <ShortcutActivationSetting
                  descriptionMode="tooltip"
                  grouped={true}
                />
              </div>
              <p className="text-xs text-text/60 text-center">
                {t("firstRun.modes.changeLater")}
              </p>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => go(-1)}>
                  {t("firstRun.back")}
                </Button>
                <Button onClick={() => go(1)}>{t("firstRun.next")}</Button>
              </div>
            </>
          )}

          {(step === "practice2" || step === "practice3") && (
            <>
              <div className="space-y-1.5 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-logo-primary">
                  {t("firstRun.practice.round", {
                    n: step === "practice2" ? 2 : 3,
                  })}
                </p>
                <h1 className="text-xl font-semibold">
                  {t(
                    `firstRun.practice.titleStyle.${styleOf(step === "practice2" ? 2 : 3)}`,
                  )}
                </h1>
                <p className="text-sm text-text/70">
                  {t(
                    `firstRun.practice.description.${styleOf(step === "practice2" ? 2 : 3)}`,
                  )}
                </p>
              </div>
              {practiceBox(step === "practice2" ? 2 : 3)}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => go(-1)}>
                  {t("firstRun.back")}
                </Button>
                <Button
                  variant={
                    passed(step === "practice2" ? 2 : 3)
                      ? "primary"
                      : "secondary"
                  }
                  onClick={() => go(1)}
                >
                  {passed(step === "practice2" ? 2 : 3)
                    ? t("firstRun.next")
                    : t("firstRun.skipRound")}
                </Button>
              </div>
            </>
          )}

          {step === "touchpad" && (
            <>
              <div className="space-y-1.5 text-center">
                <h1 className="text-xl font-semibold">
                  {t("firstRun.touchpad.title")}
                </h1>
                <p className="text-sm text-text/70">
                  {t("firstRun.touchpad.description")}
                </p>
              </div>
              <div className="rounded-xl border border-mid-gray/20">
                <TrackpadHoldTime descriptionMode="tooltip" grouped={true} />
              </div>
              <p className="text-center text-xs font-medium text-text/70">
                {t("firstRun.touchpad.tryIt")}
              </p>
              {practiceBox("pad")}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => go(-1)}>
                  {t("firstRun.back")}
                </Button>
                <Button
                  variant={passed("pad") ? "primary" : "secondary"}
                  onClick={() => go(1)}
                >
                  {passed("pad") ? t("firstRun.next") : t("firstRun.skipRound")}
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
              <ul className="space-y-1 text-center text-xs text-text/70">
                <li>{t(`firstRun.done.tip.${styleOf(1)}`)}</li>
                <li>{t("firstRun.done.tip.settings")}</li>
              </ul>
              {!engineReady && (
                <p className="text-xs text-text/60 text-center">
                  {t("firstRun.done.stillDownloading")}
                </p>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => go(-1)}>
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
