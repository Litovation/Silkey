import React from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowRight } from "lucide-react";
import ribbon from "../../assets/commandgo-ribbon.png";

const SITE_URL = "https://silktone.litovation.in";
const PRODUCT_NAME = "CommandGo";

// CommandGo teaser. Colours and artwork follow the Figma banner; type uses the
// app font so it sits with the rest of the dashboard.
export const ToneBanner: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      className="relative h-[116px] overflow-hidden rounded-2xl"
      style={{
        backgroundImage:
          "linear-gradient(-67deg, rgb(15, 23, 32) 25.82%, rgb(16, 33, 51) 74.18%)",
      }}
    >
      <div className="pointer-events-none absolute left-[calc(50%+190px)] top-[calc(50%-12px)] flex h-[540px] w-[724px] -translate-x-1/2 -translate-y-1/2 items-center justify-center opacity-90">
        <img
          src={ribbon}
          alt=""
          className="h-[220px] w-[560px] max-w-none flex-none rotate-[26.58deg] object-cover"
        />
      </div>
      <div className="relative flex h-full items-center justify-between gap-4 ps-6 pe-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[22px] font-extrabold leading-none text-[#ffc94a]">
              {PRODUCT_NAME}
            </h2>
            <span className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90">
              {t("toneBanner.comingSoon")}
            </span>
          </div>
          <p className="text-xs font-medium text-white/80">
            {t("toneBanner.tagline")}
          </p>
          <button
            type="button"
            onClick={() => openUrl(SITE_URL)}
            className="mt-2 inline-flex h-8 w-fit items-center gap-1.5 rounded-full bg-brand-pink px-4 text-xs font-semibold text-white shadow-[0_6px_16px_-6px_rgb(246_80_174/0.7)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98] cursor-pointer"
          >
            {t("toneBanner.knowMore")}
            <ArrowRight width={14} height={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
