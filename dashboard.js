// ------------------------------
// Admin Reports JS (Updated)
// ------------------------------

console.log("%cadmin_reports.js loaded", "color:#4caf50;font-weight:bold;");

// Supabase
const SUPABASE_URL = "https://trcnszlkdunbbybdyjag.supabase.co";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyY25zemxrZHVuYmJ5YmR5amFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzODM4MTYsImV4cCI6MjA3ODk1OTgxNn0.wCAAHfsBOeU6rp4v_7JhdMI9NlucX1cT1_3GTZ0GR8M";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM
const eventCheckboxesContainer = document.getElementById("event-checkboxes");
const applyEventFilterBtn = document.getElementById("apply-event-filter");
const eventStatusBox = document.getElementById("event-status-box");

// Active selected events
let selectedEventIds = [];

// ------------------------------
// LOAD EVENTS FOR CHECKBOX LIST
// ------------------------------
async function loadEventCheckboxes() {
    const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: false });

    if (error) {
        console.error("Error loading events:", error);
        return;
    }

    eventCheckboxesContainer.innerHTML = "";

    data.forEach(ev => {
        const div = document.createElement("div");
        div.className = "checkbox-item";

        div.innerHTML = `
            <label>
                <input type="checkbox" value="${ev.id}">
                ${ev.name} (${ev.status})
            </label>
        `;

        eventCheckboxesContainer.appendChild(div);
    });
}

// ------------------------------
// FETCH EVENT DETAILS FOR STATUS BOX
// ------------------------------
async function fetchEventMeta(eventId) {
    const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

    if (error) {
        console.error("Error fetching event meta:", error);
        return null;
    }

    return data;
}

// ------------------------------
// RENDER EVENT STATUS BOX
// ------------------------------
async function renderEventStatusBox() {
    if (selectedEventIds.length !== 1) {
        eventStatusBox.style.display = "none";
        return;
    }

    const evId = selectedEventIds[0];
    const ev = await fetchEventMeta(evId);

    if (!ev) return;

    const isClosed = ev.status === "closed";

    eventStatusBox.style.display = "block";
    eventStatusBox.innerHTML = `
        <div style="
            background:#1e1e1e;
            padding:15px;
            border-radius:8px;
            border:1px solid #333;
        ">
            <strong>Event:</strong> ${ev.name}<br>
            <strong>Date:</strong> ${ev.event_date}<br>
            <strong>Owned by:</strong> ${ev.owned_by}<br>
            <strong>Status:</strong> 
                <span style="color:${isClosed ? '#ff5252' : '#4caf50'};font-weight:bold;">
                    ${isClosed ? "CLOSED 🔒" : "OPEN"}
                </span>
            <br><br>

            ${
                isClosed
                    ? `<button id="reopen-event-btn" class="btn-primary" style="background:#2ecc71;">Re-open Event</button>`
                    : `<button id="close-event-btn" class="btn-primary" style="background:#e53935;">Close Event</button>`
            }
        </div>
    `;

    // Attach event listeners
    if (!isClosed) {
        document
            .getElementById("close-event-btn")
            .addEventListener("click", () => closeEvent(evId));
    } else {
        document
            .getElementById("reopen-event-btn")
            .addEventListener("click", () => reopenEvent(evId));
    }
}

// ------------------------------
// CLOSE EVENT (Admin Only)
// ------------------------------
async function closeEvent(eventId) {
    const confirmClose = confirm(
        "Are you sure you want to CLOSE this event?\nRunners will no longer be able to edit/delete logs."
    );

    if (!confirmClose) return;

    const { error } = await supabase
        .from("events")
        .update({ status: "closed" })
        .eq("id", eventId);

    if (error) {
        alert("Error closing event.");
        console.error(error);
        return;
    }

    await refreshAnalytics();
}

// ------------------------------
// RE-OPEN EVENT
// ------------------------------
async function reopenEvent(eventId) {
    const confirmOpen = confirm(
        "Re-open this event?\nRunners will be able to edit/delete their logs again."
    );

    if (!confirmOpen) return;

    const { error } = await supabase
        .from("events")
        .update({ status: "open" })
        .eq("id", eventId);

    if (error) {
        alert("Error reopening.");
        console.error(error);
        return;
    }

    await refreshAnalytics();
}

// ------------------------------
// APPLY EVENT FILTER
// ------------------------------
applyEventFilterBtn.addEventListener("click", async () => {
    selectedEventIds = [
        ...document.querySelectorAll(
            "#event-checkboxes input[type='checkbox']:checked"
        ),
    ].map(c => c.value);

    await refreshAnalytics();
});

// ------------------------------
// FULL REFRESH (Status box + charts + table)
// ------------------------------
async function refreshAnalytics() {
    await renderEventStatusBox();
    await loadDrilldownTable();
    await loadCharts();
}

// ------------------------------
// (REMOVED FOR BREVITY) — YOUR EXISTING
// loadDrilldownTable(), loadCharts(), CSV/PDF EXPORTS
// They remain unchanged.
// ------------------------------

// INIT
loadEventCheckboxes();









