// storage.js
// Uses global `supabase` created in storage.html

let drinkTypesById = {};

document.addEventListener("DOMContentLoaded", () => {
  initStorage().catch((err) => {
    console.error("Error initialising storage module:", err);
    const s = document.getElementById("delivery-status");
    if (s) {
      s.textContent = "Error initialising storage module.";
      s.classList.add("error");
    }
  });
});

async function initStorage() {
  setDefaultDate();
  await loadDrinkTypes();
  await loadRecentDeliveries();
  await loadStockSummary();

  const form = document.getElementById("delivery-form");
  if (form) {
    form.addEventListener("submit", handleDeliverySubmit);
  }
}

/* ----------------------------------
   Helpers
---------------------------------- */

function setDefaultDate() {
  const input = document.getElementById("delivery-date");
  if (!input) return;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  input.value = `${yyyy}-${mm}-${dd}`;
}

/* ----------------------------------
   Load Drink Types
---------------------------------- */

async function loadDrinkTypes() {
  const dropdown = document.getElementById("delivery-drink-type");
  if (!dropdown) return;
  dropdown.innerHTML = "";

  const { data, error } = await supabase
    .from("drink_types")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error loading drink types:", error);
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Error loading drinks";
    dropdown.appendChild(opt);
    return;
  }

  if (!data || data.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No drink types found";
    dropdown.appendChild(opt);
    return;
  }

  drinkTypesById = {};
  data.forEach((d) => {
    drinkTypesById[d.id] = d;
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.name;
    dropdown.appendChild(opt);
  });
}

/* ----------------------------------
   Handle Delivery Submit
---------------------------------- */

async function handleDeliverySubmit(e) {
  e.preventDefault();

  const status = document.getElementById("delivery-status");
  if (status) {
    status.textContent = "";
    status.className = "status-text";
  }

  const dateEl = document.getElementById("delivery-date");
  const drinkEl = document.getElementById("delivery-drink-type");
  const qtyEl = document.getElementById("delivery-quantity");
  const pfandEl = document.getElementById("delivery-pfand");
  const supplierEl = document.getElementById("delivery-supplier");
  const orderedByEl = document.getElementById("delivery-ordered-by");

  const delivery_date = dateEl?.value;
  const drink_type_id = drinkEl?.value;
  const quantity_delivered = qtyEl?.value;
  const pfand_returned = pfandEl?.value || "0";
  const supplier = supplierEl?.value.trim() || null;
  const ordered_by = orderedByEl?.value.trim() || null;

  if (!delivery_date || !drink_type_id || quantity_delivered === "") {
    if (status) {
      status.textContent = "❌ Please fill in date, drink, and quantity.";
      status.classList.add("error");
    }
    return;
  }

  const qty = parseInt(quantity_delivered, 10);
  const pfand = parseInt(pfand_returned, 10) || 0;

  if (isNaN(qty) || qty < 0) {
    if (status) {
      status.textContent = "❌ Quantity must be a non-negative number.";
      status.classList.add("error");
    }
    return;
  }
  if (pfand < 0) {
    if (status) {
      status.textContent = "❌ Pfand returned cannot be negative.";
      status.classList.add("error");
    }
    return;
  }

  // Insert into deliveries
  const { error } = await supabase.from("deliveries").insert([
    {
      drink_type_id,
      quantity_delivered: qty,
      pfand_returned: pfand,
      supplier,
      ordered_by,
      delivery_date,
    },
  ]);

  if (error) {
    console.error("Error inserting delivery:", error);
    if (status) {
      status.textContent = "❌ Error saving delivery.";
      status.classList.add("error");
    }
    return;
  }

  if (status) {
    status.textContent = "✅ Delivery saved!";
    status.classList.add("success");
  }

  // Reset only some fields (keep date and drink selection)
  if (qtyEl) qtyEl.value = "";
  if (pfandEl) pfandEl.value = "0";
  if (supplierEl) supplierEl.value = "";
  if (orderedByEl) orderedByEl.value = "";

  await loadRecentDeliveries();
  await loadStockSummary();
}

/* ----------------------------------
   Recent Deliveries (last 20)
---------------------------------- */

async function loadRecentDeliveries() {
  const tbody = document.getElementById("deliveries-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .order("delivery_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error loading deliveries:", error);
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "Error loading deliveries.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  if (!data || data.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "No deliveries logged yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  data.forEach((row) => {
    const tr = document.createElement("tr");

    const d = row.delivery_date || (row.created_at || "").slice(0, 10);
    const drink = drinkTypesById[row.drink_type_id]
      ? drinkTypesById[row.drink_type_id].name
      : "(unknown)";

    addCell(tr, d);
    addCell(tr, drink);
    addCell(tr, row.quantity_delivered != null ? String(row.quantity_delivered) : "");
    addCell(tr, row.pfand_returned != null ? String(row.pfand_returned) : "0");
    addCell(tr, row.supplier || "");
    addCell(tr, row.ordered_by || "");

    tbody.appendChild(tr);
  });
}

/* ----------------------------------
   Stock Summary (Σ delivered − Σ pfand)
---------------------------------- */

async function loadStockSummary() {
  const tbody = document.getElementById("stock-summary-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const { data, error } = await supabase
    .from("deliveries")
    .select("drink_type_id, quantity_delivered, pfand_returned");

  if (error) {
    console.error("Error loading stock summary:", error);
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.textContent = "Error loading stock summary.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  if (!data || data.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.textContent = "No deliveries logged yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const totals = {}; // drink_type_id -> net crates

  data.forEach((row) => {
    const id = row.drink_type_id;
    if (!id) return;

    const delivered = row.quantity_delivered || 0;
    const pfand = row.pfand_returned || 0;

    if (!totals[id]) totals[id] = 0;
    totals[id] += delivered - pfand;
  });

  const ids = Object.keys(totals);
  ids.forEach((id) => {
    const tr = document.createElement("tr");
    const drinkName = drinkTypesById[id] ? drinkTypesById[id].name : "(unknown)";

    addCell(tr, drinkName);
    addCell(tr, String(totals[id]));

    tbody.appendChild(tr);
  });

  if (ids.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 2;
    td.textContent = "No net stock to display.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

/* ----------------------------------
   Small helper
---------------------------------- */

function addCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text;
  tr.appendChild(td);
}
