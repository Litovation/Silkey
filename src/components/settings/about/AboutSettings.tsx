import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { commands } from "@/bindings";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { AppLanguageSelector } from "../AppLanguageSelector";
import { ThemeSelector } from "../ThemeSelector";

export const AboutSettings: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.0");
      }
    };

    fetchVersion();
  }, []);

  const openFolder = async (open: () => Promise<unknown>) => {
    try {
      await open();
    } catch (error) {
      console.error("Failed to open folder:", error);
    }
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.about.title")}>
        <AppLanguageSelector descriptionMode="tooltip" grouped={true} />
        <ThemeSelector descriptionMode="tooltip" grouped={true} />
        <SettingContainer
          title={t("settings.about.version.title")}
          description={t("settings.about.version.description")}
          grouped={true}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-sm font-mono">v{version}</span>
        </SettingContainer>
      </SettingsGroup>

      {/* Deliberately quiet: support folders and attributions most people never need. */}
      <div className="px-4 space-y-1 text-[9px] leading-snug text-mid-gray/60">
        <div className="flex gap-3">
          <button
            type="button"
            className="cursor-pointer hover:text-mid-gray"
            onClick={() => openFolder(commands.openAppDataDir)}
          >
            {t("settings.about.appDataDirectory.title")}
          </button>
          <button
            type="button"
            className="cursor-pointer hover:text-mid-gray"
            onClick={() => openFolder(commands.openLogDir)}
          >
            {t("settings.debug.logDirectory.title")}
          </button>
        </div>
        <p>{t("settings.about.licenses.notice")}</p>
        <p>{t("settings.about.acknowledgments.ggml.details")}</p>
      </div>
    </div>
  );
};
