import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

/** Seconds of silence used when the toggle is switched on. */
const SILENCE_SECONDS = 5;

interface SilenceAutoStopProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const SilenceAutoStop: React.FC<SilenceAutoStopProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const seconds = getSetting("silence_auto_stop_secs") ?? SILENCE_SECONDS;

    return (
      <ToggleSwitch
        checked={seconds > 0}
        onChange={(enabled) =>
          updateSetting("silence_auto_stop_secs", enabled ? SILENCE_SECONDS : 0)
        }
        isUpdating={isUpdating("silence_auto_stop_secs")}
        label={t("settings.general.silenceAutoStop.label")}
        description={t("settings.general.silenceAutoStop.description", {
          seconds: SILENCE_SECONDS,
        })}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
