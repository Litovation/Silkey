import React, { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  AudioLines,
  Check,
  Copy,
  FolderOpen,
  Mic,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  commands,
  events,
  type HistoryEntry,
  type HistoryUpdatePayload,
} from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { AudioPlayer, AudioPlayerGroup } from "../../ui/AudioPlayer";
import { Button } from "../../ui/Button";

const IconButton: React.FC<{
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, disabled, active, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`p-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-text/20 ${
      active
        ? "text-logo-primary hover:bg-logo-primary/10"
        : "text-text/45 hover:bg-mid-gray/10 hover:text-text"
    }`}
    title={title}
  >
    {children}
  </button>
);

const PAGE_SIZE = 30;

/** Local calendar day of a history timestamp (seconds), for grouping. */
const dayOf = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/** "Today", "Yesterday" or a short date, as the heading of a day's entries. */
const useDayLabel = () => {
  const { t, i18n } = useTranslation();
  return (timestamp: number): string => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const day = dayOf(timestamp);
    if (day === dayOf(now.getTime() / 1000)) return t("settings.history.today");
    if (day === dayOf(yesterday.getTime() / 1000)) {
      return t("settings.history.yesterday");
    }
    return new Date(timestamp * 1000).toLocaleDateString(i18n.language, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  };
};

