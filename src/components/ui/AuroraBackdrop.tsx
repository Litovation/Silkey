import React from "react";
import backdrop from "../../assets/setup-backdrop.webm";

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Heavily blurred ribbon clip behind full-screen moments (sign-in, first run).
 * Purely decorative; it gives glass panels something soft to blur. It plays
 * once and rests on its last frame. The clip is tiny on purpose: it is only
 * ever seen out of focus.
 */
export const AuroraBackdrop: React.FC = () => (
  <div className="aurora" aria-hidden="true">
    <video
      className="aurora-video"
      src={backdrop}
      autoPlay={!prefersReducedMotion()}
      muted
      playsInline
      tabIndex={-1}
    />
  </div>
);
