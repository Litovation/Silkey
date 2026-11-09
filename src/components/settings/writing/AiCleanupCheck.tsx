import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { commands } from "@/bindings";
import { Button } from "../../ui/Button";
import { useSettings } from "../../../hooks/useSettings";

type Result =
  | { state: "idle" }
  | { state: "running" }
  | { state: "ok"; text: string }
  | { state: "error"; code: string };

/** Error codes from `test_ai_cleanup` that have their own message. */
const KNOWN_CODES = [
  "missingProvider",
  "missingKey",
  "missingModel",
  "missingPrompt",
  "badKey",
  "noCredits",
  "modelNotFound",
  "rateLimited",
  "unreachable",
];

/**
 * Shows which AI provider and model "Cloud AI" cleanup will use, and runs one
 * real cleanup on a sample sentence so setup problems (no model picked, key
 * refused, no credits) show up here in words instead of failing silently.
 */
export const AiCleanupCheck: React.FC<{ onOpenPostProcess?: () => void }> = ({
  onOpenPostProcess,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [result, setResult] = useState<Result>({ state: "idle" });

  const providerId = settings?.post_process_provider_id ?? "";
  const provider = settings?.post_process_providers?.find(
    (p) => p.id === providerId,
  );
  const model = settings?.post_process_models?.[providerId] ?? "";
  const hasKey =
    (settings?.post_process_api_keys?.[providerId] ?? "").trim() !== "";

  const runTest = async () => {
    setResult({ state: "running" });
    const response = await commands.testAiCleanup();
    setResult(
      response.status === "ok"
        ? { state: "ok", text: response.data }
        : { state: "error", code: response.error },
    );
  };

  const errorText = (code: string) =>
    t(
      `writing.aiCheck.errors.${KNOWN_CODES.includes(code) ? code : "failed"}`,
      { provider: provider?.label ?? providerId, model },
    );

  return (
    <div className="px-4 py-3 space-y-3 border-t border-mid-gray/10">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text/70">
        <span>
          {t("writing.aiCheck.provider")}{" "}
          <b className="font-semibold text-text">
            {provider?.label ?? t("writing.aiCheck.none")}
          </b>
        </span>
        <span>
          {t("writing.aiCheck.model")}{" "}
          <b className="font-semibold text-text">
            {model || t("writing.aiCheck.none")}
          </b>
        </span>
        <span>
          {t("writing.aiCheck.key")}{" "}
          <b className="font-semibold text-text">
            {hasKey ? t("writing.aiCheck.keySaved") : t("writing.aiCheck.none")}
          </b>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={runTest}
          disabled={result.state === "running"}
        >
          {result.state === "running" ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("writing.aiCheck.testing")}
            </span>
          ) : (
            t("writing.aiCheck.test")
          )}
        </Button>
        {onOpenPostProcess && (
          <Button variant="ghost" size="sm" onClick={onOpenPostProcess}>
            {t("writing.aiCheck.openSetup")}
          </Button>
        )}
      </div>

      {result.state === "ok" && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-text">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="space-y-1">
            <p className="font-semibold">{t("writing.aiCheck.works")}</p>
            <p className="whitespace-pre-wrap text-text/70">{result.text}</p>
          </div>
        </div>
      )}
      {result.state === "error" && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-text">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>{errorText(result.code)}</p>
        </div>
      )}
    </div>
  );
};
