import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Ticket } from "lucide-react";
import { Button } from "../ui/Button";
import { useAuthStore } from "../../stores/authStore";
import { findInviteCode } from "../../lib/auth";

/**
 * Typing in a referral (beta invite) code by hand. Codes on the clipboard are
 * usually redeemed on their own when the user comes back to Silktone.
 */
export const InviteCodeForm: React.FC<{
  className?: string;
  /** Show the field straight away instead of a "Have a code?" link. */
  alwaysOpen?: boolean;
  onRedeemed?: () => void;
}> = ({ className = "", alwaysOpen = false, onRedeemed }) => {
  const { t } = useTranslation();
  const redeemInvite = useAuthStore((state) => state.redeemInvite);
  const inviteBusy = useAuthStore((state) => state.inviteBusy);
  const inviteError = useAuthStore((state) => state.inviteError);
  const [open, setOpen] = useState(alwaysOpen);
  const [value, setValue] = useState("");
  const [formatError, setFormatError] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`cursor-pointer text-xs text-mid-gray underline underline-offset-2 hover:text-text ${className}`}
      >
        {t("account.invite.haveCode")}
      </button>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = findInviteCode(value);
    setFormatError(!code);
    if (code && (await redeemInvite(code))) {
      setValue("");
      setOpen(alwaysOpen);
      onRedeemed?.();
    }
  };

  const error = formatError ? "invalid" : inviteError;

  return (
    <form onSubmit={submit} className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="glass-control flex flex-1 items-center gap-2 rounded-lg px-3 py-1.5">
          <Ticket width={14} height={14} className="shrink-0 text-mid-gray" />
          <input
            autoFocus={!alwaysOpen}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("account.invite.placeholder")}
            aria-label={t("account.invite.haveCode")}
            spellCheck={false}
            className="w-full bg-transparent text-sm uppercase tracking-wide outline-none placeholder:normal-case placeholder:tracking-normal"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={inviteBusy || !value.trim()}
        >
          {t("account.invite.redeem")}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-error">
          {t(`account.invite.error.${error}`)}
        </p>
      )}
    </form>
  );
};
