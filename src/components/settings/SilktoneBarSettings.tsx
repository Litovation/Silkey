import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import type { OverlayPosition } from "@/bindings";

interface SilktoneBarSettingsProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/** The always-visible Silktone bar, where it sits, and the typing nudge. */
export const SilktoneBarSettings: React.FC<SilktoneBarSettingsProps> =
  React.memo(({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const barOn = getSetting("silktone_bar_enabled") ?? true;
    const position: OverlayPosition =
      getSetting("overlay_position") === "top" ? "top" : "bottom";

    return (
      <>
        <ToggleSwitch
          checked={barOn}
          onChange={(enabled) => updateSetting("silktone_bar_enabled", enabled)}
          isUpdating={isUpdating("silktone_bar_enabled")}
          label={t("settings.general.bar.enabled.label")}
          description={t("settings.general.bar.enabled.description")}
          descriptionMode={descriptionMode}
          grouped={grouped}
        />
        <SettingContainer
          title={t("settings.general.bar.position.title")}
          description={t("settings.general.bar.position.description")}
          descriptionMode={descriptionMode}
          grouped={grouped}
        >
          <Dropdown
            options={[
              {
                value: "bottom",
                label: t("settings.advanced.overlay.position.options.bottom"),
              },
              {
                value: "top",
                label: t("settings.advanced.overlay.position.options.top"),
              },
            ]}
            selectedValue={position}
            onSelect={(value) =>
              updateSetting("overlay_position", value as OverlayPosition)
            }
            disabled={isUpdating("overlay_position")}
          />
        </SettingContainer>
        <ToggleSwitch
          checked={getSetting("typing_nudge_enabled") ?? true}
          onChange={(enabled) => updateSetting("typing_nudge_enabled", enabled)}
          isUpdating={isUpdating("typing_nudge_enabled")}
          label={t("settings.general.bar.nudge.label")}
          description={t("settings.general.bar.nudge.description")}
          descriptionMode={descriptionMode}
          grouped={grouped}
        />
      </>
    );
  });
