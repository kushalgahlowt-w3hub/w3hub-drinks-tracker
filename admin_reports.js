/* -------------------------------------------------------
   w3.hub Admin Analytics – FULL REPLACEMENT FILE

   This version:
   - Aggregates per Event + Floor + Fridge + Drink
   - Units Consumed  = start + restock_total - end  (if end exists)
   - Units Stocked   = start + restock_total        (if no end)
   - Skips combos with NO start at all
   - Charts show total UNITS (consumed+stocked as defined above)
   - Table & exports use the SAME aggregated rows
   - Clickable charts filter the table (multi-filter)
   - "Clear filters" pill resets filters
-------------------------------------------------------- */

// Lookup tables
let eventsById = {};
let floorsById = {};
let fridgesById = {};
let drinksById = {};

// Global data
let rawLogs = [];         // raw fridge_log_entries (enriched with lookups)
let aggregatedRows = [];  // one row per (event, fridge, drink) combo

// Filters driven by chart clicks
const activeFilters = {
  drinkName: null,
  fridgeName: null,
  dateKey: null,   // YYYY-MM-DD
};

// Chart instances
let drinkPieChart = null;
let fridgeBarChart = null;
let dateLineChart = null;

// --------------------------
// INIT
// --------------------------
document.addEventListener("DOMContentLoaded", () => {
  initAnalytics().catch((err) => {
    console.error("Initialization error:", err);
    const s = document.getElementById("events-status");
    if (s) s.textContent = "Error loading analytics.";
  });
});

async function initAnalytics() {
  await loadLookups();
  buildEventCheckboxes();

  const applyBtn = document.getElementById("apply-event-filter");
  if (applyBtn) applyBtn.addEventListener("click", refreshAnalytics);

  const csvBtn = document.getElementById("export-csv-btn");
  if (csvBtn) csvBtn.addEventListener("click", exportCsv);

  const pdfBtn = document.getElementById("download-pdf-btn");
  if (pdfBtn) pdfBtn.addEventListener("click", exportPdf);

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
    supabase.from("drink_types").select("*"), // may also contain price_eur later
  ]);

  (eventsRes.data || []).forEach((e) => (eventsById[e.id] = e));
  (floorsRes.data || []).forEach((f) => (floorsById[f.id] = f));
  (fridgesRes.data || []).forEach((fr) => (fridgesById[fr.id] = fr));
  (drinksRes.data || []).forEach((d) => (drinksById[d.id] = d));
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

  events.forEach((ev) => {
    const label = document.createElement("label");
    label.className = "event-checkbox-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = ev.id;
    cb.checked = true;

    const dateLabel = ev.event_date ? ` (${ev.event_date})` : "";
    label.appendChild(cb);
    label.appendChild(
      document.createTextNode(` ${ev.name}${dateLabel}`)
    );

    container.appendChild(label);
  });

  if (status) status.textContent = "All events selected by default.";
}

function getSelectedEventIds() {
  const container = document.getElementById("event-checkboxes");
  if (!container) return [];
  return Array.from(
    container.querySelectorAll("input[type='checkbox']:checked")
  ).map((cb) => cb.value);
}

