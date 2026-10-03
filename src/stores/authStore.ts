import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { commands } from "@/bindings";
import {
  beginSignIn,
  completeSignIn,
  evaluateAccess,
  getSession,
  signOut as clearSession,
  type Verdict,
} from "@/lib/auth";

const RECHECK_INTERVAL_MS = 30 * 60 * 1000;

interface AuthStore {
  verdict: Verdict | null;
  email: string;
  signingIn: boolean;
  checking: boolean;
  error: string | null;
  initialize: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  recheck: () => Promise<void>;
}

let initialized = false;

export const useAuthStore = create<AuthStore>()((set, get) => {
  const apply = (verdict: Verdict) => {
    set({ verdict, email: getSession()?.email ?? "", checking: false });
    // Dictation is refused in Rust unless this window says it is allowed.
    commands.setAccessAllowed(verdict.state === "allowed").catch(() => {});
  };

  return {
    verdict: null,
    email: getSession()?.email ?? "",
    signingIn: false,
    checking: false,
    error: null,

    initialize: () => {
      if (initialized) return;
      initialized = true;

      listen<string>("oauth-callback", async (event) => {
        try {
          await completeSignIn(event.payload);
          set({ error: null });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : String(error),
          });
        }
        set({ signingIn: false });
        await get().recheck();
      });

      get().recheck();
      setInterval(() => get().recheck(), RECHECK_INTERVAL_MS);
    },

    signIn: async () => {
      set({ signingIn: true, error: null });
      try {
        const listener = await commands.startOauthListener();
        if (listener.status !== "ok") throw new Error(listener.error);
        await openUrl(await beginSignIn());
      } catch (error) {
        set({
          signingIn: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    signOut: async () => {
      await clearSession();
      apply({ state: "signedOut" });
    },

    recheck: async () => {
      set({ checking: true });
      apply(await evaluateAccess());
    },
  };
});
