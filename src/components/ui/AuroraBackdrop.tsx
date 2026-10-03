import React from "react";

/**
 * Slow-drifting brand-colour glow behind full-screen moments (sign-in, first
 * run). Purely decorative; it gives glass panels something to blur.
 */
export const AuroraBackdrop: React.FC = () => (
  <div className="aurora" aria-hidden="true">
    <span />
    <span />
    <span />
  </div>
);
