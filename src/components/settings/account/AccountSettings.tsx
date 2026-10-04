import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, UserRound } from "lucide-react";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Tooltip } from "../../ui/Tooltip";
import { useAuthStore } from "../../../stores/authStore";
import { trialDaysLeft, type Access } from "../../../lib/auth";

const usePaidDate = (access: Access | null): string => {
  const { i18n } = useTranslation();
  if (!access?.paid_until) return "";
  return new Intl.DateTimeFormat(i18n.language, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(access.paid_until));
};

/** A renewal was due and has not been paid; the grace period is running. */
const isPaymentDue = (access: Access): boolean =>
  !!access.paid_until &&
  !access.cancel_at_period_end &&
  new Date(access.paid_until).getTime() < Date.now();

const usePlanLabel = (access: Access | null, paidDate: string): string => {
  const { t } = useTranslation();
  if (!access) return "";
  if (access.status === "trial") {
    return t("account.plan.trial", { count: trialDaysLeft(access) });
  }
  if (access.status === "paid" && paidDate) {
    if (isPaymentDue(access)) return t("account.plan.paymentDue");
    return access.cancel_at_period_end
      ? t("account.plan.paidEnds", { date: paidDate })
      : t("account.plan.paidRenews", { date: paidDate });
  }
  return t(`account.plan.${access.status}`);
};

const UpgradeButton: React.FC<{ access: Access }> = ({ access }) => {
  const { t } = useTranslation();
  const subscribe = useAuthStore((state) => state.subscribe);
  const paymentBusy = useAuthStore((state) => state.paymentBusy);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);

  return (
    <span
      ref={wrapperRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Button
        variant="primary"
        onClick={subscribe}
        disabled={paymentBusy}
        className="whitespace-nowrap"
      >
        {t("account.subscribe")}
      </Button>
      {hovered && (
        <Tooltip targetRef={wrapperRef} position="top">
          <p className="text-xs text-center">
            {t("account.trialTooltip", { count: trialDaysLeft(access) })}
          </p>
        </Tooltip>
      )}
    </span>
  );
};

const ManagePlanDialog: React.FC<{
  access: Access;
  paidDate: string;
  onClose: () => void;
}> = ({ access, paidDate, onClose }) => {
  const { t } = useTranslation();
  const cancelSubscription = useAuthStore((state) => state.cancelSubscription);
  const paymentBusy = useAuthStore((state) => state.paymentBusy);
  const paymentError = useAuthStore((state) => state.paymentError);
  const [confirming, setConfirming] = useState(false);

  const confirmCancel = async () => {
    if (await cancelSubscription()) onClose();
  };

  let summary = t("account.manage.renews", { date: paidDate });
  if (access.cancel_at_period_end) {
    summary = t("account.manage.ends", { date: paidDate });
  } else if (isPaymentDue(access)) {
    summary = t("account.manage.paymentDue");
  }

  return (
    <Dialog
      open
      onOpenChange={onClose}
      closeLabel={t("common.close")}
      title={
        confirming
          ? t("account.manage.confirmTitle")
          : t("account.manage.title")
      }
      contentFades={false}
      className="max-w-md"
      footer={
        confirming && (
          <>
            <Button
              variant="danger-ghost"
              onClick={confirmCancel}
              disabled={paymentBusy}
            >
              {t("account.manage.confirm")}
            </Button>
            <Button variant="primary" onClick={() => setConfirming(false)}>
              {t("account.manage.keep")}
            </Button>
          </>
        )
      }
    >
      {confirming ? (
        <div className="space-y-2">
          <p className="text-sm">
            {t("account.manage.confirmBody", { date: paidDate })}
          </p>
          {paymentError && (
            <p className="text-xs text-error">
              {t("account.paymentError.generic")}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm">{summary}</p>
          {!access.cancel_at_period_end && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="cursor-pointer text-xs text-mid-gray underline underline-offset-2 hover:text-text"
            >
              {t("account.manage.cancelLink")}
            </button>
          )}
        </div>
      )}
    </Dialog>
  );
};

export const AccountSettings: React.FC = () => {
  const { t } = useTranslation();
  const email = useAuthStore((state) => state.email);
  const verdict = useAuthStore((state) => state.verdict);
  const signOut = useAuthStore((state) => state.signOut);
  const awaitingPayment = useAuthStore((state) => state.awaitingPayment);
  const paymentError = useAuthStore((state) => state.paymentError);
  const [managing, setManaging] = useState(false);

  const access = verdict?.state === "allowed" ? verdict.access : null;
  const paidDate = usePaidDate(access);
  const planLabel = usePlanLabel(access, paidDate);
  const offline = verdict?.state === "allowed" && verdict.offline;
  const onTrial = access?.status === "trial";
  const subscribed = access?.status === "paid" && !!paidDate;

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
              {subscribed && !offline && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => setManaging(true)}
                    className="cursor-pointer underline underline-offset-2 hover:text-text"
                  >
                    {t("account.managePlan")}
                  </button>
                </>
              )}
            </p>
            {onTrial && awaitingPayment && (
              <p className="mt-1 text-xs text-mid-gray">
                {t("account.finishPayment")}
              </p>
            )}
            {onTrial && paymentError && (
              <p className="mt-1 text-xs text-error">
                {t(`account.paymentError.${paymentError}`, {
                  defaultValue: t("account.paymentError.generic"),
                })}
              </p>
            )}
          </div>
          {access && onTrial && !offline && <UpgradeButton access={access} />}
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
      {managing && access && (
        <ManagePlanDialog
          access={access}
          paidDate={paidDate}
          onClose={() => setManaging(false)}
        />
      )}
    </div>
  );
};
