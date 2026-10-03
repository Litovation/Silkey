import React from "react";
import { useTranslation } from "react-i18next";
import { Lightbulb } from "lucide-react";
import { useDictationStats } from "../../hooks/useDictationStats";
import { dayStreak, paceScore, wordsPerMinute } from "../../lib/dictationStats";

const BLOCKS = Array.from({ length: 10 }, (_, index) => index);

const Stat: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <p className="flex items-baseline gap-2">
    <span className="text-2xl font-semibold tabular-nums">
      {value.toLocaleString()}
    </span>
    <span className="text-sm text-text/70">{label}</span>
  </p>
);

export const StatsCard: React.FC = () => {
  const { t } = useTranslation();
  const stats = useDictationStats();
  const wpm = wordsPerMinute(stats);
  const { score, band } = paceScore(wpm);

  return (
    <div className="rounded-2xl border border-mid-gray/20 bg-mid-gray/5">
      <div className="flex flex-col gap-2 p-5">
        <Stat value={stats.totalWords} label={t("stats.totalWords")} />
        <Stat value={wpm} label={t("stats.wpm")} />
        <Stat value={dayStreak(stats)} label={t("stats.dayStreak")} />
      </div>
      <div className="flex flex-col gap-2 border-t border-mid-gray/20 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">{t("stats.pace.title")}</h3>
          {score > 0 && (
            <span className="text-xs font-semibold tabular-nums text-text/70">
              {t("stats.pace.outOfTen", { score })}
            </span>
          )}
        </div>
        <div
          className="flex gap-1"
          role="img"
          aria-label={t("stats.pace.outOfTen", { score })}
        >
          {BLOCKS.map((index) => (
            <span
              key={index}
              className={`h-2 flex-1 rounded-sm ${
                index < score ? "bg-logo-primary" : "bg-mid-gray/20"
              }`}
            />
          ))}
        </div>
        <p className="flex gap-1.5 text-xs text-mid-gray">
          <Lightbulb width={14} height={14} className="mt-0.5 shrink-0" />
          <span>{t(`stats.pace.tips.${band}`)}</span>
        </p>
      </div>
    </div>
  );
};
