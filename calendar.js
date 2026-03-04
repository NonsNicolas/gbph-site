import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initAuthUI, requireAuth } from "./auth-ui.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const authUI = initAuthUI(supabase);
await authUI.refresh();

const $ = (id) => document.getElementById(id);

const dateEl = $("date");
// If coming from month view: calendar.html?date=MM-DD-YYYY
const params = new URLSearchParams(window.location.search);
const qDate = params.get("date");
if (qDate) dateEl.value = qDate;
const viewEl = $("view");
const theadEl = $("thead");
const tbodyEl = $("tbody");
const msgEl = $("msg");

// auth
const authMsgEl = $("authMsg");
const btnLogin = $("btnLogin");
const btnSignup = $("btnSignup");

// popup
const popup = $("popup");
const popupInfo = $("popupInfo");
const popupMsg = $("popupMsg");
const btnConfirm = $("btnConfirm");
const btnCancel = $("btnCancel");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
dateEl.value = todayISO();

function timeToMin(t) {
  const clean = (t || "").slice(0, 5); // "HH:MM"
  const [h, m] = clean.split(":").map(Number);
  return h * 60 + m;
}
}
function minToTime(m) {
  const hh = String(Math.floor(m / 60) % 24).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
function normalizeEnd(t) {
  // Supabase time may be "00:00:00"
  const clean = (t || "").slice(0, 5); // "HH:MM"
  return clean === "00:00" ? 1440 : timeToMin(clean);
}
}
function overlaps(aS, aE, bS, bE) {
  return aS < bE && aE > bS;
}
function formatAMPM(t) {
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
  if (v === "c1") return COURTS.filter((c) => c.court_number === 1);
  if (v === "c2") return COURTS.filter((c) => c.court_number === 2);
  if (v === "c3") return COURTS.filter((c) => c.court_number === 3);
  return COURTS;
}

function renderHeader(courts) {
  theadEl.innerHTML = `
    <tr>
      <th>Time</th>
      ${courts.map((c) => `<th>Court ${c.court_number}</th>`).join("")}
    </tr>
  `;
}

function cellHTML(status, label, hint, meta) {
  const classMap = {
    available: "cell available",
    booked: "cell booked",
    event: "cell event",
    blocked: "cell blocked",
  };
  const c = classMap[status] || "cell";
  const l = label ? `<div class="status">${label}</div>` : "";
  const h = hint ? `<div class="status">${hint}</div>` : "";

  // If available: attach data attributes for booking
  const attrs = status === "available"
    ? `data-book="1" data-date="${meta.date}" data-court-id="${meta.courtId}" data-court-number="${meta.courtNumber}" data-start="${meta.start}" data-end="${meta.end}"`
    : "";

  return `<div class="${c}" ${attrs} style="${status === "available" ? "cursor:pointer" : ""}">
    <div><b>${status === "available" ? "Available" : "Unavailable"}</b></div>
    ${l}${h}
  </div>`;
}

let lastRenderData = null;
// will store: {date, courts, openM, closeM, events, blocks, reservations, hours}

async function fetchDayData(date) {
  const day = new Date(date + "T00:00:00").getDay();

  const [hoursRes, eventsRes, blocksRes, resvRes] = await Promise.all([
    supabase.from("operating_hours").select("*").eq("day_of_week", day).single(),
    supabase.from("event_blocks").select("*").eq("day_of_week", day).eq("active", true),
    supabase.from("blocked_slots").select("court_id,start_time,end_time,reason").eq("date", date),
    supabase.from("reservations").select("court_id,start_time,end_time").eq("date", date).eq("status", "confirmed"),
  ]);

  if (hoursRes.error) throw hoursRes.error;

  return {
    day,
    hours: hoursRes.data,
    events: eventsRes.data || [],
    blocks: blocksRes.data || [],
    reservations: resvRes.data || [],
  };
}

