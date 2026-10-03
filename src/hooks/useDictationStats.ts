import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { commands, events, type HistoryEntry } from "@/bindings";
import {
  addDictation,
  loadStats,
  saveStats,
  wavSeconds,
  type DictationStats,
} from "@/lib/dictationStats";

const recordingSeconds = async (fileName: string): Promise<number | null> => {
  try {
    const result = await commands.getAudioFilePath(fileName);
    if (result.status !== "ok") return null;
    const response = await fetch(convertFileSrc(result.data, "asset"));
    if (!response.ok) return null;
    return wavSeconds(await response.arrayBuffer());
  } catch {
    return null;
  }
};

// Entries are counted one at a time, re-reading storage each time, so the
// startup catch-up and live events can never count the same entry twice.
let queue: Promise<unknown> = Promise.resolve();

const countEntry = (entry: HistoryEntry): Promise<DictationStats> => {
  const task = queue.then(async () => {
    const stats = loadStats();
    const text = entry.transcription_text;
    if (entry.id <= stats.lastEntryId || !text.trim()) return stats;
    const seconds = await recordingSeconds(entry.file_name);
    const next = addDictation(
      stats,
      { id: entry.id, text, timestamp: entry.timestamp },
      seconds,
    );
    saveStats(next);
    return next;
  });
  queue = task.catch(() => undefined);
  return task;
};

export const useDictationStats = (): DictationStats => {
  const [stats, setStats] = useState<DictationStats>(loadStats);

  useEffect(() => {
    let active = true;
    const apply = (next: DictationStats) => {
      if (active) setStats(next);
    };

    // Catch up on dictations made while this window was not listening.
    commands
      .getHistoryEntries(null, 50)
      .then((result) => {
        if (result.status !== "ok") return;
        const oldestFirst = [...result.data.entries].sort(
          (a, b) => a.id - b.id,
        );
        for (const entry of oldestFirst) countEntry(entry).then(apply);
      })
      .catch(() => undefined);

    const unlisten = events.historyUpdatePayload.listen((event) => {
      if (event.payload.action === "added") {
        countEntry(event.payload.entry).then(apply);
      }
    });

    return () => {
      active = false;
      unlisten.then((fn) => fn());
    };
  }, []);

  return stats;
};
