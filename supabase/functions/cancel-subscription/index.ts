// Stops the signed-in user's subscription from renewing. Time already paid
// for stays usable; nothing is refunded here.
import {
  adminClient,
  callerProfile,
  corsHeaders,
  json,
  razorpay,
  type RazorpaySubscription,
} from "../_shared/razorpay.ts";

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
    if (!profile.razorpay_subscription_id) {
      return json({ error: "no_subscription" }, 404);
    }

    const id = profile.razorpay_subscription_id;
    const current = await razorpay<RazorpaySubscription>(
      "GET",
      `/subscriptions/${id}`,
    );

    let status = current.status;
    if (["cancelled", "completed", "expired"].includes(status)) {
      // Already over; just bring our record in line.
    } else {
      // Razorpay only allows "at the end of the period" while billing is active.
      const cancelled = await razorpay<RazorpaySubscription>(
        "POST",
        `/subscriptions/${id}/cancel`,
        { cancel_at_cycle_end: status === "active" ? 1 : 0 },
      );
      status = cancelled.status;
    }

    const { error } = await admin
      .from("profiles")
      .update({ subscription_status: status, cancel_at_period_end: true })
      .eq("id", profile.id);
    if (error) throw error;

    return json({ ok: true });
  } catch (error) {
    console.error("cancel-subscription failed", error);
    return json({ error: "server_error" }, 500);
  }
});