async function renderGrid() {
  msgEl.textContent = "";
  tbodyEl.innerHTML = "";
  lastRenderData = null;

  const date = dateEl.value;
  const courts = filteredCourts();
  if (!courts.length) {
    msgEl.textContent = "No courts found.";
    return;
  }

  let dayData;
  try {
    dayData = await fetchDayData(date);
  } catch (e) {
    msgEl.textContent = e?.message || "Failed to load day data.";
    return;
  }

  const hours = dayData.hours;
  if (!hours || hours.is_closed) {
    msgEl.textContent = "Closed on this day.";
    renderHeader(courts);
    return;
  }

  const openM = timeToMin(hours.open_time);
  const closeM = normalizeEnd(hours.close_time); // midnight => 1440

  lastRenderData = { date, courts, openM, closeM, ...dayData };

  renderHeader(courts);

  const rows = [];

  for (let t = openM; t + 60 <= closeM; t += 60) {
    const start = minToTime(t);
    const end = minToTime(t + 60);
    const timeLabel = `${formatAMPM(start)}–${formatAMPM(end === "00:00" ? "00:00" : end)}`;

    const cells = courts.map((court) => {
      const courtId = Number(court.id);

      // 1) Event blocks (all courts)
      for (const ev of dayData.events) {
        const evS = timeToMin(ev.start_time);
        const evE = normalizeEnd(ev.end_time);
        if (overlaps(t, t + 60, evS, evE)) {
          return `<td>${cellHTML("event", ev.name, "", {})}</td>`;
        }
      }

      // 2) Admin blocked slots
      for (const b of dayData.blocks) {
        if (b.court_id !== null && Number(b.court_id) !== courtId) continue;
        const bS = timeToMin(b.start_time);
        const bE = normalizeEnd(b.end_time);
        if (overlaps(t, t + 60, bS, bE)) {
          return `<td>${cellHTML("blocked", b.reason || "Blocked", "", {})}</td>`;
        }
      }

      // 3) Booked
      for (const r of dayData.reservations) {
        if (Number(r.court_id) !== courtId) continue;
        const rS = timeToMin(r.start_time);
        const rE = normalizeEnd(r.end_time);
        if (overlaps(t, t + 60, rS, rE)) {
          return `<td>${cellHTML("booked", "Booked", "", {})}</td>`;
        }
      }

      // 4) Available (clickable)
      const meta = {
        date,
        courtId,
        courtNumber: court.court_number,
        start,
        end,
      };
      return `<td>${cellHTML("available", "₱300 / hr", "Pay on-site", meta)}</td>`;
    });

    rows.push(`
      <tr>
        <td>${timeLabel}</td>
        ${cells.join("")}
      </tr>
    `);
  }

  tbodyEl.innerHTML = rows.join("");

  // Bind click handlers after render
  tbodyEl.querySelectorAll('[data-book="1"]').forEach((el) => {
    el.addEventListener("click", () => openPopup(el.dataset));
  });
}

// AUTH
async function signup() {
  authMsgEl.textContent = "";
  const email = $("email").value.trim();
  const password = $("password").value;
  const { error } = await supabase.auth.signUp({ email, password });
  authMsgEl.textContent = error ? error.message : "Signed up! Now login.";
}

async function login() {
  authMsgEl.textContent = "";
  const email = $("email").value.trim();
  const password = $("password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  authMsgEl.textContent = error ? error.message : "Logged in!";
}

// POPUP BOOKING
let pending = null;

function openPopup(ds) {
  popupMsg.textContent = "";
  pending = {
    date: ds.date,
    courtId: Number(ds.courtId),
    courtNumber: ds.courtNumber,
    start: ds.start,
    end: ds.end,
  };
  popupInfo.innerHTML = `
    <div><b>Date:</b> ${pending.date}</div>
    <div><b>Court:</b> ${pending.courtNumber}</div>
    <div><b>Time:</b> ${formatAMPM(pending.start)} – ${formatAMPM(pending.end)}</div>
    <div style="margin-top:6px;"><b>Total:</b> ₱300 (pay on-site)</div>
  `;
  popup.style.display = "block";
}

function closePopup() {
  popup.style.display = "none";
  pending = null;
}

async function confirmBooking() {
 const user = await requireAuth(supabase, authUI);
if (!user) return;
  }
  if (!pending) {
    popupMsg.textContent = "No booking selected.";
    return;
  }

  // Call secure RPC
  const { data, error } = await supabase.rpc("create_reservation", {
    p_date: pending.date,
    p_court_id: pending.courtId,
    p_start_time: pending.start,
  });

  if (error) {
    popupMsg.textContent = error.message;
    return;
  }
  if (!data?.ok) {
    popupMsg.textContent = data?.error || "Booking failed";
    return;
  }

  popupMsg.textContent = "Booked! ✅";
  // refresh the grid
  await renderGrid();
  // close after short delay
  setTimeout(closePopup, 700);
}

btnCancel.addEventListener("click", closePopup);
popup.addEventListener("click", (e) => {
  if (e.target === popup) closePopup();
});
btnConfirm.addEventListener("click", confirmBooking);

btnSignup.addEventListener("click", signup);
btnLogin.addEventListener("click", login);

dateEl.addEventListener("change", renderGrid);
viewEl.addEventListener("change", renderGrid);

// init
await loadCourts();
await renderGrid();
