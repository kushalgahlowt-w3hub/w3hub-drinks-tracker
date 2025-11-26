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
// SHOW/HIDE "OTHER OWNER"
// -------------------------
document.getElementById("event-owned-by").addEventListener("change", (e) => {
    const otherField = document.getElementById("event-owned-by-other");
    otherField.style.display = e.target.value === "Other" ? "block" : "none";
});


// -------------------------
// ADD EVENT — NOW WITH OWNERSHIP
// -------------------------
document.getElementById("event-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("event-name").value;
    const event_date = document.getElementById("event-date").value;
    const owned_by = document.getElementById("event-owned-by").value;

    let owned_by_other = null;
    if (owned_by === "Other") {
        owned_by_other = document.getElementById("event-owned-by-other").value.trim();
    }

    const { error } = await supabase
        .from("events")
        .insert([{ name, event_date, owned_by, owned_by_other }]);

    if (error) {
        console.error("❌ Error inserting event:", error);
        document.getElementById("event-status").textContent = "❌ Error adding event";
        return;
    }

    document.getElementById("event-status").textContent = "✅ Event added!";
    document.getElementById("event-form").reset();
    document.getElementById("event-owned-by-other").style.display = "none";
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
        return;
    }

    document.getElementById("floor-status").textContent = "✅ Floor added!";
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
        return;
    }

    document.getElementById("fridge-status").textContent = "✅ Fridge added!";
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
        return;
    }

    document.getElementById("drink-type-status").textContent = "✅ Drink type added!";
    document.getElementById("drink-type-form").reset();
});




