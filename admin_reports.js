/* -------------------------------------------------------
   w3.hub Admin Analytics – FULL REPLACEMENT

   Data model:
   - fridge_log_entries: { event_id, fridge_id, drink_type_id, action_type, amount, created_at }
   - drink_types: { id, name, price_per_unit }

   Aggregation per (event, floor, fridge, drink):
   - start = first "start" (by time)
   - restock = sum of all "restock"
   - end = last "end" (by time), if any
   - units_consumed:
       if start exists && end exists:  start + restock − end
       if start exists && NO end:      start + restock  (stocked count)
       if NO start:                    ignore row

   Charts & table:
   - Based on aggregated rows, not raw logs
   - Pie: consumption by drink
   - Bar: consumption by fridge
   - Line: consumption by event date
   - Clicking a chart element filters the table (multi-filter)
   - CSV/PDF export uses filtered aggregation only
-------------------------------------------------------- */

// Lookup maps
let eventsById = {};
let floorsById = {};
let fridgesById = {};
let drinksById = {};

// Raw logs from Supabase (enriched)
let rawLogs = [];

// Aggregated rows (one per Event·Floor·Fridge·Drink)
let aggregatedRows = [];

// Charts
let drinkPieChart = null;
let fridgeBarChart = null;
let dateLineChart = null;

// Active filters (set by chart clicks)
let activeFilters = {
  drink: null,   // drink name
  fridge: null,  // fridge name
  date: null     // event_date (YYYY-MM-DD)
};

document.addEventListener("DOMContentLoaded", () => {
  initAnalytics().catch(err => {
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
  wireButtons();
  addFilterPill();
}

/* -------------------------------------------------------
   LOOKUPS
-------------------------------------------------------- */

async function loadLookups() {
  const [eventsRes, floorsRes, fridgesRes, drinksRes] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("floors").select("*"),
    supabase.from("fridges").select("*"),
    supabase.from("drink_types").select("*") // includes price_per_unit
  ]);

  if (eventsRes.error) console.error("Events error:", eventsRes.error);
  if (floorsRes.error) console.error("Floors error:", floorsRes.error);
  if (fridgesRes.error) console.error("Fridges error:", fridgesRes.error);
  if (drinksRes.error) console.error("Drinks error:", drinksRes.error);

  (eventsRes.data || []).forEach(e => (eventsById[e.id] = e));
  (floorsRes.data || []).forEach(f => (floorsById[f.id] = f));
  (fridgesRes.data || []).forEach(fr => (fridgesById[fr.id] = fr));
  (drinksRes.data || []).forEach(d => (drinksById[d.id] = d));
}

/* -------------------------------------------------------
   EVENT CHECKBOXES
-------------------------------------------------------- */

function buildEventCheckboxes() {
  const container = document.getElementById("event-checkboxes");
  const status = document.getElementById("events-status");
  if (!container) return;

  container.innerHTML = "";

  const events = Object.values(eventsById).sort((a, b) => {
    const da = a.event_date || "";
    const db = b.event_date || "";
    return da.localeCompare(db);
  });

  if (events.length === 0) {
    container.textContent = "No events found. Add events on the Setup page.";
    if (status) status.textContent = "";
    return;
  }

  events.forEach(ev => {
    const label = document.createElement("label");
    label.className = "event-checkbox-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = ev.id;
    cb.checked = true;

    const dateLabel = ev.event_date ? ` (${ev.event_date})` : "";
    const text = document.createTextNode(` ${ev.name}${dateLabel}`);

    label.appendChild(cb);
    label.appendChild(text);
    container.appendChild(label);
  });

  if (status) status.textContent = "All events selected by default.";
}

function getSelectedEventIds() {
  const cbs = document.querySelectorAll("#event-checkboxes input[type='checkbox']");
  const ids = [];
  cbs.forEach(cb => {
    if (cb.checked) ids.push(cb.value);
  });
  return ids;
}

/* -------------------------------------------------------
   BUTTONS & ACTIONS
-------------------------------------------------------- */

function wireButtons() {
  const applyBtn = document.getElementById("apply-event-filter");
  if (applyBtn) applyBtn.addEventListener("click", refreshAnalytics);

  const csvBtn = document.getElementById("export-csv-btn");
  if (csvBtn) csvBtn.addEventListener("click", exportCsv);

  const pdfBtn = document.getElementById("download-pdf-btn");
  if (pdfBtn) pdfBtn.addEventListener("click", downloadPdf);
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
  updateFilterPill();

  const selectedIds = getSelectedEventIds();
  if (selectedIds.length === 0) {
    if (status) status.textContent = "Please select at least one event.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    showNoDataRow("No data to display. No events selected.");
    return;
  }

  if (status) status.textContent = "Loading data…";

  const { data, error } = await supabase
    .from("fridge_log_entries")
    .select("*")
    .in("event_id", selectedIds)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading fridge_log_entries:", error);
    if (status) status.textContent = "Error loading data.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    showNoDataRow("Error loading data.");
    return;
  }

  if (!data || data.length === 0) {
    if (status) status.textContent = "No fridge logs for the selected events.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    showNoDataRow("No data to display. No logs recorded for these events.");
    return;
  }

  // Enrich raw logs with lookup info
  rawLogs = data.map(row => {
    const event = eventsById[row.event_id] || null;
    const fridge = fridgesById[row.fridge_id] || null;
    const drink = drinksById[row.drink_type_id] || null;
    const floor =
      fridge && floorsById[fridge.floor_id] ? floorsById[fridge.floor_id] : null;

    return {
      ...row,
      event,
      fridge,
      drink,
      floor
    };
  });

  // Build aggregated rows (one per Event·Floor·Fridge·Drink)
  aggregatedRows = buildAggregatedRows(rawLogs);

  if (!aggregatedRows.length) {
    if (status) status.textContent =
      "No start counts found for these events. Cannot compute consumption.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    showNoDataRow("No data to display. No start counts recorded for these events.");
    return;
  }

  if (status) {
    status.textContent = `Computed ${aggregatedRows.length} aggregated rows (Event · Floor · Fridge · Drink).`;
  }

  if (chartsEmpty) chartsEmpty.style.display = "none";

  // Build charts from aggregated consumption
  buildChartsFromAggregated(aggregatedRows);

  // Fill table with all aggregated rows (no filters yet)
  fillAggregatedTable(aggregatedRows);

  // Smooth scroll to table
  autoScrollToSection("drilldown-section");
}

