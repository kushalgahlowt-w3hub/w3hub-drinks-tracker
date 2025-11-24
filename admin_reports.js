/* -------------------------------------------------------
   w3.hub Admin Analytics – FINAL FULL VERSION
   Features:
   ✔ Aggregated consumption per event/floor/fridge/drink
   ✔ Event owner support (W3.hub, BetterLife, Other)
   ✔ Clean table + totals row
   ✔ Chart filtering
   ✔ CSV + PDF export with totals
   ✔ Mobile horizontal scroll compatibility
-------------------------------------------------------- */

// LOOKUP TABLES
let eventsById = {};
let floorsById = {};
let fridgesById = {};
let drinksById = {};

// GLOBAL
let aggregatedRows = [];
let activeFilters = {
    drink: null,
    fridge: null,
    date: null,
    owner: null
};

// CHART INSTANCES
let drinkPieChart = null;
let fridgeBarChart = null;
let dateLineChart = null;
let ownerPieChart = null;

document.addEventListener("DOMContentLoaded", () => {
    initAnalytics().catch(err => {
        console.error("Initialization error:", err);
        document.getElementById("events-status").textContent = "Error loading analytics.";
    });
});

/* -------------------------------------------------------
   INIT
-------------------------------------------------------- */
async function initAnalytics() {
    await loadLookups();
    buildEventCheckboxes();

    document.getElementById("apply-event-filter").addEventListener("click", refreshAnalytics);
    document.getElementById("export-csv-btn").addEventListener("click", exportCsv);
    document.getElementById("download-pdf-btn").addEventListener("click", downloadPdf);

    addFilterPill();
}

/* -------------------------------------------------------
   LOAD LOOKUPS
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
   EVENT CHECKBOXES
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
    return [...document.querySelectorAll("#event-checkboxes input:checked")].map(cb => cb.value);
}

/* -------------------------------------------------------
   MAIN REFRESH
-------------------------------------------------------- */
async function refreshAnalytics() {
    resetFilters();
    aggregatedRows = [];

    const selected = getSelectedEventIds();
    if (selected.length === 0) {
        clearCharts();
        fillAggregatedTable([]);
        return;
    }

    const { data, error } = await supabase
        .from("fridge_log_entries")
        .select("*")
        .in("event_id", selected);

    if (error || !data) {
        clearCharts();
        fillAggregatedTable([]);
        return;
    }

    // Convert to aggregated rows
    aggregatedRows = buildAggregatedRows(data);

    // Build charts
    buildCharts(aggregatedRows);

    // Fill table
    fillAggregatedTable(aggregatedRows);
}

/* -------------------------------------------------------
   AGGREGATION
-------------------------------------------------------- */
function buildAggregatedRows(rawLogs) {
    const map = {};

    rawLogs.forEach(log => {
        const event = eventsById[log.event_id];
        const fridge = fridgesById[log.fridge_id];
        const drink = drinksById[log.drink_type_id];
        const floor = fridge ? floorsById[fridge.floor_id] : null;

        if (!event || !fridge || !drink || !floor) return;

        const key = `${event.id}_${floor.id}_${fridge.id}_${drink.id}`;
        if (!map[key]) {
            map[key] = {
                event_id: event.id,
                event_name: event.name,
                event_date: event.event_date,
                owner_type: event.event_owner_type || null,
                owner_other: event.event_owner_other || null,
                owner_label: buildOwnerLabel(event),

                floor_name: floor.name,
                fridge_name: fridge.name,
                drink_name: drink.name,

                price_per_unit: drink.price_per_unit || 0,

                start: null,
                end: null,
                restock: 0
            };
        }

        if (log.action_type === "start") map[key].start = log.amount;
        if (log.action_type === "end") map[key].end = log.amount;
        if (log.action_type === "restock") map[key].restock += log.amount;
    });

    // Convert map → list
    return Object.values(map).map(row => {
        // Consumption logic
        let consumed = null;

        if (row.start !== null && row.end !== null) {
            consumed = row.start + row.restock - row.end;
        } else if (row.start !== null) {
            consumed = row.start + row.restock; // fallback
        } else {
            consumed = null; // no data
        }

        row.units_consumed = consumed !== null && consumed >= 0 ? consumed : null;
        row.value = row.units_consumed ? row.units_consumed * row.price_per_unit : null;

        return row;
    });
}

