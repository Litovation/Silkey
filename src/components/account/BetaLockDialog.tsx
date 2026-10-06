import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Lock, Send } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { useAuthStore } from "../../stores/authStore";
import { TELEGRAM_CHANNEL_URL } from "../../lib/constants/community";
import { InviteCodeForm } from "./InviteCodeForm";

/** "Get a code" link to the Telegram channel; hidden until one is set. */
export const TelegramCodeButton: React.FC = () => {
  const { t } = useTranslation();
  if (!TELEGRAM_CHANNEL_URL) return null;
  return (
    <Button
      variant="secondary"
      onClick={() => openUrl(TELEGRAM_CHANNEL_URL)}
      className="flex items-center gap-2 whitespace-nowrap"
    >
      <Send width={14} height={14} />
      {t("account.referral.getCode")}
    </Button>
  );
};

/**
 * Shown when someone without a referral code presses the dictation keys
 * while the beta is invite-only. Recording itself is refused in Rust.
 */
export const BetaLockDialog: React.FC = () => {
  const { t } = useTranslation();
  const verdict = useAuthStore((state) => state.verdict);
  const [open, setOpen] = useState(false);
  const locked = verdict?.state === "blocked" && verdict.reason === "locked";

  useEffect(() => {
    const unlisten = listen("access-refused", () => setOpen(true));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  if (!open || !locked) return null;

  return (
    <Dialog
      open
      onOpenChange={setOpen}
      closeLabel={t("common.close")}
      title={
        <span className="flex items-center gap-2">
          <Lock width={18} height={18} className="text-logo-primary" />
          {t("account.referral.lockedTitle")}
        </span>
      }
      contentFades={false}
      className="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-sm">{t("account.referral.lockedBody")}</p>
        <InviteCodeForm alwaysOpen onRedeemed={() => setOpen(false)} />
        <TelegramCodeButton />
      </div>
    </Dialog>
  );
};
