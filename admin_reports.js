/* -------------------------------------------------------
   w3.hub Admin Analytics – FULL REPLACEMENT FILE
   Features:
   ✔ Accurate consumption (start + restock – end)
   ✔ Multi-filter (drink + fridge + date)
   ✔ Clickable charts → filtered drilldown
   ✔ Hover highlighting
   ✔ Smooth auto-scroll
   ✔ Clear Filter button
-------------------------------------------------------- */

// Lookup tables
let eventsById = {};
let floorsById = {};
let fridgesById = {};
let drinksById = {};

// Chart instances
let drinkPieChart = null;
let fridgeBarChart = null;
let dateLineChart = null;

// Global data
let currentLogs = [];
let activeFilters = {
  drink: null,
  fridge: null,
  date: null
};

document.addEventListener("DOMContentLoaded", () => {
  initAnalytics().catch(err => {
    console.error("Initialization error:", err);
    document.getElementById("events-status").textContent =
      "Error loading analytics.";
  });
});

async function initAnalytics() {
  await loadLookups();
  buildEventCheckboxes();

  document
    .getElementById("apply-event-filter")
    .addEventListener("click", refreshAnalytics);

  document
    .getElementById("export-csv-btn")
    .addEventListener("click", exportCsv);

  document
    .getElementById("download-pdf-btn")
    .addEventListener("click", downloadPdf);

  addClearFilterPill();
}

/* -------------------------------------------------------
   Load lookup tables
-------------------------------------------------------- */
async function loadLookups() {
  const [events, floors, fridges, drinks] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("floors").select("*"),
    supabase.from("fridges").select("*"),
    supabase.from("drink_types").select("*")
  ]);

  events.data?.forEach(e => (eventsById[e.id] = e));
  floors.data?.forEach(f => (floorsById[f.id] = f));
  fridges.data?.forEach(fr => (fridgesById[fr.id] = fr));
  drinks.data?.forEach(d => (drinksById[d.id] = d));
}

/* -------------------------------------------------------
   Event Checkboxes
-------------------------------------------------------- */
function buildEventCheckboxes() {
  const container = document.getElementById("event-checkboxes");
  container.innerHTML = "";

  const events = Object.values(eventsById).sort((a, b) =>
    (a.event_date || "").localeCompare(b.event_date || "")
  );

  events.forEach(ev => {
    const label = document.createElement("label");
    label.className = "event-checkbox-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = ev.id;
    cb.checked = true;

    label.appendChild(cb);
    label.appendChild(
      document.createTextNode(
        ` ${ev.name}${ev.event_date ? " (" + ev.event_date + ")" : ""}`
      )
    );

    container.appendChild(label);
  });
}

function getSelectedEventIds() {
  return [...document.querySelectorAll("#event-checkboxes input:checked")].map(
    cb => cb.value
  );
}

/* -------------------------------------------------------
   MAIN REFRESH
-------------------------------------------------------- */
async function refreshAnalytics() {
  resetFilters();
  const tbody = document.getElementById("drilldown-body");
  tbody.innerHTML = "";

  const selected = getSelectedEventIds();
  if (selected.length === 0) {
    clearCharts();
    document.getElementById("charts-empty-message").style.display = "block";
    return;
  }

  const { data, error } = await supabase
    .from("fridge_log_entries")
    .select("*")
    .in("event_id", selected);

  if (error || !data) {
    clearCharts();
    return;
  }

  currentLogs = data.map(row => {
    const event = eventsById[row.event_id];
    const fridge = fridgesById[row.fridge_id];
    const drink = drinksById[row.drink_type_id];
    const floor = fridge ? floorsById[fridge.floor_id] : null;

    return { ...row, event, fridge, drink, floor };
  });

  buildCharts(currentLogs);
  fillDrilldownTable(currentLogs);
  autoScrollToSection("drilldown-section");
}

/* -------------------------------------------------------
   CHARTS
-------------------------------------------------------- */
function clearCharts() {
  drinkPieChart?.destroy();
  fridgeBarChart?.destroy();
  dateLineChart?.destroy();

  drinkPieChart = fridgeBarChart = dateLineChart = null;
}

function buildCharts(logs) {
  clearCharts();

  // Calculate real consumption
  const usageByDrink = {};
  const usageByFridge = {};
  const usageByDate = {};

  logs.forEach(log => {
    const isStart = log.action_type === "start";
    const isRestock = log.action_type === "restock";
    const isEnd = log.action_type === "end";

    const delta = isStart || isRestock ? log.amount : -log.amount;

    const drink = log.drink?.name || "Unknown";
    const fridge = log.fridge?.name || "Unknown";
    const date = (log.created_at || "").slice(0, 10);

    usageByDrink[drink] = (usageByDrink[drink] || 0) + delta;
    usageByFridge[fridge] = (usageByFridge[fridge] || 0) + delta;
    usageByDate[date] = (usageByDate[date] || 0) + delta;
  });

  buildDrinkPieChart(usageByDrink);
  buildFridgeBarChart(usageByFridge);
  buildDateLineChart(usageByDate);

  enableChartClickHandlers();
}

function buildDrinkPieChart(obj) {
  const ctx = document.getElementById("drink-pie-chart")?.getContext("2d");
  if (!ctx) return;

  drinkPieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: Object.keys(obj),
      datasets: [{ data: Object.values(obj) }]
    },
    options: {
      onHover: hoverHandler("drink"),
      onClick: clickHandler("drink")
    }
  });
}

