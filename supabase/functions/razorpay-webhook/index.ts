// Razorpay calls this whenever a subscription changes. It is the only thing
// that marks an account as paid. Deploy with JWT verification off: Razorpay
// does not sign in, it proves itself with the signature checked below.
import {
  adminClient,
  razorpay,
  type RazorpaySubscription,
} from "../_shared/razorpay.ts";

const hex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const sameString = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

const validSignature = async (
  body: string,
  signature: string,
): Promise<boolean> => {
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return sameString(hex(expected), signature);
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // The signature covers the exact bytes sent, so read the body as text first.
  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!(await validSignature(body, signature))) {
    return new Response("bad signature", { status: 401 });
  }

  try {
    const event = JSON.parse(body);
    const subscriptionId: string | undefined =
      event?.payload?.subscription?.entity?.id;
    // Other kinds of notification (plain payments, refunds) are not ours.
    if (!subscriptionId) return new Response("ignored");

    const admin = adminClient();
    const eventId = request.headers.get("x-razorpay-event-id");
    if (eventId) {
      const { error } = await admin.from("razorpay_events").insert({
        id: eventId,
        event: String(event.event ?? ""),
        subscription_id: subscriptionId,
      });
      // 23505 = already stored, so this is a repeat we have handled before.
      if (error?.code === "23505") return new Response("duplicate");
      if (error) throw error;
    }

    // Notifications can arrive late or out of order, so ask Razorpay for the
    // subscription as it is now instead of trusting the notification's copy.
    const subscription = await razorpay<RazorpaySubscription>(
      "GET",
      `/subscriptions/${subscriptionId}`,
    );

    const changes: Record<string, unknown> = {
      subscription_status: subscription.status,
    };
    // Only an active subscription has a period that was really paid for.
    // While a renewal is failing, the old paid_until stays and the grace
    // period in silktone_get_access() takes over.
    if (subscription.status === "active" && subscription.current_end) {
      changes.plan = "paid";
      changes.paid_until = new Date(
        subscription.current_end * 1000,
      ).toISOString();
    }

    // Matching on the stored id ignores subscriptions the user has replaced.
    const { error } = await admin
      .from("profiles")
      .update(changes)
      .eq("razorpay_subscription_id", subscriptionId);
    if (error) throw error;

    return new Response("ok");
  } catch (error) {
    console.error("razorpay-webhook failed", error);
    // A 500 makes Razorpay try again later. Forget the event id so the
    // retry is not mistaken for a repeat.
    const eventId = request.headers.get("x-razorpay-event-id");
    if (eventId) {
      await adminClient().from("razorpay_events").delete().eq("id", eventId);
    }
    return new Response("error", { status: 500 });
  }
});
