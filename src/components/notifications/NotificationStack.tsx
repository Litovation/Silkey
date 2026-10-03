import React from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import {
  useNotificationStore,
  type NotificationTone,
} from "../../stores/notificationStore";

const toneIcon: Record<NotificationTone, React.ReactNode> = {
  info: <Info width={16} height={16} className="text-logo-primary" />,
  success: <CheckCircle2 width={16} height={16} className="text-green-500" />,
  error: <AlertCircle width={16} height={16} className="text-red-500" />,
  progress: (
    <Loader2
      width={16}
      height={16}
      className="animate-spin text-logo-primary"
    />
  ),
};

/** In-app notification cards, shown in the sidebar above Settings. */
export const NotificationStack: React.FC = () => {
  const { t } = useTranslation();
  const notifications = useNotificationStore((s) => s.notifications);
  const dismiss = useNotificationStore((s) => s.dismiss);

  if (notifications.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 pb-3" aria-live="polite">
      {notifications.map((n) => (
        <div
          key={n.id}
          role="status"
          className="relative rounded-lg border border-mid-gray/20 bg-background p-3 shadow-sm"
        >
          <div className="flex items-start gap-2">
            <span className="mt-px shrink-0">{toneIcon[n.tone ?? "info"]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold leading-snug pe-4">
                {n.title}
              </p>
              {n.description && (
                <p className="mt-0.5 text-[11px] leading-snug text-mid-gray">
                  {n.description}
                </p>
              )}
            </div>
          </div>

          {n.progress !== undefined && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-mid-gray/20">
              <div
                className="h-full rounded-full bg-logo-primary transition-[width]"
                style={{ width: `${Math.max(0, Math.min(100, n.progress))}%` }}
              />
            </div>
          )}

          {n.action && (
            <button
              type="button"
              onClick={n.action.onClick}
              className="mt-2 w-full rounded-md bg-logo-primary/15 px-2 py-1 text-xs font-medium text-logo-primary hover:bg-logo-primary/25 cursor-pointer"
            >
              {n.action.label}
            </button>
          )}

          {n.dismissible !== false && (
            <button
              type="button"
              onClick={() => dismiss(n.id)}
              aria-label={t("common.close")}
              className="absolute top-2 end-2 rounded p-0.5 text-mid-gray hover:bg-mid-gray/15 hover:text-text cursor-pointer"
            >
              <X width={12} height={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
