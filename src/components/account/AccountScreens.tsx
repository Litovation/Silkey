import React from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LogIn, LogOut, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import SilktoneWordmark from "../icons/SilktoneWordmark";
import { Button } from "../ui/Button";
import { SetupBackdrop } from "../ui/SetupBackdrop";
import { useAuthStore } from "../../stores/authStore";
import type { BlockReason } from "../../lib/auth";

const SITE_URL = "https://silktone.litovation.in";

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed inset-0 flex items-center justify-center overflow-hidden p-6 select-none cursor-default">
    <SetupBackdrop />
    <div className="glass-panel relative flex w-full max-w-md flex-col items-center gap-6 rounded-3xl p-10 text-center">
      <SilktoneWordmark width={190} />
      {children}
    </div>
  </div>
);

export const SignInScreen: React.FC = () => {
  const { t } = useTranslation();
  const signIn = useAuthStore((state) => state.signIn);
  const signingIn = useAuthStore((state) => state.signingIn);
  const error = useAuthStore((state) => state.error);

  return (
    <Shell>
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-semibold">{t("account.signInTitle")}</h1>
        <p className="text-sm text-mid-gray">{t("account.signInBody")}</p>
      </div>
      <Button
        variant="primary"
        size="lg"
        onClick={signIn}
        className="flex items-center gap-2"
      >
        <LogIn width={18} height={18} />
        {t("account.continueWithGoogle")}
      </Button>
      {signingIn && (
        <p className="text-xs text-mid-gray">{t("account.finishInBrowser")}</p>
      )}
      {error && (
        <p className="max-w-sm text-xs text-error">
          {t("account.signInFailed", { error })}
        </p>
      )}
      <p className="max-w-sm text-xs text-mid-gray">{t("account.privacy")}</p>
    </Shell>
  );
};

const REASON_ICON: Record<BlockReason, typeof ShieldAlert> = {
  expired: ShieldAlert,
  banned: ShieldAlert,
  offline: WifiOff,
};

export const BlockedScreen: React.FC<{ reason: BlockReason }> = ({
  reason,
}) => {
  const { t } = useTranslation();
  const email = useAuthStore((state) => state.email);
  const checking = useAuthStore((state) => state.checking);
  const recheck = useAuthStore((state) => state.recheck);
  const signOut = useAuthStore((state) => state.signOut);
  const Icon = REASON_ICON[reason];

  return (
    <Shell>
      <div className="rounded-full bg-logo-primary/15 p-4 text-logo-primary">
        <Icon width={28} height={28} />
      </div>
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-semibold">
          {t(`account.blocked.${reason}.title`)}
        </h1>
        <p className="text-sm text-mid-gray">
          {t(`account.blocked.${reason}.body`)}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {reason === "expired" && (
          <Button variant="primary" onClick={() => openUrl(SITE_URL)}>
            {t("account.blocked.expired.action")}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={recheck}
          disabled={checking}
          className="flex items-center gap-2"
        >
          <RefreshCw width={14} height={14} />
          {t("account.checkAgain")}
        </Button>
        <Button
          variant="ghost"
          onClick={signOut}
          className="flex items-center gap-2"
        >
          <LogOut width={14} height={14} />
          {t("account.signOut")}
        </Button>
      </div>
      {email && (
        <p className="text-xs text-mid-gray">
          {t("account.signedInAs", { email })}
        </p>
      )}
    </Shell>
  );
};
