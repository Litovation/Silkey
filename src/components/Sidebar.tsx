import React from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Gift,
  Lock,
  Mic,
  Quote,
  Route,
  Settings,
  UserRound,
} from "lucide-react";
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
  "ms-auto rounded-full bg-brand-pink/12 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-brand-pink";

const itemClasses =
  "flex gap-2.5 items-center px-2.5 h-9 w-full rounded-xl cursor-pointer transition-colors text-start text-sm";

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenSettings,
  onReplayWalkthrough,
}) => {
  const { t } = useTranslation();
  const email = useAuthStore((state) => state.email);
  const initial = (email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="flex flex-col w-56 h-full border-e border-mid-gray/15 bg-mid-gray/[0.045] px-3">
      <div className="flex flex-col items-start gap-1.5 px-2 pt-5 pb-6 text-text">
        <SilktoneWordmark withVersion width={136} />
        <div className="flex items-center gap-1.5 ps-0.5 opacity-70">
          <span className="text-[11px] leading-none text-mid-gray">
            {t("sidebar.by")}
          </span>
          <LitovationLogo width={58} />
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        <div
          className={`${itemClasses} relative bg-surface font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-brand-pink/15 before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-brand-pink`}
          aria-current="page"
        >
          <Mic width={17} height={17} className="shrink-0 text-brand-pink" />
          <span className="truncate">{t("sidebar.general")}</span>
        </div>
        <button
          type="button"
          className={`${itemClasses} font-medium text-text/60 hover:bg-mid-gray/10 hover:text-text`}
          onClick={() => onOpenSettings("snippets")}
        >
          <Quote width={17} height={17} className="shrink-0" />
          <span className="truncate">{t("sidebar.snippets")}</span>
        </button>
        <div
          className={`${itemClasses} cursor-not-allowed font-medium text-text/45`}
          aria-disabled="true"
          title={t("sidebar.comingSoon")}
        >
          <Bot width={17} height={17} className="shrink-0" />
          <span className="truncate">{COMMAND_GO}</span>
          <Lock width={13} height={13} className="ms-auto shrink-0" />
        </div>
      </nav>

      <div className="mt-auto">
        <NotificationStack />
      </div>

      <div className="flex flex-col gap-0.5 pb-3 pt-3">
        <button
          type="button"
          className={`${itemClasses} font-medium text-text/60 hover:bg-mid-gray/10 hover:text-text`}
          onClick={onReplayWalkthrough}
        >
          <Route width={16} height={16} className="shrink-0" />
          <span className="truncate">{t("sidebar.walkthrough")}</span>
        </button>
        <div
          className={`${itemClasses} cursor-not-allowed font-medium text-text/45`}
          aria-disabled="true"
          title={t("sidebar.comingSoon")}
        >
          <Gift width={16} height={16} className="shrink-0" />
          <span className="truncate">{t("sidebar.referAndEarn")}</span>
          <span className={soonTagClasses}>{t("sidebar.soon")}</span>
        </div>
        <button
          type="button"
          className={`${itemClasses} font-medium text-text/60 hover:bg-mid-gray/10 hover:text-text`}
          onClick={() => onOpenSettings("general")}
        >
          <Settings width={16} height={16} className="shrink-0" />
          <span className="truncate">{t("sidebar.advanced")}</span>
        </button>
        <button
          type="button"
          className="mt-2 flex w-full items-center gap-2.5 rounded-xl border border-mid-gray/15 bg-surface p-2 text-start shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:border-mid-gray/30 cursor-pointer"
          onClick={() => onOpenSettings("account")}
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-pink/12 text-xs font-semibold text-brand-pink"
            aria-hidden="true"
          >
            {email ? initial : <UserRound width={14} height={14} />}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-xs font-semibold"
              title={email}
            >
              {email || t("account.title")}
            </span>
            <span className="block text-[11px] leading-tight text-text/50">
              {t("sidebar.account")}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
};
