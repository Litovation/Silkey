import React from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { Hand, Keyboard, Mic, TimerOff } from "lucide-react";
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
      <SettingsGroup
        icon={Keyboard}
        title={t("settings.general.groups.keyboard.title")}
        description={t("settings.general.groups.keyboard.description")}
      >
        <ShortcutInput shortcutId="transcribe" grouped={true} />
        <ShortcutActivationSetting descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>
      {isWindows && (
        <SettingsGroup
          icon={Hand}
          title={t("settings.general.groups.touchpad.title")}
          description={t("settings.general.groups.touchpad.description")}
        >
          <TrackpadDoubleTap descriptionMode="tooltip" grouped={true} />
          {trackpadHoldEnabled && (
            <TrackpadHoldTime descriptionMode="tooltip" grouped={true} />
          )}
        </SettingsGroup>
      )}
      <SettingsGroup
        icon={TimerOff}
        title={t("settings.general.groups.stopping.title")}
        description={t("settings.general.groups.stopping.description")}
      >
        <SilenceAutoStop descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>
      <ModelSettingsCard />
      <SettingsGroup
        icon={Mic}
        title={t("settings.general.groups.microphone.title")}
        description={t("settings.general.groups.microphone.description")}
      >
        <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
        <ChannelSelector descriptionMode="tooltip" grouped={true} />
        <MuteWhileRecording descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>
    </div>
  );
};
