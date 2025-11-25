// runner.js
// Supabase client is already created in runner.html

let currentUserId = null;

// -------------------------
// Helper: get selected mode (start / restock / end)
// -------------------------
function getSelectedMode() {
  const radios = document.querySelectorAll('input[name="mode"]');
  for (const r of radios) {
    if (r.checked) return r.value;
  }
  return "start";
}

// -------------------------
// LOAD CURRENT USER (robust)
// -------------------------
async function loadCurrentUser() {
  try {
    // First try getUser
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.error("Could not get current user via getUser:", error);
    }

    if (data && data.user) {
      currentUserId = data.user.id;
      console.log("Current user (getUser):", currentUserId);
      return;
    }

    // Fallback: getSession
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Could not get current user via getSession:", sessionError);
      return;
    }

    if (session && session.user) {
      currentUserId = session.user.id;
      console.log("Current user (getSession):", currentUserId);
      return;
    }

    console.warn("No current user found at all.");
  } catch (e) {
    console.error("Unexpected error in loadCurrentUser:", e);
  }
}

// -------------------------
// LOAD EVENTS
// -------------------------
async function loadEvents() {
  const dropdown = document.getElementById("event-select");
  dropdown.innerHTML = "";

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("event_date", { ascending: true });

  if (error) {
    console.error("Error loading events:", error);
    dropdown.innerHTML = "<option value=''>Error loading events</option>";
    return;
  }

  if (!data || data.length === 0) {
    dropdown.innerHTML = "<option value=''>No events found</option>";
    return;
  }

  data.forEach((event) => {
    const option = document.createElement("option");
    const dateLabel = event.event_date ? ` (${event.event_date})` : "";

    // Include owner info, e.g. "Bubba-dubba (2025-11-17) · BetterLife"
    let ownerSuffix = "";
    if (event.event_owner_type) {
      if (event.event_owner_type === "Other" && event.event_owner_other) {
        ownerSuffix = ` · Other – ${event.event_owner_other}`;
      } else {
        ownerSuffix = ` · ${event.event_owner_type}`;
      }
    }

    option.value = event.id;
    option.textContent = `${event.name}${dateLabel}${ownerSuffix}`;
    dropdown.appendChild(option);
  });
}

// -------------------------
// LOAD FLOORS
// -------------------------
async function loadFloors() {
  const dropdown = document.getElementById("floor-select");
  dropdown.innerHTML = "";

  const { data, error } = await supabase.from("floors").select("*");

  if (error) {
    console.error("Error loading floors:", error);
    dropdown.innerHTML = "<option value=''>Error loading floors</option>";
    return;
  }

  if (!data || data.length === 0) {
    dropdown.innerHTML = "<option value=''>No floors found</option>";
    return;
  }

  data.forEach((floor) => {
    const option = document.createElement("option");
    option.value = floor.id;
    option.textContent = floor.name;
    dropdown.appendChild(option);
  });

  // After floors load, load fridges for the selected floor
  await loadFridges();
}

// -------------------------
// LOAD FRIDGES FOR SELECTED FLOOR
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  const floorSelect = document.getElementById("floor-select");
  if (floorSelect) {
    floorSelect.addEventListener("change", async () => {
      await loadFridges();
      await loadHistory(); // update history when fridge changes
    });
  }
});

async function loadFridges() {
  const floor_id = document.getElementById("floor-select").value;
  const dropdown = document.getElementById("fridge-select");
  dropdown.innerHTML = "";

  if (!floor_id) {
    dropdown.innerHTML = "<option value=''>Select floor first</option>";
    return;
  }

  const { data, error } = await supabase
    .from("fridges")
    .select("*")
    .eq("floor_id", floor_id);

  if (error) {
    console.error("Error loading fridges:", error);
    dropdown.innerHTML = "<option value=''>Error loading fridges</option>";
    return;
  }

  if (!data || data.length === 0) {
    dropdown.innerHTML = "<option value=''>No fridges found</option>";
    return;
  }

  data.forEach((fridge) => {
    const option = document.createElement("option");
    option.value = fridge.id;
    option.textContent = fridge.name;
    dropdown.appendChild(option);
  });
}

// -------------------------
// LOAD DRINK TYPES
// -------------------------
async function loadDrinkTypes() {
  const dropdown = document.getElementById("drink-select");
  dropdown.innerHTML = "";

  const { data, error } = await supabase.from("drink_types").select("*");

  if (error) {
    console.error("Error loading drink types:", error);
    dropdown.innerHTML = "<option value=''>Error loading drink types</option>";
    return;
  }

  if (!data || data.length === 0) {
    dropdown.innerHTML = "<option value=''>No drink types found</option>";
    return;
  }

  data.forEach((drink) => {
    const option = document.createElement("option");
    option.value = drink.id;
    option.textContent = drink.name;
    dropdown.appendChild(option);
  });
}

