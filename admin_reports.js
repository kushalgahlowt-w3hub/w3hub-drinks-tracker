/* -------------------------------------------------------
   w3.hub Admin Analytics – FULL REPLACEMENT FILE

   Features:
   ✔ Accurate consumption (start + restock – end)
   ✔ Multi-filter (drink + fridge + date)
   ✔ Clickable charts → filtered drilldown
   ✔ Hover highlighting + smooth auto-scroll
   ✔ Clear Filter pill
   ✔ CSV / PDF export of AGGREGATED, FILTERED data
     (event, floor, fridge, drink, units, € value, pfand €)
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
let currentLogs = [];          // all logs for selected events
let currentFilteredLogs = [];  // logs after chart filters
let activeFilters = {
  drink: null,
  fridge: null,
  date: null
};

document.addEventListener("DOMContentLoaded", () => {
  initAnalytics().catch(err => {
    console.error("Initialization error:", err);
    const status = document.getElementById("events-status");
    if (status) status.textContent = "Error loading analytics.";
  });
});

async function initAnalytics() {
  await loadLookups();
  buildEventCheckboxes();

  const applyBtn = document.getElementById("apply-event-filter");
  if (applyBtn) {
    applyBtn.addEventListener("click", refreshAnalytics);
  }

  const csvBtn = document.getElementById("export-csv-btn");
  if (csvBtn) {
    csvBtn.addEventListener("click", exportCsv);
  }

  const pdfBtn = document.getElementById("download-pdf-btn");
  if (pdfBtn) {
    pdfBtn.addEventListener("click", downloadPdf);
  }

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
    supabase.from("drink_types").select("*") // includes price_per_unit, pfand_per_unit now
  ]);

  (events.data || []).forEach(e => (eventsById[e.id] = e));
  (floors.data || []).forEach(f => (floorsById[f.id] = f));
  (fridges.data || []).forEach(fr => (fridgesById[fr.id] = fr));
  (drinks.data || []).forEach(d => (drinksById[d.id] = d));
}

/* -------------------------------------------------------
   Event Checkboxes
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

  events.forEach(ev => {
    const label = document.createElement("label");
    label.className = "event-checkbox-item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = ev.id;
    cb.checked = true;

    const text = document.createTextNode(
      ` ${ev.name}${ev.event_date ? " (" + ev.event_date + ")" : ""}`
    );

    label.appendChild(cb);
    label.appendChild(text);
    container.appendChild(label);
  });

  if (status) status.textContent = "All events selected by default.";
}

function getSelectedEventIds() {
  return Array.from(
    document.querySelectorAll("#event-checkboxes input[type='checkbox']")
  )
    .filter(cb => cb.checked)
    .map(cb => cb.value);
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

  const selectedIds = getSelectedEventIds();
  if (selectedIds.length === 0) {
    if (status) status.textContent = "Please select at least one event.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    currentLogs = [];
    currentFilteredLogs = [];
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
    currentLogs = [];
    currentFilteredLogs = [];
    return;
  }

  if (!data || data.length === 0) {
    if (status) status.textContent = "No logs for the selected events.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    currentLogs = [];
    currentFilteredLogs = [];
    return;
  }

  currentLogs = data.map(row => {
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

  currentFilteredLogs = [...currentLogs];

  if (status) status.textContent = `Loaded ${currentLogs.length} log entries.`;
  if (chartsEmpty) chartsEmpty.style.display = "none";

  buildCharts(currentLogs);
  fillDrilldownTable(currentFilteredLogs);

  autoScrollToSection("drilldown-section");
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

function buildCharts(logs) {
  clearCharts();

  const usageByDrink = {};
  const usageByFridge = {};
  const usageByDate = {};

  logs.forEach(log => {
    const isStart = log.action_type === "start";
    const isRestock = log.action_type === "restock";
    const isEnd = log.action_type === "end";

    const amount = Number(log.amount) || 0;
    const delta = isStart || isRestock ? amount : -amount;

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
  const data = labels.map(k => Math.max(obj[k], 0));

  drinkPieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [{ data }]
    },
    options: {
      plugins: { legend: { position: "bottom" } },
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
  const data = labels.map(k => obj[k]);

  dateLineChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          fill: false,
          tension: 0.2
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
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

    if (type === "drink" && drinkPieChart) {
      value = drinkPieChart.data.labels[idx];
    }
    if (type === "fridge" && fridgeBarChart) {
      value = fridgeBarChart.data.labels[idx];
    }
    if (type === "date" && dateLineChart) {
      value = dateLineChart.data.labels[idx];
    }

    activeFilters[type] = value;

    applyFilters();
    autoScrollToSection("drilldown-section");
    updateFilterPill();
  };
}

function applyFilters() {
  currentFilteredLogs = currentLogs.filter(log => {
    const byDrink =
      !activeFilters.drink || (log.drink && log.drink.name === activeFilters.drink);

    const byFridge =
      !activeFilters.fridge ||
      (log.fridge && log.fridge.name === activeFilters.fridge);

    const byDate =
      !activeFilters.date ||
      (log.created_at || "").slice(0, 10) === activeFilters.date;

    return byDrink && byFridge && byDate;
  });

  fillDrilldownTable(currentFilteredLogs);
}

function resetFilters() {
  activeFilters = { drink: null, fridge: null, date: null };
  currentFilteredLogs = [...currentLogs];
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
    fillDrilldownTable(currentFilteredLogs);
    pill.style.display = "none";
  };

  const section = document.getElementById("drilldown-section");
  if (section) section.prepend(pill);
}

function updateFilterPill() {
  const pill = document.getElementById("filter-pill");
  if (!pill) return;

  const active =
    activeFilters.drink || activeFilters.fridge || activeFilters.date;

  pill.style.display = active ? "inline-block" : "none";
}

/* -------------------------------------------------------
   DRILLDOWN TABLE (log-level, for inspection)
-------------------------------------------------------- */
function fillDrilldownTable(logs) {
  const tbody = document.getElementById("drilldown-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!logs || logs.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "No data for current selection / filters.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  logs.forEach(log => {
    const tr = document.createElement("tr");

    const d = new Date(log.created_at);
    const timeStr = isNaN(d.getTime()) ? log.created_at : d.toLocaleString();

    const eventName = log.event ? log.event.name : "";
    const floorName = log.floor ? log.floor.name : "";
    const fridgeName = log.fridge ? log.fridge.name : "";
    const drinkName = log.drink ? log.drink.name : "";

    addCell(tr, timeStr);
    addCell(tr, eventName);
    addCell(tr, floorName);
    addCell(tr, fridgeName);
    addCell(tr, drinkName);
    addCell(tr, log.action_type || "");
    addCell(tr, log.amount != null ? String(log.amount) : "");

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
   AGGREGATION FOR EXPORT
   Groups by: event, floor, fridge, drink
   Computes:
   - units_consumed = sum(start + restock – end)
   - value_eur      = units_consumed * price_per_unit
   - pfand_eur      = units_consumed * pfand_per_unit
-------------------------------------------------------- */
function buildAggregatesFromLogs(logs) {
  const groups = {};

  logs.forEach(log => {
    const isStart = log.action_type === "start";
    const isRestock = log.action_type === "restock";
    const isEnd = log.action_type === "end";

    const amount = Number(log.amount) || 0;
    const delta = isStart || isRestock ? amount : -amount;

    const eventName = log.event ? log.event.name : "";
    const floorName = log.floor ? log.floor.name : "";
    const fridgeName = log.fridge ? log.fridge.name : "";
    const drinkName = log.drink ? log.drink.name : "";

    const price = log.drink && log.drink.price_per_unit
      ? Number(log.drink.price_per_unit)
      : 0;
    const pfand = log.drink && log.drink.pfand_per_unit
      ? Number(log.drink.pfand_per_unit)
      : 0;

    const key = [eventName, floorName, fridgeName, drinkName].join("||");
    if (!groups[key]) {
      groups[key] = {
        eventName,
        floorName,
        fridgeName,
        drinkName,
        units: 0,
        value: 0,
        pfandValue: 0
      };
    }

    groups[key].units += delta;
    groups[key].value += delta * price;
    groups[key].pfandValue += delta * pfand;
  });

  return Object.values(groups).map(row => {
    // clamp negative units to 0 (should not happen if logs are consistent)
    if (row.units < 0) row.units = 0;
    return row;
  });
}

/* -------------------------------------------------------
   EXPORT: CSV (aggregated, filtered)
-------------------------------------------------------- */
function exportCsv() {
  const logsToUse =
    currentFilteredLogs && currentFilteredLogs.length
      ? currentFilteredLogs
      : currentLogs;

  if (!logsToUse || logsToUse.length === 0) {
    alert("No data to export.");
    return;
  }

  const aggregates = buildAggregatesFromLogs(logsToUse);
  if (!aggregates.length) {
    alert("No aggregated data (check filters).");
    return;
  }

  const header = [
    "event",
    "floor",
    "fridge",
    "drink",
    "units_consumed",
    "value_eur",
    "pfand_value_eur"
  ];

  const rows = aggregates.map(row => [
    row.eventName,
    row.floorName,
    row.fridgeName,
    row.drinkName,
    row.units.toString(),
    row.value.toFixed(2),
    row.pfandValue.toFixed(2)
  ]);

  const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
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

/* -------------------------------------------------------
   EXPORT: PDF (aggregated, filtered)
-------------------------------------------------------- */
function downloadPdf() {
  const logsToUse =
    currentFilteredLogs && currentFilteredLogs.length
      ? currentFilteredLogs
      : currentLogs;

  if (!logsToUse || logsToUse.length === 0) {
    alert("No data to export.");
    return;
  }

  const aggregates = buildAggregatesFromLogs(logsToUse);
  if (!aggregates.length) {
    alert("No aggregated data (check filters).");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library not loaded.");
    return;
  }

  const doc = new window.jspdf.jsPDF("p", "mm", "a4");

  doc.setFontSize(14);
  doc.text("w3.hub Drinks Consumption Report", 14, 16);

  const totalUnits = aggregates.reduce((sum, r) => sum + r.units, 0);
  const totalValue = aggregates.reduce((sum, r) => sum + r.value, 0);
  const totalPfand = aggregates.reduce((sum, r) => sum + r.pfandValue, 0);

  doc.setFontSize(11);
  doc.text(
    `Total units: ${totalUnits}  |  Value: €${totalValue.toFixed(
      2
    )}  |  Pfand: €${totalPfand.toFixed(2)}`,
    14,
    23
  );

  const bodyRows = aggregates.map(row => [
    row.eventName,
    row.floorName,
    row.fridgeName,
    row.drinkName,
    row.units.toString(),
    `€${row.value.toFixed(2)}`,
    `€${row.pfandValue.toFixed(2)}`
  ]);

  if (doc.autoTable) {
    doc.autoTable({
      startY: 28,
      head: [
        [
          "Event",
          "Floor",
          "Fridge",
          "Drink",
          "Units Consumed",
          "Value (€)",
          "Pfand (€)"
        ]
      ],
      body: bodyRows,
      styles: { fontSize: 8 }
    });
  }

  doc.save("w3hub_drinks_consumption.pdf");
}







