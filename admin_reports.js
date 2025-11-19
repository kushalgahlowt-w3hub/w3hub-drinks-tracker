/*******************************************************
 * ADMIN ANALYTICS DASHBOARD
 * - Multi-event selection (checkboxes)
 * - Combined analytics across selected events
 * - Charts (Chart.js v4)
 * - Heatmap
 * - Drilldown sorting & filtering
 * - CSV + PDF export
 * - Auto scroll + highlight to drilldown
 *******************************************************/

// Supabase client is already initialized in admin_reports.html

let drinkChart = null;
let fridgeChart = null;
let timeChart = null;

let lookupDrinks = {};
let lookupFridges = {};
let lookupFloors = {};
let lookupEvents = {};

let selectedEventIds = [];
let realtimeChannel = null;

let lastTotalsData = [];
let lastSummaryData = [];
let lastRestockData = [];

let lastDateFrom = null;
let lastDateTo = null;

// Drilldown data + filters + sorting
let drillRawRows = [];
let drillSort = { column: "time", direction: "desc" }; // 'asc' | 'desc'
let drillFilters = {
    eventId: "",
    fridgeId: "",
    drinkId: "",
    action: "",
    search: ""
};

/* ------------------------------
   Helper: pastel colors
--------------------------------*/
function pastelColor(alpha = 0.8) {
    const r = 120 + Math.floor(Math.random() * 135);
    const g = 120 + Math.floor(Math.random() * 135);
    const b = 120 + Math.floor(Math.random() * 135);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------
   Smooth scroll & highlight
--------------------------------*/
function scrollToDrilldown() {
    const section = document.getElementById("drilldown-section");
    if (!section) return;

    section.scrollIntoView({ behavior: "smooth", block: "start" });

    section.classList.add("highlight-pulse");
    setTimeout(() => {
        section.classList.remove("highlight-pulse");
    }, 1200);
}

/* ------------------------------
   Initial bootstrap
--------------------------------*/
document.addEventListener("DOMContentLoaded", async () => {
    await loadLookups();
    await loadEvents();
    setupFilterListeners();
    setupDrillFilterListeners();
    setupSortHeaderListeners();
    setupRealtimeListener();
});

/* ------------------------------
   Lookups
--------------------------------*/
async function loadLookups() {
    let { data: drinks } = await supabase.from("drink_types").select("*");
    drinks?.forEach(d => lookupDrinks[d.id] = d.name);

    let { data: floors } = await supabase.from("floors").select("*");
    floors?.forEach(f => lookupFloors[f.id] = f.name);

    let { data: fridges } = await supabase.from("fridges").select("*");
    fridges?.forEach(f => lookupFridges[f.id] = { name: f.name, floor_id: f.floor_id });
}

/* ------------------------------
   Load events & build checkboxes
--------------------------------*/
async function loadEvents() {
    const boxContainer = document.getElementById("event-checkboxes");
    boxContainer.innerHTML = "";

    let { data: events, error } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: false });

    if (error || !events?.length) {
        boxContainer.innerHTML = "<p style='font-size:12px; color:#888;'>No events found.</p>";
        selectedEventIds = [];
        return;
    }

    events.forEach(ev => {
        lookupEvents[ev.id] = ev;

        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = ev.id;
        cb.checked = true;

        const dateLabel = ev.event_date ? ` (${ev.event_date})` : "";
        const text = document.createElement("span");
        text.textContent = `${ev.name}${dateLabel}`;

        label.appendChild(cb);
        label.appendChild(text);
        boxContainer.appendChild(label);
    });

    // Attach listeners to checkboxes
    boxContainer.querySelectorAll("input[type='checkbox']").forEach(cb => {
        cb.addEventListener("change", () => {
            updateSelectedEventsFromUI();
            refreshAnalytics();
        });
    });

    // Initially, all events selected
    updateSelectedEventsFromUI();
    await refreshAnalytics();
}

function updateSelectedEventsFromUI() {
    const checks = document.querySelectorAll("#event-checkboxes input[type='checkbox']");
    const arr = [];
    checks.forEach(cb => {
        if (cb.checked) arr.push(cb.value);
    });
    selectedEventIds = arr;
}

