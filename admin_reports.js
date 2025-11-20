// admin_reports.js

let eventsById = {};
let floorsById = {};
let fridgesById = {};
let drinksById = {};

let drinkPieChart = null;
let fridgeBarChart = null;
let dateLineChart = null;

let currentLogs = []; // raw fridge_log_entries with lookups attached

document.addEventListener("DOMContentLoaded", () => {
  initAnalytics().catch(err => {
    console.error("Error in initAnalytics:", err);
    const s = document.getElementById("events-status");
    if (s) s.textContent = "Error initialising analytics.";
  });
});

async function initAnalytics() {
  await loadLookups();
  await buildEventCheckboxes();

  document
    .getElementById("apply-event-filter")
    .addEventListener("click", refreshAnalytics);

  document
    .getElementById("export-csv-btn")
    .addEventListener("click", exportCsv);

  document
    .getElementById("download-pdf-btn")
    .addEventListener("click", downloadPdf);
}

// ----------------------
// LOAD LOOKUP TABLES
// ----------------------
async function loadLookups() {
  const [eventsRes, floorsRes, fridgesRes, drinksRes] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("floors").select("*"),
    supabase.from("fridges").select("*"),
    supabase.from("drink_types").select("*"),
  ]);

  if (eventsRes.error) {
    console.error("Error loading events:", eventsRes.error);
  }
  if (floorsRes.error) {
    console.error("Error loading floors:", floorsRes.error);
  }
  if (fridgesRes.error) {
    console.error("Error loading fridges:", fridgesRes.error);
  }
  if (drinksRes.error) {
    console.error("Error loading drinks:", drinksRes.error);
  }

  (eventsRes.data || []).forEach(e => (eventsById[e.id] = e));
  (floorsRes.data || []).forEach(f => (floorsById[f.id] = f));
  (fridgesRes.data || []).forEach(fr => (fridgesById[fr.id] = fr));
  (drinksRes.data || []).forEach(d => (drinksById[d.id] = d));
}

// ----------------------
// EVENT CHECKBOXES
// ----------------------
async function buildEventCheckboxes() {
  const container = document.getElementById("event-checkboxes");
  const status = document.getElementById("events-status");
  container.innerHTML = "";

  const events = Object.values(eventsById).sort((a, b) => {
    const da = a.event_date || a.date;
    const db = b.event_date || b.date;
    return (da || "").localeCompare(db || "");
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

    const dateLabel = ev.event_date || ev.date || "";
    label.appendChild(cb);
    label.appendChild(
      document.createTextNode(
        ` ${ev.name}${dateLabel ? " (" + dateLabel + ")" : ""}`
      )
    );
    container.appendChild(label);
  });

  if (status) status.textContent = "All events selected by default.";
}

// ----------------------
// REFRESH ANALYTICS
// ----------------------
async function refreshAnalytics() {
  const selectedEventIds = getSelectedEventIds();
  const status = document.getElementById("events-status");
  const chartsEmpty = document.getElementById("charts-empty-message");
  const tbody = document.getElementById("drilldown-body");
  tbody.innerHTML = "";

  if (selectedEventIds.length === 0) {
    if (status) status.textContent = "Please select at least one event.";
    if (chartsEmpty) chartsEmpty.style.display = "block";
    clearCharts();
    return;
  }

  if (status) status.textContent = "Loading data…";

  const { data, error } = await supabase
    .from("fridge_log_entries")
    .select("*")
    .in("event_id", selectedEventIds)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading fridge_log_entries:", error);
    if (status) status.textContent = "Error loading data.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    return;
  }

  if (!data || data.length === 0) {
    if (status) status.textContent = "No logs for the selected events.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
    return;
  }

  // Attach lookups
  currentLogs = data.map(row => {
    return {
      ...row,
      event: eventsById[row.event_id] || null,
      fridge: fridgesById[row.fridge_id] || null,
      drink: drinksById[row.drink_type_id] || null,
      floor:
        fridgesById[row.fridge_id] && floorsById[fridgesById[row.fridge_id].floor_id]
          ? floorsById[fridgesById[row.fridge_id].floor_id]
          : null,
    };
  });

  if (status) status.textContent = `Loaded ${currentLogs.length} log entries.`;
  if (chartsEmpty) chartsEmpty.style.display = "none";

  buildCharts(currentLogs);
  fillDrilldownTable(currentLogs);

  // Scroll down a bit so you see the charts
  document
    .getElementById("drilldown-section")
    .scrollIntoView({ behavior: "smooth", block: "start" });
}

function getSelectedEventIds() {
  const container = document.getElementById("event-checkboxes");
  const checkboxes = container.querySelectorAll("input[type='checkbox']");
  const ids = [];
  checkboxes.forEach(cb => {
    if (cb.checked) ids.push(cb.value);
  });
  return ids;
}

