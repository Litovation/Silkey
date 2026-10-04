import React from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ChannelSelector } from "../ChannelSelector";
import { ShortcutInput } from "../ShortcutInput";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { ShortcutActivationSetting } from "../ShortcutActivation";
import { MuteWhileRecording } from "../MuteWhileRecording";
import { TrackpadDoubleTap } from "../TrackpadDoubleTap";
import { TrackpadHoldTime } from "../TrackpadHoldTime";
import { useSettings } from "../../../hooks/useSettings";
import { SilenceAutoStop } from "../SilenceAutoStop";
import { ModelSettingsCard } from "./ModelSettingsCard";

export const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const isWindows = type() === "windows";
  const trackpadHoldEnabled =
    getSetting("trackpad_double_tap_enabled") ?? false;
  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.general.title")}>
        <ShortcutInput shortcutId="transcribe" grouped={true} />
        <ShortcutActivationSetting descriptionMode="tooltip" grouped={true} />
        <SilenceAutoStop descriptionMode="tooltip" grouped={true} />
        {isWindows && (
          <TrackpadDoubleTap descriptionMode="tooltip" grouped={true} />
        )}
        {isWindows && trackpadHoldEnabled && (
          <TrackpadHoldTime descriptionMode="tooltip" grouped={true} />
        )}
      </SettingsGroup>
      <ModelSettingsCard />
      <SettingsGroup title={t("settings.sound.title")}>
        <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
        <ChannelSelector descriptionMode="tooltip" grouped={true} />
        <MuteWhileRecording descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>
    </div>
  );
};