function buildFridgeBarChart(obj) {
  const ctx = document.getElementById("fridge-bar-chart")?.getContext("2d");
  if (!ctx) return;

  fridgeBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(obj),
      datasets: [{ data: Object.values(obj) }]
    },
    options: {
      indexAxis: "y",
      onHover: hoverHandler("fridge"),
      onClick: clickHandler("fridge")
    }
  });
}

function buildDateLineChart(obj) {
  const ctx = document.getElementById("date-line-chart")?.getContext("2d");
  if (!ctx) return;

  dateLineChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: Object.keys(obj).sort(),
      datasets: [
        {
          data: Object.values(obj),
          fill: false
        }
      ]
    },
    options: {
      onHover: hoverHandler("date"),
      onClick: clickHandler("date")
    }
  });
}

/* -------------------------------------------------------
   HANDLERS – MULTI-FILTER + SCROLL
-------------------------------------------------------- */
function hoverHandler(type) {
  return (e, elements) => {
    document.body.style.cursor = elements.length ? "pointer" : "default";
  };
}

function clickHandler(type) {
  return (e, elements) => {
    if (!elements.length) return;

    const idx = elements[0].index;
    let value = null;

    if (type === "drink") value = drinkPieChart.data.labels[idx];
    if (type === "fridge") value = fridgeBarChart.data.labels[idx];
    if (type === "date") value = dateLineChart.data.labels[idx];

    activeFilters[type] = value;

    applyFilters();
    autoScrollToSection("drilldown-section");
    updateFilterPill();
  };
}

function applyFilters() {
  const filtered = currentLogs.filter(log => {
    const byDrink =
      !activeFilters.drink || log.drink?.name === activeFilters.drink;

    const byFridge =
      !activeFilters.fridge || log.fridge?.name === activeFilters.fridge;

    const byDate =
      !activeFilters.date ||
      (log.created_at || "").startsWith(activeFilters.date);

    return byDrink && byFridge && byDate;
  });

  fillDrilldownTable(filtered);
}

function resetFilters() {
  activeFilters = { drink: null, fridge: null, date: null };
  updateFilterPill();
}

/* -------------------------------------------------------
   UI – FILTER PILL
-------------------------------------------------------- */
function addClearFilterPill() {
  const pill = document.createElement("div");
  pill.id = "filter-pill";
  pill.style.display = "none";
  pill.style.margin = "10px 0";
  pill.style.padding = "8px 14px";
  pill.style.background = "#1f242e";
  pill.style.borderRadius = "50px";
  pill.style.fontSize = "13px";
  pill.style.cursor = "pointer";
  pill.style.width = "fit-content";

  pill.textContent = "Clear filters ✕";

  pill.onclick = () => {
    resetFilters();
    fillDrilldownTable(currentLogs);
    pill.style.display = "none";
  };

  const section = document.getElementById("drilldown-section");
  section.prepend(pill);
}

function updateFilterPill() {
  const pill = document.getElementById("filter-pill");
  const active =
    activeFilters.drink || activeFilters.fridge || activeFilters.date;

  pill.style.display = active ? "inline-block" : "none";
}

/* -------------------------------------------------------
   DRILLDOWN TABLE
-------------------------------------------------------- */
function fillDrilldownTable(logs) {
  const tbody = document.getElementById("drilldown-body");
  tbody.innerHTML = "";

  logs.forEach(log => {
    const tr = document.createElement("tr");

    const d = new Date(log.created_at);
    const t = !isNaN(d) ? d.toLocaleString() : log.created_at;

    addCell(tr, t);
    addCell(tr, log.event?.name || "");
    addCell(tr, log.floor?.name || "");
    addCell(tr, log.fridge?.name || "");
    addCell(tr, log.drink?.name || "");
    addCell(tr, log.action_type);
    addCell(tr, log.amount);

    tbody.appendChild(tr);
  });
}

function addCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text;
  tr.appendChild(td);
}

/* -------------------------------------------------------
   UTIL – SCROLL TO ELEMENT
-------------------------------------------------------- */
function autoScrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* -------------------------------------------------------
   EXPORTERS
-------------------------------------------------------- */
function exportCsv() {
  if (!currentLogs.length) return alert("No data.");

  const header = [
    "time",
    "event",
    "floor",
    "fridge",
    "drink",
    "action",
    "amount"
  ];

  const rows = currentLogs.map(log => {
    const d = new Date(log.created_at);
    const t = !isNaN(d) ? d.toISOString() : log.created_at;

    return [
      t,
      log.event?.name || "",
      log.floor?.name || "",
      log.fridge?.name || "",
      log.drink?.name || "",
      log.action_type,
      log.amount
    ];
  });

  const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "w3hub_drinks_analytics.csv";
  a.click();
}

function downloadPdf() {
  if (!currentLogs.length) return alert("No data.");

  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(14);
  doc.text("w3.hub Drinks Analytics", 14, 16);

  const rows = currentLogs.map(log => {
    const d = new Date(log.created_at);
    const t = !isNaN(d) ? d.toLocaleString() : log.created_at;

    return [
      t,
      log.event?.name || "",
      log.floor?.name || "",
      log.fridge?.name || "",
      log.drink?.name || "",
      log.action_type,
      log.amount
    ];
  });

  doc.autoTable({
    startY: 22,
    head: [["Time", "Event", "Floor", "Fridge", "Drink", "Action", "Amount"]],
    body: rows
  });

  doc.save("w3hub_drinks_analytics.pdf");
}






