import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initAuthUI } from "./auth-ui.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const authUI = initAuthUI(supabase);

export async function initHeaderAuth() {
  await authUI.refresh();
  return { supabase, authUI };
}
