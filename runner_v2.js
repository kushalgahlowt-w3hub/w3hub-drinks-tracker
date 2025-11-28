// runner.js
// Runner mode logic: logging fridge counts + showing recent activity.

let currentUserId = null;
let currentUserEmail = null;

/* --------------------------------------
   Detect selected action mode (start / restock / end)
---------------------------------------*/
function getSelectedMode() {
  const radio = document.querySelector("input[name='mode']:checked");
  return radio ? radio.value : "start";
}

/* --------------------------------------
   Load current Supabase user
---------------------------------------*/
async function loadCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("Error loading current user:", error);
    return;
  }

  currentUserId = data?.user?.id || null;
  currentUserEmail = data?.user?.email || "";

  console.log("Current user:", currentUserId, currentUserEmail);

  const mobileUserEl = document.getElementById("mobile-username");
  if (mobileUserEl && currentUserEmail) {
    mobileUserEl.textContent = currentUserEmail;
  }
}

/* --------------------------------------
   Load dropdowns
---------------------------------------*/
async function loadEvents() {
  const el = document.getElementById("event-select");
  if (!el) return;

  el.innerHTML = "";

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("event_date", { ascending: true });

  if (error) {
    console.error("Events load error:", error);
    el.innerHTML = "<option value=''>Error loading events</option>";
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = "<option value=''>No events found</option>";
    return;
  }

  el.innerHTML = data
    .map(e => {
      const dateLabel = e.event_date ? ` (${e.event_date})` : "";
      return `<option value="${e.id}">${e.name}${dateLabel}</option>`;
    })
    .join("");
}

async function loadFloors() {
  const el = document.getElementById("floor-select");
  if (!el) return;
  el.innerHTML = "";

  const { data, error } = await supabase.from("floors").select("*");

  if (error) {
    console.error("Floors load error:", error);
    el.innerHTML = "<option value=''>Error loading floors</option>";
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = "<option value=''>No floors found</option>";
    return;
  }

  el.innerHTML = data.map(f => `<option value="${f.id}">${f.name}</option>`).join("");

  await loadFridges();
}

async function loadFridges() {
  const floorId = document.getElementById("floor-select").value;
  const el = document.getElementById("fridge-select");
  if (!el) return;
  el.innerHTML = "";

  if (!floorId) {
    el.innerHTML = "<option value=''>Select floor first</option>";
    return;
  }

  const { data, error } = await supabase
    .from("fridges")
    .select("*")
    .eq("floor_id", floorId);

  if (error) {
    console.error("Fridges load error:", error);
    el.innerHTML = "<option value=''>Error loading fridges</option>";
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = "<option value=''>No fridges found</option>";
    return;
  }

  el.innerHTML = data.map(fr => `<option value="${fr.id}">${fr.name}</option>`).join("");
}

async function loadDrinkTypes() {
  const el = document.getElementById("drink-select");
  if (!el) return;
  el.innerHTML = "";

  const { data, error } = await supabase.from("drink_types").select("*");

  if (error) {
    console.error("Drink types load error:", error);
    el.innerHTML = "<option value=''>Error loading drinks</option>";
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = "<option value=''>No drink types found</option>";
    return;
  }

  el.innerHTML = data.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
}

