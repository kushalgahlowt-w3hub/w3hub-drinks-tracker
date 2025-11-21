// deliveries.js
// Admin-only Deliveries & Storage view

let drinkTypesById = {};

// -----------------------------
// INIT
// -----------------------------
document.addEventListener("DOMContentLoaded", () => {
  initDeliveries().catch((err) => {
    console.error("Init error:", err);
  });
});

async function initDeliveries() {
  setupUnitsPreview();
  setDefaultDateToday();

  await loadDrinkTypes();
  await loadRecentDeliveries();
  await loadStorageSnapshot();

  document
    .getElementById("delivery-form")
    .addEventListener("submit", handleDeliverySubmit);
}

// -----------------------------
// HELPERS
// -----------------------------
function setDefaultDateToday() {
  const input = document.getElementById("delivery-date");
  const t = new Date();
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  input.value = `${yyyy}-${mm}-${dd}`;
}

function setupUnitsPreview() {
  const crates = document.getElementById("crates");
  const units = document.getElementById("units-per-crate");
  const extra = document.getElementById("extra-units");
  const preview = document.getElementById("units-preview");

  function calc() {
    const c = parseInt(crates.value || 0);
    const u = parseInt(units.value || 0);
    const e = parseInt(extra.value || 0);
    preview.textContent = `Total units: ${c * u + e}`;
  }

  crates.addEventListener("input", calc);
  units.addEventListener("input", calc);
  extra.addEventListener("input", calc);
  calc();
}

// -----------------------------
// LOAD DRINK TYPES
// -----------------------------
async function loadDrinkTypes() {
  const dropdown = document.getElementById("drink-type");
  dropdown.innerHTML = "";

  const { data, error } = await supabase
    .from("drink_types")
    .select("*")
    .order("name");

  if (error) {
    dropdown.innerHTML = "<option>Error loading</option>";
    return;
  }

  data.forEach((d) => {
    drinkTypesById[d.id] = d;
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.name;
    dropdown.appendChild(opt);
  });
}

// -----------------------------
// SUBMIT DELIVERY
// -----------------------------
async function handleDeliverySubmit(e) {
  e.preventDefault();

  const status = document.getElementById("delivery-status");
  status.textContent = "";
  status.className = "status-text";

  const payload = {
    delivery_date: document.getElementById("delivery-date").value,
    ordered_by: document.getElementById("ordered-by").value,
    supplier: document.getElementById("supplier").value.trim() || null,
    drink_type_id: document.getElementById("drink-type").value,
    crates: parseInt(document.getElementById("crates").value || 0),
    units_per_crate: parseInt(document.getElementById("units-per-crate").value || 24),
    extra_units: parseInt(document.getElementById("extra-units").value || 0),
    pfand_returned: parseInt(document.getElementById("pfand-returned").value || 0),
  };

  if (!payload.delivery_date || !payload.ordered_by || !payload.drink_type_id) {
    status.textContent = "❌ Missing required fields.";
    status.classList.add("error");
    return;
  }

  const { error } = await supabase.from("deliveries").insert([payload]);

  if (error) {
    console.error(error);
    status.textContent = "❌ Error saving delivery.";
    status.classList.add("error");
    return;
  }

  status.textContent = "✅ Saved!";
  status.classList.add("success");

  // reset numeric fields
  document.getElementById("supplier").value = "";
  document.getElementById("crates").value = 0;
  document.getElementById("units-per-crate").value = 24;
  document.getElementById("extra-units").value = 0;
  document.getElementById("pfand-returned").value = 0;

  setupUnitsPreview();

  await loadRecentDeliveries();
  await loadStorageSnapshot();
}

// -----------------------------
// RECENT DELIVERIES
// -----------------------------
async function loadRecentDeliveries() {
  const tbody = document.getElementById("deliveries-body");
  tbody.innerHTML = "";

  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .order("delivery_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    tbody.innerHTML =
      "<tr><td colspan='9'>Error loading deliveries.</td></tr>";
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML =
      "<tr><td colspan='9'>No deliveries logged yet.</td></tr>";
    return;
  }

  data.forEach((row) => {
    const drink = drinkTypesById[row.drink_type_id];
    const drinkName = drink ? drink.name : "(unknown)";

    const totalUnits =
      (row.crates || 0) * (row.units_per_crate || 0) +
      (row.extra_units || 0);

    const tr = document.createElement("tr");

    addCell(tr, row.delivery_date);
    addCell(tr, row.ordered_by);
    addCell(tr, row.supplier || "");
    addCell(tr, drinkName);
    addCell(tr, row.crates || 0);
    addCell(tr, row.units_per_crate || 0);
    addCell(tr, row.extra_units || 0);
    addCell(tr, row.pfand_returned || 0);
    addCell(tr, totalUnits);

    tbody.appendChild(tr);
  });
}

function addCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text;
  tr.appendChild(td);
}

// -----------------------------
// STORAGE SNAPSHOT
// -----------------------------
async function loadStorageSnapshot() {
  const tbody = document.getElementById("storage-body");
  tbody.innerHTML = "";

  // 1. Total delivered units
  const { data: deliveries } = await supabase.from("deliveries").select("*");
  const delivered = {};

  (deliveries || []).forEach((d) => {
    const units = (d.crates || 0) * (d.units_per_crate || 0) + (d.extra_units || 0);
    delivered[d.drink_type_id] = (delivered[d.drink_type_id] || 0) + units;
  });

  // 2. Consumption data
  const { data: logs } = await supabase.from("fridge_log_entries").select("*");
  const consumed = {};

  (logs || []).forEach((log) => {
    let delta = 0;
    if (log.action_type === "start" || log.action_type === "restock") delta = log.amount;
    if (log.action_type === "end") delta = -log.amount;

    consumed[log.drink_type_id] = (consumed[log.drink_type_id] || 0) + delta;
  });

  // 3. Combine
  const drinkIds = new Set([...Object.keys(delivered), ...Object.keys(consumed)]);

  if (drinkIds.size === 0) {
    tbody.innerHTML =
      "<tr><td colspan='4'>No data yet.</td></tr>";
    return;
  }

  drinkIds.forEach((id) => {
    const drink = drinkTypesById[id];
    const name = drink ? drink.name : "(unknown)";

    const d = delivered[id] || 0;
    const c = consumed[id] || 0;
    const storage = Math.max(d - c, 0);

    const tr = document.createElement("tr");
    addCell(tr, name);
    addCell(tr, d);
    addCell(tr, c);
    addCell(tr, storage);
    tbody.appendChild(tr);
  });
}
