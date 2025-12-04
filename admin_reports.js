/* -------------------------------------------------------
   w3.hub Admin Analytics
   - OWNED_BY + FIXED CONSUMPTION
   - Close / Reopen Events (using events.status = 'Open'/'Closed')
   - Closed events greyed & disabled (but always included in analytics)
-------------------------------------------------------- */

let eventsById = {};
let floorsById = {};
let fridgesById = {};
let drinksById = {};

let aggregatedRows = [];
let activeFilters = { drink: null, fridge: null, date: null, owner: null };

let drinkPieChart = null;
let fridgeBarChart = null;
let dateLineChart = null;
let ownerPieChart = null;

document.addEventListener("DOMContentLoaded", () => {
    initAnalytics().catch(err => console.error("Init error:", err));
});

/* -------------------------------------------------------
   INIT
-------------------------------------------------------- */
async function initAnalytics() {
    await loadLookups();
    buildEventCheckboxes();
    buildReopenDropdown();
    updateCloseButtonVisibility();

    const applyBtn = document.getElementById("apply-event-filter");
    if (applyBtn) {
        applyBtn.addEventListener("click", refreshAnalytics);
    }

    const closeBtn = document.getElementById("close-event-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", handleCloseSelectedEvents);
    }

    const reopenBtn = document.getElementById("reopen-event-btn");
    if (reopenBtn) {
        reopenBtn.addEventListener("click", handleReopenEvent);
    }

    document.getElementById("export-csv-btn")?.addEventListener("click", exportCsv);
    document.getElementById("download-pdf-btn")?.addEventListener("click", downloadPdf);

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

    (events.data || []).forEach(e => { eventsById[e.id] = e; });
    (floors.data || []).forEach(e => { floorsById[e.id] = e; });
    (fridges.data || []).forEach(e => { fridgesById[e.id] = e; });
    (drinks.data || []).forEach(e => { drinksById[e.id] = e; });
}

/* -------------------------------------------------------
   EVENT CHECKBOXES
   - Show Open/Closed
   - Closed events greyed + disabled, but pre-checked
-------------------------------------------------------- */
function buildEventCheckboxes() {
    const container = document.getElementById("event-checkboxes");
    if (!container) return;

    container.innerHTML = "";

    const allEvents = Object.values(eventsById)
        .sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));

    allEvents.forEach(ev => {
        const status = (ev.status || "Open").trim();
        const isClosed = status.toLowerCase() === "closed";

        const label = document.createElement("label");
        label.className = "event-checkbox-item " + (isClosed ? "closed" : "open");

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = ev.id;
        cb.checked = true;               // Always included by default
        cb.disabled = isClosed;          // Closed events cannot be unchecked/selected

        // Whenever user toggles open events, update Close button visibility
        cb.addEventListener("change", updateCloseButtonVisibility);

        const textSpan = document.createElement("span");
        textSpan.textContent =
            `${ev.name}${ev.event_date ? " (" + ev.event_date + ")" : ""}`;

        const pill = document.createElement("span");
        pill.className = "status-pill";
        pill.textContent = isClosed ? "Closed" : "Open";

        label.appendChild(cb);
        label.appendChild(document.createTextNode(" "));
        label.appendChild(textSpan);
        label.appendChild(pill);

        container.appendChild(label);
    });

    updateCloseButtonVisibility();
}

/* Selected event IDs for analytics (includes closed if checked) */
function getSelectedEventIds() {
    const boxes = document.querySelectorAll("#event-checkboxes input[type='checkbox']");
    const selected = [];
    boxes.forEach(cb => {
        if (cb.checked) {
            selected.push(cb.value);
        }
    });
    return selected;
}

/* -------------------------------------------------------
   CLOSE / REOPEN BUTTON VISIBILITY
-------------------------------------------------------- */
function updateCloseButtonVisibility() {
    const closeBtn = document.getElementById("close-event-btn");
    if (!closeBtn) return;

    const selected = getSelectedEventIds();
    if (!selected.length) {
        closeBtn.style.display = "none";
        return;
    }

    const hasOpen = selected.some(id => {
        const ev = eventsById[id];
        return ev && (ev.status || "Open").toLowerCase() === "open";
    });

    closeBtn.style.display = hasOpen ? "inline-block" : "none";
}

/* -------------------------------------------------------
   BUILD REOPEN DROPDOWN
   - Lists only Closed events
-------------------------------------------------------- */
function buildReopenDropdown() {
    const wrapper = document.getElementById("reopen-event-wrapper");
    const select = document.getElementById("reopen-event-select");
    if (!wrapper || !select) return;

    select.innerHTML = "";

    const closedEvents = Object.values(eventsById)
        .filter(ev => (ev.status || "Open").toLowerCase() === "closed")
        .sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));

    if (!closedEvents.length) {
        wrapper.style.display = "none";
        return;
    }

    // Placeholder
    const optPlaceholder = document.createElement("option");
    optPlaceholder.value = "";
    optPlaceholder.textContent = "Select closed event…";
    select.appendChild(optPlaceholder);

    closedEvents.forEach(ev => {
        const opt = document.createElement("option");
        const dateLabel = ev.event_date ? ` (${ev.event_date})` : "";
        opt.value = ev.id;
        opt.textContent = `${ev.name}${dateLabel} · Closed`;
        select.appendChild(opt);
    });

    wrapper.style.display = "flex";
}

