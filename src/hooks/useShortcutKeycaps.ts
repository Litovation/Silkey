import { useSettings } from "./useSettings";
import { useOsType } from "./useOsType";
import { formatKeyCombination } from "../lib/utils/keyboard";

const DEFAULT_KEYS = ["Ctrl", "Windows"];

// "Left Ctrl + Left Super" reads better as "Ctrl" + "Windows".
const toKeycaps = (combination: string): string[] =>
  combination
    .split("+")
    .map((key) =>
      key
        .trim()
        .replace(/^(Left|Right)\s+/i, "")
        .replace(/^(Super|Win|Meta)$/i, "Windows"),
    )
    .filter(Boolean);

/** The dictation shortcut as keycap labels, e.g. ["Ctrl", "Windows"]. */
export const useShortcutKeycaps = (): string[] => {
  const { getSetting } = useSettings();
  const osType = useOsType();
  const binding = getSetting("bindings")?.transcribe?.current_binding;
  return binding
    ? toKeycaps(formatKeyCombination(binding, osType))
    : DEFAULT_KEYS;
};

/** Whether a DOM key event is for the key a keycap label names. */
export const keyMatchesKeycap = (event: KeyboardEvent, keycap: string) => {
  const cap = keycap.toLowerCase();
  switch (event.key) {
    case "Control":
      return cap === "ctrl" || cap === "control";
    case "Meta":
    case "OS":
      return cap === "windows" || cap === "command" || cap === "cmd";
    case "Alt":
      return cap === "alt" || cap === "option";
    case "Shift":
      return cap === "shift";
    case " ":
      return cap === "space";
    default:
      return event.key.toLowerCase() === cap;
  }
};
