import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, type ModelInfo } from "@/bindings";
import { useModelStore } from "../stores/modelStore";
import { isLegacySource } from "../components/onboarding/ModelCard";
import { tierOf, type ModelTier } from "../stores/modelTierStore";

export type EngineStatus =
  | { state: "checking" }
  | { state: "downloading"; percent: number }
  | { state: "finishing" }
  | { state: "ready" }
  | { state: "error" };

/** Only knows English; far more accurate at it than the multilingual model. */
const isEnglishOnly = (m: ModelInfo): boolean =>
  m.supported_languages.length === 1 && m.supported_languages[0] === "en";

const speaks = (m: ModelInfo, language: string): boolean =>
  language === "auto"
    ? m.supports_language_detection
    : m.supported_languages.includes(language);

/**
 * The model Silktone should run for this language and tier. English gets the
 * English-only model (half the mistakes of the multilingual one in tests);
 * Hindi and auto-detect get the multilingual model, even on the Light tier,
 * because the light model does not know Hindi. The catalog arrives in rank
 * order, so the first match is the best pick.
 */
export const preferredModel = (
  models: ModelInfo[],
  tier: ModelTier | null,
  language: string,
): ModelInfo | undefined => {
  const offered = models.filter((m) => !isLegacySource(m) && !m.is_custom);
  const wanted = tier ?? "standard";
  const fits = offered.filter((m) => speaks(m, language));
  const inTier = fits.filter((m) => tierOf(m) === wanted);
  const pool = inTier.length > 0 ? inTier : fits;
  if (language === "en") {
    const english = pool.find(isEnglishOnly);
    if (english) return english;
  }
  return pool.find((m) => !isEnglishOnly(m)) ?? pool[0] ?? offered[0];
};

/**
 * Makes sure a speech model is downloaded and selected without asking the
 * user to choose one. Runs while `active`; the model list is never shown.
 *
 * When the best model for the user's language is not on disk yet but another
 * working model is, Silktone keeps using that one, downloads the better one in
 * the background and switches over once it is ready. So existing users move to
 * the more accurate English model without ever losing dictation.
 */
export const useAutoModelSetup = (
  active: boolean,
  tier: ModelTier | null,
  language: string,
) => {
  const {
    models,
    currentModel,
    downloadingModels,
    verifyingModels,
    extractingModels,
    downloadProgress,
    downloadModel,
    selectModel,
  } = useModelStore();
  const [failed, setFailed] = useState(false);
  const [selecting, setSelecting] = useState(false);
  // Bumped to try a deferred switch again (see the busy-recording check).
  const [switchAttempt, setSwitchAttempt] = useState(0);
  const downloadStartedFor = useRef<string | null>(null);

  const target = useMemo(
    () => preferredModel(models, tier, language),
    [models, tier, language],
  );
  const targetId = target?.id;
  const onTarget = currentModel === targetId && !!target?.is_downloaded;
  // Whatever is loaded now still transcribes while a better model downloads.
  const usable = models.some((m) => m.id === currentModel && m.is_downloaded);
  const busy =
    targetId !== undefined &&
    (targetId in downloadingModels ||
      targetId in verifyingModels ||
      targetId in extractingModels);

  useEffect(() => {
    if (!active || onTarget || failed || selecting || !target || busy) return;

    if (target.is_downloaded) {
      setSelecting(true);
      // Swapping models reloads the engine: never in the middle of a
      // dictation. Wait for it to finish and try again.
      const busyRecording = usable
        ? commands.isRecording().catch(() => false)
        : Promise.resolve(false);
      busyRecording.then((recording) => {
        if (recording) {
          setSelecting(false);
          setTimeout(() => setSwitchAttempt((n) => n + 1), 5000);
          return;
        }
        selectModel(target.id).then((ok) => {
          setSelecting(false);
          if (!ok) setFailed(true);
        });
      });
      return;
    }

    if (downloadStartedFor.current === target.id) return;
    downloadStartedFor.current = target.id;
    // Failure toasts come from the store's model-download-failed listener.
    downloadModel(target.id).then((ok) => {
      if (!ok) setFailed(true);
    });
  }, [
    active,
    onTarget,
    usable,
    failed,
    selecting,
    target,
    busy,
    switchAttempt,
    selectModel,
    downloadModel,
  ]);

  // A new tier or language is a new target: start from a clean slate.
  useEffect(() => {
    downloadStartedFor.current = null;
    setFailed(false);
  }, [tier, language]);

  const retry = useCallback(() => {
    downloadStartedFor.current = null;
    setFailed(false);
  }, []);

  let status: EngineStatus;
  if (onTarget || usable) {
    status = { state: "ready" };
  } else if (failed || (models.length > 0 && !target)) {
    status = { state: "error" };
  } else if (targetId !== undefined && targetId in downloadingModels) {
    status = {
      state: "downloading",
      percent: Math.round(downloadProgress[targetId]?.percentage ?? 0),
    };
  } else if (busy || selecting) {
    status = { state: "finishing" };
  } else {
    status = { state: "checking" };
  }

  return { status, retry };
};