/* ------------------------------
   Global filter listeners
--------------------------------*/
function setupFilterListeners() {
    document.getElementById("refresh-btn").addEventListener("click", async () => {
        await refreshAnalytics();
    });

    document.getElementById("export-btn").addEventListener("click", async () => {
        await exportCsv();
    });

    document.getElementById("pdf-btn").addEventListener("click", async () => {
        await exportPdf();
    });

    document.getElementById("event-select-all").addEventListener("click", () => {
        const checks = document.querySelectorAll("#event-checkboxes input[type='checkbox']");
        checks.forEach(cb => cb.checked = true);
        updateSelectedEventsFromUI();
        refreshAnalytics();
    });

    document.getElementById("event-clear-all").addEventListener("click", () => {
        const checks = document.querySelectorAll("#event-checkboxes input[type='checkbox']");
        checks.forEach(cb => cb.checked = false);
        updateSelectedEventsFromUI();
        refreshAnalytics();
    });
}

/* ------------------------------
   Realtime
--------------------------------*/
function setupRealtimeListener() {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);

    realtimeChannel = supabase.channel("realtime:fridge_log_entries")
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "fridge_log_entries" },
            async payload => {
                const evId = payload.new?.event_id || payload.old?.event_id;
                if (evId && selectedEventIds.includes(evId)) {
                    await refreshAnalytics(false);
                }
            }
        )
        .subscribe();
}

/* ------------------------------
   Apply event filter to query
--------------------------------*/
function applyEventFilter(query) {
    if (!selectedEventIds.length) return query; // will be handled externally
    if (selectedEventIds.length === 1) {
        return query.eq("event_id", selectedEventIds[0]);
    }
    return query.in("event_id", selectedEventIds);
}

/* ------------------------------
   Main refresh
--------------------------------*/
async function refreshAnalytics(showMessage = true) {
    const status = document.getElementById("filter-status");

    if (!selectedEventIds.length) {
        status.textContent = "Please select at least one event.";
        lastTotalsData = [];
        lastSummaryData = [];
        lastRestockData = [];
        renderDrinkChart([]);
        renderFridgeChart([]);
        renderTimeChart([]);
        renderHeatmap([]);
        drillRawRows = [];
        applyDrillFiltersAndRender();
        return;
    }

    if (showMessage) status.textContent = "Loading analytics…";

    lastDateFrom = document.getElementById("date-from").value || null;
    lastDateTo = document.getElementById("date-to").value || null;

    // Totals per drink across selected events
    let totalsQuery = supabase
        .from("event_consumption_totals")
        .select("*");
    totalsQuery = applyEventFilter(totalsQuery);

    const { data: totals } = await totalsQuery;
    lastTotalsData = totals || [];

    // Summary per day / fridge / drink across selected events
    let summaryQuery = supabase
        .from("event_consumption_summary")
        .select("*");
    summaryQuery = applyEventFilter(summaryQuery);

    if (lastDateFrom) summaryQuery = summaryQuery.gte("log_date", lastDateFrom);
    if (lastDateTo) summaryQuery = summaryQuery.lte("log_date", lastDateTo);

    const { data: summary } = await summaryQuery;
    lastSummaryData = summary || [];

    // Restocks for heatmap
    let restockQuery = supabase
        .from("fridge_log_entries")
        .select("*")
        .eq("action_type", "restock");
    restockQuery = applyEventFilter(restockQuery);

    if (lastDateFrom) restockQuery = restockQuery.gte("created_at", lastDateFrom + " 00:00:00");
    if (lastDateTo) restockQuery = restockQuery.lte("created_at", lastDateTo + " 23:59:59");

    const { data: restocks } = await restockQuery;
    lastRestockData = restocks || [];

    await updateSummaryCards(lastTotalsData, lastSummaryData);
    await renderDrinkChart(lastTotalsData);
    await renderFridgeChart(lastSummaryData);
    await renderTimeChart(lastSummaryData);
    await renderHeatmap(lastRestockData);

    if (showMessage) status.textContent = "Analytics updated.";
}

