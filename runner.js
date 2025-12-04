// ------------------------------------------------------------
// runner.js
// Full Runner Mode Logic – Updated Dec 2025
// ------------------------------------------------------------

let currentUserId = null;
let currentUserEmail = null;

/* ------------------------------------------------------------
   Detect selected action mode (start / restock / end)
------------------------------------------------------------ */
function getSelectedMode() {
  const radio = document.querySelector("input[name='mode']:checked");
  return radio ? radio.value : "start";
}

/* ------------------------------------------------------------
   Load current authenticated user
------------------------------------------------------------ */
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

/* ------------------------------------------------------------
   Load event dropdown
------------------------------------------------------------ */
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
      const statusLabel = e.status === "Closed" ? " [Closed]" : "";
      return `<option value="${e.id}">${e.name}${dateLabel}${statusLabel}</option>`;
    })
    .join("");
}

/* ------------------------------------------------------------
   Load floors
------------------------------------------------------------ */
async function loadFloors() {
  const el = document.getElementById("floor-select");
  if (!el) return;
  el.innerHTML = "";

  const { data, error } = await supabase.from("floors").select("*");

  if (error) {
    console.error("Floors load error:", error);
    el.innerHTML = "<option>Error loading floors</option>";
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = "<option>No floors found</option>";
    return;
  }

  el.innerHTML = data.map(f => `<option value="${f.id}">${f.name}</option>`).join("");

  await loadFridges();
}

/* ------------------------------------------------------------
   Load fridges based on floor
------------------------------------------------------------ */
async function loadFridges() {
  const floorId = document.getElementById("floor-select").value;
  const el = document.getElementById("fridge-select");
  if (!el) return;
  el.innerHTML = "";

  if (!floorId) {
    el.innerHTML = "<option>Select floor first</option>";
    return;
  }

  const { data, error } = await supabase
    .from("fridges")
    .select("*")
    .eq("floor_id", floorId);

  if (error) {
    console.error("Fridges load error:", error);
    el.innerHTML = "<option>Error loading fridges</option>";
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = "<option>No fridges found</option>";
    return;
  }

  el.innerHTML = data.map(fr => `<option value="${fr.id}">${fr.name}</option>`).join("");
}

/* ------------------------------------------------------------
   Load drink types
------------------------------------------------------------ */
async function loadDrinkTypes() {
  const el = document.getElementById("drink-select");
  if (!el) return;

  const { data, error } = await supabase.from("drink_types").select("*");

  if (error) {
    console.error("Drink types load error:", error);
    el.innerHTML = "<option>Error loading drinks</option>";
    return;
  }

  if (!data || data.length === 0) {
    el.innerHTML = "<option>No drink types found</option>";
    return;
  }

  el.innerHTML = data.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
}

/* ------------------------------------------------------------
   Load history for selected combination
------------------------------------------------------------ */
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
    tr.innerHTML = `<td colspan="3">Error loading history.</td>`;
    tbody.appendChild(tr);
    return;
  }

  if (!data || data.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3">No history yet for this combination.</td>`;
    tbody.appendChild(tr);
    return;
  }

  data.forEach(row => {
    const tr = document.createElement("tr");
    const t = new Date(row.created_at).toLocaleString();

    tr.innerHTML = `
      <td>${t}</td>
      <td>${row.action_type}</td>
      <td>${row.amount}</td>
    `;

    tbody.appendChild(tr);
  });
}

/* ------------------------------------------------------------
   Load My Activity (joined with event status)
   + disable editing for Closed events
------------------------------------------------------------ */
async function loadMyActivity() {
  const tbody = document.getElementById("my-activity-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!currentUserId) {
    tbody.innerHTML = `<tr><td colspan="8">Could not identify current user.</td></tr>`;
    return;
  }

  const { data, error } = await supabase
    .from("fridge_log_entries")
    .select(`
      *,
      events(*),
      fridges(*),
      floors(*),
      drink_types(*)
    `)
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(15);

  if (error || !data) {
    console.error("My activity load error:", error);
    tbody.innerHTML = `<tr><td colspan="8">Error loading activity.</td></tr>`;
    return;
  }

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">No recent activity.</td></tr>`;
    return;
  }

  data.forEach(row => {
    const tr = document.createElement("tr");

    const isClosed = row.events?.status === "Closed";

    const createdAt = new Date(row.created_at).toLocaleString();
    const eventName = row.events?.name || "";
    const floorName = row.floors?.name || "";
    const fridgeName = row.fridges?.name || "";
    const drinkName = row.drink_types?.name || "";

    tr.innerHTML = `
      <td>${createdAt}</td>
      <td>${eventName}</td>
      <td>${floorName}</td>
      <td>${fridgeName}</td>
      <td>${drinkName}</td>
      <td>${row.action_type}</td>
      <td>${row.amount}</td>
    `;

    const actionsTd = document.createElement("td");

    if (isClosed) {
      const label = document.createElement("span");
      label.textContent = "Event Closed";
      label.style.color = "#888";
      label.style.fontSize = "12px";
      label.style.fontStyle = "italic";
      actionsTd.appendChild(label);
    } else {
      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.className = "table-action-btn";
      editBtn.addEventListener("click", () =>
        editLogEntry(row.id, row.amount, row.action_type)
      );

      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.className = "table-action-btn danger";
      delBtn.addEventListener("click", () => deleteLogEntry(row.id));

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(delBtn);
    }

    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });
}

