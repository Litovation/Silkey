import React from "react";
import { useTranslation } from "react-i18next";
import { LogOut, UserRound } from "lucide-react";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { Button } from "../../ui/Button";
import { useAuthStore } from "../../../stores/authStore";
import { trialDaysLeft, type Access } from "../../../lib/auth";

const usePlanLabel = (access: Access | null): string => {
  const { t } = useTranslation();
  if (!access) return "";
  if (access.status === "trial") {
    return t("account.plan.trial", { count: trialDaysLeft(access) });
  }
  return t(`account.plan.${access.status}`);
};

export const AccountSettings: React.FC = () => {
  const { t } = useTranslation();
  const email = useAuthStore((state) => state.email);
  const verdict = useAuthStore((state) => state.verdict);
  const signOut = useAuthStore((state) => state.signOut);

  const access = verdict?.state === "allowed" ? verdict.access : null;
  const planLabel = usePlanLabel(access);
  const offline = verdict?.state === "allowed" && verdict.offline;

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("account.title")}>
        <div className="flex items-center gap-4 px-4 py-4">
          <div className="shrink-0 rounded-full bg-logo-primary/20 p-3 text-logo-primary">
            <UserRound width={22} height={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold select-text">
              {email}
            </p>
            <p className="text-xs text-mid-gray">
              {planLabel}
              {offline && ` · ${t("account.offline")}`}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={signOut}
            className="flex items-center gap-2 whitespace-nowrap"
          >
            <LogOut width={16} height={16} />
            {t("account.signOut")}
          </Button>
        </div>
      </SettingsGroup>
    </div>
  );
};