/* -------------------------------------------------------
   AGGREGATION LOGIC
-------------------------------------------------------- */

function buildAggregatedRows(logs) {
  const grouped = new Map();

  logs.forEach(log => {
    const key = `${log.event_id}|${log.fridge_id}|${log.drink_type_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(log);
  });

  const rows = [];

  for (const [key, group] of grouped.entries()) {
    if (!group.length) continue;

    const sample = group[0];
    const event = sample.event;
    const fridge = sample.fridge;
    const drink = sample.drink;
    const floor = sample.floor;

    const eventId = sample.event_id;
    const fridgeId = sample.fridge_id;
    const drinkTypeId = sample.drink_type_id;
    const floorId = floor ? floor.id : null;

    // Split by action_type
    const starts = group.filter(g => g.action_type === "start");
    const restocks = group.filter(g => g.action_type === "restock");
    const ends = group.filter(g => g.action_type === "end");

    // start = first start by created_at
    let startValue = null;
    if (starts.length) {
      starts.sort((a, b) =>
        String(a.created_at || "").localeCompare(String(b.created_at || ""))
      );
      startValue = Number(starts[0].amount) || 0;
    }

    // restock = sum of amounts
    const restockTotal = restocks.reduce((sum, r) => {
      const v = Number(r.amount) || 0;
      return sum + v;
    }, 0);

    // end = last end by created_at (if any)
    let endValue = null;
    if (ends.length) {
      ends.sort((a, b) =>
        String(a.created_at || "").localeCompare(String(b.created_at || ""))
      );
      endValue = Number(ends[ends.length - 1].amount) || 0;
    }

    // If no start at all, we cannot compute; skip.
    if (startValue === null) {
      continue;
    }

    let unitsConsumed;
    if (endValue === null) {
      // NO END: show stocked data = start + restock
      unitsConsumed = startValue + restockTotal;
    } else {
      // Normal consumption: start + restock − end
      unitsConsumed = startValue + restockTotal - endValue;
    }

    if (unitsConsumed < 0) unitsConsumed = 0;

    const eventName = event ? event.name : "";
    const floorName = floor ? floor.name : "";
    const fridgeName = fridge ? fridge.name : "";
    const drinkName = drink ? drink.name : "";
    const eventDate = event ? (event.event_date || "") : "";

    const pricePerUnit = drink ? Number(drink.price_per_unit) || 0 : 0;
    const totalValue = unitsConsumed * pricePerUnit;

    rows.push({
      eventId,
      floorId,
      fridgeId,
      drinkTypeId,
      eventName,
      floorName,
      fridgeName,
      drinkName,
      eventDate,
      unitsConsumed,
      pricePerUnit,
      totalValue
    });
  }

  return rows;
}

/* -------------------------------------------------------
   CHARTS FROM AGGREGATED DATA
-------------------------------------------------------- */

function clearCharts() {
  if (drinkPieChart) {
    drinkPieChart.destroy();
    drinkPieChart = null;
  }
  if (fridgeBarChart) {
    fridgeBarChart.destroy();
    fridgeBarChart = null;
  }
  if (dateLineChart) {
    dateLineChart.destroy();
    dateLineChart = null;
  }
}

function buildChartsFromAggregated(rows) {
  clearCharts();

  const byDrink = {};
  const byFridge = {};
  const byDate = {};

  rows.forEach(row => {
    const dName = row.drinkName || "Unknown";
    const fName = row.fridgeName || "Unknown";
    const dDate = row.eventDate || "No date";

    byDrink[dName] = (byDrink[dName] || 0) + row.unitsConsumed;
    byFridge[fName] = (byFridge[fName] || 0) + row.unitsConsumed;
    byDate[dDate] = (byDate[dDate] || 0) + row.unitsConsumed;
  });

  buildDrinkPieChart(byDrink);
  buildFridgeBarChart(byFridge);
  buildDateLineChart(byDate);
}

function buildDrinkPieChart(obj) {
  const canvas = document.getElementById("drink-pie-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const labels = Object.keys(obj);
  const data = labels.map(k => obj[k]);

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
      onHover: genericHoverHandler,
      onClick: (e, els) => {
        if (!els.length) return;
        const idx = els[0].index;
        const label = drinkPieChart.data.labels[idx];
        activeFilters.drink = label;
        applyFiltersAndRefreshTable();
        updateFilterPill();
        autoScrollToSection("drilldown-section");
      }
    }
  });
}

function buildFridgeBarChart(obj) {
  const canvas = document.getElementById("fridge-bar-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const labels = Object.keys(obj);
  const data = labels.map(k => obj[k]);

  fridgeBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data }]
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      onHover: genericHoverHandler,
      onClick: (e, els) => {
        if (!els.length) return;
        const idx = els[0].index;
        const label = fridgeBarChart.data.labels[idx];
        activeFilters.fridge = label;
        applyFiltersAndRefreshTable();
        updateFilterPill();
        autoScrollToSection("drilldown-section");
      }
    }
  });
}

function buildDateLineChart(obj) {
  const canvas = document.getElementById("date-line-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const labels = Object.keys(obj).sort();
  const data = labels.map(k => obj[k]);

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
      plugins: { legend: { display: false } },
      onHover: genericHoverHandler,
      onClick: (e, els) => {
        if (!els.length) return;
        const idx = els[0].index;
        const label = dateLineChart.data.labels[idx];
        activeFilters.date = label;
        applyFiltersAndRefreshTable();
        updateFilterPill();
        autoScrollToSection("drilldown-section");
      }
    }
  });
}

// Simple hover handler: show pointer when hovering a data point
function genericHoverHandler(event, elements) {
  if (elements && elements.length) {
    event.native.target.style.cursor = "pointer";
  } else {
    event.native.target.style.cursor = "default";
  }
}

/* -------------------------------------------------------
   FILTERING
-------------------------------------------------------- */

function resetFilters() {
  activeFilters = { drink: null, fridge: null, date: null };
}

function getFilteredAggregatedRows() {
  return aggregatedRows.filter(row => {
    const okDrink =
      !activeFilters.drink || row.drinkName === activeFilters.drink;
    const okFridge =
      !activeFilters.fridge || row.fridgeName === activeFilters.fridge;
    const okDate =
      !activeFilters.date || row.eventDate === activeFilters.date;

    return okDrink && okFridge && okDate;
  });
}

function applyFiltersAndRefreshTable() {
  const filtered = getFilteredAggregatedRows();
  fillAggregatedTable(filtered);
}

/* -------------------------------------------------------
   FILTER PILL UI
-------------------------------------------------------- */

function addFilterPill() {
  const section = document.getElementById("drilldown-section");
  if (!section) return;

  const pill = document.createElement("div");
  pill.id = "filter-pill";
  pill.style.display = "none";
  pill.style.margin = "8px 0";
  pill.style.padding = "6px 12px";
  pill.style.background = "#1f242e";
  pill.style.borderRadius = "999px";
  pill.style.fontSize = "12px";
  pill.style.cursor = "pointer";
  pill.style.width = "fit-content";

  pill.textContent = "Clear filters ✕";

  pill.addEventListener("click", () => {
    resetFilters();
    updateFilterPill();
    fillAggregatedTable(aggregatedRows);
  });

  section.insertBefore(pill, section.querySelector(".drilldown-actions"));
}

function updateFilterPill() {
  const pill = document.getElementById("filter-pill");
  if (!pill) return;

  const parts = [];
  if (activeFilters.drink) parts.push(`Drink: ${activeFilters.drink}`);
  if (activeFilters.fridge) parts.push(`Fridge: ${activeFilters.fridge}`);
  if (activeFilters.date) parts.push(`Date: ${activeFilters.date}`);

  if (!parts.length) {
    pill.style.display = "none";
    return;
  }

  pill.textContent = `Filters – ${parts.join(" · ")}  ✕`;
  pill.style.display = "inline-block";
}

/* -------------------------------------------------------
   TABLE RENDER (AGGREGATED)
-------------------------------------------------------- */

function showNoDataRow(message) {
  const tbody = document.getElementById("drilldown-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 7;
  td.style.padding = "10px";
  td.textContent = message || "No data to display.";
  tr.appendChild(td);
  tbody.appendChild(tr);
}

function fillAggregatedTable(rows) {
  const tbody = document.getElementById("drilldown-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!rows || !rows.length) {
    showNoDataRow("No data to display for the current filters.");
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement("tr");

    addCell(tr, row.eventName);
    addCell(tr, row.floorName);
    addCell(tr, row.fridgeName);
    addCell(tr, row.drinkName);
    addCell(tr, String(row.unitsConsumed));

    const priceStr =
      row.pricePerUnit != null ? row.pricePerUnit.toFixed(2) : "0.00";
    addCell(tr, priceStr);

    const totalStr =
      row.totalValue != null ? row.totalValue.toFixed(2) : "0.00";
    addCell(tr, totalStr);

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
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* -------------------------------------------------------
   EXPORT (CSV & PDF) – uses FILTERED aggregated rows
-------------------------------------------------------- */

function exportCsv() {
  const rows = getFilteredAggregatedRows();
  if (!rows.length) {
    alert("No data to export for the current filters.");
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

  const csvRows = rows.map(r => [
    r.eventName,
    r.floorName,
    r.fridgeName,
    r.drinkName,
    r.unitsConsumed,
    r.pricePerUnit.toFixed(2),
    r.totalValue.toFixed(2)
  ]);

  const csv =
    [header.join(","), ...csvRows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
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
  const rows = getFilteredAggregatedRows();
  if (!rows.length) {
    alert("No data to export for the current filters.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library not loaded.");
    return;
  }

  const doc = new window.jspdf.jsPDF("p", "mm", "a4");

  doc.setFontSize(14);
  doc.text("w3.hub – Aggregated Drinks Consumption", 14, 16);

  const body = rows.map(r => [
    r.eventName,
    r.floorName,
    r.fridgeName,
    r.drinkName,
    String(r.unitsConsumed),
    r.pricePerUnit.toFixed(2),
    r.totalValue.toFixed(2)
  ]);

  if (doc.autoTable) {
    doc.autoTable({
      startY: 22,
      head: [[
        "Event",
        "Floor",
        "Fridge",
        "Drink",
        "Units",
        "Price / Unit (€)",
        "Total (€)"
      ]],
      body,
      styles: { fontSize: 8 }
    });
  }

  doc.save("w3hub_drinks_aggregated.pdf");
}











