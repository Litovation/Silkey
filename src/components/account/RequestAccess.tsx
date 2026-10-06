import React from "react";
import { useTranslation } from "react-i18next";
import { Clock, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { useAuthStore } from "../../stores/authStore";
import { InviteCodeForm } from "./InviteCodeForm";

/**
 * How a locked account gets into the beta: one tap on "Request beta access"
 * (approved by the server, usually at once), or a referral code for people
 * invited directly.
 */
export const RequestAccess: React.FC<{ onUnlocked?: () => void }> = ({
  onUnlocked,
}) => {
  const { t } = useTranslation();
  const verdict = useAuthStore((state) => state.verdict);
  const requestAccess = useAuthStore((state) => state.requestAccess);
  const busy = useAuthStore((state) => state.accessRequestBusy);
  const error = useAuthStore((state) => state.accessRequestError);
  const recheck = useAuthStore((state) => state.recheck);
  const checking = useAuthStore((state) => state.checking);

  const pending =
    verdict?.state === "blocked" && verdict.access?.beta_request === "pending";

  const request = async () => {
    await requestAccess();
    if (useAuthStore.getState().verdict?.state === "allowed") onUnlocked?.();
  };

  return (
    <div className="space-y-3">
      {pending ? (
        <div className="flex items-start gap-2 rounded-lg bg-logo-primary/10 p-3 text-sm">
          <Clock
            width={16}
            height={16}
            className="mt-0.5 shrink-0 text-logo-primary"
          />
          <div className="space-y-1">
            <p>{t("account.request.pending")}</p>
            <button
              type="button"
              onClick={recheck}
              disabled={checking}
              className="cursor-pointer text-xs text-mid-gray underline underline-offset-2 hover:text-text disabled:opacity-50"
            >
              {t("account.checkAgain")}
            </button>
          </div>
        </div>
      ) : (
        <Button
          variant="primary"
          onClick={request}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2"
        >
          <Sparkles width={16} height={16} />
          {t("account.request.button")}
        </Button>
      )}
      {error && (
        <p className="text-xs text-error">
          {t(`account.request.error.${error}`)}
        </p>
      )}
      <InviteCodeForm onRedeemed={onUnlocked} />
    </div>
  );
};