/* ------------------------------
   Summary cards
--------------------------------*/
async function updateSummaryCards(totals, summary) {
    const totalEl = document.getElementById("summary-total-consumption");
    const fridgesEl = document.getElementById("summary-fridges");
    const drinksEl = document.getElementById("summary-drinks");

    if (!totals?.length) {
        totalEl.textContent = "0";
        fridgesEl.textContent = "0";
        drinksEl.textContent = "0";
        return;
    }

    const total = totals.reduce((acc, t) => acc + (t.total_consumption || 0), 0);
    totalEl.textContent = total;

    const fridgeSet = new Set();
    const drinkSet = new Set();
    summary?.forEach(r => {
        if (r.fridge_id) fridgeSet.add(r.fridge_id);
        if (r.drink_type_id) drinkSet.add(r.drink_type_id);
    });

    fridgesEl.textContent = fridgeSet.size || 0;
    drinksEl.textContent = drinkSet.size || 0;
}

/* ------------------------------
   Drink breakdown (pie)
   Combine totals across events per drink
--------------------------------*/
async function renderDrinkChart(totals) {
    const ctx = document.getElementById("chart-drink-breakdown");
    if (drinkChart) drinkChart.destroy();

    if (!totals?.length) {
        drinkChart = new Chart(ctx, {
            type: "pie",
            data: { labels: ["No data"], datasets: [{ data: [1] }] }
        });
        return;
    }

    // Aggregate per drink_type_id
    const drinkMap = {};
    totals.forEach(t => {
        const id = t.drink_type_id;
        drinkMap[id] = (drinkMap[id] || 0) + (t.total_consumption || 0);
    });

    const drinkIds = Object.keys(drinkMap);
    const labels = drinkIds.map(id => lookupDrinks[id] || "Unknown");
    const values = drinkIds.map(id => drinkMap[id]);
    const colors = values.map(() => pastelColor());

    drinkChart = new Chart(ctx, {
        type: "pie",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors
            }]
        },
        options: {
            onClick: async (evt, elements) => {
                if (!elements.length) return;
                const index = elements[0].index;
                const drinkId = drinkIds[index];
                await drillDownByDrink(drinkId);
            },
            plugins: {
                legend: { labels: { color: "#e9e9e9" } }
            }
        }
    });
}

/* ------------------------------
   Fridge totals (bar)
--------------------------------*/
async function renderFridgeChart(summary) {
    const ctx = document.getElementById("chart-fridge-totals");
    if (fridgeChart) fridgeChart.destroy();

    if (!summary?.length) {
        fridgeChart = new Chart(ctx, {
            type: "bar",
            data: { labels: ["No data"], datasets: [{ data: [0] }] }
        });
        return;
    }

    const fridgeMap = {};
    summary.forEach(r => {
        if (!r.fridge_id) return;
        fridgeMap[r.fridge_id] = (fridgeMap[r.fridge_id] || 0) + (r.net_change || 0);
    });

    const ids = Object.keys(fridgeMap);
    const labels = ids.map(id => lookupFridges[id]?.name || "Unknown");
    const values = ids.map(id => fridgeMap[id]);

    fridgeChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Consumption",
                data: values,
                backgroundColor: values.map(() => pastelColor())
            }]
        },
        options: {
            onClick: async (evt, elements) => {
                if (!elements.length) return;
                const index = elements[0].index;
                await drillDownByFridge(ids[index]);
            },
            scales: {
                x: { ticks: { color: "#e9e9e9" } },
                y: { ticks: { color: "#e9e9e9" } }
            },
            plugins: {
                legend: { labels: { color: "#e9e9e9" } }
            }
        }
    });
}

