import React from "react";

/** Plain grey surface behind full-screen dialogs (sign-in, first run). */
export const SetupBackdrop: React.FC = () => (
  <div className="setup-backdrop" aria-hidden="true" />
);
