import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  commands,
  type VoiceCommandLogEntry,
  type VoiceCommandStatus,
} from "@/bindings";
import { useSettings } from "../../../hooks/useSettings";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { Button } from "../../ui/Button";
import { ShortcutInput } from "../ShortcutInput";

interface DownloadProgress {
  downloaded: number;
  total: number;
}

const EXAMPLE_KEYS = [
  "openApp",
  "openSite",
  "search",
  "media",
  "volume",
  "window",
  "screenshot",
  "lock",
] as const;

const formatMb = (bytes: number) => Math.round(bytes / 1_000_000);

export const VoiceCommandsSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const enabled = getSetting("voice_commands_enabled") || false;

  const [status, setStatus] = useState<VoiceCommandStatus | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [recent, setRecent] = useState<VoiceCommandLogEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      setStatus(await commands.getVoiceCommandStatus());
      setRecent(await commands.getRecentVoiceCommands());
    } catch (e) {
      console.warn("Failed to load voice command status:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unlistenProgress = listen<DownloadProgress>(
      "voice-command-download-progress",
      (event) => setProgress(event.payload),
    );
    const unlistenHistory = listen("voice-command-history-updated", () => {
      commands.getRecentVoiceCommands().then(setRecent).catch(console.warn);
    });
    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenHistory.then((fn) => fn());
    };
  }, [refresh]);

  const download = async () => {
    setStatus((s) => (s ? { ...s, downloading: true } : s));
    setProgress(null);
    const result = await commands.downloadVoiceCommandModel();
    if (result.status === "error") {
      toast.error(t("settings.voiceCommands.model.failed", { error: result.error }));
    }
    setProgress(null);
    refresh();
  };

  const remove = async () => {
    const result = await commands.deleteVoiceCommandModel();
    if (result.status === "error") toast.error(result.error);
    refresh();
  };

  const downloading = status?.downloading ?? false;
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : 0;

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <div className="rounded-lg border border-brand-pink/40 bg-brand-pink/10 px-4 py-3 text-sm">
        <p className="font-medium">{t("settings.voiceCommands.beta.title")}</p>
        <p className="text-mid-gray mt-1">
          {t("settings.voiceCommands.beta.description")}
        </p>
      </div>

      <SettingsGroup title={t("settings.voiceCommands.title")}>
        <ToggleSwitch
          checked={enabled}
          onChange={(value) => updateSetting("voice_commands_enabled", value)}
          isUpdating={isUpdating("voice_commands_enabled")}
          label={t("settings.voiceCommands.enable.label")}
          description={t("settings.voiceCommands.enable.description")}
          descriptionMode="inline"
          grouped={true}
        />
        <SettingContainer
          title={t("settings.voiceCommands.model.title")}
          description={t("settings.voiceCommands.model.description")}
          descriptionMode="inline"
          grouped={true}
        >
          {status?.model_downloaded ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-logo-primary">
                {t("settings.voiceCommands.model.ready")}
              </span>
              <Button variant="secondary" size="sm" onClick={remove}>
                {t("settings.voiceCommands.model.remove")}
              </Button>
            </div>
          ) : downloading ? (
            <div className="flex flex-col items-end gap-1 min-w-40">
              <div className="w-40 h-1.5 rounded-full bg-mid-gray/20 overflow-hidden">
                <div
                  className="h-full bg-logo-primary transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-xs text-mid-gray">
                {progress
                  ? t("settings.voiceCommands.model.progress", {
                      done: formatMb(progress.downloaded),
                      total: formatMb(progress.total),
                    })
                  : t("settings.voiceCommands.model.starting")}
              </span>
            </div>
          ) : (
            <Button variant="primary" size="sm" onClick={download}>
              {t("settings.voiceCommands.model.download")}
            </Button>
          )}
        </SettingContainer>
        <ShortcutInput
          shortcutId="voice_command"
          descriptionMode="tooltip"
          grouped={true}
        />
      </SettingsGroup>

      <SettingsGroup title={t("settings.voiceCommands.examples.title")}>
        <ul className="px-4 py-3 space-y-2 text-sm">
          {EXAMPLE_KEYS.map((key) => (
            <li key={key} className="flex gap-3">
              <span className="text-mid-gray w-28 shrink-0">
                {t(`settings.voiceCommands.examples.${key}.label`)}
              </span>
              <span>{t(`settings.voiceCommands.examples.${key}.say`)}</span>
            </li>
          ))}
        </ul>
      </SettingsGroup>

      <SettingsGroup title={t("settings.voiceCommands.recent.title")}>
        {recent.length === 0 ? (
          <p className="px-4 py-3 text-sm text-mid-gray">
            {t("settings.voiceCommands.recent.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-mid-gray/15">
            {recent.map((entry) => (
              <li
                key={`${entry.timestamp}-${entry.heard}`}
                className="flex items-start gap-3 px-4 py-2.5 text-sm"
              >
                {entry.ok ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-logo-primary" />
                ) : (
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-mid-gray" />
                )}
                <div className="min-w-0">
                  <p className="truncate">&ldquo;{entry.heard}&rdquo;</p>
                  <p className="text-xs text-mid-gray">{entry.result}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsGroup>
    </div>
  );
};
