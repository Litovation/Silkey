import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  FlaskConical,
  Info,
  Laptop,
  type LucideIcon,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useSettings } from "../../hooks/useSettings";
import { GeneralSettings } from "./general/GeneralSettings";
import { AdvancedSettings } from "./advanced/AdvancedSettings";
import { PostProcessingSettings } from "./post-processing/PostProcessingSettings";
import { AccountSettings } from "./account/AccountSettings";
import { AboutSettings } from "./about/AboutSettings";
import { DebugSettings } from "./debug/DebugSettings";
import type { OnboardingPreviewStep } from "./debug/OnboardingPreview";

export type SettingsTab =
  "general" | "system" | "postprocessing" | "account" | "debug" | "about";

interface TabConfig {
  id: SettingsTab;
  labelKey: string;
  icon: LucideIcon;
  enabled: (settings: ReturnType<typeof useSettings>["settings"]) => boolean;
}

const TABS: TabConfig[] = [
  {
    id: "general",
    labelKey: "settingsModal.tabs.general",
    icon: SlidersHorizontal,
    enabled: () => true,
  },
  {
    id: "system",
    labelKey: "settingsModal.tabs.system",
    icon: Laptop,
    enabled: () => true,
  },
  {
    id: "account",
    labelKey: "settingsModal.tabs.account",
    icon: UserRound,
    enabled: () => true,
  },
  {
    id: "postprocessing",
    labelKey: "sidebar.postProcessing",
    icon: Sparkles,
    enabled: () => true,
  },
  {
    id: "debug",
    labelKey: "sidebar.debug",
    icon: FlaskConical,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
  {
    id: "about",
    labelKey: "sidebar.about",
    icon: Info,
    enabled: () => true,
  },
];

interface SettingsModalProps {
  tab: SettingsTab | null;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  onPreviewOnboarding: (step: OnboardingPreviewStep) => void;
  onReplayWalkthrough: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  tab,
  onTabChange,
  onClose,
  onPreviewOnboarding,
  onReplayWalkthrough,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const open = tab !== null;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const availableTabs = TABS.filter((config) => config.enabled(settings));
  // A tab can disappear while open (e.g. post-processing switched off).
  const activeTab = availableTabs.some((config) => config.id === tab)
    ? tab
    : "general";

  const renderContent = () => {
    switch (activeTab) {
      case "system":
        return <AdvancedSettings />;
      case "postprocessing":
        return <PostProcessingSettings />;
      case "account":
        return <AccountSettings />;
      case "debug":
        return <DebugSettings onPreviewOnboarding={onPreviewOnboarding} />;
      case "about":
        return <AboutSettings onReplayWalkthrough={onReplayWalkthrough} />;
      default:
        return <GeneralSettings />;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("sidebar.advanced")}
        className="flex h-full max-h-[720px] w-full max-w-4xl overflow-hidden rounded-2xl border border-mid-gray/20 bg-background shadow-2xl select-none cursor-default"
      >
        <div className="flex w-48 shrink-0 flex-col gap-1 border-e border-mid-gray/20 bg-mid-gray/5 p-3">
          <h2 className="px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-mid-gray">
            {t("sidebar.advanced")}
          </h2>
          {availableTabs.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm font-medium cursor-pointer transition-colors ${
                id === activeTab
                  ? "bg-logo-primary/15 text-text"
                  : "text-text/80 hover:bg-mid-gray/15"
              }`}
            >
              <Icon
                width={16}
                height={16}
                className={`shrink-0 ${id === activeTab ? "text-logo-primary" : ""}`}
              />
              <span className="truncate">{t(labelKey)}</span>
            </button>
          ))}
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            onClick={onClose}
            title={t("common.close")}
            aria-label={t("common.close")}
            className="absolute end-3 top-3 z-10 rounded-md p-1.5 text-text/60 hover:bg-mid-gray/15 hover:text-text cursor-pointer"
          >
            <X width={16} height={16} />
          </button>
          <div className="flex-1 overflow-y-auto px-5 pb-6 pt-12">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
