import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const dateEl = $("date");
const viewEl = $("view");
const theadEl = $("thead");
const tbodyEl = $("tbody");
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
  // 00:00 = end of day
  return t === "00:00" ? 1440 : timeToMin(t);
}
function overlaps(aS, aE, bS, bE) {
  return aS < bE && aE > bS;
}
function formatAMPM(t) {
  // "18:00" -> "6:00 PM"
  const [hh, mm] = t.split(":").map(Number);
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = (hh % 12) || 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

let COURTS = []; // [{id, court_number}]
async function loadCourts() {
  const { data, error } = await supabase
    .from("courts")
    .select("id,court_number,is_active")
    .order("court_number");

  if (error) throw error;
  COURTS = (data || []).filter((c) => c.is_active);
}

function filteredCourts() {
  const v = viewEl.value;
  if (v === "all") return COURTS;
  if (v === "c1") return COURTS.filter(c => c.court_number === 1);
  if (v === "c2") return COURTS.filter(c => c.court_number === 2);
  if (v === "c3") return COURTS.filter(c => c.court_number === 3);
  return COURTS;
}

function renderHeader(courts) {
  theadEl.innerHTML = `
    <tr>
      <th>Time</th>
      ${courts.map(c => `<th>Court ${c.court_number}</th>`).join("")}
    </tr>
  `;
}

function cellHTML(status, label, hint) {
  // status: available | booked | event | blocked
  const classMap = {
    available: "cell available",
    booked: "cell booked",
    event: "cell event",
    blocked: "cell blocked",
  };
  const c = classMap[status] || "cell";
  const l = label ? `<div class="status">${label}</div>` : "";
  const h = hint ? `<div class="status">${hint}</div>` : "";
  return `<div class="${c}"><div><b>${status === "available" ? "Available" : "Unavailable"}</b></div>${l}${h}</div>`;
}

async function renderGrid() {
  msgEl.textContent = "";
  tbodyEl.innerHTML = "";

  const date = dateEl.value;
  const courts = filteredCourts();
  if (!courts.length) {
    msgEl.textContent = "No courts found.";
    return;
  }

  const day = new Date(date + "T00:00:00").getDay();

  // Fetch needed data in parallel
  const [hoursRes, eventsRes, blocksRes, resvRes] = await Promise.all([
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
    msgEl.textContent = "Closed on this day.";
    renderHeader(courts);
    tbodyEl.innerHTML = "";
    return;
  }

  const openM = timeToMin(hours.open_time);
  const closeM = normalizeEnd(hours.close_time); // midnight => 1440

  const events = eventsRes.data || [];
  const blocks = blocksRes.data || [];
  const reservations = resvRes.data || [];

  renderHeader(courts);

  // Build rows for each 1-hour slot
  const rows = [];
  for (let t = openM; t + 60 <= closeM; t += 60) {
    const start = minToTime(t);
    const end = minToTime(t + 60);

    const timeLabel = `${formatAMPM(start)}–${formatAMPM(end === "00:00" ? "00:00" : end)}`;

    const cells = courts.map((court) => {
      // Determine status for this cell
      const courtId = Number(court.id);

      // 1) Event blocks (apply to all courts)
      for (const ev of events) {
        const evS = timeToMin(ev.start_time);
        const evE = normalizeEnd(ev.end_time);
        if (overlaps(t, t + 60, evS, evE)) {
          return `<td>${cellHTML("event", ev.name, "")}</td>`;
        }
      }

      // 2) Admin blocked slots (court-specific or all courts)
      for (const b of blocks) {
        if (b.court_id !== null && Number(b.court_id) !== courtId) continue;
        const bS = timeToMin(b.start_time);
        const bE = normalizeEnd(b.end_time);
        if (overlaps(t, t + 60, bS, bE)) {
          return `<td>${cellHTML("blocked", b.reason || "Blocked", "")}</td>`;
        }
      }

      // 3) Existing reservation for that court
      for (const r of reservations) {
        if (Number(r.court_id) !== courtId) continue;
        const rS = timeToMin(r.start_time);
        const rE = normalizeEnd(r.end_time);
        if (overlaps(t, t + 60, rS, rE)) {
          return `<td>${cellHTML("booked", "Booked", "")}</td>`;
        }
      }

      // 4) Otherwise available
      return `<td>${cellHTML("available", "₱300 / hr", "Pay on-site")}</td>`;
    });

    rows.push(`
      <tr>
        <td>${timeLabel}</td>
        ${cells.join("")}
      </tr>
    `);
  }

  tbodyEl.innerHTML = rows.join("");
}

dateEl.addEventListener("change", renderGrid);
viewEl.addEventListener("change", renderGrid);

await loadCourts();
await renderGrid();