/* ------------------------------
   Time series (line)
--------------------------------*/
async function renderTimeChart(summary) {
    const ctx = document.getElementById("chart-time-series");
    if (timeChart) timeChart.destroy();

    if (!summary?.length) {
        timeChart = new Chart(ctx, {
            type: "line",
            data: { labels: ["No data"], datasets: [{ data: [0] }] }
        });
        return;
    }

    const dateMap = {};
    summary.forEach(r => {
        if (!r.log_date) return;
        dateMap[r.log_date] = (dateMap[r.log_date] || 0) + (r.net_change || 0);
    });

    const labels = Object.keys(dateMap).sort();
    const values = labels.map(d => dateMap[d]);

    timeChart = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Net Change",
                data: values,
                borderColor: "rgba(0, 200, 255, 0.9)",
                backgroundColor: "rgba(0, 200, 255, 0.3)",
                tension: 0.3
            }]
        },
        options: {
            onClick: async (evt, elements) => {
                if (!elements.length) return;
                const index = elements[0].index;
                await drillDownByDate(labels[index]);
            },
            scales: {
                x: { ticks: { color: "#e9e9e9" } },
                y: { ticks: { color: "#e9e9e9" } }
            },
            plugins: {
                legend: { labels: { color: "#e9e9e9" } }
            }
        }
    });
}

