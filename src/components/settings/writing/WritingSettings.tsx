import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookA,
  ChevronDown,
  Eye,
  PenLine,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { type } from "@tauri-apps/plugin-os";
import { toast } from "sonner";
import { commands, type SmartCleanup } from "@/bindings";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { Dropdown } from "../../ui/Dropdown";
import { CustomWords } from "../CustomWords";
import { ShortcutInput } from "../ShortcutInput";
import { Button } from "../../ui/Button";
import { useSettings } from "../../../hooks/useSettings";
import { AiCleanupCheck } from "./AiCleanupCheck";

type ContextToggle =
  | "context_app_name"
  | "context_selected_text"
  | "context_clipboard";

const VOICE_AI_SHORTCUTS = ["command_mode", "draft_message", "ask_question"];

type WritingToggle =
  | "self_corrections_enabled"
  | "spoken_punctuation_enabled"
  | "numbers_as_digits_enabled"
  | "format_lists_enabled";

const TOGGLES: { key: WritingToggle; id: string }[] = [
  { key: "self_corrections_enabled", id: "selfCorrections" },
  { key: "spoken_punctuation_enabled", id: "spokenPunctuation" },
  { key: "numbers_as_digits_enabled", id: "numbers" },
  { key: "format_lists_enabled", id: "lists" },
];

/** Spoken words and the marks they become, for the cheat-sheet. */
const CHEAT_SHEET: [string, string][] = [
  ["comma", ","],
  ["period / full stop", "."],
  ["question mark", "?"],
  ["exclamation mark", "!"],
  ["colon / semicolon", ": ;"],
  ["dash", "-"],
  ["open quote … close quote", '" "'],
  ["open bracket … close bracket", "( )"],
  ["new line / press enter", "↵"],
  ["new paragraph", "↵↵"],
  ["at the rate / at sign", "@"],
  ["literal comma", "comma"],
];

