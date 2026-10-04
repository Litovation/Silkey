import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  HardDrive,
  type LucideIcon,
} from "lucide-react";

type OptionId = "groq" | "cerebras" | "openrouter" | "gemini" | "ollama";

/** A value the user pastes into the fields below (or a terminal). */
interface CopyValue {
  labelKey: "provider" | "baseUrl" | "model" | "command" | "apiKey";
  value: string;
}

interface FreeOption {
  id: OptionId;
  icon: LucideIcon;
  /** Where the key is created, or where the software is downloaded. */
  url: string;
  copies: CopyValue[];
}

// Product names, URLs and model ids are literal on purpose: they are what the
// user must type or paste, so they are never translated.
const FREE_OPTIONS: FreeOption[] = [
  {
    id: "groq",
    icon: Cloud,
    url: "https://console.groq.com/keys",
    copies: [
      { labelKey: "provider", value: "Groq" },
      { labelKey: "model", value: "llama-3.3-70b-versatile" },
    ],
  },
  {
    id: "cerebras",
    icon: Cloud,
    url: "https://cloud.cerebras.ai",
    copies: [
      { labelKey: "provider", value: "Cerebras" },
      { labelKey: "model", value: "llama-3.3-70b" },
    ],
  },
  {
    id: "openrouter",
    icon: Cloud,
    url: "https://openrouter.ai/keys",
    copies: [{ labelKey: "provider", value: "OpenRouter" }],
  },
  {
    id: "gemini",
    icon: Cloud,
    url: "https://aistudio.google.com/apikey",
    copies: [
      { labelKey: "provider", value: "Custom" },
      {
        labelKey: "baseUrl",
        value: "https://generativelanguage.googleapis.com/v1beta/openai",
      },
    ],
  },
  {
    id: "ollama",
    icon: HardDrive,
    url: "https://ollama.com/download",
    copies: [
      { labelKey: "command", value: "ollama pull llama3.2" },
      { labelKey: "provider", value: "Custom" },
      { labelKey: "baseUrl", value: "http://localhost:11434/v1" },
      { labelKey: "apiKey", value: "ollama" },
      { labelKey: "model", value: "llama3.2" },
    ],
  },
];

const CopyChip: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-mid-gray">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-md bg-mid-gray/10 px-2 py-1 font-mono select-text cursor-text">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        title={t("common.copy")}
        aria-label={t("common.copy")}
        className="shrink-0 rounded-md p-1.5 text-text/60 hover:bg-mid-gray/15 hover:text-logo-primary cursor-pointer"
      >
        {copied ? (
          <Check width={14} height={14} />
        ) : (
          <Copy width={14} height={14} />
        )}
      </button>
    </div>
  );
};

export const PostProcessingGuide: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<OptionId | null>("groq");

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

      <div className="divide-y divide-mid-gray/20 rounded-lg border border-mid-gray/20">
        {FREE_OPTIONS.map(({ id, icon: Icon, url, copies }) => {
          const isOpen = open === id;
          const steps = t(`settings.postProcessing.guide.options.${id}.steps`, {
            returnObjects: true,
          }) as string[];
          return (
            <div key={id}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-start cursor-pointer hover:bg-mid-gray/5"
              >
                <Icon
                  width={16}
                  height={16}
                  className="shrink-0 text-logo-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {t(`settings.postProcessing.guide.options.${id}.name`)}
                    <span className="rounded-full bg-logo-primary/15 px-1.5 py-px text-[10px] font-semibold text-logo-primary">
                      {t(`settings.postProcessing.guide.options.${id}.tag`)}
                    </span>
                  </span>
                  <span className="block text-xs text-mid-gray">
                    {t(`settings.postProcessing.guide.options.${id}.summary`)}
                  </span>
                </span>
                <ChevronDown
                  width={16}
                  height={16}
                  className={`shrink-0 text-mid-gray transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <div className="space-y-3 px-3 pb-3 ps-10">
                  <ol className="list-decimal ps-4 space-y-1 text-xs text-text/80">
                    {Array.isArray(steps) &&
                      steps.map((step, index) => <li key={index}>{step}</li>)}
                  </ol>
                  <div className="space-y-1.5">
                    {copies.map(({ labelKey, value }) => (
                      <CopyChip
                        key={`${labelKey}-${value}`}
                        label={t(
                          `settings.postProcessing.guide.fields.${labelKey}`,
                        )}
                        value={value}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => openUrl(url)}
                    className="inline-flex items-center gap-1 rounded-lg bg-background-ui px-3 py-1.5 text-xs font-semibold text-white hover:bg-background-ui/80 cursor-pointer transition-colors"
                  >
                    {t(`settings.postProcessing.guide.options.${id}.open`)}
                    <ArrowUpRight width={14} height={14} />
                  </button>
                  <p className="text-xs text-mid-gray">
                    {t(`settings.postProcessing.guide.options.${id}.note`)}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-mid-gray">
        {t("settings.postProcessing.guide.afterSetup")}
      </p>
      <p className="text-xs text-mid-gray">
        {t("settings.postProcessing.guide.privacy")}
      </p>
    </div>
  );
};
