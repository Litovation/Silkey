import React from "react";
import { useTranslation } from "react-i18next";
import { LogIn, UserRound } from "lucide-react";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { Button } from "../../ui/Button";

// Placeholder until accounts are connected: sign-in and sign-out are wired up
// here once the backend exists, so the button is visibly unavailable for now.
export const AccountSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("account.title")}>
        <div className="flex items-center gap-4 px-4 py-4">
          <div className="shrink-0 rounded-full bg-logo-primary/20 p-3 text-logo-primary">
            <UserRound width={22} height={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("account.signedOut")}</p>
            <p className="text-xs text-mid-gray">{t("account.unavailable")}</p>
          </div>
          <Button
            variant="primary"
            disabled
            className="flex items-center gap-2 whitespace-nowrap"
          >
            <LogIn width={16} height={16} />
            {t("account.continueWithGoogle")}
          </Button>
        </div>
      </SettingsGroup>
    </div>
  );
};
