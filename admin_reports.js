/* -------------------------------------------------------
   w3.hub Admin Analytics – FULL REPLACEMENT FILE

   ✅ Accurate consumption per combo:
      units = (sum of start + restock) − (sum of end)
   ✅ Aggregated rows:
      Event · Floor · Fridge · Drink · Units · Price/Unit · Value
   ✅ Charts still work (Drink / Fridge / Date)
   ✅ Clicking charts filters table
   ✅ CSV & PDF export AGGREGATED data (no raw logs)
-------------------------------------------------------- */

// Lookup tables
let eventsById = {};
let floorsById = {};
let fridgesById = {};
let drinksById = {}; // must include price_eur

// Chart instances
let drinkPieChart = null;
let fridgeBarChart = null;
let dateLineChart = null;

// Global raw logs (enriched with lookups)
let currentLogs = [];

// Aggregated summary for current filters
let currentSummary = [];

// Active filters (set by chart clicks)
let activeFilters = {
  drink: null,
  fridge: null,
  date: null
};

document.addEventListener("DOMContentLoaded", () => {
  initAnalytics().catch((err) => {
    console.error("Initialization error:", err);
    const s = document.getElementById("events-status");
    if (s) s.textContent = "Error loading analytics.";
  });
});

/* -------------------------------------------------------
   INIT
-------------------------------------------------------- */
async function initAnalytics() {
  await loadLookups();
  buildEventCheckboxes();

  const applyBtn = document.getElementById("apply-event-filter");
  if (applyBtn) applyBtn.addEventListener("click", refreshAnalytics);

  const csvBtn = document.getElementById("export-csv-btn");
  if (csvBtn) csvBtn.addEventListener("click", exportCsv);

  const pdfBtn = document.getElementById("download-pdf-btn");
  if (pdfBtn) pdfBtn.addEventListener("click", downloadPdf);

  addClearFilterPill();
}

/* -------------------------------------------------------
   LOOKUPS
-------------------------------------------------------- */
async function loadLookups() {
  const [events, floors, fridges, drinks] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("floors").select("*"),
    supabase.from("fridges").select("*"),
    // IMPORTANT: drink_types must have a numeric column price_eur
    supabase.from("drink_types").select("id, name, price_eur")
  ]);

  (events.data || []).forEach((e) => (eventsById[e.id] = e));
  (floors.data || []).forEach((f) => (floorsById[f.id] = f));
  (fridges.data || []).forEach((fr) => (fridgesById[fr.id] = fr));
  (drinks.data || []).forEach((d) => (drinksById[d.id] = d));
}

/* -------------------------------------------------------
   EVENT CHECKBOXES
-------------------------------------------------------- */
function buildEventCheckboxes() {
  const container = document.getElementById("event-checkboxes");
  const status = document.getElementById("events-status");
  if (!container) return;

  container.innerHTML = "";

  const events = Object.values(eventsById).sort((a, b) =>
    (a.event_date || "").localeCompare(b.event_date || "")
  );

  if (events.length === 0) {
    container.textContent = "No events found. Add events on the Setup page.";
    if (status) status.textContent = "";
    return;
  }

  events.forEach((ev) => {
    const label = document.createElement("label");
    label.className = "event-checkbox-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = ev.id;
    cb.checked = true;

    const dateLabel = ev.event_date || "";
    const text = document.createTextNode(
      ` ${ev.name}${dateLabel ? " (" + dateLabel + ")" : ""}`
    );

    label.appendChild(cb);
    label.appendChild(text);
    container.appendChild(label);
  });

  if (status) status.textContent = "All events selected by default.";
}

