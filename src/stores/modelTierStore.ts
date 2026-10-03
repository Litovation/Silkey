import { create } from "zustand";
import type { ModelInfo } from "@/bindings";

/**
 * Users never see speech-model names. They pick how Silktone should run:
 * "standard" for most PCs, "light" for older or slower ones.
 */
export type ModelTier = "standard" | "light";

const STORAGE_KEY = "silktone.modelTier";

/** The light engine is the small non-streaming model; everything else is standard. */
export const tierOf = (model: ModelInfo): ModelTier =>
  model.supports_streaming ? "standard" : "light";

const readStoredTier = (): ModelTier | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "standard" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
};

interface ModelTierStore {
  /** null until the user has chosen (first run) or for installs that predate the choice. */
  tier: ModelTier | null;
  setTier: (tier: ModelTier) => void;
}

export const useModelTierStore = create<ModelTierStore>()((set) => ({
  tier: readStoredTier(),
  setTier: (tier) => {
    try {
      localStorage.setItem(STORAGE_KEY, tier);
    } catch {
      // ignore
    }
    set({ tier });
  },
}));
