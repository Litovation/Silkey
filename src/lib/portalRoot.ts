/**
 * Where dialogs, tooltips and the settings sheet render. On Windows and Linux
 * the main window is a shaped, see-through frame (WindowFrame); overlays go
 * inside it so their dimmed backdrop stays within the window's shape instead
 * of tinting the transparent margin around it. Elsewhere it is document.body.
 */
export const PORTAL_ROOT_ID = "silk-portal";

export const portalRoot = (): HTMLElement =>
  document.getElementById(PORTAL_ROOT_ID) ?? document.body;
