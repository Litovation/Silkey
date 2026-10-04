import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { useModelStore } from "../../stores/modelStore";
import {
  tierOf,
  useModelTierStore,
  type ModelTier,
} from "../../stores/modelTierStore";

interface PerformanceModeProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/** Standard or Light engine, chosen by what the PC can handle. */
export const PerformanceMode: React.FC<PerformanceModeProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { models, currentModel } = useModelStore();
  const storedTier = useModelTierStore((state) => state.tier);
  const setTier = useModelTierStore((state) => state.setTier);

  // Installs from before this choice existed have no stored tier; show the
  // one their current engine belongs to.
  const current = models.find((model) => model.id === currentModel);
  const tier: ModelTier =
    storedTier ?? (current ? tierOf(current) : "standard");

  return (
    <SettingContainer
      title={t("performance.title")}
      description={t("performance.description")}
      descriptionMode={descriptionMode}
      grouped={grouped}
    >
      <Dropdown
        options={[
          { value: "standard", label: t("performance.standard.title") },
          { value: "light", label: t("performance.light.title") },
        ]}
        selectedValue={tier}
        onSelect={(value) => setTier(value as ModelTier)}
      />
    </SettingContainer>
  );
};
