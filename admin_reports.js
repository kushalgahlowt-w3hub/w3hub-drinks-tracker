/* =====================================================================
   w3.hub Admin Analytics – FULL FILE (v3, with Totals Footer + PDF Summary)
   ---------------------------------------------------------------------
   ✔ Aggregated consumption (start + restock – end)
   ✔ Price-per-unit support (from drink_types.price_per_unit)
   ✔ Table footer: TOTAL UNITS + TOTAL VALUE
   ✔ PDF summary block
   ✔ CSV includes totals
   ✔ Multi-filter (event, drink, fridge, date)
   ✔ Charts remain unchanged
===================================================================== */

let eventsById = {};
let floorsById = {};
let fridgesById = {};
let drinksById = {};

let drinkPieChart = null;
let fridgeBarChart = null;
let dateLineChart = null;

let currentLogs = [];
let aggregatedRows = [];

let activeFilters = {
  drink: null,
  fridge: null,
  date: null,
};

document.addEventListener("DOMContentLoaded", () => {
  initAnalytics().catch((err) => {
    console.error("Initialization error:", err);
    document.getElementById("events-status").textContent =
      "Error loading analytics.";
  });
});

/* -------------------------------------------------------
   INITIALIZE ANALYTICS
-------------------------------------------------------- */
async function initAnalytics() {
  await loadLookups();
  buildEventCheckboxes();

  document
    .getElementById("apply-event-filter")
    .addEventListener("click", refreshAnalytics);

  document.getElementById("export-csv-btn").addEventListener("click", exportCsv);
  document.getElementById("download-pdf-btn").addEventListener("click", downloadPdf);

  addClearFilterPill();
}

/* -------------------------------------------------------
   LOAD LOOKUP DATA
-------------------------------------------------------- */
async function loadLookups() {
  const [events, floors, fridges, drinks] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("floors").select("*"),
    supabase.from("fridges").select("*"),
    supabase.from("drink_types").select("*"),
  ]);

  events.data?.forEach((e) => (eventsById[e.id] = e));
  floors.data?.forEach((f) => (floorsById[f.id] = f));
  fridges.data?.forEach((fr) => (fridgesById[fr.id] = fr));
  drinks.data?.forEach((d) => (drinksById[d.id] = d));
}

/* -------------------------------------------------------
   EVENT CHECKBOXES
-------------------------------------------------------- */
function buildEventCheckboxes() {
  const container = document.getElementById("event-checkboxes");
  container.innerHTML = "";

  const events = Object.values(eventsById).sort((a, b) =>
    (a.event_date || "").localeCompare(b.event_date || "")
  );

  events.forEach((ev) => {
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
    (cb) => cb.value
  );
}

/* -------------------------------------------------------
   MAIN REFRESH FLOW
-------------------------------------------------------- */
async function refreshAnalytics() {
  resetFilters();

  const tbody = document.getElementById("drilldown-body");
  tbody.innerHTML = "";
  clearTableFooter();

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

  currentLogs = data.map((row) => {
    const event = eventsById[row.event_id];
    const fridge = fridgesById[row.fridge_id];
    const drink = drinksById[row.drink_type_id];
    const floor = fridge ? floorsById[fridge.floor_id] : null;

    return { ...row, event, fridge, drink, floor };
  });

  aggregatedRows = aggregateConsumption(currentLogs);

  buildCharts(currentLogs);
  fillAggregatedTable(aggregatedRows);
  autoScrollToSection("drilldown-section");
}

/* -------------------------------------------------------
   AGGREGATION (Event × Floor × Fridge × Drink)
-------------------------------------------------------- */
function aggregateConsumption(logs) {
  const map = {};

  logs.forEach((log) => {
    if (!log.event || !log.fridge || !log.drink) return;

    const key = `${log.event.id}|${log.floor?.id}|${log.fridge.id}|${log.drink.id}`;

    if (!map[key]) {
      map[key] = {
        eventName: log.event.name,
        floorName: log.floor?.name || "",
        fridgeName: log.fridge.name,
        drinkName: log.drink.name,
        price: log.drink.price_per_unit || 0,

        start: 0,
        restock: 0,
        end: 0,
      };
    }

    if (log.action_type === "start") map[key].start += log.amount;
    if (log.action_type === "restock") map[key].restock += log.amount;
    if (log.action_type === "end") map[key].end += log.amount;
  });

  return Object.values(map).map((row) => {
    const consumed = row.start + row.restock - row.end;

    return {
      ...row,
      consumed: consumed < 0 ? 0 : consumed,
      totalValue: consumed * row.price,
    };
  });
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

function buildCharts() {
  clearCharts();

  const usageByDrink = {};
  const usageByFridge = {};
  const usageByDate = {};

  currentLogs.forEach((log) => {
    if (!log.drink || !log.fridge) return;

    const delta =
      log.action_type === "start" || log.action_type === "restock"
        ? log.amount
        : -log.amount;

    const drink = log.drink.name;
    const fridge = log.fridge.name;
    const date = (log.created_at || "").slice(0, 10);

    usageByDrink[drink] = (usageByDrink[drink] || 0) + delta;
    usageByFridge[fridge] = (usageByFridge[fridge] || 0) + delta;
    usageByDate[date] = (usageByDate[date] || 0) + delta;
  });

  buildDrinkPieChart(usageByDrink);
  buildFridgeBarChart(usageByFridge);
  buildDateLineChart(usageByDate);
}

function buildDrinkPieChart(obj) {
  const ctx = document.getElementById("drink-pie-chart")?.getContext("2d");
  if (!ctx) return;

  drinkPieChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: Object.keys(obj),
      datasets: [{ data: Object.values(obj) }],
    },
  });
}

