// Silktone accounts backend. The publishable key is meant to ship in the app:
// it only identifies the project, and every table is locked by row-level rules.
export const SUPABASE_URL = "https://ihslofjgydhpnaadbhnv.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_Z_8SF_7YMQHB2WYEWMuF8g_e0OZo2pd";

// Where the browser returns after Google sign-in; must match the port in
// src-tauri/src/access.rs and the project's allowed redirect URLs.
export const OAUTH_REDIRECT_URL = "http://127.0.0.1:17645/callback";
