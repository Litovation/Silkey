import React from "react";
import { useTranslation } from "react-i18next";
import { useShortcutKeycaps } from "../../hooks/useShortcutKeycaps";
import { HistorySettings } from "../settings/history/HistorySettings";
import { ToneBanner } from "./ToneBanner";
import { StatsCard } from "./StatsCard";

export const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const keys = useShortcutKeycaps();

  return (
    <div className="max-w-5xl w-full mx-auto space-y-5">
      <div className="px-1 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("toneBanner.welcome")}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-text/80">
          <span>{t("toneBanner.press")}</span>
          {keys.map((key, index) => (
            <React.Fragment key={`${key}-${index}`}>
              {index > 0 && <span aria-hidden="true">{"+"}</span>}
              <kbd className="rounded-md border border-mid-gray/40 bg-mid-gray/10 px-1.5 py-0.5 text-xs font-semibold">
                {key}
              </kbd>
            </React.Fragment>
          ))}
          <span>{t("toneBanner.andSpeak")}</span>
        </p>
      </div>
      <ToneBanner />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <HistorySettings />
        <StatsCard />
      </div>
    </div>
  );
};
