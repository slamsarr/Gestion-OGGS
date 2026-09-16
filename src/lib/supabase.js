import { createClient } from "@supabase/supabase-js";
import { isCloudConfigured } from "./db";

let client = null;

export function getSupabase() {
  if (!isCloudConfigured()) return null;
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
