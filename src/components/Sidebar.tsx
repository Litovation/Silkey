import React from "react";
import { useTranslation } from "react-i18next";
import { Bot, Gift, Lock, Mic, Route, Settings, UserRound } from "lucide-react";
import SilktoneWordmark from "./icons/SilktoneWordmark";
import LitovationLogo from "./icons/LitovationLogo";
import { NotificationStack } from "./notifications";
import type { SettingsTab } from "./settings/SettingsModal";
import { useAuthStore } from "../stores/authStore";

interface SidebarProps {
  onOpenSettings: (tab: SettingsTab) => void;
  onReplayWalkthrough: () => void;
}

const COMMAND_GO = "CommandGo";

const soonTagClasses =
  "ms-auto rounded-full bg-brand-pink/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-brand-pink";

const itemClasses =
  "flex gap-3 items-center px-3 py-2 w-full rounded-lg cursor-pointer transition-colors text-start";

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenSettings,
  onReplayWalkthrough,
}) => {
  const { t } = useTranslation();
  const email = useAuthStore((state) => state.email);

  return (
    <div className="flex flex-col w-52 h-full border-e border-mid-gray/20 bg-mid-gray/5 px-2">
      <div className="flex flex-col items-start gap-1.5 mx-3 mt-5 mb-5 text-text">
        <SilktoneWordmark withVersion width={150} />
        <div className="flex items-center gap-1.5 ps-1 opacity-80">
          <span className="text-[11px] leading-none text-mid-gray">
            {t("sidebar.by")}
          </span>
          <LitovationLogo width={64} />
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        <div
          className={`${itemClasses} bg-logo-primary/15`}
          aria-current="page"
        >
          <Mic width={18} height={18} className="shrink-0 text-logo-primary" />
          <span className="text-sm font-medium truncate">
            {t("sidebar.general")}
          </span>
        </div>
        <div
          className={`${itemClasses} cursor-not-allowed opacity-60`}
          aria-disabled="true"
          title={t("sidebar.comingSoon")}
        >
          <Bot width={18} height={18} className="shrink-0" />
          <span className="text-sm font-medium truncate">{COMMAND_GO}</span>
          <Lock width={14} height={14} className="ms-auto shrink-0" />
        </div>
      </nav>

      <div className="mt-auto">
        <NotificationStack />
      </div>

      <div className="flex flex-col gap-1 pb-3 pt-3 border-t border-mid-gray/20">
        {/* Always available, but deliberately quieter than the items below. */}
        <button
          type="button"
          className={`${itemClasses} text-mid-gray hover:bg-mid-gray/10 hover:text-text/80`}
          onClick={onReplayWalkthrough}
        >
          <Route width={16} height={16} className="shrink-0" />
          <span className="text-xs font-medium truncate">
            {t("sidebar.walkthrough")}
          </span>
        </button>
        <button
          type="button"
          className={`${itemClasses} hover:bg-mid-gray/15`}
          onClick={() => onOpenSettings("general")}
        >
          <Settings width={18} height={18} className="shrink-0" />
          <span className="text-sm font-medium truncate">
            {t("sidebar.advanced")}
          </span>
        </button>
        <div
          className={`${itemClasses} cursor-not-allowed opacity-70`}
          aria-disabled="true"
          title={t("sidebar.comingSoon")}
        >
          <Gift width={18} height={18} className="shrink-0" />
          <span className="text-sm font-medium truncate">
            {t("sidebar.referAndEarn")}
          </span>
          <span className={soonTagClasses}>{t("sidebar.soon")}</span>
        </div>
        <button
          type="button"
          className={`${itemClasses} hover:bg-mid-gray/15`}
          onClick={() => onOpenSettings("account")}
        >
          <span className="shrink-0 rounded-full bg-logo-primary/20 p-1 text-logo-primary">
            <UserRound width={14} height={14} />
          </span>
          <span className="text-sm font-medium truncate" title={email}>
            {email || t("account.title")}
          </span>
        </button>
      </div>
    </div>
  );
};
