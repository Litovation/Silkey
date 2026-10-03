import React from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUpRight,
  BookOpen,
  HardDrive,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

interface FreeOption {
  id: "groq" | "openrouter" | "ollama";
  icon: LucideIcon;
  url: string;
}

const FREE_OPTIONS: FreeOption[] = [
  { id: "groq", icon: KeyRound, url: "https://console.groq.com/keys" },
  { id: "openrouter", icon: KeyRound, url: "https://openrouter.ai/keys" },
  { id: "ollama", icon: HardDrive, url: "https://ollama.com/download" },
];

const STEPS = ["choose", "key", "model", "prompt", "use"] as const;

export const PostProcessingGuide: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-mid-gray/20 bg-background p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-full bg-logo-primary/20 p-2 text-logo-primary">
          <BookOpen width={18} height={18} />
        </div>
        <div>
          <h2 className="text-sm font-semibold">
            {t("settings.postProcessing.guide.title")}
          </h2>
          <p className="text-xs text-mid-gray mt-0.5">
            {t("settings.postProcessing.guide.intro")}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {FREE_OPTIONS.map(({ id, icon: Icon, url }) => (
          <button
            key={id}
            type="button"
            onClick={() => openUrl(url)}
            className="text-start rounded-lg border border-mid-gray/20 p-3 hover:border-logo-primary cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Icon width={14} height={14} />
              {t(`settings.postProcessing.guide.options.${id}.name`)}
              <ArrowUpRight width={12} height={12} />
            </span>
            <span className="block mt-1 text-xs text-mid-gray">
              {t(`settings.postProcessing.guide.options.${id}.description`)}
            </span>
          </button>
        ))}
      </div>

      <ol className="list-decimal ps-5 space-y-1 text-xs text-text/80">
        {STEPS.map((step) => (
          <li key={step}>{t(`settings.postProcessing.guide.steps.${step}`)}</li>
        ))}
      </ol>
      <p className="text-xs text-mid-gray">
        {t("settings.postProcessing.guide.privacy")}
      </p>
    </div>
  );
};
