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
// ADD EVENT
// -------------------------
document.getElementById("event-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("event-name").value;
    const event_date = document.getElementById("event-date").value;
    const owned_by = document.getElementById("event-owned-by").value;
    const owned_by_other_input = document.getElementById("event-owned-by-other");

    let owned_by_other = null;

    if (owned_by === "Other") {
        owned_by_other = owned_by_other_input.value.trim();
    }

    const { error } = await supabase
        .from("events")
        .insert([{ name, event_date, owned_by, owned_by_other }]);

    if (error) {
        console.error("❌ Error inserting event:", error);
        document.getElementById("event-status").textContent = "❌ Error adding event";
        document.getElementById("event-status").className = "error";
        return;
    }

    document.getElementById("event-status").textContent = "✅ Event added!";
    document.getElementById("event-status").className = "success";

    document.getElementById("event-form").reset();
    owned_by_other_input.style.display = "none";
});


// -------------------------
// SHOW OTHER INPUT IF NEEDED
// -------------------------
document.getElementById("event-owned-by").addEventListener("change", () => {
    const dropdown = document.getElementById("event-owned-by");
    const otherField = document.getElementById("event-owned-by-other");

    if (dropdown.value === "Other") {
        otherField.style.display = "block";
    } else {
        otherField.style.display = "none";
        otherField.value = "";
    }
});


// -------------------------
// ADD FLOOR
// -------------------------
document.getElementById("floor-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("floor-name").value;

    const { error } = await supabase
        .from("floors")
        .insert([{ name }]);

    if (error) {
        console.error("❌ Error inserting floor:", error);
        document.getElementById("floor-status").textContent = "❌ Error adding floor";
        document.getElementById("floor-status").className = "error";
        return;
    }

    document.getElementById("floor-status").textContent = "✅ Floor added!";
    document.getElementById("floor-status").className = "success";

    document.getElementById("floor-form").reset();
    loadFloors();
});


// -------------------------
// ADD FRIDGE
// -------------------------
document.getElementById("fridge-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("fridge-name").value;
    const floor_id = document.getElementById("fridge-floor").value;

    const { error } = await supabase
        .from("fridges")
        .insert([{ name, floor_id }]);

    if (error) {
        console.error("❌ Error inserting fridge:", error);
        document.getElementById("fridge-status").textContent = "❌ Error adding fridge";
        document.getElementById("fridge-status").className = "error";
        return;
    }

    document.getElementById("fridge-status").textContent = "✅ Fridge added!";
    document.getElementById("fridge-status").className = "success";

    document.getElementById("fridge-form").reset();
});


// -------------------------
// ADD DRINK TYPE
// -------------------------
document.getElementById("drink-type-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("drink-type-name").value;

    const { error } = await supabase
        .from("drink_types")
        .insert([{ name }]);

    if (error) {
        console.error("❌ Error inserting drink type:", error);
        document.getElementById("drink-type-status").textContent = "❌ Error adding drink type";
        document.getElementById("drink-type-status").className = "error";
        return;
    }

    document.getElementById("drink-type-status").textContent = "✅ Drink type added!";
    document.getElementById("drink-type-status").className = "success";

    document.getElementById("drink-type-form").reset();
});