function getSelectedEventIds() {
  const container = document.getElementById("event-checkboxes");
  if (!container) return [];
  return [...container.querySelectorAll("input[type='checkbox']")]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

/* -------------------------------------------------------
   MAIN REFRESH
-------------------------------------------------------- */
async function refreshAnalytics() {
  const status = document.getElementById("events-status");
  const chartsEmpty = document.getElementById("charts-empty-message");
  const tbody = document.getElementById("drilldown-body");
  if (tbody) tbody.innerHTML = "";

  resetFilters();

  const selected = getSelectedEventIds();
  if (selected.length === 0) {
    if (status) status.textContent = "Please select at least one event.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    currentLogs = [];
    currentSummary = [];
    fillDrilldownTable(currentSummary);
    return;
  }

  if (status) status.textContent = "Loading data…";

  const { data, error } = await supabase
    .from("fridge_log_entries")
    .select("*")
    .in("event_id", selected)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading fridge_log_entries:", error);
    if (status) status.textContent = "Error loading data.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    currentLogs = [];
    currentSummary = [];
    fillDrilldownTable(currentSummary);
    return;
  }

  if (!data || data.length === 0) {
    if (status) status.textContent = "No logs for the selected events.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    currentLogs = [];
    currentSummary = [];
    fillDrilldownTable(currentSummary);
    return;
  }

  // Enrich logs with event/floor/fridge/drink objects
  currentLogs = data.map((row) => {
    const event = eventsById[row.event_id] || null;
    const fridge = fridgesById[row.fridge_id] || null;
    const drink = drinksById[row.drink_type_id] || null;
    const floor =
      fridge && floorsById[fridge.floor_id] ? floorsById[fridge.floor_id] : null;

    return { ...row, event, fridge, drink, floor };
  });

  // Build charts from raw logs
  buildCharts(currentLogs);
  if (chartsEmpty) chartsEmpty.style.display = "none";

  // Build initial aggregated summary & table
  currentSummary = buildAggregatedSummary(currentLogs);
  fillDrilldownTable(currentSummary);

  if (status)
    status.textContent = `Loaded ${currentLogs.length} log entries across ${currentSummary.length} aggregated rows.`;

  autoScrollToSection("drilldown-section");
}

/* -------------------------------------------------------
   AGGREGATION: logs → summary rows
-------------------------------------------------------- */
function buildAggregatedSummary(logs) {
  const map = {};

  logs.forEach((log) => {
    if (!log.event || !log.fridge || !log.drink) return;

    const eventId = log.event_id;
    const fridgeId = log.fridge_id;
    const drinkId = log.drink_type_id;

    const key = `${eventId}::${fridgeId}::${drinkId}`;

    if (!map[key]) {
      const floor = log.floor || null;
      const price = log.drink.price_eur ?? null;

      map[key] = {
        event: log.event,
        floor,
        fridge: log.fridge,
        drink: log.drink,
        units: 0,
        price_eur: price,
        value_eur: 0
      };
    }

    const isStart = log.action_type === "start";
    const isRestock = log.action_type === "restock";
    const isEnd = log.action_type === "end";
    const amt = Number(log.amount) || 0;

    let delta = 0;
    if (isStart || isRestock) delta = amt;
    if (isEnd) delta = -amt;

    map[key].units += delta;
  });

  // Finalize: clamp negatives to 0, compute value
  const summary = Object.values(map).map((row) => {
    const units = Math.max(row.units, 0);
    const price = row.price_eur ?? null;
    const value = price != null ? units * Number(price) : 0;

    return {
      ...row,
      units,
      value_eur: value
    };
  });

  // Optional: remove rows with 0 units if you don't care about them
  return summary.filter((row) => row.units > 0);
}

/* -------------------------------------------------------
   CHARTS (based on raw logs)
-------------------------------------------------------- */
function clearCharts() {
  if (drinkPieChart) drinkPieChart.destroy();
  if (fridgeBarChart) fridgeBarChart.destroy();
  if (dateLineChart) dateLineChart.destroy();
  drinkPieChart = fridgeBarChart = dateLineChart = null;
}

function buildCharts(logs) {
  clearCharts();

  const usageByDrink = {};
  const usageByFridge = {};
  const usageByDate = {};

  logs.forEach((log) => {
    const isStart = log.action_type === "start";
    const isRestock = log.action_type === "restock";
    const isEnd = log.action_type === "end";
    const amt = Number(log.amount) || 0;

    let delta = 0;
    if (isStart || isRestock) delta = amt;
    if (isEnd) delta = -amt;

    const drinkKey = log.drink ? log.drink.name : "Unknown";
    const fridgeKey = log.fridge ? log.fridge.name : "Unknown";
    const dateKey = (log.created_at || "").slice(0, 10);

    usageByDrink[drinkKey] = (usageByDrink[drinkKey] || 0) + delta;
    usageByFridge[fridgeKey] = (usageByFridge[fridgeKey] || 0) + delta;
    usageByDate[dateKey] = (usageByDate[dateKey] || 0) + delta;
  });

  buildDrinkPieChart(usageByDrink);
  buildFridgeBarChart(usageByFridge);
  buildDateLineChart(usageByDate);
}