/* -------------------------------------------------------
   OWNER LABEL BUILDER
-------------------------------------------------------- */
function buildOwnerLabel(event) {
    if (!event.event_owner_type) return "Unknown";

    if (event.event_owner_type === "w3hub") return "W3.hub";
    if (event.event_owner_type === "betterlife") return "BetterLife";
    if (event.event_owner_type === "other") {
        return `Other – ${event.event_owner_other || "Unspecified"}`;
    }

    return "Unknown";
}

/* -------------------------------------------------------
   CHARTS
-------------------------------------------------------- */
function clearCharts() {
    drinkPieChart?.destroy();
    fridgeBarChart?.destroy();
    dateLineChart?.destroy();
    ownerPieChart?.destroy();

    drinkPieChart = fridgeBarChart = dateLineChart = ownerPieChart = null;
}

function buildCharts(rows) {
    clearCharts();

    if (!rows.length) return;

    const drinkTotals = {};
    const fridgeTotals = {};
    const dateTotals = {};
    const ownerTotals = {};

    rows.forEach(r => {
        if (r.units_consumed === null) return;

        drinkTotals[r.drink_name] = (drinkTotals[r.drink_name] || 0) + r.units_consumed;
        fridgeTotals[r.fridge_name] = (fridgeTotals[r.fridge_name] || 0) + r.units_consumed;
        ownerTotals[r.owner_label] = (ownerTotals[r.owner_label] || 0) + r.units_consumed;

        const dateKey = r.event_date || "Unknown";
        dateTotals[dateKey] = (dateTotals[dateKey] || 0) + r.units_consumed;
    });

    buildPieChart("drink-pie-chart", drinkTotals, "drink");
    buildBarChart("fridge-bar-chart", fridgeTotals, "fridge");
    buildLineChart("date-line-chart", dateTotals, "date");
}

function buildPieChart(id, obj, filterType) {
    const ctx = document.getElementById(id)?.getContext("2d");
    if (!ctx) return;

    const chart = new Chart(ctx, {
        type: "pie",
        data: {
            labels: Object.keys(obj),
            datasets: [{ data: Object.values(obj) }]
        },
        options: {
            onClick: (e, elements) => handleChartClick(elements, filterType, chart),
            onHover: (e, elements) => {
                document.body.style.cursor = elements.length ? "pointer" : "default";
            }
        }
    });

    if (filterType === "drink") drinkPieChart = chart;
}

function buildBarChart(id, obj, filterType) {
    const ctx = document.getElementById(id)?.getContext("2d");
    if (!ctx) return;

    const chart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: Object.keys(obj),
            datasets: [{ data: Object.values(obj) }]
        },
        options: {
            indexAxis: "y",
            onClick: (e, elements) => handleChartClick(elements, filterType, chart),
            onHover: (e, elements) => {
                document.body.style.cursor = elements.length ? "pointer" : "default";
            }
        }
    });

    if (filterType === "fridge") fridgeBarChart = chart;
}

function buildLineChart(id, obj, filterType) {
    const ctx = document.getElementById(id)?.getContext("2d");
    if (!ctx) return;

    const sortedLabels = Object.keys(obj).sort();
    const sortedValues = sortedLabels.map(k => obj[k]);

    const chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: sortedLabels,
            datasets: [{
                data: sortedValues,
                fill: false
            }]
        },
        options: {
            onClick: (e, elements) => handleChartClick(elements, filterType, chart),
            onHover: (e, elements) => {
                document.body.style.cursor = elements.length ? "pointer" : "default";
            }
        }
    });

    if (filterType === "date") dateLineChart = chart;
}

/* -------------------------------------------------------
   CHART CLICK HANDLER
-------------------------------------------------------- */
function handleChartClick(elements, type, chart) {
    if (!elements.length) return;
    const index = elements[0].index;

    const label = chart.data.labels[index];
    activeFilters[type] = label;

    applyFilters();
    updateFilterPill();
    scrollToTable();
}

/* -------------------------------------------------------
   APPLY FILTERS
-------------------------------------------------------- */
function applyFilters() {
    const filtered = aggregatedRows.filter(r => {
        if (activeFilters.drink && r.drink_name !== activeFilters.drink) return false;
        if (activeFilters.fridge && r.fridge_name !== activeFilters.fridge) return false;
        if (activeFilters.date && r.event_date !== activeFilters.date) return false;
        if (activeFilters.owner && r.owner_label !== activeFilters.owner) return false;
        return true;
    });

    fillAggregatedTable(filtered);
}

