import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelInfo } from "@/bindings";
import { useModelStore } from "../stores/modelStore";
import { isLegacySource } from "../components/onboarding/ModelCard";
import { tierOf, type ModelTier } from "../stores/modelTierStore";

export type EngineStatus =
  | { state: "checking" }
  | { state: "downloading"; percent: number }
  | { state: "finishing" }
  | { state: "ready" }
  | { state: "error" };

/**
 * The model Silktone should use: one already on disk if there is one, else
 * the top recommended download. The catalog arrives in rank order, so the
 * first match is the best pick.
 */
const pickFrom = (models: ModelInfo[]): ModelInfo | undefined =>
  models.find((m) => m.is_downloaded && !isLegacySource(m)) ??
  models.find((m) => m.is_downloaded) ??
  models.find((m) => m.is_recommended && !isLegacySource(m)) ??
  models.find((m) => !isLegacySource(m));

/** Models the chosen tier allows; every model when there is no preference. */
const candidatesFor = (
  models: ModelInfo[],
  tier: ModelTier | null,
): ModelInfo[] => {
  if (!tier) return models;
  const inTier = models.filter((m) => tierOf(m) === tier);
  // A catalog without that tier must not leave the user with no engine.
  return inTier.length > 0 ? inTier : models;
};

/**
 * Makes sure a speech model is downloaded and selected without asking the
 * user to choose one. Runs while `active`; the model list is never shown.
 * `tier` narrows the pick to the Standard or Light engine; null keeps whatever
 * is already installed.
 */
export const useAutoModelSetup = (active: boolean, tier: ModelTier | null) => {
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
  const downloadStartedFor = useRef<string | null>(null);

  const candidates = useMemo(() => candidatesFor(models, tier), [models, tier]);
  const ready = candidates.some(
    (m) => m.id === currentModel && m.is_downloaded,
  );
  const target = useMemo(() => pickFrom(candidates), [candidates]);
  const targetId = target?.id;
  const busy =
    targetId !== undefined &&
    (targetId in downloadingModels ||
      targetId in verifyingModels ||
      targetId in extractingModels);

  useEffect(() => {
    if (!active || ready || failed || selecting || !target || busy) return;

    if (target.is_downloaded) {
      setSelecting(true);
      selectModel(target.id).then((ok) => {
        setSelecting(false);
        if (!ok) setFailed(true);
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
    ready,
    failed,
    selecting,
    target,
    busy,
    selectModel,
    downloadModel,
  ]);

  // Switching between Standard and Light starts from a clean slate.
  useEffect(() => {
    downloadStartedFor.current = null;
    setFailed(false);
  }, [tier]);

  const retry = useCallback(() => {
    downloadStartedFor.current = null;
    setFailed(false);
  }, []);

  let status: EngineStatus;
  if (ready) {
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
