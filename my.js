import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initHeaderAuth } from "./app-init.js";
await initHeaderAuth();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const authUI = initAuthUI(supabase);
await authUI.refresh();

const $ = (id) => document.getElementById(id);
const msgEl = $("msg");
const listEl = $("list");

function cleanTime(t){ return (t||"").slice(0,5); }

async function loadMine(){
  msgEl.textContent = "";
  listEl.innerHTML = "";

  const user = await requireAuth(supabase, authUI);
  if (!user) {
    msgEl.textContent = "Please login to view your bookings.";
    return;
  }

  // RLS: user can read own reservations
  const { data, error } = await supabase
    .from("reservations")
    .select("id,date,start_time,end_time,total_fee_php,status,court_id")
    .order("date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) { msgEl.textContent = error.message; return; }

  if (!data || data.length === 0) {
    msgEl.textContent = "No bookings yet.";
    return;
  }

  // Get courts map for nicer display
  const { data: courts } = await supabase.from("courts").select("id,court_number");
  const map = new Map((courts||[]).map(c => [String(c.id), c.court_number]));

  listEl.innerHTML = data.map(r => `
    <div class="card" style="margin:0;">
      <div><b>${r.date}</b> • Court ${map.get(String(r.court_id)) ?? "?"}</div>
      <div class="small">${cleanTime(r.start_time)} – ${cleanTime(r.end_time)} • ₱${r.total_fee_php} • ${r.status}</div>
      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
        <a class="btn" style="background:#111;color:#fff;text-decoration:none" href="./calendar.html?date=${encodeURIComponent(r.date)}">View day</a>
      </div>
    </div>
  `).join("");
}

await loadMine();
