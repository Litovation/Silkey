import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { arch, platform } from "@tauri-apps/plugin-os";
import { useSettings } from "../../hooks/useSettings";
import { commands } from "../../bindings";
import { dismissNotification, notify } from "../../stores/notificationStore";
import { resolvePortableInstallerUrl } from "./portableInstaller";

const NOTIFICATION_ID = "app-update";
const LAST_RUN_VERSION_KEY = "silktone.lastRunVersion";
const RECORDING_POLL_MS = 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Updates the app without asking. On launch it checks for a new version,
 * downloads it in the background, waits until no dictation is in progress,
 * then installs and restarts. Progress is shown as a sidebar notification.
 * Renders nothing itself.
 */
const AutoUpdater: React.FC = () => {
  const { t } = useTranslation();
  const { settings, isLoading, updateChecksLocked } = useSettings();
  const busyRef = useRef(false);

  // Wait for the lock state too (null = not loaded yet), otherwise the first
  // render could fire an update check before SILKTONE_DISABLE_UPDATER is known.
  const settingsLoaded =
    !isLoading && settings !== null && updateChecksLocked !== null;
  const updatesEnabled =
    (settings?.update_checks_enabled ?? false) && updateChecksLocked === false;

  useEffect(() => {
    if (!settingsLoaded) return;
    void announceIfJustUpdated();
    if (!updatesEnabled) return;

    void runUpdate(false);

    // Tray menu "Check for updates".
    const unlisten = listen("check-for-updates", () => {
      void runUpdate(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [settingsLoaded, updatesEnabled]);

  const announceIfJustUpdated = async () => {
    try {
      const current = await getVersion();
      const previous = localStorage.getItem(LAST_RUN_VERSION_KEY);
      localStorage.setItem(LAST_RUN_VERSION_KEY, current);
      if (previous && previous !== current) {
        notify({
          id: NOTIFICATION_ID,
          tone: "success",
          title: t("updates.updatedTitle"),
          description: t("updates.updatedDescription", { version: current }),
          autoHideMs: 15000,
        });
      }
    } catch (error) {
      // Storage can be unavailable; the card is a nicety, not required.
      console.warn("Could not record the running version:", error);
    }
  };

  const runUpdate = async (manual: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;

    try {
      if (manual) {
        notify({
          id: NOTIFICATION_ID,
          tone: "progress",
          title: t("updates.checking"),
          dismissible: false,
        });
      }

      const update = await check();
      if (!update) {
        if (manual) {
          notify({
            id: NOTIFICATION_ID,
            tone: "success",
            title: t("updates.upToDate"),
            autoHideMs: 4000,
          });
        }
        return;
      }

      // Portable installs can't replace themselves; point at the installer.
      if (await commands.isPortable()) {
        const url = resolvePortableInstallerUrl(
          update.rawJson,
          platform(),
          arch(),
        );
        notify({
          id: NOTIFICATION_ID,
          tone: "info",
          title: t("updates.manualTitle"),
          description: t("updates.manualDescription", {
            version: update.version,
          }),
          action: {
            label: t("updates.manualButton"),
            onClick: () => void openUrl(url),
          },
        });
        return;
      }

      const showDownload = (progress: number) =>
        notify({
          id: NOTIFICATION_ID,
          tone: "progress",
          title: t("updates.downloadingTitle"),
          description: t("updates.downloadingDescription", {
            version: update.version,
            progress,
          }),
          progress,
        });

      let total = 0;
      let received = 0;
      let shown = -1;
      showDownload(0);
      await update.download((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          const percent =
            total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : 0;
          if (percent !== shown) {
            shown = percent;
            showDownload(percent);
          }
        }
      });

      // Never cut off a dictation: restart only once the user is idle.
      while (await commands.isRecording()) {
        notify({
          id: NOTIFICATION_ID,
          tone: "progress",
          title: t("updates.downloadingTitle"),
          description: t("updates.waitingForDictation"),
          progress: 100,
        });
        await sleep(RECORDING_POLL_MS);
      }

      notify({
        id: NOTIFICATION_ID,
        tone: "progress",
        title: t("updates.restarting"),
        dismissible: false,
      });
      // On Windows the installer closes the app and starts it again itself.
      await update.install();
      await relaunch();
    } catch (error) {
      console.error("Update failed:", error);
      if (manual) {
        notify({
          id: NOTIFICATION_ID,
          tone: "error",
          title: t("updates.failed"),
          autoHideMs: 8000,
        });
      } else {
        // Automatic checks fail quietly (offline, server down); retry next launch.
        dismissNotification(NOTIFICATION_ID);
      }
    } finally {
      busyRef.current = false;
    }
  };

  return null;
};

export default AutoUpdater;
