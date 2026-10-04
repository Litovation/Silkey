// Shared by the payment functions: who is calling, and how to talk to Razorpay.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Full-access database client. Never return its results to the app unfiltered. */
export const adminClient = (): SupabaseClient =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

export interface Profile {
  id: string;
  email: string | null;
  banned: boolean;
  razorpay_subscription_id: string | null;
  subscription_status: string | null;
}

/** The signed-in user's profile, or null when the request carries no valid session. */
export const callerProfile = async (
  admin: SupabaseClient,
  request: Request,
): Promise<Profile | null> => {
  const token = (request.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, banned, razorpay_subscription_id, subscription_status")
    .eq("id", data.user.id)
    .maybeSingle();
  return profile as Profile | null;
};

export interface RazorpaySubscription {
  id: string;
  status: string;
  short_url?: string;
  /** Unix seconds; end of the billing period that has been paid for. */
  current_end?: number | null;
}

export class RazorpayError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const razorpay = async <T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> => {
  const auth = btoa(
    `${Deno.env.get("RAZORPAY_KEY_ID")}:${Deno.env.get("RAZORPAY_KEY_SECRET")}`,
  );
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new RazorpayError(
      response.status,
      data?.error?.description ?? `Razorpay error (${response.status})`,
    );
  }
  return data as T;
};

/** Subscription states in which the customer can still pay or is being billed. */
export const LIVE_STATUSES = ["created", "authenticated", "active", "pending"];
