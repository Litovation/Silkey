import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface TrackpadDoubleTapProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const TrackpadDoubleTap: React.FC<TrackpadDoubleTapProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const enabled = getSetting("trackpad_double_tap_enabled") ?? false;

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(enabled) =>
          updateSetting("trackpad_double_tap_enabled", enabled)
        }
        isUpdating={isUpdating("trackpad_double_tap_enabled")}
        label={t("settings.advanced.trackpadDoubleTap.label")}
        description={t("settings.advanced.trackpadDoubleTap.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