// ----------------------
// CHARTS
// ----------------------
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

function buildCharts(logs) {
  clearCharts();

  // Simple "net usage" approximation:
  // start/restock → +amount, end → -amount
  const usageByDrink = {};
  const usageByFridge = {};
  const usageByDate = {};

  logs.forEach(log => {
    const sign = log.action_type === "end" ? -1 : 1;
    const val = sign * (log.amount || 0);

    const drinkKey = log.drink ? log.drink.name : "Unknown";
    usageByDrink[drinkKey] = (usageByDrink[drinkKey] || 0) + val;

    const fridgeKey = log.fridge ? log.fridge.name : "Unknown";
    usageByFridge[fridgeKey] = (usageByFridge[fridgeKey] || 0) + val;

    const dateKey = (log.created_at || "").slice(0, 10);
    usageByDate[dateKey] = (usageByDate[dateKey] || 0) + val;
  });

  // PIE: by drink
  const drinkCtx = document.getElementById("drink-pie-chart").getContext("2d");
  const drinkLabels = Object.keys(usageByDrink);
  const drinkValues = drinkLabels.map(k => Math.max(usageByDrink[k], 0)); // no negative slices

  drinkPieChart = new Chart(drinkCtx, {
    type: "pie",
    data: {
      labels: drinkLabels,
      datasets: [
        {
          data: drinkValues,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "bottom" },
      },
    },
  });

  // BAR: by fridge
  const fridgeCtx = document.getElementById("fridge-bar-chart").getContext("2d");
  const fridgeLabels = Object.keys(usageByFridge);
  const fridgeValues = fridgeLabels.map(k => usageByFridge[k]);

  fridgeBarChart = new Chart(fridgeCtx, {
    type: "bar",
    data: {
      labels: fridgeLabels,
      datasets: [
        {
          data: fridgeValues,
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: {
        legend: { display: false },
      },
    },
  });

  // LINE: by date
  const dateCtx = document.getElementById("date-line-chart").getContext("2d");
  const dateLabels = Object.keys(usageByDate).sort();
  const dateValues = dateLabels.map(k => usageByDate[k]);

  dateLineChart = new Chart(dateCtx, {
    type: "line",
    data: {
      labels: dateLabels,
      datasets: [
        {
          data: dateValues,
          fill: false,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
    },
  });
}

// ----------------------
// DRILLDOWN TABLE
// ----------------------
function fillDrilldownTable(logs) {
  const tbody = document.getElementById("drilldown-body");
  tbody.innerHTML = "";

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
    addCell(tr, log.action_type);
    addCell(tr, log.amount != null ? String(log.amount) : "");

    tbody.appendChild(tr);
  });
}

function addCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text;
  tr.appendChild(td);
}

// ----------------------
// EXPORTS
// ----------------------
function exportCsv() {
  if (!currentLogs || currentLogs.length === 0) {
    alert("No data to export.");
    return;
  }

  const header = [
    "time",
    "event",
    "floor",
    "fridge",
    "drink",
    "action",
    "amount",
  ];

  const rows = currentLogs.map(log => {
    const d = new Date(log.created_at);
    const timeStr = isNaN(d.getTime()) ? log.created_at : d.toISOString();
    const eventName = log.event ? log.event.name : "";
    const floorName = log.floor ? log.floor.name : "";
    const fridgeName = log.fridge ? log.fridge.name : "";
    const drinkName = log.drink ? log.drink.name : "";

    return [
      timeStr,
      eventName,
      floorName,
      fridgeName,
      drinkName,
      log.action_type,
      log.amount != null ? String(log.amount) : "",
    ];
  });

  const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "w3hub_drinks_analytics.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadPdf() {
  if (!currentLogs || currentLogs.length === 0) {
    alert("No data to export.");
    return;
  }

  const doc = new jsPDF("p", "mm", "a4");
  doc.setFontSize(14);
  doc.text("w3.hub Drinks Analytics", 14, 16);

  const rows = currentLogs.map(log => {
    const d = new Date(log.created_at);
    const timeStr = isNaN(d.getTime()) ? log.created_at : d.toLocaleString();
    return [
      timeStr,
      log.event ? log.event.name : "",
      log.floor ? log.floor.name : "",
      log.fridge ? log.fridge.name : "",
      log.drink ? log.drink.name : "",
      log.action_type,
      log.amount != null ? String(log.amount) : "",
    ];
  });

  doc.autoTable({
    startY: 22,
    head: [["Time", "Event", "Floor", "Fridge", "Drink", "Action", "Amount"]],
    body: rows,
    styles: { fontSize: 8 },
  });

  doc.save("w3hub_drinks_analytics.pdf");
}

}





