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
      className="relative h-[150px] overflow-hidden rounded-[20px] border border-[#ccc]"
      style={{
        backgroundImage:
          "linear-gradient(-67deg, rgb(15, 23, 32) 25.82%, rgb(16, 33, 51) 74.18%)",
      }}
    >
      <div className="pointer-events-none absolute left-[calc(50%+145px)] top-[calc(50%-19.5px)] flex h-[540px] w-[724px] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <img
          src={ribbon}
          alt=""
          className="h-[265px] w-[677px] max-w-none flex-none rotate-[26.58deg] object-cover"
        />
      </div>
      <div className="relative flex h-full flex-col items-start justify-center gap-4 ps-8">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[27px] font-extrabold leading-none text-[#ffc94a]">
              {PRODUCT_NAME}
            </h2>
            <span className="rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              {t("toneBanner.comingSoon")}
            </span>
          </div>
          <p className="text-xs font-semibold text-white">
            {t("toneBanner.tagline")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openUrl(SITE_URL)}
          className="inline-flex h-[33px] items-center gap-1.5 rounded-full bg-brand-pink px-6 text-xs font-semibold text-white hover:opacity-90 cursor-pointer transition-opacity"
        >
          {t("toneBanner.knowMore")}
          <ArrowRight width={14} height={14} />
        </button>
      </div>
    </div>
  );
};
