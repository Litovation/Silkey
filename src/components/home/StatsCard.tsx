import React from "react";
import { useTranslation } from "react-i18next";
import { Clock3, Flame, Gauge, Lightbulb, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDictationStats } from "../../hooks/useDictationStats";
import {
  dayStreak,
  minutesSaved,
  paceScore,
  wordsPerMinute,
} from "../../lib/dictationStats";

const BLOCKS = Array.from({ length: 10 }, (_, index) => index);

const Tile: React.FC<{
  icon: LucideIcon;
  value: string;
  label: string;
  children?: React.ReactNode;
}> = ({ icon: Icon, value, label, children }) => (
  <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-mid-gray/15 bg-surface p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:border-brand-pink/30">
    <span className="flex items-center gap-2 text-xs font-medium text-text/55">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-pink/10 text-brand-pink">
        <Icon width={13} height={13} />
      </span>
      <span className="truncate">{label}</span>
    </span>
    <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
      {value}
    </span>
    {children}
  </div>
);

/** The home page's numbers: words, pace, streak and time saved. */
export const StatsCard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const stats = useDictationStats();
  const wpm = wordsPerMinute(stats);
  const { score, band } = paceScore(wpm);
  const format = (n: number) => n.toLocaleString(i18n.language);
  const saved = minutesSaved(stats);

  return (
    <section aria-label={t("stats.title")} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          icon={Type}
          value={format(stats.totalWords)}
          label={t("stats.words")}
        />
        <Tile icon={Gauge} value={format(wpm)} label={t("stats.speed")}>
          <div
            className="flex gap-0.5"
            role="img"
            aria-label={t("stats.pace.outOfTen", { score })}
          >
            {BLOCKS.map((index) => (
              <span
                key={index}
                className={`h-1 flex-1 rounded-full ${
                  index < score ? "bg-brand-pink" : "bg-mid-gray/20"
                }`}
              />
            ))}
          </div>
        </Tile>
        <Tile
          icon={Flame}
          value={t("stats.days", { count: dayStreak(stats) })}
          label={t("stats.streak")}
        />
        <Tile
          icon={Clock3}
          value={t("stats.minutes", { count: saved })}
          label={t("stats.saved")}
        />
      </div>
      <p className="flex items-start gap-1.5 px-1 text-xs text-text/55">
        <Lightbulb width={14} height={14} className="mt-0.5 shrink-0" />
        <span>{t(`stats.pace.tips.${band}`)}</span>
      </p>
    </section>
  );
};