/* ------------------------------
   Restock Heatmap (Fridge × Date)
--------------------------------*/
async function renderHeatmap(restocks) {
    const container = document.getElementById("heatmap-container");
    container.innerHTML = "";

    if (!restocks?.length) {
        container.innerHTML = "<p style='font-size:12px; color:#888;'>No restocks in this range.</p>";
        return;
    }

    const dateSet = new Set();
    const fridgeSet = new Set();
    const matrix = {}; // matrix[fridgeId][date] = sum

    restocks.forEach(r => {
        const d = new Date(r.created_at);
        const dateKey = d.toISOString().slice(0, 10);
        const fId = r.fridge_id;

        dateSet.add(dateKey);
        fridgeSet.add(fId);

        if (!matrix[fId]) matrix[fId] = {};
        matrix[fId][dateKey] = (matrix[fId][dateKey] || 0) + (r.amount || 0);
    });

    const dates = Array.from(dateSet).sort();
    const fridges = Array.from(fridgeSet);

    let maxVal = 0;
    fridges.forEach(fId => {
        dates.forEach(d => {
            const val = matrix[fId]?.[d] || 0;
            if (val > maxVal) maxVal = val;
        });
    });
    if (maxVal === 0) maxVal = 1;

    const table = document.createElement("table");
    table.className = "heatmap-table";

    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "Fridge \\ Date";
    hr.appendChild(corner);

    dates.forEach(d => {
        const th = document.createElement("th");
        th.textContent = d;
        hr.appendChild(th);
    });

    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    fridges.forEach(fId => {
        const row = document.createElement("tr");

        const fridgeLabel = lookupFridges[fId]?.name || fId;
        const firstCell = document.createElement("td");
        firstCell.textContent = fridgeLabel;
        row.appendChild(firstCell);

        dates.forEach(d => {
            const cell = document.createElement("td");
            const val = matrix[fId]?.[d] || 0;

            if (val === 0) {
                cell.className = "heatmap-cell-empty";
                cell.textContent = "";
            } else {
                const intensity = val / maxVal;
                const bg = `rgba(68, 157, 255, ${0.2 + 0.8 * intensity})`;
                cell.className = "heatmap-cell";
                cell.style.background = bg;
                cell.textContent = val;

                cell.addEventListener("click", async () => {
                    await drillDownByFridgeAndDate(fId, d);
                });
            }

            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);
}

/* ------------------------------
   Drilldown loaders
--------------------------------*/
async function drillDownByDrink(drinkId) {
    if (!selectedEventIds.length) return;

    document.getElementById("detail-title").textContent =
        "Details for drink: " + (lookupDrinks[drinkId] || "Unknown") + " (all selected events)";

    let q = supabase
        .from("fridge_log_entries")
        .select("*")
        .eq("drink_type_id", drinkId)
        .order("created_at", { ascending: false })
        .limit(500);

    q = applyEventFilter(q);

    const { data } = await q;
    setDrillData(data);
}

async function drillDownByFridge(fridgeId) {
    if (!selectedEventIds.length) return;

    document.getElementById("detail-title").textContent =
        "Details for fridge: " + (lookupFridges[fridgeId]?.name || "Unknown") + " (all selected events)";

    let q = supabase
        .from("fridge_log_entries")
        .select("*")
        .eq("fridge_id", fridgeId)
        .order("created_at", { ascending: false })
        .limit(500);

    q = applyEventFilter(q);

    const { data } = await q;
    setDrillData(data);
}

async function drillDownByDate(date) {
    if (!selectedEventIds.length) return;

    document.getElementById("detail-title").textContent =
        "Details for date: " + date + " (all selected events)";

    let q = supabase
        .from("fridge_log_entries")
        .select("*")
        .gte("created_at", date + " 00:00:00")
        .lte("created_at", date + " 23:59:59")
        .order("created_at", { ascending: false })
        .limit(500);

    q = applyEventFilter(q);

    const { data } = await q;
    setDrillData(data);
}

async function drillDownByFridgeAndDate(fridgeId, dateKey) {
    if (!selectedEventIds.length) return;

    const fridgeLabel = lookupFridges[fridgeId]?.name || "Unknown";
    document.getElementById("detail-title").textContent =
        `Details for fridge: ${fridgeLabel} on ${dateKey} (selected events)`;

    let q = supabase
        .from("fridge_log_entries")
        .select("*")
        .eq("fridge_id", fridgeId)
        .gte("created_at", dateKey + " 00:00:00")
        .lte("created_at", dateKey + " 23:59:59")
        .order("created_at", { ascending: false })
        .limit(500);

    q = applyEventFilter(q);

    const { data } = await q;
    setDrillData(data);
}

/* ------------------------------
   Drilldown core: set data, filters, sort
--------------------------------*/
function setDrillData(rows) {
    drillRawRows = rows || [];

    drillFilters.eventId = "";
    drillFilters.fridgeId = "";
    drillFilters.drinkId = "";
    drillFilters.action = "";
    drillFilters.search = "";

    updateDrillFilterOptions();
    applyDrillFiltersAndRender();
    scrollToDrilldown();
}

/* ------------------------------
   Drilldown filter UI
--------------------------------*/
function setupDrillFilterListeners() {
    document.getElementById("drill-filter-event").addEventListener("change", e => {
        drillFilters.eventId = e.target.value;
        applyDrillFiltersAndRender();
    });

    document.getElementById("drill-filter-fridge").addEventListener("change", e => {
        drillFilters.fridgeId = e.target.value;
        applyDrillFiltersAndRender();
    });

    document.getElementById("drill-filter-drink").addEventListener("change", e => {
        drillFilters.drinkId = e.target.value;
        applyDrillFiltersAndRender();
    });

    document.getElementById("drill-filter-action").addEventListener("change", e => {
        drillFilters.action = e.target.value;
        applyDrillFiltersAndRender();
    });

    document.getElementById("drill-filter-search").addEventListener("input", e => {
        drillFilters.search = e.target.value.toLowerCase();
        applyDrillFiltersAndRender();
    });
}

function updateDrillFilterOptions() {
    const eventSelect = document.getElementById("drill-filter-event");
    const fridgeSelect = document.getElementById("drill-filter-fridge");
    const drinkSelect = document.getElementById("drill-filter-drink");

    eventSelect.innerHTML = '<option value="">All events</option>';
    fridgeSelect.innerHTML = '<option value="">All fridges</option>';
    drinkSelect.innerHTML = '<option value="">All drinks</option>';

    const eventSet = new Set();
    const fridgeSet = new Set();
    const drinkSet = new Set();

    drillRawRows.forEach(r => {
        if (r.event_id) eventSet.add(r.event_id);
        if (r.fridge_id) fridgeSet.add(r.fridge_id);
        if (r.drink_type_id) drinkSet.add(r.drink_type_id);
    });

    Array.from(eventSet).forEach(id => {
        const opt = document.createElement("option");
        opt.value = id;
        const ev = lookupEvents[id];
        opt.textContent = ev ? (ev.name || id) : id;
        eventSelect.appendChild(opt);
    });

    Array.from(fridgeSet).forEach(id => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = lookupFridges[id]?.name || id;
        fridgeSelect.appendChild(opt);
    });

    Array.from(drinkSet).forEach(id => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = lookupDrinks[id] || id;
        drinkSelect.appendChild(opt);
    });
}

/* ------------------------------
   Drilldown sorting (header clicks)
--------------------------------*/
function setupSortHeaderListeners() {
    const headers = document.querySelectorAll("#detail-table thead th.sortable-header");

    headers.forEach(th => {
        th.addEventListener("click", () => {
            const col = th.getAttribute("data-sort");
            if (drillSort.column === col) {
                drillSort.direction = drillSort.direction === "asc" ? "desc" : "asc";
            } else {
                drillSort.column = col;
                if (col === "time" || col === "amount") {
                    drillSort.direction = "desc";
                } else {
                    drillSort.direction = "asc";
                }
            }
            updateSortIndicators();
            applyDrillFiltersAndRender();
        });
    });

    updateSortIndicators();
}

function updateSortIndicators() {
    const headers = document.querySelectorAll("#detail-table thead th.sortable-header");
    headers.forEach(th => {
        const col = th.getAttribute("data-sort");
        const span = th.querySelector(".sort-indicator");
        if (!span) return;
        if (col === drillSort.column) {
            span.textContent = drillSort.direction === "asc" ? "▲" : "▼";
        } else {
            span.textContent = "";
        }
    });
}

/* ------------------------------
   Drilldown: apply filters + sort + render
--------------------------------*/
function applyDrillFiltersAndRender() {
    const tbody = document.getElementById("detail-body");
    tbody.innerHTML = "";

    if (!drillRawRows.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:8px;">No entries found.</td></tr>`;
        return;
    }

    let rows = drillRawRows.filter(r => {
        if (drillFilters.eventId && r.event_id !== drillFilters.eventId) return false;
        if (drillFilters.fridgeId && r.fridge_id !== drillFilters.fridgeId) return false;
        if (drillFilters.drinkId && r.drink_type_id !== drillFilters.drinkId) return false;
        if (drillFilters.action && r.action_type !== drillFilters.action) return false;

        if (drillFilters.search) {
            const timeStr = new Date(r.created_at).toLocaleString().toLowerCase();
            const eventStr = (lookupEvents[r.event_id]?.name || "").toLowerCase();
            const fridgeStr = (lookupFridges[r.fridge_id]?.name || "").toLowerCase();
            const drinkStr = (lookupDrinks[r.drink_type_id] || "").toLowerCase();
            const actionStr = (r.action_type || "").toLowerCase();

            const text = `${timeStr} ${eventStr} ${fridgeStr} ${drinkStr} ${actionStr}`;
            if (!text.includes(drillFilters.search)) return false;
        }

        return true;
    });

    rows.sort((a, b) => {
        let av, bv;

        switch (drillSort.column) {
            case "time":
                av = new Date(a.created_at).getTime();
                bv = new Date(b.created_at).getTime();
                break;
            case "event":
                av = (lookupEvents[a.event_id]?.name || "").toLowerCase();
                bv = (lookupEvents[b.event_id]?.name || "").toLowerCase();
                break;
            case "fridge":
                av = (lookupFridges[a.fridge_id]?.name || "").toLowerCase();
                bv = (lookupFridges[b.fridge_id]?.name || "").toLowerCase();
                break;
            case "drink":
                av = (lookupDrinks[a.drink_type_id] || "").toLowerCase();
                bv = (lookupDrinks[b.drink_type_id] || "").toLowerCase();
                break;
            case "action":
                av = (a.action_type || "").toLowerCase();
                bv = (b.action_type || "").toLowerCase();
                break;
            case "amount":
                av = a.amount || 0;
                bv = b.amount || 0;
                break;
            default:
                av = 0;
                bv = 0;
        }

        if (av < bv) return drillSort.direction === "asc" ? -1 : 1;
        if (av > bv) return drillSort.direction === "asc" ? 1 : -1;
        return 0;
    });

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:8px;">No entries match filters.</td></tr>`;
        return;
    }

    rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #2a2d35";

        const d = new Date(r.created_at).toLocaleString();
        const eventName = lookupEvents[r.event_id]?.name || "Unknown";
        const fridge = lookupFridges[r.fridge_id]?.name || "Unknown";
        const drink = lookupDrinks[r.drink_type_id] || "Unknown";

        tr.innerHTML = `
            <td style="padding:8px;">${d}</td>
            <td style="padding:8px;">${eventName}</td>
            <td style="padding:8px;">${fridge}</td>
            <td style="padding:8px;">${drink}</td>
            <td style="padding:8px;">${r.action_type}</td>
            <td style="padding:8px;">${r.amount}</td>
        `;
        tbody.appendChild(tr);
    });
}

