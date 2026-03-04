import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initAuthUI, requireAuth } from "./auth-ui.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const authUI = initAuthUI(supabase);
await authUI.refresh();

const $ = (id) => document.getElementById(id);

const dateEl = $("date");
const courtEl = $("court");
const slotsEl = $("slots");
const selectedEl = $("selected");
const msgEl = $("msg");
const btnBook = $("btnBook");

dateEl.value = new Date().toISOString().slice(0, 10);

let selectedStart = null;
let selectedEnd = null;

function timeToMin(t) {
  const clean = (t || "").slice(0, 5); // handles "HH:MM:SS"
  const [h, m] = clean.split(":").map(Number);
  return h * 60 + m;
}
function minToTime(m) {
  const hh = String(Math.floor(m / 60) % 24).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
function normalizeEnd(t) {
  const clean = (t || "").slice(0, 5);
  return clean === "00:00" ? 1440 : timeToMin(clean);
}
function overlaps(aS, aE, bS, bE) {
  return aS < bE && aE > bS;
}

async function loadCourts() {
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

function renderSlots(slotButtons) {
  slotsEl.innerHTML = slotButtons
    .map((s) => {
      const label = s.label ? s.label : `${s.start} – ${s.end}`;
      const disabledAttr = s.disabled ? "disabled" : "";
      const extra = s.label ? " blocked" : "";
      return `
        <button class="slot${extra}" ${disabledAttr}
          data-start="${s.start}" data-end="${s.end}">
          <div><b>${s.start}</b></div>
          <div class="small">${s.label ? s.label : s.end}</div>
        </button>
      `;
    })
    .join("");

  slotsEl.querySelectorAll("button.slot:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => {
      slotsEl.querySelectorAll(".slot").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedStart = btn.dataset.start;
      selectedEnd = btn.dataset.end;
      selectedEl.textContent = `Selected: ${selectedStart} – ${selectedEnd}`;
      msgEl.textContent = "";
    });
  });
}

async function loadAvailability() {
  msgEl.textContent = "";
  selectedStart = null;
  selectedEnd = null;
  selectedEl.textContent = "";

  const date = dateEl.value;
  const courtId = Number(courtEl.value);
  if (!date || !courtId) return;

  const day = new Date(date + "T00:00:00").getDay();

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
    slotsEl.innerHTML = "<div class='small'>Closed.</div>";
    return;
  }

  const openM = timeToMin(hours.open_time);
  const closeM = normalizeEnd(hours.close_time);

  const events = eventsRes.data || [];
  const blocks = blocksRes.data || [];
  const resv = resvRes.data || [];

  const slotButtons = [];

  for (let t = openM; t + 60 <= closeM; t += 60) {
    const start = minToTime(t);
    const end = minToTime(t + 60);

    let disabled = false;
    let label = "";

    // Event blocks (all courts)
    for (const ev of events) {
      const evS = timeToMin(ev.start_time);
      const evE = normalizeEnd(ev.end_time);
      if (overlaps(t, t + 60, evS, evE)) {
        disabled = true;
        label = ev.name;
        break;
      }
    }

    // Admin blocks (this court or all)
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

    // Existing reservations (this court)
    if (!disabled) {
      for (const r of resv) {
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

    slotButtons.push({ start, end, disabled, label });
  }

  renderSlots(slotButtons);
}

async function book() {
  msgEl.textContent = "";

  if (!selectedStart) {
    msgEl.textContent = "Select a time slot first.";
    return;
  }

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
    msgEl.textContent = error.message;
    return;
  }
  if (!data?.ok) {
    msgEl.textContent = data?.error || "Booking failed";
    return;
  }

  msgEl.textContent = "Booked! ✅";
  await loadAvailability();
}

// Events
btnBook.addEventListener("click", book);
dateEl.addEventListener("change", loadAvailability);
courtEl.addEventListener("change", loadAvailability);

// Init
await loadCourts();
await loadAvailability();
