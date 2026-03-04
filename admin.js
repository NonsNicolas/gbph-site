import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initHeaderAuth } from "./app-init.js";
await initHeaderAuth();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
$("date").value = new Date().toISOString().slice(0,10);

async function loadCourts(){
  const { data, error } = await supabase.from("courts").select("id,court_number,is_active").order("court_number");
  if (error) throw error;
  const active = (data||[]).filter(c => c.is_active);
  const opts = active.map(c => `<option value="${c.id}">Court ${c.court_number}</option>`).join("");
  $("court").insertAdjacentHTML("beforeend", opts);
}

async function login(){
  $("authMsg").textContent = "";
  const email = $("email").value.trim();
  const password = $("password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  $("authMsg").textContent = error ? error.message : "Logged in!";
}

async function blockTime(){
  $("blockMsg").textContent = "";

  // Admin-only: RLS will reject non-admin
  const date = $("date").value;
  const courtVal = $("court").value;
  const court_id = (courtVal === "all") ? null : Number(courtVal);

  const start_time = $("start").value;
  const end_time = $("end").value;
  const reason = $("reason").value.trim() || "Blocked";

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { $("blockMsg").textContent = "Please login first."; return; }

  const { error } = await supabase.from("blocked_slots").insert({
    date,
    court_id,
    start_time,
    end_time,
    reason,
    created_by: user.id
  });

  $("blockMsg").textContent = error ? error.message : "Blocked ✅";
}

$("btnLogin").addEventListener("click", login);
$("btnBlock").addEventListener("click", blockTime);

await loadCourts();
