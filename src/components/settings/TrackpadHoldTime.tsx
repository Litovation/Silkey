import React from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "../ui/Slider";
import { useSettings } from "../../hooks/useSettings";

const DEFAULT_HOLD_MS = 1500;

interface TrackpadHoldTimeProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/** How long two fingers must rest on the touchpad before dictation toggles. */
export const TrackpadHoldTime: React.FC<TrackpadHoldTimeProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting } = useSettings();

    const seconds = (getSetting("trackpad_hold_ms") ?? DEFAULT_HOLD_MS) / 1000;

    return (
      <Slider
        value={seconds}
        onChange={(value) =>
          updateSetting("trackpad_hold_ms", Math.round(value * 1000))
        }
        min={0.5}
        max={3}
        step={0.1}
        label={t("settings.advanced.trackpadHoldTime.label")}
        description={t("settings.advanced.trackpadHoldTime.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
        formatValue={(value) =>
          t("settings.advanced.trackpadHoldTime.value", {
            seconds: value.toFixed(1),
          })
        }
      />
    );
  },
);