/* -------------------------------------------------------
   MAIN REFRESH
-------------------------------------------------------- */
async function refreshAnalytics() {
  const status = document.getElementById("events-status");
  const chartsEmpty = document.getElementById("charts-empty-message");
  const tbody = document.getElementById("drilldown-body");

  if (tbody) tbody.innerHTML = "";
  resetFiltersUI();

  const selectedIds = getSelectedEventIds();
  if (selectedIds.length === 0) {
    if (status) status.textContent = "Please select at least one event.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    aggregatedRows = [];
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
    aggregatedRows = [];
    return;
  }

  if (!data || data.length === 0) {
    if (status) status.textContent = "No logs for the selected events.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    aggregatedRows = [];
    return;
  }

  // Enrich raw logs with lookup data
  rawLogs = data.map((row) => {
    const event = eventsById[row.event_id] || null;
    const fridge = fridgesById[row.fridge_id] || null;
    const drink = drinksById[row.drink_type_id] || null;
    const floor = fridge && floorsById[fridge.floor_id]
      ? floorsById[fridge.floor_id]
      : null;

    return {
      ...row,
      event,
      fridge,
      drink,
      floor,
    };
  });

  // Aggregate into (event, fridge, drink) combos
  aggregatedRows = buildAggregates(rawLogs);

  if (!aggregatedRows.length) {
    if (status)
      status.textContent =
        "No complete combos with a start count. Add Start counts first.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    return;
  }

  if (status) {
    status.textContent = `Showing ${aggregatedRows.length} combinations.`;
  }
  if (chartsEmpty) chartsEmpty.style.display = "none";

  buildCharts(aggregatedRows);
  renderTable(); // uses current filters (none at first)
  autoScrollToSection("drilldown-section");
}

/* -------------------------------------------------------
   AGGREGATION LOGIC
   Combos: (event_id, fridge_id, drink_type_id)
-------------------------------------------------------- */
function buildAggregates(logs) {
  const map = {};

  logs.forEach((log) => {
    const key = `${log.event_id}|${log.fridge_id}|${log.drink_type_id}`;
    if (!map[key]) {
      map[key] = {
        key,
        event_id: log.event_id,
        fridge_id: log.fridge_id,
        drink_type_id: log.drink_type_id,

        event: log.event || null,
        fridge: log.fridge || null,
        floor: log.floor || null,
        drink: log.drink || null,

        // For date grouping
        earliestCreatedAt: log.created_at,
        dateKey: (log.event && log.event.event_date)
          ? log.event.event_date
          : (log.created_at || "").slice(0, 10),

        // Start / restock / end tracking
        startCount: null,
        startCreatedAt: null,

        restockTotal: 0,

        endCount: null,
        endCreatedAt: null,
      };
    }

    const combo = map[key];

    // Track earliest created_at
    if (
      !combo.earliestCreatedAt ||
      (log.created_at && log.created_at < combo.earliestCreatedAt)
    ) {
      combo.earliestCreatedAt = log.created_at;
    }

    // Action-specific
    if (log.action_type === "start") {
      if (
        combo.startCreatedAt == null ||
        (log.created_at && log.created_at < combo.startCreatedAt)
      ) {
        combo.startCreatedAt = log.created_at;
        combo.startCount = log.amount;
      }
    } else if (log.action_type === "restock") {
      combo.restockTotal += Number(log.amount || 0);
    } else if (log.action_type === "end") {
      if (
        combo.endCreatedAt == null ||
        (log.created_at && log.created_at > combo.endCreatedAt)
      ) {
        combo.endCreatedAt = log.created_at;
        combo.endCount = log.amount;
      }
    }
  });

  // Final pass: compute units + mode + pricing
  const rows = [];

  Object.values(map).forEach((combo) => {
    const start = combo.startCount;
    const restock = combo.restockTotal || 0;
    const end = combo.endCount;

    if (start == null) {
      // No start at all → skip entirely
      return;
    }

    let units = 0;
    let mode = "stocked"; // or "consumed"

    if (end != null && end !== undefined) {
      units = Number(start) + Number(restock) - Number(end);
      mode = "consumed";
    } else {
      units = Number(start) + Number(restock);
      mode = "stocked";
    }

    if (units < 0) units = 0;

    const drink = combo.drink || {};
    const price = drink.price_eur != null ? Number(drink.price_eur) : 0;
    const totalValue = units * price;

    rows.push({
      ...combo,
      units,
      mode, // "consumed" or "stocked"
      price_eur: price,
      total_value_eur: totalValue,
    });
  });

  return rows;
}

/* -------------------------------------------------------
   CHARTS
-------------------------------------------------------- */
function clearCharts() {
  if (drinkPieChart) drinkPieChart.destroy();
  if (fridgeBarChart) fridgeBarChart.destroy();
  if (dateLineChart) dateLineChart.destroy();

  drinkPieChart = fridgeBarChart = dateLineChart = null;
}

