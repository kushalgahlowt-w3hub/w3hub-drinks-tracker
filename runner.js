// ------------------------------------------------------------
// runner.js – Fully Corrected Version (Dec 2025)
// ------------------------------------------------------------

let currentUserId = null;
let currentUserEmail = null;

/* ------------------------------------------------------------
   Detect Start / Restock / End mode
------------------------------------------------------------ */
function getSelectedMode() {
  const radio = document.querySelector("input[name='mode']:checked");
  return radio ? radio.value : "start";
}

/* ------------------------------------------------------------
   Load authenticated user
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
  if (mobileUserEl && currentUserEmail) mobileUserEl.textContent = currentUserEmail;
}

/* ------------------------------------------------------------
   Load events
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
    el.innerHTML = "<option>Error loading events</option>";
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

  el.innerHTML = data.map(f => `<option value="${f.id}">${f.name}</option>`).join("");

  await loadFridges();
}

/* ------------------------------------------------------------
   Load fridges for selected floor
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

  el.innerHTML = data.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
}

/* ------------------------------------------------------------
   Load last 10 logs for selected (event + fridge + drink)
------------------------------------------------------------ */
async function loadHistory() {
  const event_id = document.getElementById("event-select").value;
  const fridge_id = document.getElementById("fridge-select").value;
  const drink_type_id = document.getElementById("drink-select").value;

  const tbody = document.getElementById("history-body");
  tbody.innerHTML = "";

  if (!event_id || !fridge_id || !drink_type_id) return;

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
    tbody.innerHTML = `<tr><td colspan="3">Error loading history.</td></tr>`;
    return;
  }

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3">No history yet for this combination.</td></tr>`;
    return;
  }

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(row.created_at).toLocaleString()}</td>
      <td>${row.action_type}</td>
      <td>${row.amount}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ------------------------------------------------------------
   Load My Activity (last 15 logs)
------------------------------------------------------------ */
async function loadMyActivity() {
  const tbody = document.getElementById("my-activity-body");
  tbody.innerHTML = "";

  if (!currentUserId) {
    tbody.innerHTML = `<tr><td colspan="8">No user found.</td></tr>`;
    return;
  }

  const { data, error } = await supabase
    .from("fridge_log_entries")
    .select(
      `
      id, amount, action_type, created_at,
      events ( id, name, status ),
      fridges ( id, name ),
      floors ( id, name ),
      drink_types ( id, name )
    `
    )
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) {
    console.error("My activity load error:", error);
    tbody.innerHTML = `<tr><td colspan="8">Error loading activity.</td></tr>`;
    return;
  }

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">No recent activity.</td></tr>`;
    return;
  }

  data.forEach(row => {
    const closed = row.events?.status === "Closed";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(row.created_at).toLocaleString()}</td>
      <td>${row.events?.name}</td>
      <td>${row.floors?.name}</td>
      <td>${row.fridges?.name}</td>
      <td>${row.drink_types?.name}</td>
      <td>${row.action_type}</td>
      <td>${row.amount}</td>
    `;

    const tdActions = document.createElement("td");

    if (closed) {
      tdActions.innerHTML = `<span style="font-size:12px;color:#888;">Event Closed</span>`;
    } else {
      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.className = "table-action-btn";
      editBtn.onclick = () =>
        editLogEntry(row.id, row.amount, row.action_type);

      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.className = "table-action-btn danger";
      delBtn.onclick = () => deleteLogEntry(row.id);

      tdActions.appendChild(editBtn);
      tdActions.appendChild(delBtn);
    }

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

/* ------------------------------------------------------------
   Edit a log entry
------------------------------------------------------------ */
async function editLogEntry(id, amount, type) {
  const val = prompt(`Update amount for "${type}"`, amount);
  if (val === null) return;

  const newAmount = parseInt(val, 10);
  if (isNaN(newAmount) || newAmount < 0) {
    alert("Invalid number.");
    return;
  }

  const { error } = await supabase
    .from("fridge_log_entries")
    .update({ amount: newAmount })
    .eq("id", id)
    .eq("user_id", currentUserId);

  if (error) {
    alert("Event is CLOSED — editing not allowed.");
    console.error(error);
  }

  loadMyActivity();
  loadHistory();
}

/* ------------------------------------------------------------
   Delete a log entry
------------------------------------------------------------ */
async function deleteLogEntry(id) {
  if (!confirm("Delete this entry?")) return;

  const { error } = await supabase
    .from("fridge_log_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUserId);

  if (error) {
    alert("Event is CLOSED — deleting not allowed.");
    console.error(error);
  }

  loadMyActivity();
  loadHistory();
}

/* ------------------------------------------------------------
   Submit a new log entry
------------------------------------------------------------ */
async function handleSubmit(e) {
  e.preventDefault();

  const event_id = document.getElementById("event-select").value;
  const fridge_id = document.getElementById("fridge-select").value; // FIXED
  const drink_type_id = document.getElementById("drink-select").value;

  const statusEl = document.getElementById("log-status");
  statusEl.textContent = "";

  const mode = getSelectedMode();
  const amountVal =
    mode === "start"
      ? document.getElementById("start-count").value
      : mode === "restock"
      ? document.getElementById("restock-count").value
      : document.getElementById("end-count").value;

  const amount = parseInt(amountVal, 10);

  if (!event_id || !fridge_id || !drink_type_id) {
    statusEl.innerHTML = "❌ Please select all fields.";
    statusEl.classList.add("error");
    return;
  }

  if (isNaN(amount) || amount < 0) {
    statusEl.innerHTML = "❌ Invalid amount.";
    statusEl.classList.add("error");
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
        amount
      }
    ]);

  if (error) {
    console.error(error);
    statusEl.innerHTML = "❌ Error saving log.";
    statusEl.classList.add("error");
    return;
  }

  statusEl.innerHTML = "✅ Log saved!";
  statusEl.classList.add("success");

  if (mode === "start") document.getElementById("start-count").value = "";
  if (mode === "restock") document.getElementById("restock-count").value = "";
  if (mode === "end") document.getElementById("end-count").value = "";

  loadHistory();
  loadMyActivity();
}

/* ------------------------------------------------------------
   Init Runner Mode
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
   DOM Ready
------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("log-form").addEventListener("submit", handleSubmit);

  document.getElementById("floor-select").addEventListener("change", async () => {
    await loadFridges();
    await loadHistory();
  });

  ["event-select", "fridge-select", "drink-select"].forEach(id =>
    document.getElementById(id)?.addEventListener("change", loadHistory)
  );

  initRunner();
});