/* ------------------------------------------------------------
   Edit log entry
------------------------------------------------------------ */
async function editLogEntry(entryId, currentAmount, actionType) {
  if (!entryId) return;

  const newAmountStr = window.prompt(
    `Update amount for "${actionType}" (current: ${currentAmount ?? 0})`,
    currentAmount != null ? String(currentAmount) : "0"
  );

  if (newAmountStr === null) return;

  const newAmount = parseInt(newAmountStr, 10);
  if (isNaN(newAmount) || newAmount < 0) {
    alert("Amount must be a non-negative number.");
    return;
  }

  const { error } = await supabase
    .from("fridge_log_entries")
    .update({ amount: newAmount })
    .eq("id", entryId)
    .eq("user_id", currentUserId);

  if (error) {
    alert("Event is CLOSED — editing is not allowed.");
    console.error("Update error:", error);
  }

  await loadHistory();
  await loadMyActivity();
}

/* ------------------------------------------------------------
   Delete log entry
------------------------------------------------------------ */
async function deleteLogEntry(entryId) {
  if (!entryId) return;

  const ok = window.confirm("Are you sure you want to delete this entry?");
  if (!ok) return;

  const { error } = await supabase
    .from("fridge_log_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", currentUserId);

  if (error) {
    alert("Event is CLOSED — deleting is not allowed.");
    console.error("Delete error:", error);
  }

  await loadHistory();
  await loadMyActivity();
}

/* ------------------------------------------------------------
   Submit new log
------------------------------------------------------------ */
async function handleSubmit(e) {
  e.preventDefault();

  const event_id = document.getElementById("event-select").value;
  const fridge_id = document.getElementById("floor-select").value;
  const drink_type_id = document.getElementById("drink-select").value;

  const status = document.getElementById("log-status");
  status.textContent = "";

  const mode = getSelectedMode();
  const amountInput = {
    start: document.getElementById("start-count").value,
    restock: document.getElementById("restock-count").value,
    end: document.getElementById("end-count").value,
  }[mode];

  if (!event_id || !fridge_id || !drink_type_id) {
    status.textContent = "❌ Please select all fields.";
    status.classList.add("error");
    return;
  }

  const amount = parseInt(amountInput, 10);
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
        user_id: currentUserId,
        action_type: mode,
        amount,
      },
    ]);

  if (error) {
    console.error(error);
    status.textContent = "❌ Error saving log.";
    status.classList.add("error");
    return;
  }

  status.textContent = "✅ Log saved!";
  status.classList.add("success");

  // Clear relevant input
  if (mode === "start") document.getElementById("start-count").value = "";
  if (mode === "restock") document.getElementById("restock-count").value = "";
  if (mode === "end") document.getElementById("end-count").value = "";

  await loadHistory();
  await loadMyActivity();
}

/* ------------------------------------------------------------
   Initialise Runner mode
------------------------------------------------------------ */
async function initRunner() {
  await loadCurrentUser();
  await loadEvents();
  await loadFloors();
  await loadDrinkTypes();
  await loadHistory();
  await loadMyActivity();
}

/* ------------------------------------------------------------
   DOM READY
------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("log-form");
  if (form) form.addEventListener("submit", handleSubmit);

  const floorSelect = document.getElementById("floor-select");
  if (floorSelect) {
    floorSelect.addEventListener("change", async () => {
      await loadFridges();
      await loadHistory();
    });
  }

  ["event-select", "fridge-select", "drink-select"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", loadHistory);
  });

  initRunner().catch(err => console.error("Error initialising runner:", err));
});






