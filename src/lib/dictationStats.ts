/**
 * Running dictation totals shown on the home page. Kept in the webview's
 * localStorage because history itself is trimmed to a few entries, so totals
 * cannot be recomputed from it later.
 */
export interface DictationStats {
  totalWords: number;
  /** Words from dictations whose recording length is known (basis for WPM). */
  timedWords: number;
  timedSeconds: number;
  /** Local dates (YYYY-MM-DD) with at least one dictation. */
  days: string[];
  /** Highest history entry id already counted. */
  lastEntryId: number;
}

const STORAGE_KEY = "silktone.dictationStats";
const MAX_DAYS = 400;
// Shorter clips give meaningless words-per-minute figures.
const MIN_TIMED_SECONDS = 0.5;

const EMPTY: DictationStats = {
  totalWords: 0,
  timedWords: 0,
  timedSeconds: 0,
  days: [],
  lastEntryId: 0,
};

export const loadStats = (): DictationStats => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...EMPTY };
};

export const saveStats = (stats: DictationStats): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
};

export const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const addDictation = (
  stats: DictationStats,
  entry: { id: number; text: string; timestamp: number },
  seconds: number | null,
): DictationStats => {
  const words = countWords(entry.text);
  const day = dayKey(new Date(entry.timestamp * 1000));
  const days = stats.days.includes(day) ? stats.days : [...stats.days, day];
  return {
    totalWords: stats.totalWords + words,
    timedWords: stats.timedWords + (seconds ? words : 0),
    timedSeconds: stats.timedSeconds + (seconds ?? 0),
    days: days.slice(-MAX_DAYS),
    lastEntryId: Math.max(stats.lastEntryId, entry.id),
  };
};

export const wordsPerMinute = (stats: DictationStats): number =>
  stats.timedSeconds > 0
    ? Math.round(stats.timedWords / (stats.timedSeconds / 60))
    : 0;

/** Consecutive days with a dictation, ending today or yesterday. */
export const dayStreak = (stats: DictationStats, now = new Date()): number => {
  const days = new Set(stats.days);
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

export type PaceBand = "none" | "slow" | "good" | "fast";

/**
 * Pace score out of 10. Dictation is most accurate at a natural speaking pace
 * (roughly 120-160 wpm); the score drops one block per 10 wpm outside it.
 */
export const paceScore = (wpm: number): { score: number; band: PaceBand } => {
  if (wpm <= 0) return { score: 0, band: "none" };
  const distance = Math.max(0, Math.abs(wpm - 140) - 20);
  const score = Math.min(10, Math.max(1, Math.round(10 - distance / 10)));
  const band = wpm < 120 ? "slow" : wpm > 160 ? "fast" : "good";
  return { score, band };
};

/** Length of a PCM WAV recording in seconds, from its header's byte rate. */
export const wavSeconds = (buffer: ArrayBuffer): number | null => {
  if (buffer.byteLength <= 44) return null;
  const view = new DataView(buffer);
  // "RIFF" .... "WAVE" — anything else is not a recording we can time.
  if (view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57415645)
    return null;
  const byteRate = view.getUint32(28, true);
  if (!byteRate) return null;
  const seconds = (buffer.byteLength - 44) / byteRate;
  return seconds >= MIN_TIMED_SECONDS ? seconds : null;
};
