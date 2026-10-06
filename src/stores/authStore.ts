import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import i18n from "@/i18n";
import { commands } from "@/bindings";
import {
  beginSignIn,
  cancelSubscription as requestCancel,
  completeSignIn,
  createCheckoutUrl,
  evaluateAccess,
  findInviteCode,
  getSession,
  redeemInviteCode,
  requestBetaAccess,
  signOut as clearSession,
  type AccessRequestError,
  type InviteError,
  type Verdict,
} from "@/lib/auth";
import { useNotificationStore } from "./notificationStore";

const RECHECK_INTERVAL_MS = 30 * 60 * 1000;
// While the payment page is open in the browser, look for the result often,
// then give up quietly; "Check again" and the regular re-check still work.
const PAYMENT_POLL_MS = 5000;
const PAYMENT_WAIT_MS = 15 * 60 * 1000;

const isPaid = (verdict: Verdict | null): boolean =>
  verdict?.state === "allowed" && verdict.access.status === "paid";

/** Trial, locked and trial-ended accounts can still use a referral code. */
export const canRedeemInvite = (verdict: Verdict | null): boolean =>
  (verdict?.state === "allowed" && verdict.access.status === "trial") ||
  (verdict?.state === "blocked" &&
    (verdict.reason === "expired" || verdict.reason === "locked"));

// Codes already tried from the clipboard, so one is never sent twice.
const TRIED_INVITES_KEY = "silktone.triedInvites";
const readTriedInvites = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(TRIED_INVITES_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const rememberTriedInvite = (code: string): void => {
  try {
    localStorage.setItem(
      TRIED_INVITES_KEY,
      JSON.stringify([...readTriedInvites(), code].slice(-20)),
    );
  } catch {
    // ignore
  }
};

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
  /** An invite code is being redeemed. */
  inviteBusy: boolean;
  inviteError: InviteError | null;
  /** A "Request beta access" is being sent. */
  accessRequestBusy: boolean;
  accessRequestError: AccessRequestError | null;
  /** Ask for beta access; unlocks at once when the server approves it. */
  requestAccess: () => Promise<void>;
  /** Resolves true when the code gave this account free beta access. */
  redeemInvite: (code: string) => Promise<boolean>;
  /**
   * Redeem an invite code the user copied from their invite page, without
   * asking. Only the matched code ever leaves this computer.
   */
  redeemInviteFromClipboard: () => Promise<void>;
  subscribe: () => Promise<void>;
  /** Resolves true when the subscription was set to stop renewing. */
  cancelSubscription: () => Promise<boolean>;
  initialize: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  recheck: () => Promise<void>;
}

let initialized = false;
let lastFocusRecheck = 0;
let clipboardCheckRunning = false;

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

  const redeemFromClipboard = async () => {
    let text = "";
    try {
      text = await readText();
    } catch {
      return; // Empty clipboard or not text.
    }
    const code = findInviteCode(text);
    if (!code || readTriedInvites().includes(code)) return;
    const redeemed = await get().redeemInvite(code);
    const error = get().inviteError;
    // A network failure is retried on the next focus; anything else is final.
    if (error !== "network") rememberTriedInvite(code);
    if (!redeemed && error && error !== "network") {
      useNotificationStore.getState().notify({
        id: "beta-invite",
        tone: "error",
        title: i18n.t("account.invite.failedTitle"),
        description: i18n.t(`account.invite.error.${error}`),
      });
    }
  };

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
    inviteBusy: false,
    inviteError: null,
    accessRequestBusy: false,
    accessRequestError: null,

    requestAccess: async () => {
      set({ accessRequestBusy: true, accessRequestError: null });
      const result = await requestBetaAccess();
      set({
        accessRequestBusy: false,
        accessRequestError: result.ok ? null : result.error,
      });
      // "Full today" still saves the request, so refresh to show it waiting.
      if (!result.ok) {
        if (result.error === "full_today") await get().recheck();
        return;
      }
      await get().recheck();
      const notify = useNotificationStore.getState().notify;
      if (result.status === "approved") {
        notify({
          id: "beta-invite",
          tone: "success",
          title: i18n.t("account.invite.welcomeTitle"),
          description: i18n.t("account.invite.welcomeBody"),
          autoHideMs: 15000,
        });
      } else {
        notify({
          id: "beta-invite",
          tone: "info",
          title: i18n.t("account.request.sentTitle"),
          description: i18n.t("account.request.pending"),
          autoHideMs: 15000,
        });
      }
    },

    redeemInvite: async (code) => {
      set({ inviteBusy: true, inviteError: null });
      const error = await redeemInviteCode(code);
      set({ inviteBusy: false, inviteError: error });
      if (error) return false;
      await get().recheck();
      useNotificationStore.getState().notify({
        id: "beta-invite",
        tone: "success",
        title: i18n.t("account.invite.welcomeTitle"),
        description: i18n.t("account.invite.welcomeBody"),
        autoHideMs: 15000,
      });
      return true;
    },

    redeemInviteFromClipboard: async () => {
      if (clipboardCheckRunning || !canRedeemInvite(get().verdict)) return;
      clipboardCheckRunning = true;
      try {
        await redeemFromClipboard();
      } finally {
        clipboardCheckRunning = false;
      }
    },

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
        await get().redeemInviteFromClipboard();
      });

      get()
        .recheck()
        .then(() => get().redeemInviteFromClipboard());
      setInterval(() => get().recheck(), RECHECK_INTERVAL_MS);
      // The invite page copies the code; coming back to Silktone redeems it.
      window.addEventListener("focus", () => {
        get().redeemInviteFromClipboard();
        // A request approved by the owner unlocks without waiting for the
        // half-hourly check.
        const verdict = get().verdict;
        const waiting =
          verdict?.state === "blocked" &&
          verdict.reason === "locked" &&
          verdict.access?.beta_request === "pending";
        if (waiting && Date.now() - lastFocusRecheck > 60_000) {
          lastFocusRecheck = Date.now();
          get().recheck();
        }
      });
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