function buildDrinkPieChart(obj) {
  const canvas = document.getElementById("drink-pie-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const labels = Object.keys(obj);
  const data = labels.map((k) => Math.max(obj[k], 0));

  drinkPieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{ data }]
    },
    options: {
      plugins: {
        legend: { position: "bottom" }
      },
      onHover: hoverHandler("drink"),
      onClick: clickHandler("drink")
    }
  });
}

function buildFridgeBarChart(obj) {
  const canvas = document.getElementById("fridge-bar-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const labels = Object.keys(obj);
  const data = labels.map((k) => obj[k]);

  fridgeBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data }]
    },
    options: {
      indexAxis: "y",
      plugins: {
        legend: { display: false }
      },
      onHover: hoverHandler("fridge"),
      onClick: clickHandler("fridge")
    }
  });
}

function buildDateLineChart(obj) {
  const canvas = document.getElementById("date-line-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const labels = Object.keys(obj).sort();
  const data = labels.map((k) => obj[k]);

  dateLineChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          fill: false
        }
      ]
    },
    options: {
      plugins: {
        legend: { display: false }
      },
      onHover: hoverHandler("date"),
      onClick: clickHandler("date")
    }
  });
}

/* -------------------------------------------------------
   CHART INTERACTION → FILTERS + SCROLL
-------------------------------------------------------- */
function hoverHandler(type) {
  return (evt, elements) => {
    document.body.style.cursor = elements.length ? "pointer" : "default";
  };
}

function clickHandler(type) {
  return (evt, elements) => {
    if (!elements.length) return;

    const idx = elements[0].index;
    let value = null;

    if (type === "drink" && drinkPieChart) {
      value = drinkPieChart.data.labels[idx];
    } else if (type === "fridge" && fridgeBarChart) {
      value = fridgeBarChart.data.labels[idx];
    } else if (type === "date" && dateLineChart) {
      value = dateLineChart.data.labels[idx];
    }

    activeFilters[type] = value;
    applyFilters();
    autoScrollToSection("drilldown-section");
    updateFilterPill();
  };
}

function applyFilters() {
  // Filters are applied on raw logs, then re-aggregated so table matches charts
  const filteredLogs = currentLogs.filter((log) => {
    const byDrink =
      !activeFilters.drink || (log.drink && log.drink.name === activeFilters.drink);

    const byFridge =
      !activeFilters.fridge ||
      (log.fridge && log.fridge.name === activeFilters.fridge);

    const byDate =
      !activeFilters.date ||
      (log.created_at || "").startsWith(activeFilters.date);

    return byDrink && byFridge && byDate;
  });

  currentSummary = buildAggregatedSummary(filteredLogs);
  fillDrilldownTable(currentSummary);
}

function resetFilters() {
  activeFilters = { drink: null, fridge: null, date: null };
  updateFilterPill();
}

/* -------------------------------------------------------
   FILTER PILL (UI)
-------------------------------------------------------- */
function addClearFilterPill() {
  const section = document.getElementById("drilldown-section");
  if (!section) return;

  const pill = document.createElement("div");
  pill.id = "filter-pill";
  pill.style.display = "none";
  pill.style.margin = "6px 0 10px";
  pill.style.padding = "6px 12px";
  pill.style.background = "#1f242e";
  pill.style.borderRadius = "999px";
  pill.style.fontSize = "12px";
  pill.style.cursor = "pointer";
  pill.style.width = "fit-content";
  pill.style.color = "#e9e9e9";

  pill.textContent = "Filters active – click to clear ✕";

  pill.onclick = () => {
    resetFilters();
    currentSummary = buildAggregatedSummary(currentLogs);
    fillDrilldownTable(currentSummary);
  };

  // Insert just above the actions
  const actions = section.querySelector(".drilldown-actions");
  section.insertBefore(pill, actions);
}