/* ------------------------------
   Export CSV (consumption)
--------------------------------*/
async function exportCsv() {
    if (!selectedEventIds.length) {
        alert("No event selected.");
        return;
    }

    let q = supabase
        .from("event_consumption_summary")
        .select("*");
    q = applyEventFilter(q);

    if (lastDateFrom) q = q.gte("log_date", lastDateFrom);
    if (lastDateTo) q = q.lte("log_date", lastDateTo);

    const { data } = await q;

    if (!data?.length) {
        alert("No data to export for this selection.");
        return;
    }

    const rows = [];
    rows.push(["log_date", "event", "fridge", "floor", "drink", "consumption"]);

    data.forEach(r => {
        const evName = lookupEvents[r.event_id]?.name || "";
        const fridgeInfo = lookupFridges[r.fridge_id];
        const fridgeName = fridgeInfo?.name || "";
        const floorName = fridgeInfo ? (lookupFloors[fridgeInfo.floor_id] || "") : "";
        const drinkName = lookupDrinks[r.drink_type_id] || "";
        const cons = r.net_change || 0;

        rows.push([
            r.log_date,
            evName,
            fridgeName,
            floorName,
            drinkName,
            cons
        ]);
    });

    const csv = rows
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "event_consumption.csv";
    a.click();

    URL.revokeObjectURL(url);
}

