import React from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "../ui/Slider";
import { useSettings } from "../../hooks/useSettings";

const DEFAULT_GAIN_PERCENT = 100;

interface MicrophoneBoostProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/** Makes the captured voice louder (or quieter) before it is transcribed and saved. */
export const MicrophoneBoost: React.FC<MicrophoneBoostProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting } = useSettings();

    const gain = (getSetting("mic_gain_percent") ?? DEFAULT_GAIN_PERCENT) / 100;

    return (
      <Slider
        value={gain}
        onChange={(value) =>
          updateSetting("mic_gain_percent", Math.round(value * 100))
        }
        min={0.5}
        max={4}
        step={0.1}
        label={t("settings.sound.microphoneBoost.label")}
        description={t("settings.sound.microphoneBoost.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
        formatValue={(value) =>
          t("settings.sound.microphoneBoost.value", {
            times: value.toFixed(1),
          })
        }
      />
    );
  },
);
