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

  data.forEach((floor) => {
    const option = document.createElement("option");
    option.value = floor.id;
    option.textContent = floor.name;
    dropdown.appendChild(option);
  });
}

loadFloors();

// -------------------------
// OWNED BY: SHOW/HIDE "OTHER" INPUT
// -------------------------
const ownedBySelect = document.getElementById("event-owned-by");
const ownedByOtherInput = document.getElementById("event-owned-by-other");

if (ownedBySelect && ownedByOtherInput) {
  ownedBySelect.addEventListener("change", (e) => {
    if (e.target.value === "Other") {
      ownedByOtherInput.style.display = "block";
    } else {
      ownedByOtherInput.style.display = "none";
      ownedByOtherInput.value = "";
    }
  });
}

// -------------------------
// ADD EVENT
// -------------------------
document.getElementById("event-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("event-name").value;
  const event_date = document.getElementById("event-date").value;
  const owned_by = document.getElementById("event-owned-by").value;
  let owned_by_other = null;

  if (owned_by === "Other") {
    owned_by_other = ownedByOtherInput.value.trim() || null;
  }

  const { error } = await supabase.from("events").insert([
    { name, event_date, owned_by, owned_by_other },
  ]);

  if (error) {
    console.error("❌ Error inserting event:", error);
    const status = document.getElementById("event-status");
    status.textContent = "❌ Error adding event";
    status.className = "error";
    return;
  }

  const status = document.getElementById("event-status");
  status.textContent = "✅ Event added!";
  status.className = "success";

  document.getElementById("event-form").reset();
  // reset Owned By to default and hide "Other" field
  ownedBySelect.value = "w3.hub";
  ownedByOtherInput.style.display = "none";
  ownedByOtherInput.value = "";
});

// -------------------------
// ADD FLOOR
// -------------------------
document.getElementById("floor-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("floor-name").value;

  const { error } = await supabase.from("floors").insert([{ name }]);

  if (error) {
    console.error("❌ Error inserting floor:", error);
    const status = document.getElementById("floor-status");
    status.textContent = "❌ Error adding floor";
    status.className = "error";
    return;
  }

  const status = document.getElementById("floor-status");
  status.textContent = "✅ Floor added!";
  status.className = "success";

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

  const { error } = await supabase.from("fridges").insert([{ name, floor_id }]);

  if (error) {
    console.error("❌ Error inserting fridge:", error);
    const status = document.getElementById("fridge-status");
    status.textContent = "❌ Error adding fridge";
    status.className = "error";
    return;
  }

  const status = document.getElementById("fridge-status");
  status.textContent = "✅ Fridge added!";
  status.className = "success";

  document.getElementById("fridge-form").reset();
});

// -------------------------
// ADD DRINK TYPE
// -------------------------
document
  .getElementById("drink-type-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("drink-type-name").value;

    const { error } = await supabase.from("drink_types").insert([{ name }]);

    if (error) {
      console.error("❌ Error inserting drink type:", error);
      const status = document.getElementById("drink-type-status");
      status.textContent = "❌ Error adding drink type";
      status.className = "error";
      return;
    }

    const status = document.getElementById("drink-type-status");
    status.textContent = "✅ Drink type added!";
    status.className = "success";

    document.getElementById("drink-type-form").reset();
  });