/** Entries split into consecutive runs from the same day, newest first. */
const groupByDay = (
  entries: HistoryEntry[],
): { day: string; entries: HistoryEntry[] }[] => {
  const groups: { day: string; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const day = dayOf(entry.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
};

interface OpenRecordingsButtonProps {
  onClick: () => void;
  label: string;
}

const OpenRecordingsButton: React.FC<OpenRecordingsButtonProps> = ({
  onClick,
  label,
}) => (
  <Button
    onClick={onClick}
    variant="ghost"
    size="sm"
    className="flex items-center gap-1.5 text-text/60 hover:text-text"
    title={label}
  >
    <FolderOpen className="w-3.5 h-3.5" />
    <span className="text-xs">{label}</span>
  </Button>
);

export const HistorySettings: React.FC = () => {
  const { t } = useTranslation();
  const osType = useOsType();
  const dayLabel = useDayLabel();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef<HistoryEntry[]>([]);
  const loadingRef = useRef(false);

  // Keep ref in sync for use in IntersectionObserver callback
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const loadPage = useCallback(async (cursor?: number) => {
    const isFirstPage = cursor === undefined;
    if (!isFirstPage && loadingRef.current) return;
    loadingRef.current = true;

    if (isFirstPage) setLoading(true);

    try {
      const result = await commands.getHistoryEntries(
        cursor ?? null,
        PAGE_SIZE,
      );
      if (result.status === "ok") {
        const { entries: newEntries, has_more } = result.data;
        setEntries((prev) =>
          isFirstPage ? newEntries : [...prev, ...newEntries],
        );
        setHasMore(has_more);
      }
    } catch (error) {
      console.error("Failed to load history entries:", error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (loading) return;

    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        const first = observerEntries[0];
        if (first.isIntersecting) {
          const lastEntry = entriesRef.current[entriesRef.current.length - 1];
          if (lastEntry) {
            loadPage(lastEntry.id);
          }
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, hasMore, loadPage]);

  // Listen for new entries added from the transcription pipeline
  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload: HistoryUpdatePayload = event.payload;
      if (payload.action === "added") {
        setEntries((prev) => [payload.entry, ...prev]);
      } else if (payload.action === "updated") {
        setEntries((prev) =>
          prev.map((e) => (e.id === payload.entry.id ? payload.entry : e)),
        );
      }
      // "deleted" and "toggled" are handled by optimistic updates only,
      // so we intentionally ignore them here to avoid double-mutation.
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const toggleSaved = async (id: number) => {
    // Optimistic update
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
    );
    try {
      const result = await commands.toggleHistoryEntrySaved(id);
      if (result.status !== "ok") {
        // Revert on failure
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
        );
      }
    } catch (error) {
      console.error("Failed to toggle saved status:", error);
      // Revert on failure
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
      );
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const getAudioUrl = useCallback(
    async (fileName: string) => {
      try {
        const result = await commands.getAudioFilePath(fileName);
        if (result.status === "ok") {
          if (osType === "linux") {
            const fileData = await readFile(result.data);
            const blob = new Blob([fileData], { type: "audio/wav" });
            return URL.createObjectURL(blob);
          }
          return convertFileSrc(result.data, "asset");
        }
        return null;
      } catch (error) {
        console.error("Failed to get audio file path:", error);
        return null;
      }
    },
    [osType],
  );

  const deleteAudioEntry = async (id: number) => {
    // Optimistically remove
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      const result = await commands.deleteHistoryEntry(id);
      if (result.status !== "ok") {
        // Reload on failure
        loadPage();
      }
    } catch (error) {
      console.error("Failed to delete entry:", error);
      loadPage();
    }
  };

  const retryHistoryEntry = async (id: number) => {
    const result = await commands.retryHistoryEntryTranscription(id);
    if (result.status !== "ok") {
      throw new Error(String(result.error));
    }
  };

  const openRecordingsFolder = async () => {
    try {
      const result = await commands.openRecordingsFolder();
      if (result.status !== "ok") {
        throw new Error(String(result.error));
      }
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
    }
  };

  let content: React.ReactNode;

  if (loading) {
    content = (
      <div className="rounded-2xl border border-mid-gray/15 bg-surface px-4 py-8 text-center text-sm text-text/50">
        {t("settings.history.loading")}
      </div>
    );
  } else if (entries.length === 0) {
    content = (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-mid-gray/30 bg-surface/60 px-6 py-10 text-center">
        <span className="rounded-full bg-logo-primary/10 p-3 text-logo-primary">
          <Mic width={20} height={20} />
        </span>
        <p className="text-sm font-medium">
          {t("settings.history.emptyTitle")}
        </p>
        <p className="max-w-sm text-xs text-text/55">
          {t("settings.history.empty")}
        </p>
      </div>
    );
  } else {
    content = (
      <>
        <AudioPlayerGroup>
          <div className="space-y-5">
            {groupByDay(entries).map((group) => (
              <div key={group.day} className="space-y-2">
                <h3 className="px-1 text-xs font-semibold text-text/50">
                  {dayLabel(group.entries[0].timestamp)}
                </h3>
                <div className="divide-y divide-mid-gray/10 overflow-hidden rounded-2xl border border-mid-gray/15 bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
                  {group.entries.map((entry) => (
                    <HistoryEntryComponent
                      key={entry.id}
                      entry={entry}
                      onToggleSaved={() => toggleSaved(entry.id)}
                      onCopyText={() =>
                        copyToClipboard(entry.transcription_text)
                      }
                      getAudioUrl={getAudioUrl}
                      deleteAudio={deleteAudioEntry}
                      retryTranscription={retryHistoryEntry}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </AudioPlayerGroup>
        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-1" />
      </>
    );
  }

  return (
    <section className="w-full space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-semibold tracking-tight">
          {t("settings.history.title")}
        </h2>
        <OpenRecordingsButton
          onClick={openRecordingsFolder}
          label={t("settings.history.openFolder")}
        />
      </div>
      {content}
    </section>
  );
};

interface HistoryEntryProps {
  entry: HistoryEntry;
  onToggleSaved: () => void;
  onCopyText: () => void;
  getAudioUrl: (fileName: string) => Promise<string | null>;
  deleteAudio: (id: number) => Promise<void>;
  retryTranscription: (id: number) => Promise<void>;
}

const HistoryEntryComponent: React.FC<HistoryEntryProps> = ({
  entry,
  onToggleSaved,
  onCopyText,
  getAudioUrl,
  deleteAudio,
  retryTranscription,
}) => {
  const { t, i18n } = useTranslation();
  const [showCopied, setShowCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // The player only appears when asked for, so the list reads as text.
  const [showAudio, setShowAudio] = useState(false);

  const hasTranscription = entry.transcription_text.trim().length > 0;

  const handleLoadAudio = useCallback(
    () => getAudioUrl(entry.file_name),
    [getAudioUrl, entry.file_name],
  );

  const handleCopyText = () => {
    if (!hasTranscription) {
      return;
    }

    onCopyText();
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const handleDeleteEntry = async () => {
    try {
      await deleteAudio(entry.id);
    } catch (error) {
      console.error("Failed to delete entry:", error);
      toast.error(t("settings.history.deleteError"));
    }
  };

  const handleRetranscribe = async () => {
    try {
      setRetrying(true);
      await retryTranscription(entry.id);
    } catch (error) {
      console.error("Failed to re-transcribe:", error);
      toast.error(t("settings.history.retranscribeError"));
    } finally {
      setRetrying(false);
    }
  };

  const time = new Date(entry.timestamp * 1000).toLocaleTimeString(
    i18n.language,
    { hour: "numeric", minute: "2-digit" },
  );

  return (
    <div className="group relative grid grid-cols-[4.5rem_1fr] gap-x-3 px-4 py-3.5 transition-colors hover:bg-mid-gray/[0.04]">
      <p className="pt-px text-xs tabular-nums text-text/45">{time}</p>
      <div className="min-w-0 flex flex-col gap-2">
        <div className="absolute end-2 top-2 flex items-center rounded-xl border border-mid-gray/15 bg-surface p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <IconButton
            onClick={() => setShowAudio((current) => !current)}
            active={showAudio}
            title={t("settings.history.listen")}
          >
            <AudioLines width={15} height={15} />
          </IconButton>
          <IconButton
            onClick={handleCopyText}
            disabled={!hasTranscription || retrying}
            title={t("settings.history.copyToClipboard")}
          >
            {showCopied ? (
              <Check width={15} height={15} />
            ) : (
              <Copy width={15} height={15} />
            )}
          </IconButton>
          <IconButton
            onClick={onToggleSaved}
            disabled={retrying}
            active={entry.saved}
            title={
              entry.saved
                ? t("settings.history.unsave")
                : t("settings.history.save")
            }
          >
            <Star
              width={15}
              height={15}
              fill={entry.saved ? "currentColor" : "none"}
            />
          </IconButton>
          <IconButton
            onClick={handleRetranscribe}
            disabled={retrying}
            title={t("settings.history.retranscribe")}
          >
            <RotateCcw
              width={15}
              height={15}
              style={
                retrying
                  ? { animation: "spin 1s linear infinite reverse" }
                  : undefined
              }
            />
          </IconButton>
          <IconButton
            onClick={handleDeleteEntry}
            disabled={retrying}
            title={t("settings.history.delete")}
          >
            <Trash2 width={15} height={15} />
          </IconButton>
        </div>

        <p
          className={`pe-6 text-sm leading-relaxed ${
            retrying
              ? ""
              : hasTranscription
                ? "text-text/90 select-text cursor-text whitespace-pre-wrap break-words"
                : "text-text/40"
          }`}
          style={
            retrying
              ? { animation: "transcribe-pulse 3s ease-in-out infinite" }
              : undefined
          }
        >
          {retrying && (
            <style>{`
            @keyframes transcribe-pulse {
              0%, 100% { color: color-mix(in srgb, var(--color-text) 40%, transparent); }
              50% { color: color-mix(in srgb, var(--color-text) 90%, transparent); }
            }
          `}</style>
          )}
          {retrying
            ? t("settings.history.transcribing")
            : hasTranscription
              ? entry.transcription_text
              : t("settings.history.transcriptionFailed")}
        </p>

        {entry.saved && !showAudio && (
          <Star
            width={12}
            height={12}
            fill="currentColor"
            className="absolute end-3 top-4 text-logo-primary group-hover:opacity-0"
            aria-hidden="true"
          />
        )}
        {showAudio && (
          <AudioPlayer onLoadRequest={handleLoadAudio} className="w-full" />
        )}
      </div>
    </div>
  );
};