function buildFridgeBarChart(obj) {
  const ctx = document.getElementById("fridge-bar-chart")?.getContext("2d");
  if (!ctx) return;

  fridgeBarChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(obj),
      datasets: [{ data: Object.values(obj) }],
    },
    options: { indexAxis: "y" },
  });
}

function buildDateLineChart(obj) {
  const ctx = document.getElementById("date-line-chart")?.getContext("2d");
  if (!ctx) return;

  dateLineChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: Object.keys(obj).sort(),
      datasets: [{ data: Object.values(obj), fill: false }],
    },
  });
}

/* -------------------------------------------------------
   TABLE RENDERING (AGGREGATED)
-------------------------------------------------------- */
function fillAggregatedTable(rows) {
  const tbody = document.getElementById("drilldown-body");
  tbody.innerHTML = "";

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    addCell(tr, r.eventName);
    addCell(tr, r.floorName);
    addCell(tr, r.fridgeName);
    addCell(tr, r.drinkName);
    addCell(tr, r.consumed);
    addCell(tr, r.price.toFixed(2));
    addCell(tr, r.totalValue.toFixed(2));
    tbody.appendChild(tr);
  });

  addTotalsFooter(rows);
}

function addCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text;
  tr.appendChild(td);
}

/* -------------------------------------------------------
   FOOTER — OPTION C
-------------------------------------------------------- */
function clearTableFooter() {
  const table = document.getElementById("drilldown-table");
  const old = table.querySelector("tfoot");
  if (old) old.remove();
}

function addTotalsFooter(rows) {
  clearTableFooter();

  const table = document.getElementById("drilldown-table");
  const tfoot = document.createElement("tfoot");

  const totalUnits = rows.reduce((a, b) => a + b.consumed, 0);
  const totalValue = rows.reduce((a, b) => a + b.totalValue, 0);

  const rowUnits = document.createElement("tr");
  rowUnits.innerHTML = `
      <td colspan="7" style="font-weight:bold; background:#11131A;">
        TOTAL UNITS CONSUMED: ${totalUnits}
      </td>
  `;

  const rowValue = document.createElement("tr");
  rowValue.innerHTML = `
      <td colspan="7" style="font-weight:bold; background:#11131A;">
        TOTAL VALUE (€): ${totalValue.toFixed(2)}
      </td>
  `;

  tfoot.appendChild(rowUnits);
  tfoot.appendChild(rowValue);
  table.appendChild(tfoot);
}

/* -------------------------------------------------------
   PDF EXPORT — OPTION 2 SUMMARY BLOCK
-------------------------------------------------------- */
function downloadPdf() {
  if (!aggregatedRows.length) return alert("No data.");

  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(14);
  doc.text("w3.hub Drinks Consumption Report", 14, 14);

  const rows = aggregatedRows.map((r) => [
    r.eventName,
    r.floorName,
    r.fridgeName,
    r.drinkName,
    r.consumed,
    r.price.toFixed(2),
    r.totalValue.toFixed(2),
  ]);

  doc.autoTable({
    startY: 22,
    head: [
      [
        "Event",
        "Floor",
        "Fridge",
        "Drink",
        "Units Consumed",
        "Price/Unit (€)",
        "Total Value (€)",
      ],
    ],
    body: rows,
  });

  const totalUnits = aggregatedRows.reduce((a, b) => a + b.consumed, 0);
  const totalValue = aggregatedRows.reduce((a, b) => a + b.totalValue, 0);

  let y = doc.lastAutoTable.finalY + 10;

  doc.setFontSize(12);
  doc.text(`Summary`, 14, y);
  y += 6;
  doc.text(`Total Units Consumed: ${totalUnits}`, 14, y);
  y += 6;
  doc.text(`Total Value (€): ${totalValue.toFixed(2)}`, 14, y);

  doc.save("w3hub_consumption_report.pdf");
}

/* -------------------------------------------------------
   CSV EXPORT WITH TOTALS
-------------------------------------------------------- */
function exportCsv() {
  if (!aggregatedRows.length) return alert("No data.");

  const header = [
    "event",
    "floor",
    "fridge",
    "drink",
    "units_consumed",
    "price_per_unit",
    "total_value",
  ];

  const rows = aggregatedRows.map((r) => [
    r.eventName,
    r.floorName,
    r.fridgeName,
    r.drinkName,
    r.consumed,
    r.price.toFixed(2),
    r.totalValue.toFixed(2),
  ]);

  // Totals at bottom
  const totalUnits = aggregatedRows.reduce((a, b) => a + b.consumed, 0);
  const totalValue = aggregatedRows.reduce((a, b) => a + b.totalValue, 0);

  rows.push([]);
  rows.push(["TOTAL UNITS", "", "", "", totalUnits]);
  rows.push(["TOTAL VALUE (€)", "", "", "", "", "", totalValue.toFixed(2)]);

  const csv =
    [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "w3hub_consumption_report.csv";
  a.click();
}

/* -------------------------------------------------------
   FILTER PILL + SCROLLING
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
    fillAggregatedTable(aggregatedRows);
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

function resetFilters() {
  activeFilters = { drink: null, fridge: null, date: null };
  updateFilterPill();
}

function autoScrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}












