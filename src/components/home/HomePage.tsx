import React from "react";
import { useTranslation } from "react-i18next";
import { useShortcutKeycaps } from "../../hooks/useShortcutKeycaps";
import { HistorySettings } from "../settings/history/HistorySettings";
import { ToneBanner } from "./ToneBanner";
import { StatsCard } from "./StatsCard";

/** Morning, afternoon or evening, by the local clock. */
const greetingKey = (hour: number): string =>
  hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

export const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const keys = useShortcutKeycaps();

  return (
    <div className="max-w-4xl w-full mx-auto space-y-6 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
            {t(`home.greeting.${greetingKey(new Date().getHours())}`)}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-text/60">
            <span>{t("toneBanner.press")}</span>
            {keys.map((key, index) => (
              <React.Fragment key={`${key}-${index}`}>
                {index > 0 && (
                  <span aria-hidden="true" className="text-text/40">
                    {"+"}
                  </span>
                )}
                <kbd className="rounded-md border border-mid-gray/25 border-b-2 bg-surface px-1.5 py-px font-sans text-xs font-semibold text-text/80">
                  {key}
                </kbd>
              </React.Fragment>
            ))}
            <span>{t("toneBanner.andSpeak")}</span>
          </p>
        </div>
      </header>

      <StatsCard />
      <ToneBanner />
      <HistorySettings />
    </div>
  );
};
