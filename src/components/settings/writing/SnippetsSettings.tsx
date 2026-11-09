import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Quote, Trash2 } from "lucide-react";
import type { Snippet } from "@/bindings";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import { useSettings } from "../../../hooks/useSettings";

const EMPTY: Snippet = { trigger: "", text: "" };

/**
 * Spoken shortcuts (build spec feature 11): say a trigger, Silktone pastes
 * the saved text. "insert <trigger>" works inside a longer sentence.
 */
export const SnippetsSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const snippets = getSetting("snippets") ?? [];
  // Index being edited; snippets.length means a new snippet.
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Snippet>(EMPTY);

  const startEdit = (index: number) => {
    setEditing(index);
    setDraft(index < snippets.length ? snippets[index] : EMPTY);
  };

  const trigger = draft.trigger.trim();
  const duplicate = snippets.some(
    (s, i) =>
      i !== editing && s.trigger.toLowerCase() === trigger.toLowerCase(),
  );
  const canSave =
    trigger.length > 0 && draft.text.trim().length > 0 && !duplicate;

  const save = () => {
    if (editing === null || !canSave) return;
    const next = [...snippets];
    const value = { trigger, text: draft.text };
    if (editing < snippets.length) next[editing] = value;
    else next.push(value);
    updateSetting("snippets", next);
    setEditing(null);
  };

  const remove = (index: number) => {
    updateSetting(
      "snippets",
      snippets.filter((_, i) => i !== index),
    );
    if (editing === index) setEditing(null);
  };

  const editor = (
    <div className="space-y-3 px-4 py-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-text/70">
          {t("snippets.trigger")}
        </span>
        <Input
          value={draft.trigger}
          onChange={(e) => setDraft({ ...draft, trigger: e.target.value })}
          placeholder={t("snippets.triggerPlaceholder")}
          className="w-full"
          maxLength={60}
          autoFocus
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-text/70">
          {t("snippets.text")}
        </span>
        <Textarea
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          placeholder={t("snippets.textPlaceholder")}
          className="w-full"
          maxLength={2000}
        />
      </label>
      <p className="text-xs text-text/55">{t("snippets.placeholders")}</p>
      {duplicate && (
        <p className="text-xs text-amber-600">{t("snippets.duplicate")}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
          {t("snippets.cancel")}
        </Button>
        <Button
          size="sm"
          onClick={save}
          disabled={!canSave || isUpdating("snippets")}
        >
          {t("snippets.save")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup
        icon={Quote}
        title={t("snippets.title")}
        description={t("snippets.description")}
      >
        {snippets.length === 0 && editing === null && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm font-medium">{t("snippets.emptyTitle")}</p>
            <p className="mt-1 text-xs text-text/55">
              {t("snippets.emptyBody")}
            </p>
          </div>
        )}
        {snippets.map((snippet, index) =>
          editing === index ? (
            <React.Fragment key={snippet.trigger}>{editor}</React.Fragment>
          ) : (
            <div
              key={snippet.trigger}
              className="group flex items-start gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {t("snippets.say", { trigger: snippet.trigger })}
                </p>
                <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-text/60">
                  {snippet.text}
                </p>
              </div>
              <button
                type="button"
                onClick={() => startEdit(index)}
                title={t("snippets.edit")}
                aria-label={t("snippets.edit")}
                className="rounded-md p-1.5 text-text/40 hover:bg-mid-gray/10 hover:text-text cursor-pointer"
              >
                <Pencil width={14} height={14} />
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                title={t("snippets.remove")}
                aria-label={t("snippets.remove")}
                className="rounded-md p-1.5 text-text/40 hover:bg-mid-gray/10 hover:text-text cursor-pointer"
              >
                <Trash2 width={14} height={14} />
              </button>
            </div>
          ),
        )}
        {editing === snippets.length ? (
          editor
        ) : (
          <div className="px-4 py-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => startEdit(snippets.length)}
            >
              <span className="flex items-center gap-1.5">
                <Plus width={14} height={14} />
                {t("snippets.add")}
              </span>
            </Button>
          </div>
        )}
      </SettingsGroup>
    </div>
  );
};
