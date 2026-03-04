import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { initHeaderAuth } from "./app-init.js";
await initHeaderAuth();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const authUI = initAuthUI(supabase);
await authUI.refresh();

const $ = (id) => document.getElementById(id);
const titleEl = $("title");
const gridEl = $("grid");
const dowEl = $("dow");
const msgEl = $("msg");

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
dowEl.innerHTML = DOW.map(d => `<div class="dow">${d}</div>`).join("");

function iso(d){ return d.toISOString().slice(0,10); }
function ym(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }

let cursor = new Date();

async function loadMonth() {
  msgEl.textContent = "";
  gridEl.innerHTML = "";
  titleEl.textContent = cursor.toLocaleString(undefined, { month:"long", year:"numeric" });

  const start = startOfMonth(cursor);
  const end = endOfMonth(cursor);

  const rangeStart = iso(start);
  const rangeEnd = iso(end);

  // fetch reservations + blocks within month
  const [resvRes, blockRes] = await Promise.all([
    supabase.from("reservations")
      .select("date")
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .eq("status","confirmed"),
    supabase.from("blocked_slots")
      .select("date")
      .gte("date", rangeStart)
      .lte("date", rangeEnd),
  ]);

  if (resvRes.error) msgEl.textContent = resvRes.error.message;
  if (blockRes.error) msgEl.textContent = (msgEl.textContent ? msgEl.textContent + " | " : "") + blockRes.error.message;

  const bookedCount = new Map(); // date -> count
  for (const r of (resvRes.data || [])) {
    bookedCount.set(r.date, (bookedCount.get(r.date) || 0) + 1);
  }

  const blockedCount = new Map();
  for (const b of (blockRes.data || [])) {
    blockedCount.set(b.date, (blockedCount.get(b.date) || 0) + 1);
  }

  // calendar grid: start on Sunday
  const firstDay = start.getDay();
  const daysInMonth = end.getDate();

  // add leading blanks from previous month
  const cells = [];
  for (let i=0;i<firstDay;i++){
    cells.push({ muted:true, label:"", date:null });
  }

  for (let day=1; day<=daysInMonth; day++){
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    const key = iso(d);
    const b = bookedCount.get(key) || 0;
    const x = blockedCount.get(key) || 0;

    cells.push({ muted:false, label:String(day), date:key, booked:b, blocked:x });
  }

  // fill to complete weeks (optional)
  while (cells.length % 7 !== 0) cells.push({ muted:true, label:"", date:null });

  gridEl.innerHTML = cells.map(c => {
    if (c.muted) return `<div class="day muted"></div>`;

    const badges = [];
    if (c.booked) badges.push(`<span class="badge">Booked: ${c.booked}</span>`);
    if (c.blocked) badges.push(`<span class="badge">Blocks: ${c.blocked}</span>`);
    if (!c.booked && !c.blocked) badges.push(`<span class="badge">Open</span>`);

    return `
      <div class="day" data-date="${c.date}">
        <div class="daynum">${c.label}</div>
        <div class="badges">${badges.join("")}</div>
      </div>
    `;
  }).join("");

  // click day -> open daily schedule with ?date=
  gridEl.querySelectorAll(".day[data-date]").forEach(el => {
    el.addEventListener("click", () => {
      const d = el.dataset.date;
      window.location.href = `./calendar.html?date=${encodeURIComponent(d)}`;
    });
  });
}

$("prev").addEventListener("click", async () => {
  cursor = new Date(cursor.getFullYear(), cursor.getMonth()-1, 1);
  await loadMonth();
});
$("next").addEventListener("click", async () => {
  cursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
  await loadMonth();
});
$("today").addEventListener("click", async () => {
  cursor = new Date();
  await loadMonth();
});

await loadMonth();
