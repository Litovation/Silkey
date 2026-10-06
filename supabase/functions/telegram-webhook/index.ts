// Telegram calls this with every bot update (only join requests are
// subscribed). The work happens in silktone_handle_telegram_update(), which
// checks Telegram's secret header, so this function only forwards.
// Deployed with JWT verification off: Telegram cannot send a Supabase JWT.

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  const payload = await req.json().catch(() => null);
  if (!payload) return new Response("ok");

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const response = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/silktone_handle_telegram_update`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: req.headers.get("x-telegram-bot-api-secret-token") ?? "",
        payload,
      }),
    },
  );
  if (!response.ok) {
    console.error(
      "handle_telegram_update failed",
      response.status,
      await response.text(),
    );
  }
  // Always 200, so Telegram does not retry the same join request forever.
  return new Response("ok");
});
