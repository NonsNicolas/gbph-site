import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initAuthUI, requireAuth } from "./auth-ui.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Auth UI (safe init; never break the page) ----------
let authUI = null;
try {
  authUI = initAuthUI(supabase);
  await authUI.refresh();
} catch (e) {
  console.error("Auth UI init failed:", e);
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);

const dateEl = $("date");
const courtEl = $("court");
const slotsEl = $("slots");
const selectedEl = $("selected");
const msgEl = $("msg");
const btnBook = $("btnBook");

// Pre-fill from Calendar link
const params = new URLSearchParams(location.search);
const qDate = params.get("date");
const qCourt = params.get("court");

if (qDate && dateEl) {
  dateEl.value = qDate;
}

if (qCourt && qCourt !== "all" && courtEl) {
  courtEl.value = qCourt;
}

// Guard: ensure page has required elements
if (!dateEl || !courtEl || !slotsEl || !selectedEl || !msgEl || !btnBook) {
  console.error("reserve.html is missing required IDs.");
  if (msgEl) msgEl.textContent = "Page setup error: missing required elements.";
}

// Default date
if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);

// ---------- Helpers ----------
let selectedStart = null;

function cleanTime(t) {
  // Handles "HH:MM:SS" -> "HH:MM"
  return (t || "").slice(0, 5);
}
function timeToMin(t) {
  const s = cleanTime(t);
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}
function minToTime(m) {
  const hh = String(Math.floor(m / 60) % 24).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
function normalizeEnd(t) {
  // Midnight close_time ("00:00") means end of day = 1440
  const s = cleanTime(t);
  return s === "00:00" ? 1440 : timeToMin(s);
}
function overlaps(aS, aE, bS, bE) {
  return aS < bE && aE > bS;
}
function showMsg(text) {
  if (msgEl) msgEl.textContent = text || "";
}
function showErr(err, prefix = "") {
  const message = err?.message || String(err);
  showMsg(prefix ? `${prefix}: ${message}` : message);
}

// ---------- Data Loaders ----------
async function loadCourts() {
  showMsg("");

  const { data, error } = await supabase
    .from("courts")
    .select("id,court_number,is_active")
    .order("court_number");

  if (error) throw error;

  const active = (data || []).filter((c) => c.is_active);
  if (!active.length) {
    courtEl.innerHTML = "";
    showMsg("No active courts found. Add courts in Supabase table: courts.");
    return;
  }

  courtEl.innerHTML = active
    .map((c) => `<option value="${c.id}">Court ${c.court_number}</option>`)
    .join("");
}

async function loadAvailability() {
  showMsg("");
  selectedStart = null;
  if (selectedEl) selectedEl.textContent = "";

  const date = dateEl?.value;
  const courtId = Number(courtEl?.value);

  if (!date || !courtId) return;

  // DOW: 0=Sun ... 6=Sat
  const dow = new Date(date + "T00:00:00").getDay();

  // Fetch: operating hours + event blocks + admin blocks + public reservations
  const [hoursRes, eventsRes, blocksRes, bookedRes] = await Promise.all([
    supabase.from("operating_hours").select("*").eq("day_of_week", dow).single(),
    supabase.from("event_blocks").select("*").eq("day_of_week", dow).eq("active", true),
    supabase.from("blocked_slots").select("court_id,start_time,end_time,reason").eq("date", date),
    // PUBLIC VIEW (so everyone can see booked slots)
    supabase.from("public_reservations").select("court_id,start_time,end_time").eq("date", date),
  ]);

  if (hoursRes.error) throw hoursRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (blocksRes.error) throw blocksRes.error;
  if (bookedRes.error) throw bookedRes.error;

  const hours = hoursRes.data;
  if (!hours || hours.is_closed) {
    slotsEl.innerHTML = `<div class="small">Closed.</div>`;
    return;
  }

  const openM = timeToMin(hours.open_time);
  const closeM = normalizeEnd(hours.close_time);

  const events = eventsRes.data || [];
  const blocks = blocksRes.data || [];
  const booked = bookedRes.data || [];

  const slots = [];

  // 1-hour slots only
  for (let t = openM; t + 60 <= closeM; t += 60) {
    const start = minToTime(t);
    const end = minToTime(t + 60);

    let disabled = false;
    let label = "";

    // 1) Event blocks: Open Play / Club Night (blocks all courts)
    for (const ev of events) {
      const evS = timeToMin(ev.start_time);
      const evE = normalizeEnd(ev.end_time);
      if (overlaps(t, t + 60, evS, evE)) {
        disabled = true;
        label = ev.name || "Event";
        break;
      }
    }

    // 2) Admin blocked slots: blocks per court or all courts (court_id null)
    if (!disabled) {
      for (const b of blocks) {
        if (b.court_id !== null && Number(b.court_id) !== courtId) continue;
        const bS = timeToMin(b.start_time);
        const bE = normalizeEnd(b.end_time);
        if (overlaps(t, t + 60, bS, bE)) {
          disabled = true;
          label = b.reason || "Blocked";
          break;
        }
      }
    }

    // 3) Booked reservations (public view): only this court
    if (!disabled) {
      for (const r of booked) {
        if (Number(r.court_id) !== courtId) continue;
        const rS = timeToMin(r.start_time);
        const rE = normalizeEnd(r.end_time);
        if (overlaps(t, t + 60, rS, rE)) {
          disabled = true;
          label = "Booked";
          break;
        }
      }
    }

    slots.push({ start, end, disabled, label });
  }

  // Render slots
  slotsEl.innerHTML = slots
    .map((s) => {
      const disabledAttr = s.disabled ? "disabled" : "";
      const sub = s.label ? s.label : `${s.end} • ₱300`;
      const extraClass = s.disabled ? " blocked" : "";
      return `
        <button class="slot${extraClass}" ${disabledAttr} data-start="${s.start}">
          <div><b>${s.start}</b></div>
          <div class="small">${sub}</div>
        </button>
      `;
    })
    .join("");

  // Click to select
  slotsEl.querySelectorAll("button.slot:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => {
      slotsEl.querySelectorAll(".slot").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedStart = btn.dataset.start;
      selectedEl.textContent = `Selected: ${selectedStart}`;
      showMsg("");
    });
  });
}

// ---------- Booking ----------
async function book() {
  showMsg("");

  if (!selectedStart) {
    showMsg("Select a time slot first.");
    return;
  }

  // Ask login only when booking
  const user = await requireAuth(supabase, authUI);
  if (!user) return;

  const date = dateEl.value;
  const courtId = Number(courtEl.value);

  const { data, error } = await supabase.rpc("create_reservation", {
    p_date: date,
    p_court_id: courtId,
    p_start_time: selectedStart,
  });

  if (error) {
    showMsg(error.message);
    return;
  }
  if (!data?.ok) {
    showMsg(data?.error || "Booking failed.");
    return;
  }

  showMsg("Booked! ✅");
  await loadAvailability();
}

// ---------- Events ----------
btnBook?.addEventListener("click", () => book().catch((e) => showErr(e, "Booking error")));
dateEl?.addEventListener("change", () => loadAvailability().catch((e) => showErr(e, "Load error")));
courtEl?.addEventListener("change", () => loadAvailability().catch((e) => showErr(e, "Load error")));

// ---------- Init ----------
(async function init() {
  try {
    await loadCourts();
    await loadAvailability();
  } catch (e) {
    console.error(e);
    showErr(e);
  }
})();