/* -------------------------------------------------------
   CLOSE SELECTED EVENTS
-------------------------------------------------------- */
async function handleCloseSelectedEvents() {
    const selected = getSelectedEventIds();
    if (!selected.length) {
        alert("Please select at least one event.");
        return;
    }

    const openIds = selected.filter(id => {
        const ev = eventsById[id];
        return ev && (ev.status || "Open").toLowerCase() === "open";
    });

    if (!openIds.length) {
        alert("All selected events are already Closed.");
        return;
    }

    const confirmClose = window.confirm(
        `Are you sure you want to CLOSE ${openIds.length} event(s)?\n\n` +
        "Runners will no longer be able to edit or delete logs for these events."
    );
    if (!confirmClose) return;

    const { error } = await supabase
        .from("events")
        .update({ status: "Closed" })
        .in("id", openIds);

    if (error) {
        console.error("Error closing events:", error);
        alert("❌ Error closing events. See console for details.");
        return;
    }

    // Update local cache
    openIds.forEach(id => {
        if (eventsById[id]) {
            eventsById[id].status = "Closed";
        }
    });

    const statusEl = document.getElementById("events-status");
    if (statusEl) {
        statusEl.textContent = `✅ Closed ${openIds.length} event(s).`;
        statusEl.classList.remove("error");
        statusEl.classList.add("success");
    }

    // Rebuild UI
    buildEventCheckboxes();
    buildReopenDropdown();
    await refreshAnalytics();
}

/* -------------------------------------------------------
   REOPEN A CLOSED EVENT
-------------------------------------------------------- */
async function handleReopenEvent() {
    const select = document.getElementById("reopen-event-select");
    if (!select) return;

    const eventId = select.value;
    if (!eventId) {
        alert("Please select a closed event to reopen.");
        return;
    }

    const ev = eventsById[eventId];
    const label = ev
        ? `${ev.name}${ev.event_date ? " (" + ev.event_date + ")" : ""}`
        : "this event";

    const confirmReopen = window.confirm(
        `Reopen "${label}"?\n\nRunners will be able to edit/delete logs again (within RLS rules).`
    );
    if (!confirmReopen) return;

    const { error } = await supabase
        .from("events")
        .update({ status: "Open" })
        .eq("id", eventId);

    if (error) {
        console.error("Error reopening event:", error);
        alert("❌ Error reopening event. See console for details.");
        return;
    }

    // Update local cache
    if (eventsById[eventId]) {
        eventsById[eventId].status = "Open";
    }

    const statusEl = document.getElementById("events-status");
    if (statusEl) {
        statusEl.textContent = `✅ Reopened "${label}".`;
        statusEl.classList.remove("error");
        statusEl.classList.add("success");
    }

    buildEventCheckboxes();
    buildReopenDropdown();
    await refreshAnalytics();
}

/* -------------------------------------------------------
   MAIN REFRESH
-------------------------------------------------------- */
async function refreshAnalytics() {
    resetFilters();
    aggregatedRows = [];

    updateCloseButtonVisibility();

    const selected = getSelectedEventIds();
    if (!selected.length) {
        clearCharts();
        fillAggregatedTable([]);
        return;
    }

    const { data, error } = await supabase
        .from("fridge_log_entries")
        .select("*")
        .in("event_id", selected);

    if (error || !data) {
        console.error("Log load error:", error);
        clearCharts();
        fillAggregatedTable([]);
        return;
    }

    aggregatedRows = buildAggregatedRows(data);

    buildCharts(aggregatedRows);
    fillAggregatedTable(aggregatedRows);
}

/* -------------------------------------------------------
   AGGREGATION – start + restock − end
-------------------------------------------------------- */
function buildAggregatedRows(logs) {
    const map = {};

    logs.forEach(log => {
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

                owner: event.owned_by || null,
                owner_other: event.owned_by_other || null,
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

    return Object.values(map).map(row => {
        const start = row.start ?? 0;
        const restock = row.restock ?? 0;
        const hasEnd = row.end !== null;

        let consumed = 0;

        if (hasEnd) {
            consumed = start + restock - row.end;
            if (consumed < 0) consumed = 0;
        } else {
            consumed = 0;
        }

        row.units_consumed = consumed;
        row.value = row.price_per_unit ? consumed * row.price_per_unit : 0;

        return row;
    });
}

/* -------------------------------------------------------
   OWNER LABEL BUILDER
-------------------------------------------------------- */
function buildOwnerLabel(event) {
    const raw = (event.owned_by || "").trim();
    if (!raw) return "Unknown";

    const lower = raw.toLowerCase();

    if (lower === "w3.hub" || lower === "w3hub" || lower === "w3") return "W3.hub";
    if (lower === "betterlife" || lower === "better life") return "BetterLife";
    if (lower === "other") return `Other – ${event.owned_by_other || "Unspecified"}`;

    return raw;
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
        if (!r.units_consumed) return;

        drinkTotals[r.drink_name] = (drinkTotals[r.drink_name] || 0) + r.units_consumed;
        fridgeTotals[r.fridge_name] = (fridgeTotals[r.fridge_name] || 0) + r.units_consumed;
        ownerTotals[r.owner_label] = (ownerTotals[r.owner_label] || 0) + r.units_consumed;

        const dateKey = r.event_date || "Unknown";
        dateTotals[dateKey] = (dateTotals[dateKey] || 0) + r.units_consumed;
    });

    buildPie("drink-pie-chart", drinkTotals, "drink");
    buildBar("fridge-bar-chart", fridgeTotals, "fridge");
    buildLine("date-line-chart", dateTotals, "date");
}

