import { createClient } from "@supabase/supabase-js";
import { isCloudConfigured } from "./db";

let client = null;
const NET_TIMEOUT_MS = 3000;
const fetchWithTimeout = (input, init) => {
  const ctrl = new AbortController();
  if (init && init.signal) {
    if (init.signal.aborted) ctrl.abort();
    else init.signal.addEventListener("abort", () => ctrl.abort());
  }
  const id = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(id));
};

export function getSupabase() {
  if (!isCloudConfigured()) return null;
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      global: { fetch: fetchWithTimeout },
    });
  }
  return client;
}
