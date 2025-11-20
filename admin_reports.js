// admin_reports.js
// Uses global `supabase` created in admin_reports.html

let eventsById = {};
let floorsById = {};
let fridgesById = {};
let drinksById = {};

let drinkPieChart = null;
let fridgeBarChart = null;
let dateLineChart = null;

let currentLogs = [];

document.addEventListener("DOMContentLoaded", () => {
  initAnalytics().catch(err => {
    console.error("Error initialising analytics:", err);
    const s = document.getElementById("events-status");
    if (s) s.textContent = "Error initialising analytics.";
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
}

/* -----------------------------
   LOOKUPS
------------------------------ */

async function loadLookups() {
  const [eventsRes, floorsRes, fridgesRes, drinksRes] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("floors").select("*"),
    supabase.from("fridges").select("*"),
    supabase.from("drink_types").select("*")
  ]);

  if (eventsRes.error) console.error("Error loading events:", eventsRes.error);
  if (floorsRes.error) console.error("Error loading floors:", floorsRes.error);
  if (fridgesRes.error) console.error("Error loading fridges:", fridgesRes.error);
  if (drinksRes.error) console.error("Error loading drink types:", drinksRes.error);

  (eventsRes.data || []).forEach(e => (eventsById[e.id] = e));
  (floorsRes.data || []).forEach(f => (floorsById[f.id] = f));
  (fridgesRes.data || []).forEach(fr => (fridgesById[fr.id] = fr));
  (drinksRes.data || []).forEach(d => (drinksById[d.id] = d));
}

/* -----------------------------
   EVENT CHECKBOXES
------------------------------ */

function buildEventCheckboxes() {
  const container = document.getElementById("event-checkboxes");
  const status = document.getElementById("events-status");
  if (!container) return;

  container.innerHTML = "";

  const events = Object.values(eventsById).sort((a, b) => {
    const da = a.event_date || a.date || "";
    const db = b.event_date || b.date || "";
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

    const dateLabel = ev.event_date || ev.date || "";
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
  const cbs = container.querySelectorAll("input[type='checkbox']");
  const ids = [];
  cbs.forEach(cb => {
    if (cb.checked) ids.push(cb.value);
  });
  return ids;
}

/* -----------------------------
   MAIN REFRESH
------------------------------ */

async function refreshAnalytics() {
  const status = document.getElementById("events-status");
  const chartsEmpty = document.getElementById("charts-empty-message");
  const tbody = document.getElementById("drilldown-body");

  if (tbody) tbody.innerHTML = "";

  const selectedIds = getSelectedEventIds();
  if (selectedIds.length === 0) {
    if (status) status.textContent = "Please select at least one event.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
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
    return;
  }

  if (!data || data.length === 0) {
    if (status) status.textContent = "No logs for the selected events.";
    clearCharts();
    if (chartsEmpty) chartsEmpty.style.display = "block";
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

  if (status) status.textContent = `Loaded ${currentLogs.length} log entries.`;
  if (chartsEmpty) chartsEmpty.style.display = "none";

  buildCharts(currentLogs);
  fillDrilldownTable(currentLogs);

  const drilldownSection = document.getElementById("drilldown-section");
  if (drilldownSection) {
    drilldownSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/* -----------------------------
   CHARTS
------------------------------ */

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

  const usageByDrink = {};
  const usageByFridge = {};
  const usageByDate = {};

  logs.forEach(log => {
    const sign = log.action_type === "end" ? -1 : 1;
    const value = (log.amount || 0) * sign;

    const drinkKey = log.drink ? log.drink.name : "Unknown";
    usageByDrink[drinkKey] = (usageByDrink[drinkKey] || 0) + value;

    const fridgeKey = log.fridge ? log.fridge.name : "Unknown";
    usageByFridge[fridgeKey] = (usageByFridge[fridgeKey] || 0) + value;

    const dateKey = (log.created_at || "").slice(0, 10);
    usageByDate[dateKey] = (usageByDate[dateKey] || 0) + value;
  });

  // PIE – by drink
  const drinkCanvas = document.getElementById("drink-pie-chart");
  if (drinkCanvas) {
    const ctx = drinkCanvas.getContext("2d");
    const labels = Object.keys(usageByDrink);
    const data = labels.map(k => Math.max(usageByDrink[k], 0));

    drinkPieChart = new Chart(ctx, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data
          }
        ]
      },
      options: {
        plugins: {
          legend: { position: "bottom" }
        }
      }
    });
  }

  // BAR – by fridge
  const fridgeCanvas = document.getElementById("fridge-bar-chart");
  if (fridgeCanvas) {
    const ctx = fridgeCanvas.getContext("2d");
    const labels = Object.keys(usageByFridge);
    const data = labels.map(k => usageByFridge[k]);

    fridgeBarChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data
          }
        ]
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  // LINE – over time
  const dateCanvas = document.getElementById("date-line-chart");
  if (dateCanvas) {
    const ctx = dateCanvas.getContext("2d");
    const labels = Object.keys(usageByDate).sort();
    const data = labels.map(k => usageByDate[k]);

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
        }
      }
    });
  }
}

/* -----------------------------
   DRILLDOWN TABLE
------------------------------ */

function fillDrilldownTable(logs) {
  const tbody = document.getElementById("drilldown-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  logs.forEach(log => {
    const tr = document.createElement("tr");

    const d = new Date(log.created_at);
    const timeStr = isNaN(d.getTime())
      ? log.created_at
      : d.toLocaleString();

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

/* -----------------------------
   EXPORT: CSV
------------------------------ */

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
    "amount"
  ];

  const rows = currentLogs.map(log => {
    const d = new Date(log.created_at);
    const timeStr = isNaN(d.getTime())
      ? log.created_at
      : d.toISOString();

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
      log.action_type || "",
      log.amount != null ? String(log.amount) : ""
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

/* -----------------------------
   EXPORT: PDF
------------------------------ */

function downloadPdf() {
  if (!currentLogs || currentLogs.length === 0) {
    alert("No data to export.");
    return;
  }

  // jsPDF is exposed via window.jspdf.jsPDF for the UMD build
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF library not loaded.");
    return;
  }

  const doc = new window.jspdf.jsPDF("p", "mm", "a4");

  doc.setFontSize(14);
  doc.text("w3.hub Drinks Analytics", 14, 16);

  const rows = currentLogs.map(log => {
    const d = new Date(log.created_at);
    const timeStr = isNaN(d.getTime())
      ? log.created_at
      : d.toLocaleString();

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
      log.action_type || "",
      log.amount != null ? String(log.amount) : ""
    ];
  });

  if (doc.autoTable) {
    doc.autoTable({
      startY: 22,
      head: [["Time", "Event", "Floor", "Fridge", "Drink", "Action", "Amount"]],
      body: rows,
      styles: { fontSize: 8 }
    });
  }

  doc.save("w3hub_drinks_analytics.pdf");
}