function buildCharts(rows) {
  clearCharts();

  const usageByDrink = {};
  const usageByFridge = {};
  const usageByDate = {};

  rows.forEach((r) => {
    const drinkName = r.drink?.name || "Unknown";
    const fridgeName = r.fridge?.name || "Unknown";
    const dateKey = r.dateKey || (r.earliestCreatedAt || "").slice(0, 10);

    usageByDrink[drinkName] = (usageByDrink[drinkName] || 0) + r.units;
    usageByFridge[fridgeName] = (usageByFridge[fridgeName] || 0) + r.units;
    usageByDate[dateKey] = (usageByDate[dateKey] || 0) + r.units;
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
  const data = labels.map((k) => obj[k]);

  drinkPieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "bottom" },
      },
      onHover: (evt, elements) => {
        document.body.style.cursor = elements.length ? "pointer" : "default";
      },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        const label = drinkPieChart.data.labels[idx];
        activeFilters.drinkName = label;
        renderTable();
        updateFilterPill();
        autoScrollToSection("drilldown-section");
      },
    },
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
      datasets: [
        {
          data,
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: {
        legend: { display: false },
      },
      onHover: (evt, elements) => {
        document.body.style.cursor = elements.length ? "pointer" : "default";
      },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        const label = fridgeBarChart.data.labels[idx];
        activeFilters.fridgeName = label;
        renderTable();
        updateFilterPill();
        autoScrollToSection("drilldown-section");
      },
    },
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
          fill: false,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
      },
      onHover: (evt, elements) => {
        document.body.style.cursor = elements.length ? "pointer" : "default";
      },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        const label = dateLineChart.data.labels[idx];
        activeFilters.dateKey = label;
        renderTable();
        updateFilterPill();
        autoScrollToSection("drilldown-section");
      },
    },
  });
}

/* -------------------------------------------------------
   FILTERING + TABLE RENDER
-------------------------------------------------------- */
function getFilteredRows() {
  return aggregatedRows.filter((r) => {
    const drinkOk =
      !activeFilters.drinkName ||
      (r.drink && r.drink.name === activeFilters.drinkName);
    const fridgeOk =
      !activeFilters.fridgeName ||
      (r.fridge && r.fridge.name === activeFilters.fridgeName);
    const dateOk =
      !activeFilters.dateKey ||
      r.dateKey === activeFilters.dateKey ||
      (r.earliestCreatedAt || "").startsWith(activeFilters.dateKey);

    return drinkOk && fridgeOk && dateOk;
  });
}

function renderTable() {
  const tbody = document.getElementById("drilldown-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  const rows = getFilteredRows();

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 11;
    td.textContent = "No data to display for the current filters.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((r) => {
    const tr = document.createElement("tr");

    const eventName = r.event?.name || "";
    const floorName = r.floor?.name || "";
    const fridgeName = r.fridge?.name || "";
    const drinkName = r.drink?.name || "";

    // One "Units" column; the meaning (consumed vs stocked) is in r.mode
    addCell(tr, eventName);
    addCell(tr, floorName);
    addCell(tr, fridgeName);
    addCell(tr, drinkName);
    addCell(tr, String(r.units));           // Units
    addCell(tr, r.mode === "consumed" ? "Consumed" : "Stocked");
    addCell(tr, r.price_eur ? r.price_eur.toFixed(2) : "0.00"); // Price / unit
    addCell(tr, r.total_value_eur ? r.total_value_eur.toFixed(2) : "0.00");

    addCell(tr, r.startCount != null ? String(r.startCount) : "");
    addCell(tr, r.restockTotal != null ? String(r.restockTotal) : "");
    addCell(tr, r.endCount != null ? String(r.endCount) : "");

    tbody.appendChild(tr);
  });
}

function addCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text;
  tr.appendChild(td);
}