/* ------------------------------
   Export PDF (consolidated across selected events)
--------------------------------*/
async function exportPdf() {
    if (!selectedEventIds.length) {
        alert("No event selected.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const eventNames = selectedEventIds
        .map(id => lookupEvents[id]?.name || id)
        .join(", ");

    doc.setFontSize(18);
    doc.text("Event Drinks Report (Consolidated)", 14, 18);

    doc.setFontSize(12);
    doc.text(`Events: ${eventNames}`, 14, 28);

    if (lastDateFrom || lastDateTo) {
        let range = "Date Range: ";
        range += lastDateFrom ? lastDateFrom : "...";
        range += " to ";
        range += lastDateTo ? lastDateTo : "...";
        doc.text(range, 14, 34);
    }

    const totalConsumption = lastTotalsData.reduce(
        (acc, t) => acc + (t.total_consumption || 0),
        0
    );
    doc.text(`Total Consumption (all drinks, all selected events): ${totalConsumption}`, 14, 42);

    // Table 1: By drink type (aggregated)
    const drinkMap = {};
    lastTotalsData.forEach(r => {
        const id = r.drink_type_id;
        drinkMap[id] = (drinkMap[id] || 0) + (r.total_consumption || 0);
    });

    const drinkBody = Object.keys(drinkMap).map(id => [
        lookupDrinks[id] || "Unknown",
        drinkMap[id]
    ]);

    doc.autoTable({
        startY: 50,
        head: [["Drink", "Total Consumption"]],
        body: drinkBody,
        theme: "grid",
        styles: { fontSize: 10 }
    });

    // Table 2: By floor (aggregated)
    const floorMap = {};
    lastSummaryData.forEach(r => {
        const fridgeInfo = lookupFridges[r.fridge_id];
        const floorName = fridgeInfo ? (lookupFloors[fridgeInfo.floor_id] || "Unknown Floor") : "Unknown Floor";
        floorMap[floorName] = (floorMap[floorName] || 0) + (r.net_change || 0);
    });

    const floorBody = Object.keys(floorMap).map(name => [
        name,
        floorMap[name]
    ]);

    doc.autoTable({
        head: [["Floor", "Total Consumption"]],
        body: floorBody,
        theme: "grid",
        styles: { fontSize: 10 },
        startY: doc.lastAutoTable.finalY + 8
    });

    const finalY = doc.lastAutoTable.finalY + 14;
    doc.setFontSize(9);
    doc.text("Generated by Drinks Tracker Dashboard (multi-event)", 14, finalY);

    doc.save("event_report.pdf");
}





