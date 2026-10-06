import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { Lock } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { useAuthStore } from "../../stores/authStore";
import { RequestAccess } from "./RequestAccess";

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
        <RequestAccess onUnlocked={() => setOpen(false)} />
      </div>
    </Dialog>
  );
};