function updateFilterPill() {
  const pill = document.getElementById("filter-pill");
  if (!pill) return;

  const active =
    activeFilters.drink || activeFilters.fridge || activeFilters.date;

  pill.style.display = active ? "inline-block" : "none";
}

/* -------------------------------------------------------
   TABLE RENDER – USES AGGREGATED SUMMARY
-------------------------------------------------------- */
function fillDrilldownTable(summaryRows) {
  const tbody = document.getElementById("drilldown-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!summaryRows || summaryRows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "No consumption data for the current selection.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  summaryRows.forEach((row) => {
    const tr = document.createElement("tr");

    const eventName = row.event ? row.event.name : "";
    const floorName = row.floor ? row.floor.name : "";
    const fridgeName = row.fridge ? row.fridge.name : "";
    const drinkName = row.drink ? row.drink.name : "";

    const unitsStr = String(row.units ?? 0);

    const priceNull = row.price_eur == null;
    const priceStr = priceNull
      ? ""
      : Number(row.price_eur).toFixed(2);

    const valueStr =
      !priceNull && row.units != null
        ? Number(row.value_eur || 0).toFixed(2)
        : "";

    addCell(tr, eventName);
    addCell(tr, floorName);
    addCell(tr, fridgeName);
    addCell(tr, drinkName);
    addCell(tr, unitsStr);
    addCell(tr, priceStr);
    addCell(tr, valueStr);

    tbody.appendChild(tr);
  });
}

function addCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text;
  tr.appendChild(td);
}

/* -------------------------------------------------------
   SCROLL HELPER
-------------------------------------------------------- */
function autoScrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* -------------------------------------------------------
   EXPORTERS – USE AGGREGATED DATA
-------------------------------------------------------- */
function exportCsv() {
  if (!currentSummary || currentSummary.length === 0) {
    alert("No data to export.");
    return;
  }

  const header = [
    "event",
    "floor",
    "fridge",
    "drink",
    "units_consumed",
    "price_per_unit_eur",
    "total_value_eur"
  ];

  const rows = currentSummary.map((row) => {
    const eventName = row.event ? row.event.name : "";
    const floorName = row.floor ? row.floor.name : "";
    const fridgeName = row.fridge ? row.fridge.name : "";
    const drinkName = row.drink ? row.drink.name : "";

    const units = row.units ?? 0;
    const price = row.price_eur != null ? Number(row.price_eur) : "";
    const value =
      row.price_eur != null ? Number(row.value_eur || 0) : "";

    return [
      eventName,
      floorName,
      fridgeName,
      drinkName,
      units,
      price !== "" ? price.toFixed(2) : "",
      value !== "" ? value.toFixed(2) : ""
    ];
  });

  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "w3hub_drinks_aggregated.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadPdf() {
  if (!currentSummary || currentSummary.length === 0) {
    alert("No data to export.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library not loaded.");
    return;
  }

  const doc = new window.jspdf.jsPDF("p", "mm", "a4");
  doc.setFontSize(14);
  doc.text("w3.hub Drinks – Aggregated Consumption", 14, 16);

  const body = currentSummary.map((row) => {
    const eventName = row.event ? row.event.name : "";
    const floorName = row.floor ? row.floor.name : "";
    const fridgeName = row.fridge ? row.fridge.name : "";
    const drinkName = row.drink ? row.drink.name : "";

    const units = row.units ?? 0;
    const price =
      row.price_eur != null ? Number(row.price_eur).toFixed(2) : "";
    const value =
      row.price_eur != null ? Number(row.value_eur || 0).toFixed(2) : "";

    return [
      eventName,
      floorName,
      fridgeName,
      drinkName,
      String(units),
      price,
      value
    ];
  });

  doc.autoTable({
    startY: 22,
    head: [
      [
        "Event",
        "Floor",
        "Fridge",
        "Drink",
        "Units",
        "Price / Unit (€)",
        "Total (€)"
      ]
    ],
    body,
    styles: { fontSize: 8 }
  });

  doc.save("w3hub_drinks_aggregated.pdf");
}









