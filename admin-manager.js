import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initHeaderAuth } from "./app-init.js";
await initHeaderAuth();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const authUI = initAuthUI(supabase);
await authUI.refresh();

const $ = (id) => document.getElementById(id);
const dateEl = $("date");
const courtEl = $("court");
const msgEl = $("msg");
const rowsEl = $("rows");

dateEl.value = new Date().toISOString().slice(0,10);

function cleanTime(t){ return (t||"").slice(0,5); }

async function ensureAdmin(){
  const user = await requireAuth(supabase, authUI);
  if (!user) return false;

  // check role
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (error) { msgEl.textContent = error.message; return false; }
  if (data?.role !== "admin") {
    msgEl.textContent = "You are not an admin. Set role=admin in Supabase profiles.";
    return false;
  }
  return true;
}

async function loadCourts(){
  const { data } = await supabase.from("courts").select("id,court_number,is_active").order("court_number");
  const active = (data||[]).filter(c => c.is_active);
  courtEl.innerHTML = `<option value="all">All</option>` + active.map(c => `<option value="${c.id}">Court ${c.court_number}</option>`).join("");
}

async function refresh(){
  msgEl.textContent = "";
  rowsEl.innerHTML = "";

  const ok = await ensureAdmin();
  if (!ok) return;

  const date = dateEl.value;
  const court = courtEl.value;

  let q = supabase
    .from("public reservations")
    .select("id,user_id,court_id,date,start_time,end_time,total_fee_php,status")
    .eq("date", date)
    .order("start_time", { ascending: true });

  if (court !== "all") q = q.eq("court_id", Number(court));

  const { data, error } = await q;
  if (error) { msgEl.textContent = error.message; return; }

  // court map for display
  const { data: courts } = await supabase.from("courts").select("id,court_number");
  const map = new Map((courts||[]).map(c => [String(c.id), c.court_number]));

  if (!data || data.length === 0) {
    msgEl.textContent = "No reservations found for this date.";
    return;
  }

  rowsEl.innerHTML = data.map(r => `
    <tr>
      <td>${cleanTime(r.start_time)}–${cleanTime(r.end_time)}</td>
      <td>Court ${map.get(String(r.court_id)) ?? "?"}</td>
      <td class="small">${r.user_id}</td>
      <td>${r.status}</td>
      <td>₱${r.total_fee_php}</td>
      <td>
        ${r.status === "confirmed"
          ? `<button class="danger" data-cancel="${r.id}">Cancel</button>`
          : `<span class="small">—</span>`
        }
      </td>
    </tr>
  `).join("");

  rowsEl.querySelectorAll("[data-cancel]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.cancel);
      const yes = confirm("Cancel this reservation?");
      if (!yes) return;

      const { error: upErr } = await supabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("id", id);

      if (upErr) alert(upErr.message);
      await refresh();
    });
  });
}

$("refresh").addEventListener("click", refresh);
dateEl.addEventListener("change", refresh);
courtEl.addEventListener("change", refresh);

await loadCourts();
await refresh();