/* --------------------------------------
   Load history for selected Event/Fridge/Drink
---------------------------------------*/
async function loadHistory() {
  const event_id = document.getElementById("event-select").value;
  const fridge_id = document.getElementById("fridge-select").value;
  const drink_type_id = document.getElementById("drink-select").value;

  const tbody = document.getElementById("history-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!event_id || !fridge_id || !drink_type_id) {
    return;
  }

  const { data, error } = await supabase
    .from("fridge_log_entries")
    .select("*")
    .eq("event_id", event_id)
    .eq("fridge_id", fridge_id)
    .eq("drink_type_id", drink_type_id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("History load error:", error);
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.textContent = "Error loading history.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  if (!data || data.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.textContent = "No history yet for this combination.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  data.forEach(row => {
    const tr = document.createElement("tr");
    const t = new Date(row.created_at).toLocaleString();

    const timeTd = document.createElement("td");
    timeTd.textContent = t;
    tr.appendChild(timeTd);

    const actionTd = document.createElement("td");
    actionTd.textContent = row.action_type || "";
    tr.appendChild(actionTd);

    const amountTd = document.createElement("td");
    amountTd.textContent = row.amount != null ? String(row.amount) : "";
    tr.appendChild(amountTd);

    tbody.appendChild(tr);
  });
}

/* --------------------------------------
   Load last 15 actions by this user (editable)
---------------------------------------*/
async function loadMyActivity() {
  const tbody = document.getElementById("my-activity-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!currentUserId) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "Could not identify current user.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const { data, error } = await supabase
    .from("fridge_log_entries")
    .select("*")
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) {
    console.error("My activity load error:", error);
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "Error loading your activity.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  if (!data || data.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "No recent activity.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  // Lookups for names
  const [events, floors, fridges, drinks] = await Promise.all([
    supabase.from("events").select("id,name"),
    supabase.from("floors").select("id,name"),
    supabase.from("fridges").select("id,name,floor_id"),
    supabase.from("drink_types").select("id,name"),
  ]);

  const eMap = Object.fromEntries((events.data || []).map(e => [e.id, e.name]));
  const fMap = Object.fromEntries((floors.data || []).map(f => [f.id, f.name]));
  const frMap = Object.fromEntries((fridges.data || []).map(fr => [fr.id, fr]));
  const dMap = Object.fromEntries((drinks.data || []).map(d => [d.id, d.name]));

  data.forEach(row => {
    const tr = document.createElement("tr");

    const createdAt = new Date(row.created_at).toLocaleString();
    const eventName = eMap[row.event_id] || "";
    const fridge = frMap[row.fridge_id];
    const floorName = fridge ? (fMap[fridge.floor_id] || "") : "";
    const fridgeName = fridge ? fridge.name : "";
    const drinkName = dMap[row.drink_type_id] || "";

    const cells = [
      createdAt,
      eventName,
      floorName,
      fridgeName,
      drinkName,
      row.action_type || "",
      row.amount != null ? String(row.amount) : ""
    ];

    cells.forEach(text => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });

    // Actions cell (Edit / Delete)
    const actionsTd = document.createElement("td");

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.className = "table-action-btn";
    editBtn.addEventListener("click", () => editLogEntry(row.id, row.amount, row.action_type));

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "table-action-btn danger";
    delBtn.addEventListener("click", () => deleteLogEntry(row.id));

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
}

/* --------------------------------------
   Edit a log entry (amount only for now)
---------------------------------------*/
async function editLogEntry(entryId, currentAmount, actionType) {
  if (!entryId) return;

  const newAmountStr = window.prompt(
    `Update amount for "${actionType}" (current: ${currentAmount ?? 0})`,
    currentAmount != null ? String(currentAmount) : "0"
  );

  if (newAmountStr === null) return; // cancelled

  const newAmount = parseInt(newAmountStr, 10);
  if (isNaN(newAmount) || newAmount < 0) {
    window.alert("Amount must be a non-negative number.");
    return;
  }

  const { error } = await supabase
    .from("fridge_log_entries")
    .update({ amount: newAmount })
    .eq("id", entryId)
    .eq("user_id", currentUserId);

  if (error) {
    console.error("Error updating log:", error);
    window.alert("Error updating log entry.");
    return;
  }

  await loadHistory();
  await loadMyActivity();
}

/* --------------------------------------
   Delete a log entry
---------------------------------------*/
async function deleteLogEntry(entryId) {
  if (!entryId) return;

  const ok = window.confirm("Are you sure you want to delete this log entry?");
  if (!ok) return;

  const { error } = await supabase
    .from("fridge_log_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", currentUserId);

  if (error) {
    console.error("Error deleting log:", error);
    window.alert("Error deleting log entry.");
    return;
  }

  await loadHistory();
  await loadMyActivity();
}

/* --------------------------------------
   Submit log entry
---------------------------------------*/
async function handleSubmit(e) {
  e.preventDefault();

  const event_id = document.getElementById("event-select").value;
  const fridge_id = document.getElementById("fridge-select").value;
  const drink_type_id = document.getElementById("drink-select").value;
  const mode = getSelectedMode();

  const startVal = document.getElementById("start-count").value;
  const restockVal = document.getElementById("restock-count").value;
  const endVal = document.getElementById("end-count").value;

  const status = document.getElementById("log-status");
  status.textContent = "";
  status.className = "status-text";

  if (!event_id || !fridge_id || !drink_type_id) {
    status.textContent = "❌ Please select event, floor, fridge, and drink.";
    status.classList.add("error");
    return;
  }

  let amount = null;

  if (mode === "start") {
    if (startVal === "") {
      status.textContent = "❌ Please enter a start count.";
      status.classList.add("error");
      return;
    }
    amount = parseInt(startVal, 10);
  } else if (mode === "restock") {
    if (restockVal === "") {
      status.textContent = "❌ Please enter a restock amount.";
      status.classList.add("error");
      return;
    }
    amount = parseInt(restockVal, 10);
  } else if (mode === "end") {
    if (endVal === "") {
      status.textContent = "❌ Please enter an end count.";
      status.classList.add("error");
      return;
    }
    amount = parseInt(endVal, 10);
  }

  if (isNaN(amount) || amount < 0) {
    status.textContent = "❌ Amount must be a non-negative number.";
    status.classList.add("error");
    return;
  }

  const { error } = await supabase
    .from("fridge_log_entries")
    .insert([
      {
        event_id,
        fridge_id,
        drink_type_id,
        user_id: currentUserId || null,
        action_type: mode,
        amount
      }
    ]);

  if (error) {
    console.error("Error inserting log entry:", error);
    status.textContent = "❌ Error saving log.";
    status.classList.add("error");
    return;
  }

  status.textContent = "✅ Log saved!";
  status.classList.add("success");

  // Clear only the relevant input
  if (mode === "start") {
    document.getElementById("start-count").value = "";
  } else if (mode === "restock") {
    document.getElementById("restock-count").value = "";
  } else if (mode === "end") {
    document.getElementById("end-count").value = "";
  }

  await loadHistory();
  await loadMyActivity();
}

/* --------------------------------------
   Initialise page
---------------------------------------*/
async function initRunner() {
  await loadCurrentUser();
  await loadEvents();
  await loadFloors();
  await loadDrinkTypes();
  await loadHistory();
  await loadMyActivity();
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("log-form");
  if (form) {
    form.addEventListener("submit", handleSubmit);
  }

  // Reload history when filters change
  const floorSelect = document.getElementById("floor-select");
  if (floorSelect) {
    floorSelect.addEventListener("change", async () => {
      await loadFridges();
      await loadHistory();
    });
  }

  ["event-select", "fridge-select", "drink-select"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", loadHistory);
    }
  });

  initRunner().catch(err => {
    console.error("Error initialising runner:", err);
  });
});
