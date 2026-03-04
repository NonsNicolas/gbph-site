import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initHeaderAuth } from "./app-init.js";
await initHeaderAuth();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const dateEl = $("date");
const courtEl = $("court");
const slotsEl = $("slots");
const msgEl = $("msg");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
dateEl.value = todayISO();

function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minToTime(m) {
  const hh = String(Math.floor(m / 60) % 24).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
function normalizeEnd(t) {
  return t === "00:00" ? 1440 : timeToMin(t);
}
function overlaps(aS, aE, bS, bE) {
  return aS < bE && aE > bS;
}

async function loadCourts() {
  msgEl.textContent = "";
  const { data, error } = await supabase
    .from("courts")
    .select("id,court_number,is_active")
    .order("court_number");

  if (error) {
    msgEl.textContent = error.message;
    return;
  }

  const active = (data || []).filter((c) => c.is_active);
  courtEl.innerHTML = active
    .map((c) => `<option value="${c.id}">Court ${c.court_number}</option>`)
    .join("");
}

function slotCard({ start, end, status, label }) {
  // Simple visual: unavailable slots are disabled-style cards
  const disabled = status !== "Available";
  return `
    <div class="slot" style="${disabled ? "opacity:.55" : ""}">
      <div><b>${start}</b> – ${end}</div>
      <div class="label">${label || status}</div>
    </div>
  `;
}

async function render() {
  msgEl.textContent = "";
  slotsEl.innerHTML = "";

  const date = dateEl.value;
  const courtId = Number(courtEl.value);
  const day = new Date(date + "T00:00:00").getDay();

  const [
    hoursRes,
    eventsRes,
    blocksRes,
    resvRes
  ] = await Promise.all([
    supabase.from("operating_hours").select("*").eq("day_of_week", day).single(),
    supabase.from("event_blocks").select("*").eq("day_of_week", day).eq("active", true),
    supabase.from("blocked_slots").select("court_id,start_time,end_time,reason").eq("date", date),
    supabase.from("reservations").select("court_id,start_time,end_time").eq("date", date).eq("status", "confirmed"),
  ]);

  if (hoursRes.error) {
    msgEl.textContent = hoursRes.error.message;
    return;
  }
  const hours = hoursRes.data;
  if (!hours || hours.is_closed) {
    slotsEl.innerHTML = `<div class="small">Closed on this day.</div>`;
    return;
  }

  const openM = timeToMin(hours.open_time);
  const closeM = normalizeEnd(hours.close_time); // midnight => 1440
  const events = eventsRes.data || [];
  const blocks = blocksRes.data || [];
  const reservations = resvRes.data || [];

  const cards = [];

  for (let t = openM; t + 60 <= closeM; t += 60) {
    const start = minToTime(t);
    const end = minToTime(t + 60);

    let status = "Available";
    let label = "";

    // Event blocks first
    for (const ev of events) {
      const evS = timeToMin(ev.start_time);
      const evE = normalizeEnd(ev.end_time);
      if (overlaps(t, t + 60, evS, evE)) {
        status = "Unavailable";
        label = ev.name; // e.g. Open Play (Tue)
        break;
      }
    }

    // Admin blocked slots
    if (status === "Available") {
      for (const b of blocks) {
        if (b.court_id !== null && Number(b.court_id) !== courtId) continue;
        const bS = timeToMin(b.start_time);
        const bE = normalizeEnd(b.end_time);
        if (overlaps(t, t + 60, bS, bE)) {
          status = "Unavailable";
          label = b.reason || "Blocked";
          break;
        }
      }
    }

    // Existing reservation (selected court)
    if (status === "Available") {
      for (const r of reservations) {
        if (Number(r.court_id) !== courtId) continue;
        const rS = timeToMin(r.start_time);
        const rE = normalizeEnd(r.end_time);
        if (overlaps(t, t + 60, rS, rE)) {
          status = "Unavailable";
          label = "Booked";
          break;
        }
      }
    }

    cards.push(slotCard({ start, end, status, label }));
  }

  slotsEl.innerHTML = cards.join("");
}

dateEl.addEventListener("change", render);
courtEl.addEventListener("change", render);

await loadCourts();
await render();
