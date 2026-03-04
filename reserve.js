import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initAuthUI, requireAuth } from "./auth-ui.js";
const authUI = initAuthUI(supabase);
await authUI.refresh();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const dateEl = $("date");
const courtEl = $("court");
const slotsEl = $("slots");
const msgEl = $("msg");
const authMsgEl = $("authMsg");
const selectedEl = $("selected");

let selectedStart = null;

function todayISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}
dateEl.value = new Date().toISOString().split("T")[0];

function timeToMin(t){
  const [h,m] = t.split(":").map(Number);
  return h*60+m;
}
function minToTime(m){
  const hh = String(Math.floor(m/60)%24).padStart(2,"0");
  const mm = String(m%60).padStart(2,"0");
  return `${hh}:${mm}`;
}
function normalizeEnd(t){
  // "00:00" treated as 24:00 for comparisons
  return (t === "00:00") ? 1440 : timeToMin(t);
}
function overlaps(aS,aE,bS,bE){ return aS < bE && aE > bS; }

async function loadCourts(){
  const { data, error } = await supabase.from("courts").select("id,court_number,is_active").order("court_number");
  if (error) throw error;
  const active = (data||[]).filter(c => c.is_active);
  courtEl.innerHTML = active.map(c => `<option value="${c.id}">Court ${c.court_number}</option>`).join("");
}

async function loadAvailability(){
  msgEl.textContent = "";
  selectedStart = null;
  selectedEl.textContent = "";

  const date = dateEl.value;
  const courtId = Number(courtEl.value);
  const day = new Date(date+"T00:00:00").getDay();

  const [{ data: hours }, { data: events }, { data: blocks }, { data: resv }] = await Promise.all([
    supabase.from("operating_hours").select("*").eq("day_of_week", day).single(),
    supabase.from("event_blocks").select("*").eq("day_of_week", day).eq("active", true),
    supabase.from("blocked_slots").select("court_id,start_time,end_time,reason").eq("date", date),
    supabase.from("reservations").select("court_id,start_time,end_time").eq("date", date).eq("status","confirmed"),
  ]);

  if (!hours || hours.is_closed) {
    slotsEl.innerHTML = "<div class='small'>Closed.</div>";
    return;
  }

  const openM = timeToMin(hours.open_time);
  const closeM = normalizeEnd(hours.close_time); // midnight => 1440

  const slotButtons = [];
  for (let t=openM; t+60<=closeM; t+=60){
    const start = minToTime(t);
    const end = minToTime(t+60);
    let disabled = false;
    let label = "";

    // event blocks
    for (const ev of (events||[])){
      const evS = timeToMin(ev.start_time);
      const evE = normalizeEnd(ev.end_time);
      if (overlaps(t, t+60, evS, evE)){
        disabled = true;
        label = ev.name;
        break;
      }
    }

    // blocked slots
    if (!disabled){
      for (const b of (blocks||[])){
        if (b.court_id !== null && Number(b.court_id) !== courtId) continue;
        const bS = timeToMin(b.start_time);
        const bE = normalizeEnd(b.end_time);
        if (overlaps(t, t+60, bS, bE)){
          disabled = true;
          label = b.reason || "Blocked";
          break;
        }
      }
    }

    // existing reservations (selected court)
    if (!disabled){
      for (const r of (resv||[])){
        if (Number(r.court_id) !== courtId) continue;
        const rS = timeToMin(r.start_time);
        const rE = normalizeEnd(r.end_time);
        if (overlaps(t, t+60, rS, rE)){
          disabled = true;
          label = "Booked";
          break;
        }
      }
    }

    slotButtons.push({ start, end, disabled, label });
  }

  slotsEl.innerHTML = slotButtons.map(s => `
    <button class="slot" ${s.disabled?"disabled":""} data-start="${s.start}" data-end="${s.end}">
      <div><b>${s.start}</b></div>
      ${s.label ? `<div class="label">${s.label}</div>` : `<div class="label">${s.end}</div>`}
    </button>
  `).join("");

  slotsEl.querySelectorAll("button.slot:not([disabled])").forEach(btn => {
    btn.addEventListener("click", () => {
      slotsEl.querySelectorAll(".slot").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedStart = btn.dataset.start;
      selectedEl.textContent = `Selected: ${btn.dataset.start} – ${btn.dataset.end}`;
    });
  });
}

async function signup(){
  authMsgEl.textContent = "";
  const email = $("email").value.trim();
  const password = $("password").value;
  const { error } = await supabase.auth.signUp({ email, password });
  authMsgEl.textContent = error ? error.message : "Signed up! Now login.";
}

async function login(){
  authMsgEl.textContent = "";
  const email = $("email").value.trim();
  const password = $("password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  authMsgEl.textContent = error ? error.message : "Logged in!";
}

async function book(){
  msgEl.textContent = "";
  const user = await requireAuth(supabase, authUI);
if (!user) return;

  const date = dateEl.value;
  const courtId = Number(courtEl.value);

  // call the secure RPC (prevents double booking + blocks events + blocks admin blocks)
  const { data, error } = await supabase.rpc("create_reservation", {
    p_date: date,
    p_court_id: courtId,
    p_start_time: selectedStart
  });

  if (error) { msgEl.textContent = error.message; return; }
  if (!data?.ok) { msgEl.textContent = data?.error || "Booking failed"; return; }

  msgEl.textContent = "Booked! ✅";
  await loadAvailability();
}

$("btnSignup").addEventListener("click", signup);
$("btnLogin").addEventListener("click", login);
$("btnBook").addEventListener("click", book);

dateEl.addEventListener("change", loadAvailability);
courtEl.addEventListener("change", loadAvailability);

await loadCourts();
await loadAvailability();
