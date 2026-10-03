import { create } from "zustand";

export type NotificationTone = "info" | "success" | "error" | "progress";

export interface AppNotificationAction {
  label: string;
  onClick: () => void;
}

export interface AppNotification {
  /** Stable id: notifying again with the same id replaces the card in place. */
  id: string;
  title: string;
  description?: string;
  tone?: NotificationTone;
  /** 0–100; shows a bar under the text when set. */
  progress?: number;
  action?: AppNotificationAction;
  /** Defaults to true. */
  dismissible?: boolean;
  /** Removes the card on its own after this many milliseconds. */
  autoHideMs?: number;
}

interface NotificationStore {
  notifications: AppNotification[];
  notify: (notification: AppNotification) => void;
  dismiss: (id: string) => void;
}

const hideTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useNotificationStore = create<NotificationStore>()((set, get) => ({
  notifications: [],

  notify: (notification) => {
    const existing = hideTimers.get(notification.id);
    if (existing) {
      clearTimeout(existing);
      hideTimers.delete(notification.id);
    }
    if (notification.autoHideMs) {
      hideTimers.set(
        notification.id,
        setTimeout(
          () => get().dismiss(notification.id),
          notification.autoHideMs,
        ),
      );
    }

    set((state) => {
      const index = state.notifications.findIndex(
        (n) => n.id === notification.id,
      );
      if (index === -1) {
        return { notifications: [...state.notifications, notification] };
      }
      const notifications = [...state.notifications];
      notifications[index] = notification;
      return { notifications };
    });
  },

  dismiss: (id) => {
    const timer = hideTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      hideTimers.delete(id);
    }
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
}));

/** For non-React callers (updater, event listeners). */
export const notify = (notification: AppNotification) =>
  useNotificationStore.getState().notify(notification);

export const dismissNotification = (id: string) =>
  useNotificationStore.getState().dismiss(id);
