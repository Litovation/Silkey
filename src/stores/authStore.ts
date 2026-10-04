import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { commands } from "@/bindings";
import {
  beginSignIn,
  cancelSubscription as requestCancel,
  completeSignIn,
  createCheckoutUrl,
  evaluateAccess,
  getSession,
  signOut as clearSession,
  type Verdict,
} from "@/lib/auth";

const RECHECK_INTERVAL_MS = 30 * 60 * 1000;
// While the payment page is open in the browser, look for the result often,
// then give up quietly; "Check again" and the regular re-check still work.
const PAYMENT_POLL_MS = 5000;
const PAYMENT_WAIT_MS = 15 * 60 * 1000;

const isPaid = (verdict: Verdict | null): boolean =>
  verdict?.state === "allowed" && verdict.access.status === "paid";

interface AuthStore {
  verdict: Verdict | null;
  email: string;
  signingIn: boolean;
  checking: boolean;
  error: string | null;
  /** A sign-in just completed in this session; the app shows the tutorial once. */
  justSignedIn: boolean;
  clearJustSignedIn: () => void;
  /** The Razorpay page was opened and no payment has been seen yet. */
  awaitingPayment: boolean;
  /** A payment request (subscribe or cancel) is being sent. */
  paymentBusy: boolean;
  /** Error code from the last payment request, e.g. "already_subscribed". */
  paymentError: string | null;
  subscribe: () => Promise<void>;
  /** Resolves true when the subscription was set to stop renewing. */
  cancelSubscription: () => Promise<boolean>;
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

  let paymentPoll: ReturnType<typeof setInterval> | undefined;
  const stopWaitingForPayment = () => {
    clearInterval(paymentPoll);
    paymentPoll = undefined;
    set({ awaitingPayment: false });
  };
  const waitForPayment = () => {
    clearInterval(paymentPoll);
    const startedAt = Date.now();
    set({ awaitingPayment: true });
    paymentPoll = setInterval(async () => {
      await get().recheck();
      const signedOut = get().verdict?.state === "signedOut";
      const timedOut = Date.now() - startedAt > PAYMENT_WAIT_MS;
      if (isPaid(get().verdict) || signedOut || timedOut) {
        stopWaitingForPayment();
      }
    }, PAYMENT_POLL_MS);
  };

  const errorCode = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  return {
    verdict: null,
    email: getSession()?.email ?? "",
    signingIn: false,
    checking: false,
    error: null,
    justSignedIn: false,
    clearJustSignedIn: () => set({ justSignedIn: false }),
    awaitingPayment: false,
    paymentBusy: false,
    paymentError: null,

    subscribe: async () => {
      set({ paymentBusy: true, paymentError: null });
      try {
        await openUrl(await createCheckoutUrl());
        waitForPayment();
      } catch (error) {
        set({ paymentError: errorCode(error) });
        // "Already subscribed" means our view is stale; refresh it.
        await get().recheck();
      }
      set({ paymentBusy: false });
    },

    cancelSubscription: async () => {
      set({ paymentBusy: true, paymentError: null });
      let cancelled = false;
      try {
        await requestCancel();
        cancelled = true;
        await get().recheck();
      } catch (error) {
        set({ paymentError: errorCode(error) });
      }
      set({ paymentBusy: false });
      return cancelled;
    },

    initialize: () => {
      if (initialized) return;
      initialized = true;

      listen<string>("oauth-callback", async (event) => {
        try {
          await completeSignIn(event.payload);
          set({ error: null, justSignedIn: true });
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
      stopWaitingForPayment();
      set({ paymentError: null });
      await clearSession();
      apply({ state: "signedOut" });
    },

    recheck: async () => {
      set({ checking: true });
      apply(await evaluateAccess());
    },
  };
});
