/* ----------------------------------------------------------
   dashboard.js — FINAL VERSION (Safe for Production)
   Features added:
   ✔ Add Event (with owned_by + owned_by_other)
   ✔ List Events (name, date, owner, status)
   ✔ Close Event (soft-lock)
   ✔ Add Floors
   ✔ Add Fridges
   ✔ Add Drink Types
----------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    initDashboard().catch(err => {
        console.error("Dashboard init error:", err);
    });
});

/* ----------------------------------------------------------
   INITIALISATION
----------------------------------------------------------- */
async function initDashboard() {
    await loadFloorsDropdown();
    await loadEventsList();

    // Attach form handlers
    document.getElementById("event-form")?.addEventListener("submit", handleCreateEvent);
    document.getElementById("floor-form")?.addEventListener("submit", handleCreateFloor);
    document.getElementById("fridge-form")?.addEventListener("submit", handleCreateFridge);
    document.getElementById("drink-type-form")?.addEventListener("submit", handleCreateDrinkType);

    // Show "Other owner" textbox
    const ownedSelect = document.getElementById("event-owned-by");
    const ownedOther = document.getElementById("event-owned-by-other");
    if (ownedSelect && ownedOther) {
        ownedSelect.addEventListener("change", () => {
            ownedOther.style.display = ownedSelect.value === "Other" ? "block" : "none";
        });
    }
}

/* ----------------------------------------------------------
   1) CREATE EVENT
----------------------------------------------------------- */
async function handleCreateEvent(e) {
    e.preventDefault();

    const name = document.getElementById("event-name").value.trim();
    const date = document.getElementById("event-date").value;
    const ownedBy = document.getElementById("event-owned-by").value;
    const ownedByOther = document.getElementById("event-owned-by-other").value.trim();

    const statusEl = document.getElementById("event-status");
    statusEl.textContent = "";

    if (!name || !date) {
        statusEl.textContent = "❌ Name and date are required.";
        statusEl.classList.add("error");
        return;
    }

    let finalOwner = ownedBy;
    if (ownedBy === "Other") {
        if (!ownedByOther) {
            statusEl.textContent = "❌ Please specify owner.";
            statusEl.classList.add("error");
            return;
        }
        finalOwner = ownedByOther;
    }

    const { error } = await supabase
        .from("events")
        .insert([{
            name,
            event_date: date,
            owned_by: finalOwner,
            status: "open"     // Default
        }]);

    if (error) {
        console.error("Create event error:", error);
        statusEl.textContent = "❌ Error creating event.";
        statusEl.classList.add("error");
        return;
    }

    statusEl.textContent = "✅ Event added!";
    statusEl.classList.add("success");

    document.getElementById("event-form").reset();
    document.getElementById("event-owned-by-other").style.display = "none";

    await loadEventsList();
}

/* ----------------------------------------------------------
   2) LOAD EVENTS LIST (with Close Event button)
----------------------------------------------------------- */
async function loadEventsList() {
    const container = document.getElementById("events-list");
    if (!container) return;

    container.innerHTML = "<p>Loading events...</p>";

    const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: false });

    if (error || !data) {
        container.innerHTML = "<p>Error loading events.</p>";
        console.error(error);
        return;
    }

    if (data.length === 0) {
        container.innerHTML = "<p>No events found.</p>";
        return;
    }

    container.innerHTML = "";

    data.forEach(ev => {
        const wrap = document.createElement("div");
        wrap.className = "event-card";

        const statusClass = ev.status === "closed" ? "event-status-closed" : "event-status-open";
        const statusLabel = ev.status === "closed" ? "CLOSED" : "OPEN";

        wrap.innerHTML = `
            <div class="event-header">
                <strong>${ev.name}</strong>
                <span class="${statusClass}">${statusLabel}</span>
            </div>
            <p>Date: ${ev.event_date}</p>
            <p>Owned By: <strong>${ev.owned_by || "Unknown"}</strong></p>
            ${
                ev.status === "open"
                ? `<button class="close-btn" onclick="closeEvent(${ev.id})">Close Event</button>`
                : `<div class="closed-tag">Event Locked</div>`
            }
        `;

        container.appendChild(wrap);
    });
}

/* ----------------------------------------------------------
   3) CLOSE EVENT (Soft Lock)
----------------------------------------------------------- */
async function closeEvent(eventId) {
    const ok = confirm("Are you sure? Closing an event will disable edits & deletions.");
    if (!ok) return;

    const { error } = await supabase
        .from("events")
        .update({ status: "closed" })
        .eq("id", eventId);

    if (error) {
        console.error("Close event error:", error);
        alert("❌ Error closing event.");
        return;
    }

    await loadEventsList();
}

/* ----------------------------------------------------------
   4) ADD FLOOR
----------------------------------------------------------- */
async function handleCreateFloor(e) {
    e.preventDefault();
    const name = document.getElementById("floor-name").value.trim();
    const statusEl = document.getElementById("floor-status");

    if (!name) {
        statusEl.textContent = "❌ Floor name required.";
        statusEl.classList.add("error");
        return;
    }

    const { error } = await supabase
        .from("floors")
        .insert([{ name }]);

    if (error) {
        console.error("Floor error:", error);
        statusEl.textContent = "❌ Error adding floor.";
        statusEl.classList.add("error");
        return;
    }

    statusEl.textContent = "✅ Floor added!";
    statusEl.classList.add("success");

    document.getElementById("floor-form").reset();
    await loadFloorsDropdown();
}

/* ----------------------------------------------------------
   5) FLOORS DROPDOWN FOR FRIDGES
----------------------------------------------------------- */
async function loadFloorsDropdown() {
    const el = document.getElementById("fridge-floor");
    if (!el) return;

    const { data, error } = await supabase.from("floors").select("*");

    if (error || !data) {
        el.innerHTML = "<option>Error loading floors</option>";
        return;
    }

    el.innerHTML = data.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
}

/* ----------------------------------------------------------
   6) ADD FRIDGE
----------------------------------------------------------- */
async function handleCreateFridge(e) {
    e.preventDefault();

    const name = document.getElementById("fridge-name").value.trim();
    const floor = document.getElementById("fridge-floor").value;
    const statusEl = document.getElementById("fridge-status");

    if (!name || !floor) {
        statusEl.textContent = "❌ Fridge name & floor are required.";
        statusEl.classList.add("error");
        return;
    }

    const { error } = await supabase
        .from("fridges")
        .insert([{ name, floor_id: floor }]);

    if (error) {
        console.error(error);
        statusEl.textContent = "❌ Error adding fridge.";
        statusEl.classList.add("error");
        return;
    }

    statusEl.textContent = "✅ Fridge added!";
    statusEl.classList.add("success");

    document.getElementById("fridge-form").reset();
}

/* ----------------------------------------------------------
   7) ADD DRINK TYPE
----------------------------------------------------------- */
async function handleCreateDrinkType(e) {
    e.preventDefault();
    const name = document.getElementById("drink-type-name").value.trim();
    const statusEl = document.getElementById("drink-type-status");

    if (!name) {
        statusEl.textContent = "❌ Drink name required.";
        statusEl.classList.add("error");
        return;
    }

    const { error } = await supabase
        .from("drink_types")
        .insert([{ name }]);

    if (error) {
        console.error(error);
        statusEl.textContent = "❌ Error adding drink type.";
        statusEl.classList.add("error");
        return;
    }

    statusEl.textContent = "✅ Drink type added!";
    statusEl.classList.add("success");

    document.getElementById("drink-type-form").reset();
}