// -------------------------
// RELOAD HISTORY WHEN SELECTION CHANGES
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  const eventSel = document.getElementById("event-select");
  const fridgeSel = document.getElementById("fridge-select");
  const drinkSel = document.getElementById("drink-select");

  if (eventSel) eventSel.addEventListener("change", loadHistory);
  if (fridgeSel) fridgeSel.addEventListener("change", loadHistory);
  if (drinkSel) drinkSel.addEventListener("change", loadHistory);
});

// -------------------------
// LOAD HISTORY (last 10 actions for selected combo)
// -------------------------
async function loadHistory() {
  const event_id = document.getElementById("event-select").value;
  const fridge_id = document.getElementById("fridge-select").value;
  const drink_type_id = document.getElementById("drink-select").value;
  const tbody = document.getElementById("history-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!event_id || !fridge_id || !drink_type_id) {
    // Not enough info selected yet
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
    console.error("Error loading history:", error);
    return;
  }

  if (!data || data.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.style.padding = "8px";
    td.textContent = "No history yet for this combination.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  data.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid #2a2d35";

    const timeTd = document.createElement("td");
    timeTd.style.padding = "8px";
    const d = new Date(entry.created_at);
    timeTd.textContent = d.toLocaleString();

    const actionTd = document.createElement("td");
    actionTd.style.padding = "8px";
    actionTd.textContent = entry.action_type;

    const amountTd = document.createElement("td");
    amountTd.style.padding = "8px";
    amountTd.textContent = entry.amount;

    tr.appendChild(timeTd);
    tr.appendChild(actionTd);
    tr.appendChild(amountTd);
    tbody.appendChild(tr);
  });
}

// -------------------------
// LOAD "MY ACTIVITY" (last 20 logs for this user)
// -------------------------
async function loadMyActivity() {
  const tbody = document.getElementById("my-activity-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!currentUserId) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent =
      "Could not identify current user (no user_id). Try refreshing or logging in again.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const { data, error } = await supabase
    .from("fridge_log_entries")
    .select("*")
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error loading my activity:", error);
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "Error loading your activity.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  if (!data || data.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "No recent activity.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  // Small lookup for names
  const [eventsRes, floorsRes, fridgesRes, drinksRes] = await Promise.all([
    supabase.from("events").select("id, name"),
    supabase.from("floors").select("id, name"),
    supabase.from("fridges").select("id, name, floor_id"),
    supabase.from("drink_types").select("id, name"),
  ]);

  const eventsById = {};
  const floorsById = {};
  const fridgesById = {};
  const drinksById = {};

  (eventsRes.data || []).forEach((e) => (eventsById[e.id] = e));
  (floorsRes.data || []).forEach((f) => (floorsById[f.id] = f));
  (fridgesRes.data || []).forEach((fr) => (fridgesById[fr.id] = fr));
  (drinksRes.data || []).forEach((d) => (drinksById[d.id] = d));

  data.forEach((entry) => {
    const tr = document.createElement("tr");

    const d = new Date(entry.created_at);
    const timeStr = d.toLocaleString();

    const event = eventsById[entry.event_id];
    const fridge = fridgesById[entry.fridge_id];
    const drink = drinksById[entry.drink_type_id];
    const floor = fridge && floorsById[fridge.floor_id];

    const eventName = event ? event.name : "";
    const floorName = floor ? floor.name : "";
    const fridgeName = fridge ? fridge.name : "";
    const drinkName = drink ? drink.name : "";

    addCell(tr, timeStr);
    addCell(tr, eventName);
    addCell(tr, floorName);
    addCell(tr, fridgeName);
    addCell(tr, drinkName);
    addCell(tr, entry.action_type || "");
    addCell(tr, entry.amount != null ? String(entry.amount) : "");

    tbody.appendChild(tr);
  });
}

function addCell(tr, text) {
  const td = document.createElement("td");
  td.textContent = text;
  tr.appendChild(td);
}

// -------------------------
// SUBMIT LOG (one action = one row)
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("log-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
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

    const payload = {
      event_id,
      fridge_id,
      drink_type_id,
      user_id: currentUserId || null,
      action_type: mode,
      amount,
    };

    const { error } = await supabase
      .from("fridge_log_entries")
      .insert([payload]);

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

    // Refresh history and my activity
    await loadHistory();
    await loadMyActivity();
  });
});

// -------------------------
// INITIALISATION
// -------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await loadCurrentUser();
  await loadEvents();
  await loadFloors();
  await loadDrinkTypes();
  await loadHistory();
  await loadMyActivity();
});



