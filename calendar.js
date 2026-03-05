import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initAuthUI } from "./auth-ui.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth UI (just for profile display; calendar is public)
const authUI = initAuthUI(supabase);
await authUI.refresh();

const calGrid = document.getElementById("calGrid");
const monthTitle = document.getElementById("monthTitle");
const calMsg = document.getElementById("calMsg");

const btnToday = document.getElementById("btnToday");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const courtFilter = document.getElementById("courtFilter");

let current = new Date();
current.setDate(1);

let courtsById = new Map(); // court_id -> court_number

function pad2(n) { return String(n).padStart(2, "0"); }
function ymd(d) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  return `${y}-${m}-${da}`;
}
function cleanTime(t) { return String(t || "").slice(0, 5); }

function startOfCalendarGrid(monthDate) {
  // monthDate is first day of month
  const d = new Date(monthDate);
  const day = d.getDay(); // 0 Sun
  d.setDate(d.getDate() - day);
  return d;
}
function endOfCalendarGrid(monthDate) {
  const d = new Date(monthDate);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0); // last day of month
  const day = d.getDay();
  d.setDate(d.getDate() + (6 - day));
  return d;
}

async function loadCourts() {
  const { data, error } = await supabase
    .from("courts")
    .select("id,court_number,is_active")
    .order("court_number");

  if (error) throw error;

  courtsById = new Map();
  (data || []).forEach((c) => courtsById.set(Number(c.id), c.court_number));

  // populate dropdown
  const active = (data || []).filter((c) => c.is_active);
  courtFilter.innerHTML = `<option value="all">All</option>` + active
    .map((c) => `<option value="${c.id}">Court ${c.court_number}</option>`)
    .join("");
}

async function fetchBookings(rangeStart, rangeEnd) {
  // Public view: public_reservations
  const { data, error } = await supabase
    .from("public_reservations")
    .select("date,court_id,start_time,end_time")
    .gte("date", rangeStart)
    .lte("date", rangeEnd);

  if (error) throw error;

  // Optional filter by court
  const selectedCourt = courtFilter.value;
  const filtered = selectedCourt === "all"
    ? (data || [])
    : (data || []).filter((r) => String(r.court_id) === String(selectedCourt));

  // Group by date
  const byDate = new Map();
  for (const r of filtered) {
    const k = r.date; // YYYY-MM-DD from Supabase
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(r);
  }

  // Sort each day by time
  for (const [k, arr] of byDate.entries()) {
    arr.sort((a, b) => cleanTime(a.start_time).localeCompare(cleanTime(b.start_time)));
  }

  return byDate;
}

function renderMonthGrid(byDate) {
  const monthName = current.toLocaleString(undefined, { month: "long" });
  monthTitle.textContent = `${monthName} ${current.getFullYear()}`;

  const gridStart = startOfCalendarGrid(current);
  const gridEnd = endOfCalendarGrid(current);

  const todayStr = ymd(new Date());
  const monthIndex = current.getMonth();

  // Build 6 weeks max (42 cells)
  const cells = [];
  const d = new Date(gridStart);

  while (d <= gridEnd) {
    const inMonth = d.getMonth() === monthIndex;
    const key = ymd(d);

    const dayBookings = byDate.get(key) || [];

    // limit visible chips like Google Calendar (+ more)
    const maxShow = 3;
    const shown = dayBookings.slice(0, maxShow);
    const extra = dayBookings.length - shown.length;

    const chipsHtml = shown.map((r) => {
      const courtNum = courtsById.get(Number(r.court_id)) ?? r.court_id;
      const st = cleanTime(r.start_time);
      const en = cleanTime(r.end_time);
      return `
        <div class="cal-chip" title="Court ${courtNum} • ${st}-${en}">
          <span class="cal-chip-dot"></span>
          <span class="cal-chip-text">Court ${courtNum} • ${st}-${en}</span>
        </div>
      `;
    }).join("");

    const moreHtml = extra > 0 ? `<div class="cal-more">+${extra} more</div>` : "";

    const classes = [
      "cal-day",
      inMonth ? "" : "muted",
      key === todayStr ? "today" : ""
    ].join(" ").trim();

    cells.push(`
      <div class="${classes}" data-date="${key}">
        <div class="cal-day-top">
          <div class="cal-day-num">${d.getDate()}</div>
        </div>
        <div class="cal-events">
          ${chipsHtml}
          ${moreHtml}
        </div>
      </div>
    `);

    d.setDate(d.getDate() + 1);
  }

  calGrid.innerHTML = cells.join("");

  // Optional: click day -> go to Reserve page for that date
  calGrid.querySelectorAll(".cal-day").forEach((el) => {
    el.addEventListener("click", () => {
      const date = el.getAttribute("data-date");
      // send user to reserve page with date prefilled
      window.location.href = `./reserve.html?date=${encodeURIComponent(date)}&court=${encodeURIComponent(courtFilter.value)}`;
    });
  });
}

async function loadAndRender() {
  calMsg.textContent = "";
  try {
    const gridStart = ymd(startOfCalendarGrid(current));
    const gridEnd = ymd(endOfCalendarGrid(current));
    const byDate = await fetchBookings(gridStart, gridEnd);

    renderMonthGrid(byDate);

    const total = [...byDate.values()].reduce((sum, a) => sum + a.length, 0);
    const courtText = courtFilter.value === "all" ? "All courts" : `Court ${courtsById.get(Number(courtFilter.value)) || ""}`;
    calMsg.textContent = `Showing bookings for ${courtText}. Click a day to book that date.`;
  } catch (e) {
    console.error(e);
    calMsg.textContent = e?.message || "Failed to load calendar.";
  }
}

// Events
btnToday.addEventListener("click", async () => {
  current = new Date();
  current.setDate(1);
  await loadAndRender();
});
btnPrev.addEventListener("click", async () => {
  current.setMonth(current.getMonth() - 1);
  current.setDate(1);
  await loadAndRender();
});
btnNext.addEventListener("click", async () => {
  current.setMonth(current.getMonth() + 1);
  current.setDate(1);
  await loadAndRender();
});
courtFilter.addEventListener("change", loadAndRender);

// Init
(async function init() {
  await loadCourts();
  await loadAndRender();
})();
