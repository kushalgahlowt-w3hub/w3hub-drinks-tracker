// dashboard.js
// NOTE: Supabase client is already initialized in dashboard.html

// -------------------------
// LOAD FLOORS INTO DROPDOWN
// -------------------------
async function loadFloors() {
    const { data, error } = await supabase.from("floors").select("*");

    if (error) {
        console.error("❌ Error loading floors:", error);
        return;
    }

    const dropdown = document.getElementById("fridge-floor");
    dropdown.innerHTML = "";

    data.forEach(floor => {
        const option = document.createElement("option");
        option.value = floor.id;
        option.textContent = floor.name;
        dropdown.appendChild(option);
    });
}

loadFloors();


// -------------------------
// ADD EVENT (UPDATED)
// -------------------------
document.getElementById("event-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("event-name").value.trim();
    const event_date = document.getElementById("event-date").value;

    const ownerType = document.getElementById("event-owner-type").value;
    const ownerOther = document.getElementById("event-owner-other").value.trim();

    const statusEl = document.getElementById("event-status");
    statusEl.textContent = "";
    statusEl.className = "status";

    if (!name || !event_date || !ownerType) {
        statusEl.textContent = "❌ Please fill all required fields.";
        statusEl.classList.add("error");
        return;
    }

    let owner_final = ownerType;
    let owner_other_final = null;

    if (ownerType === "Other") {
        if (!ownerOther) {
            statusEl.textContent = "❌ Please specify event owner.";
            statusEl.classList.add("error");
            return;
        }
        owner_final = "Other";
        owner_other_final = ownerOther;
    }

    const { error } = await supabase
        .from("events")
        .insert([
            {
                name,
                event_date,
                event_owner_type: owner_final,
                event_owner_other: owner_other_final
            }
        ]);

    if (error) {
        console.error("❌ Error inserting event:", error);
        statusEl.textContent = "❌ Error adding event.";
        statusEl.classList.add("error");
        return;
    }

    statusEl.textContent = "✅ Event added!";
    statusEl.classList.add("success");

    document.getElementById("event-form").reset();
    document.getElementById("event-owner-other-block").style.display = "none";
});


// -------------------------
// ADD FLOOR
// -------------------------
document.getElementById("floor-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("floor-name").value.trim();

    const { error } = await supabase
        .from("floors")
        .insert([{ name }]);

    const statusEl = document.getElementById("floor-status");

    if (error) {
        console.error("❌ Error inserting floor:", error);
        statusEl.textContent = "❌ Error adding floor";
        statusEl.classList.add("error");
        return;
    }

    statusEl.textContent = "✅ Floor added!";
    statusEl.classList.add("success");

    document.getElementById("floor-form").reset();
    loadFloors();
});


// -------------------------
// ADD FRIDGE
// -------------------------
document.getElementById("fridge-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("fridge-name").value.trim();
    const floor_id = document.getElementById("fridge-floor").value;

    const statusEl = document.getElementById("fridge-status");

    const { error } = await supabase
        .from("fridges")
        .insert([{ name, floor_id }]);

    if (error) {
        console.error("❌ Error inserting fridge:", error);
        statusEl.textContent = "❌ Error adding fridge";
        statusEl.classList.add("error");
        return;
    }

    statusEl.textContent = "✅ Fridge added!";
    statusEl.classList.add("success");

    document.getElementById("fridge-form").reset();
});


// -------------------------
// ADD DRINK TYPE
// -------------------------
document.getElementById("drink-type-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("drink-type-name").value.trim();

    const statusEl = document.getElementById("drink-type-status");

    const { error } = await supabase
        .from("drink_types")
        .insert([{ name }]);

    if (error) {
        console.error("❌ Error inserting drink type:", error);
        statusEl.textContent = "❌ Error adding drink type";
        statusEl.classList.add("error");
        return;
    }

    statusEl.textContent = "✅ Drink type added!";
    statusEl.classList.add("success");

    document.getElementById("drink-type-form").reset();
});