/* PIE */
function buildPie(id, data, type) {
    const ctx = document.getElementById(id)?.getContext("2d");
    if (!ctx) return;

    const chart = new Chart(ctx, {
        type: "pie",
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data) }] },
        options: {
            onClick: (e, el) => handleChartClick(el, type, chart),
            onHover: (e, el) => {
                document.body.style.cursor = el.length ? "pointer" : "default";
            }
        }
    });

    if (type === "drink") drinkPieChart = chart;
}

/* BAR */
function buildBar(id, data, type) {
    const ctx = document.getElementById(id)?.getContext("2d");
    if (!ctx) return;

    const chart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: Object.keys(data),
            datasets: [{ data: Object.values(data) }]
        },
        options: {
            indexAxis: "y",
            onClick: (e, el) => handleChartClick(el, type, chart),
            onHover: (e, el) => {
                document.body.style.cursor = el.length ? "pointer" : "default";
            }
        }
    });

    if (type === "fridge") fridgeBarChart = chart;
}

/* LINE */
function buildLine(id, data, type) {
    const ctx = document.getElementById(id)?.getContext("2d");
    if (!ctx) return;

    const labels = Object.keys(data).sort();
    const values = labels.map(k => data[k]);

    const chart = new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [{ data: values, fill: false }] },
        options: {
            onClick: (e, el) => handleChartClick(el, type, chart),
            onHover: (e, el) => {
                document.body.style.cursor = el.length ? "pointer" : "default";
            }
        }
    });

    if (type === "date") dateLineChart = chart;
}

/* -------------------------------------------------------
   CHART CLICK & FILTERING
-------------------------------------------------------- */
function handleChartClick(elements, type, chart) {
    if (!elements.length) return;

    const label = chart.data.labels[elements[0].index];
    activeFilters[type] = label;

    applyFilters();
    updateFilterPill();
    scrollToTable();
}

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

    document.getElementById("drilldown-section")?.prepend(pill);
}

function updateFilterPill() {
    const pill = document.getElementById("filter-pill");
    if (!pill) return;

    const active = Object.values(activeFilters).some(v => v !== null);
    pill.style.display = active ? "inline-block" : "none";
}

function resetFilters() {
    activeFilters = { drink: null, fridge: null, date: null, owner: null };
    updateFilterPill();
}

/* -------------------------------------------------------
   TABLE
-------------------------------------------------------- */
function fillAggregatedTable(rows) {
    const tbody = document.getElementById("drilldown-body");
    if (!tbody) return;
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

        totalUnits += r.units_consumed || 0;
        totalValue += r.value || 0;

        tbody.appendChild(tr);
    });

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
    if (!aggregatedRows.length) return alert("No data.");

    const header = [
        "Event","Floor","Fridge","Drink",
        "Units Consumed","Price Per Unit","Total Value","Owner"
    ];

    const csvRows = aggregatedRows.map(r => [
        r.event_name, r.floor_name, r.fridge_name, r.drink_name,
        r.units_consumed ?? "",
        r.price_per_unit,
        r.value ?? "",
        r.owner_label
    ]);

    const csv = [header.join(","), ...csvRows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
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
        r.event_name, r.floor_name, r.fridge_name, r.drink_name,
        r.units_consumed ?? "",
        r.price_per_unit.toFixed(2),
        r.value ? r.value.toFixed(2) : "",
        r.owner_label
    ]);

    doc.autoTable({
        startY: 22,
        head: [[
            "Event","Floor","Fridge","Drink",
            "Units","Price","Value","Owner"
        ]],
        body: tableRows
    });

    const totalUnits = aggregatedRows.reduce((s,r)=>s+(r.units_consumed||0),0);
    const totalValue = aggregatedRows.reduce((s,r)=>s+(r.value||0),0);

    doc.text(
        `TOTAL UNITS: ${totalUnits}     TOTAL VALUE: €${totalValue.toFixed(2)}`,
        14,
        doc.lastAutoTable.finalY + 10
    );

    doc.save("w3hub_drinks_consumption.pdf");
}

/* -------------------------------------------------------
   SCROLL
-------------------------------------------------------- */
function scrollToTable() {
    document.getElementById("drilldown-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

