/** Every text-quality choice in one place (build spec "New settings and screens"). */
export const WritingSettings: React.FC<{ onOpenPostProcess?: () => void }> = ({
  onOpenPostProcess,
}) => {
  const { t } = useTranslation();
  const { settings, getSetting, updateSetting, isUpdating, refreshSettings } =
    useSettings();
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const smartCleanup = getSetting("smart_cleanup") ?? "basic";
  const providerReady =
    !!settings?.post_process_provider_id &&
    !!settings.post_process_models?.[settings.post_process_provider_id];
  const learned = getSetting("learned_corrections") ?? [];

  const forget = async (wrong: string) => {
    await commands.forgetCorrection(wrong);
    await refreshSettings();
  };

  const voiceAiOn = getSetting("voice_ai_enabled") ?? false;
  // The app name can only be read on Windows; elsewhere the switch is hidden.
  const contextToggles: { key: ContextToggle; id: string }[] = [
    ...(type() === "windows"
      ? [{ key: "context_app_name" as const, id: "appName" }]
      : []),
    { key: "context_selected_text", id: "selectedText" },
    { key: "context_clipboard", id: "clipboard" },
  ];

  const clearStyle = async () => {
    await commands.clearStyleMemory();
    await refreshSettings();
    toast.success(t("writing.style.cleared"));
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup
        icon={Sparkles}
        title={t("writing.groups.cleanup.title")}
        description={t("writing.groups.cleanup.description")}
      >
        <SettingContainer
          title={t("writing.smartCleanup.title")}
          description={t("writing.smartCleanup.description")}
          descriptionMode="tooltip"
          grouped={true}
        >
          <Dropdown
            options={[
              { value: "basic", label: t("writing.smartCleanup.basic") },
              { value: "cloud_ai", label: t("writing.smartCleanup.cloud") },
            ]}
            selectedValue={smartCleanup}
            onSelect={(value) =>
              updateSetting("smart_cleanup", value as SmartCleanup)
            }
            disabled={isUpdating("smart_cleanup")}
          />
        </SettingContainer>
        {smartCleanup === "cloud_ai" && (
          <AiCleanupCheck onOpenPostProcess={onOpenPostProcess} />
        )}
        <p className="px-4 py-3 text-xs text-text/55">
          {t("writing.smartCleanup.localSoon")}
        </p>
      </SettingsGroup>

      <SettingsGroup
        icon={PenLine}
        title={t("writing.groups.format.title")}
        description={t("writing.groups.format.description")}
      >
        {TOGGLES.map(({ key, id }) => (
          <ToggleSwitch
            key={key}
            checked={getSetting(key) ?? true}
            onChange={(enabled) => updateSetting(key, enabled)}
            isUpdating={isUpdating(key)}
            label={t(`writing.${id}.label`)}
            description={t(`writing.${id}.description`)}
            descriptionMode="inline"
            grouped={true}
          />
        ))}
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setShowCheatSheet((open) => !open)}
            aria-expanded={showCheatSheet}
            className="flex items-center gap-1 text-xs font-medium text-logo-primary hover:underline cursor-pointer"
          >
            <ChevronDown
              width={14}
              height={14}
              className={`transition-transform ${showCheatSheet ? "rotate-180" : ""}`}
            />
            {t("writing.cheatSheet.toggle")}
          </button>
          {showCheatSheet && (
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-xs">
              {CHEAT_SHEET.map(([spoken, mark]) => (
                <React.Fragment key={spoken}>
                  <dt className="text-text/70">
                    {t("writing.cheatSheet.say", { words: spoken })}
                  </dt>
                  <dd className="font-mono font-semibold">{mark}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup
        icon={WandSparkles}
        title={t("writing.groups.voiceAi.title")}
        description={t("writing.groups.voiceAi.description")}
      >
        <ToggleSwitch
          checked={voiceAiOn}
          onChange={(enabled) => updateSetting("voice_ai_enabled", enabled)}
          isUpdating={isUpdating("voice_ai_enabled")}
          label={t("writing.voiceAi.label")}
          description={t("writing.voiceAi.description")}
          descriptionMode="inline"
          grouped={true}
        />
        {voiceAiOn &&
          VOICE_AI_SHORTCUTS.map((id) => (
            <ShortcutInput
              key={id}
              shortcutId={id}
              descriptionMode="tooltip"
              grouped={true}
            />
          ))}
        {voiceAiOn && !providerReady && (
          <p className="px-4 py-3 text-xs text-amber-600">
            {t("writing.voiceAi.needsProvider")}
          </p>
        )}
      </SettingsGroup>

      <SettingsGroup
        icon={Eye}
        title={t("writing.groups.context.title")}
        description={t("writing.groups.context.description")}
      >
        {contextToggles.map(({ key, id }) => (
          <ToggleSwitch
            key={key}
            checked={getSetting(key) ?? false}
            onChange={(enabled) => updateSetting(key, enabled)}
            isUpdating={isUpdating(key)}
            label={t(`writing.context.${id}.label`)}
            description={t(`writing.context.${id}.description`)}
            descriptionMode="inline"
            grouped={true}
          />
        ))}
        <ToggleSwitch
          checked={getSetting("style_memory_enabled") ?? false}
          onChange={(enabled) => updateSetting("style_memory_enabled", enabled)}
          isUpdating={isUpdating("style_memory_enabled")}
          label={t("writing.style.label")}
          description={t("writing.style.description")}
          descriptionMode="inline"
          grouped={true}
        />
        {getSetting("style_memory_enabled") && (
          <div className="px-4 py-3">
            <Button variant="secondary" size="sm" onClick={clearStyle}>
              {t("writing.style.clear")}
            </Button>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup
        icon={BookA}
        title={t("writing.groups.dictionary.title")}
        description={t("writing.groups.dictionary.description")}
      >
        <CustomWords descriptionMode="tooltip" grouped={true} />
        <div className="px-4 py-3">
          <p className="text-sm font-medium">{t("writing.learned.title")}</p>
          <p className="mt-0.5 text-xs text-text/55">
            {t("writing.learned.description")}
          </p>
          {learned.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-mid-gray/30 px-3 py-2 text-xs text-text/50">
              {t("writing.learned.empty")}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-mid-gray/10 rounded-lg border border-mid-gray/15">
              {learned.map((correction) => (
                <li
                  key={correction.wrong}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <span className="text-text/50 line-through decoration-text/30">
                    {correction.wrong}
                  </span>
                  <span aria-hidden="true" className="text-text/40">
                    {"→"}
                  </span>
                  <span className="font-medium">{correction.right}</span>
                  <button
                    type="button"
                    onClick={() => forget(correction.wrong)}
                    title={t("writing.learned.remove")}
                    aria-label={t("writing.learned.remove")}
                    className="ms-auto rounded-md p-1 text-text/40 hover:bg-mid-gray/10 hover:text-text cursor-pointer"
                  >
                    <Trash2 width={14} height={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingsGroup>
    </div>
  );
};
