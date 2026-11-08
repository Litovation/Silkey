import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingContainer } from "../ui/SettingContainer";
import { Button } from "../ui/Button";
import { MicCheck } from "../shared/MicCheck";

interface MicCheckSettingProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/** Re-run the setup's microphone check from Settings. */
export const MicCheckSetting: React.FC<MicCheckSettingProps> = ({
  descriptionMode = "tooltip",
  grouped = false,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingContainer
        title={t("micCheck.settingsTitle")}
        description={t("micCheck.settingsDescription")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? t("common.close") : t("micCheck.start")}
        </Button>
      </SettingContainer>
      {open && (
        <div className="px-4 pb-4">
          <MicCheck showSelector={false} />
        </div>
      )}
    </>
  );
};