/* -------------------------------------------------------
   FILTER PILL
-------------------------------------------------------- */
function addFilterPill() {
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
    const active = Object.values(activeFilters).some(v => v !== null);
    pill.style.display = active ? "inline-block" : "none";
}

function resetFilters() {
    activeFilters = {
        drink: null,
        fridge: null,
        date: null,
        owner: null
    };
    updateFilterPill();
}

/* -------------------------------------------------------
   TABLE FILLER (AGGREGATED)
-------------------------------------------------------- */
function fillAggregatedTable(rows) {
    const tbody = document.getElementById("drilldown-body");
    tbody.innerHTML = "";

    let totalUnits = 0;
    let totalValue = 0;

    rows.forEach(r => {
        const tr = document.createElement("tr");

        addCell(tr, r.event_name);
        addCell(tr, r.floor_name);
        addCell(tr, r.fridge_name);
        addCell(tr, r.drink_name);
        addCell(tr, r.units_consumed ?? "–");
        addCell(tr, r.price_per_unit.toFixed(2));
        addCell(tr, r.value ? r.value.toFixed(2) : "–");
        addCell(tr, r.owner_label);

        if (r.units_consumed) totalUnits += r.units_consumed;
        if (r.value) totalValue += r.value;

        tbody.appendChild(tr);
    });

    // TOTALS ROW
    if (rows.length) {
        const tr = document.createElement("tr");
        tr.style.fontWeight = "bold";
        tr.style.background = "#151821";

        addCell(tr, "TOTAL");
        addCell(tr, "");
        addCell(tr, "");
        addCell(tr, "");
        addCell(tr, totalUnits);
        addCell(tr, "€");
        addCell(tr, totalValue.toFixed(2));
        addCell(tr, "");

        tbody.appendChild(tr);
    }
}

function addCell(tr, text) {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
}

/* -------------------------------------------------------
   CSV EXPORT
-------------------------------------------------------- */
function exportCsv() {
    const rows = aggregatedRows;
    if (!rows.length) return alert("No data.");

    const header = [
        "Event",
        "Floor",
        "Fridge",
        "Drink",
        "Units Consumed",
        "Price Per Unit",
        "Total Value",
        "Owner"
    ];

    const csvRows = rows.map(r => [
        r.event_name,
        r.floor_name,
        r.fridge_name,
        r.drink_name,
        r.units_consumed ?? "",
        r.price_per_unit,
        r.value ?? "",
        r.owner_label
    ]);

    const csv = [header.join(","), ...csvRows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "w3hub_drinks_consumption.csv";
    a.click();
}

/* -------------------------------------------------------
   PDF EXPORT
-------------------------------------------------------- */
function downloadPdf() {
    if (!aggregatedRows.length) return alert("No data.");

    const doc = new window.jspdf.jsPDF();
    doc.setFontSize(14);
    doc.text("w3.hub Drinks Consumption Report", 14, 16);

    const tableRows = aggregatedRows.map(r => [
        r.event_name,
        r.floor_name,
        r.fridge_name,
        r.drink_name,
        r.units_consumed ?? "",
        r.price_per_unit.toFixed(2),
        r.value ? r.value.toFixed(2) : "",
        r.owner_label
    ]);

    doc.autoTable({
        startY: 22,
        head: [[
            "Event",
            "Floor",
            "Fridge",
            "Drink",
            "Units",
            "Price",
            "Value",
            "Owner"
        ]],
        body: tableRows
    });

    // TOTALS
    const totalUnits = aggregatedRows.reduce((sum, r) => sum + (r.units_consumed || 0), 0);
    const totalValue = aggregatedRows.reduce((sum, r) => sum + (r.value || 0), 0);

    doc.text(
        `TOTAL UNITS: ${totalUnits}     TOTAL VALUE: €${totalValue.toFixed(2)}`,
        14,
        doc.lastAutoTable.finalY + 10
    );

    doc.save("w3hub_drinks_consumption.pdf");
}

/* -------------------------------------------------------
   SCROLL TO TABLE
-------------------------------------------------------- */
function scrollToTable() {
    const el = document.getElementById("drilldown-section");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}