/* -------------------------------------------------------
   FILTER PILL (UI)
-------------------------------------------------------- */
function addFilterPill() {
  const section = document.getElementById("drilldown-section");
  if (!section) return;

  const pill = document.createElement("div");
  pill.id = "filter-pill";
  pill.style.display = "none";
  pill.style.margin = "8px 0";
  pill.style.padding = "6px 12px";
  pill.style.borderRadius = "999px";
  pill.style.background = "#1f242e";
  pill.style.fontSize = "12px";
  pill.style.cursor = "pointer";
  pill.textContent = "Clear filters ✕";

  pill.addEventListener("click", () => {
    resetFiltersUI();
    renderTable();
  });

  section.prepend(pill);
}

function updateFilterPill() {
  const pill = document.getElementById("filter-pill");
  if (!pill) return;

  const active = activeFilters.drinkName || activeFilters.fridgeName || activeFilters.dateKey;
  if (!active) {
    pill.style.display = "none";
    return;
  }

  const parts = [];
  if (activeFilters.drinkName) parts.push(`Drink: ${activeFilters.drinkName}`);
  if (activeFilters.fridgeName) parts.push(`Fridge: ${activeFilters.fridgeName}`);
  if (activeFilters.dateKey) parts.push(`Date: ${activeFilters.dateKey}`);

  pill.textContent = `Filters – ${parts.join(" · ")}  ✕`;
  pill.style.display = "inline-block";
}

function resetFiltersUI() {
  activeFilters.drinkName = null;
  activeFilters.fridgeName = null;
  activeFilters.dateKey = null;
  const pill = document.getElementById("filter-pill");
  if (pill) pill.style.display = "none";
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
   EXPORT – CSV & PDF
   Uses the CURRENT filtered rows (what you see in the table)
-------------------------------------------------------- */
function exportCsv() {
  const rows = getFilteredRows();
  if (!rows.length) {
    alert("No data to export.");
    return;
  }

  const header = [
    "event",
    "floor",
    "fridge",
    "drink",
    "units",
    "mode",
    "price_eur",
    "total_value_eur",
    "start_count",
    "restock_total",
    "end_count",
  ];

  const dataRows = rows.map((r) => [
    r.event?.name || "",
    r.floor?.name || "",
    r.fridge?.name || "",
    r.drink?.name || "",
    String(r.units),
    r.mode,
    r.price_eur != null ? r.price_eur.toFixed(2) : "0.00",
    r.total_value_eur != null ? r.total_value_eur.toFixed(2) : "0.00",
    r.startCount != null ? String(r.startCount) : "",
    r.restockTotal != null ? String(r.restockTotal) : "",
    r.endCount != null ? String(r.endCount) : "",
  ]);

  const csv = [header.join(","), ...dataRows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "w3hub_drinks_consumption.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPdf() {
  const rows = getFilteredRows();
  if (!rows.length) {
    alert("No data to export.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF || !window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library not loaded.");
    return;
  }

  const doc = new window.jspdf.jsPDF("p", "mm", "a4");
  doc.setFontSize(14);
  doc.text("w3.hub Drinks Consumption", 14, 16);

  const body = rows.map((r) => [
    r.event?.name || "",
    r.floor?.name || "",
    r.fridge?.name || "",
    r.drink?.name || "",
    String(r.units),
    r.mode,
    r.price_eur != null ? r.price_eur.toFixed(2) : "0.00",
    r.total_value_eur != null ? r.total_value_eur.toFixed(2) : "0.00",
    r.startCount != null ? String(r.startCount) : "",
    r.restockTotal != null ? String(r.restockTotal) : "",
    r.endCount != null ? String(r.endCount) : "",
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
        "Mode",
        "Price (€)",
        "Total Value (€)",
        "Start",
        "Restock",
        "End",
      ]],
      body,
      styles: { fontSize: 8 },
    });
  }

  doc.save("w3hub_drinks_consumption.pdf");
}










