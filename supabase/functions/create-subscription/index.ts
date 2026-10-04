// Gives the signed-in user a Razorpay payment page for the Silktone plan.
// The app opens the returned link in the browser; the webhook does the rest.
import {
  adminClient,
  callerProfile,
  corsHeaders,
  json,
  LIVE_STATUSES,
  razorpay,
  type RazorpaySubscription,
} from "../_shared/razorpay.ts";

interface Plan {
  period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
  interval: number;
}

const CYCLES_PER_YEAR = {
  daily: 365,
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};
// Razorpay needs an end; ten years of renewals is "until cancelled" in practice.
const YEARS = 10;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const admin = adminClient();
    const profile = await callerProfile(admin, request);
    if (!profile) return json({ error: "not_signed_in" }, 401);
    if (profile.banned) return json({ error: "banned" }, 403);

    // Reuse a subscription that is still open instead of making a second one.
    if (
      profile.razorpay_subscription_id &&
      LIVE_STATUSES.includes(profile.subscription_status ?? "")
    ) {
      const existing = await razorpay<RazorpaySubscription>(
        "GET",
        `/subscriptions/${profile.razorpay_subscription_id}`,
      );
      if (existing.status === "created" && existing.short_url) {
        return json({ url: existing.short_url });
      }
      if (LIVE_STATUSES.includes(existing.status)) {
        return json({ error: "already_subscribed" }, 409);
      }
    }

    const planId = Deno.env.get("RAZORPAY_PLAN_ID")!;
    const plan = await razorpay<Plan>("GET", `/plans/${planId}`);
    const totalCount = Math.max(
      1,
      Math.floor((CYCLES_PER_YEAR[plan.period] * YEARS) / plan.interval),
    );

    const subscription = await razorpay<RazorpaySubscription>(
      "POST",
      "/subscriptions",
      {
        plan_id: planId,
        total_count: totalCount,
        customer_notify: 1,
        notes: { user_id: profile.id, email: profile.email ?? "" },
      },
    );

    const { error } = await admin
      .from("profiles")
      .update({
        razorpay_subscription_id: subscription.id,
        subscription_status: subscription.status,
        cancel_at_period_end: false,
      })
      .eq("id", profile.id);
    if (error) throw error;

    return json({ url: subscription.short_url });
  } catch (error) {
    console.error("create-subscription failed", error);
    return json({ error: "server_error" }, 500);
  }
});
