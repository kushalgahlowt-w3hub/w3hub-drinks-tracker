// ✅ runner.js — CLEAN, FULLY COMPATIBLE WITH CURRENT runner.html

let currentUserId = null;

/* -----------------------------
   Detect selected action mode
------------------------------*/
function getSelectedMode() {
  return document.querySelector("input[name='mode']:checked")?.value || "start";
}

/* -----------------------------
   Load logged-in Supabase user
------------------------------*/
async function loadCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("User load error:", error);
    return;
  }
  currentUserId = data?.user?.id || null;
  console.log("Current user:", currentUserId);
}

/* -----------------------------
   Load dropdown values
------------------------------*/
async function loadEvents() {
  const el = document.getElementById("event-select");
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
    .map(e => `<option value="${e.id}">${e.name}${e.event_date ? ` (${e.event_date})` : ""}</option>`)
    .join("");
}

async function loadFloors() {
  const el = document.getElementById("floor-select");
  const { data, error } = await supabase.from("floors").select("*");

  if (error) {
    console.error("Floors load error:", error);
    el.innerHTML = "<option>Error loading floors</option>";
    return;
  }

  el.innerHTML = data.map(f => `<option value="${f.id}">${f.name}</option>`).join("");

  await loadFridges();
}

async function loadFridges() {
  const floorId = document.getElementById("floor-select").value;
  const el = document.getElementById("fridge-select");

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

async function loadDrinkTypes() {
  const el = document.getElementById("drink-select");
  const { data, error } = await supabase.from("drink_types").select("*");

  if (error) {
    console.error("Drink types load error:", error);
    el.innerHTML = "<option>Error loading drinks</option>";
    return;
  }

  el.innerHTML = data.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
}

/* -----------------------------
   Load recent logs for selection
------------------------------*/
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
    tbody.innerHTML = `<tr><td colspan="3">Error loading history</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="3">No history yet.</td></tr>`;
    return;
  }

  data.forEach(row => {
    tbody.innerHTML += `
      <tr>
        <td>${new Date(row.created_at).toLocaleString()}</td>
        <td>${row.action_type}</td>
        <td>${row.amount}</td>
      </tr>`;
  });
}

/* -----------------------------
   Load activity by this user
------------------------------*/
async function loadMyActivity() {
  if (!currentUserId) return;
  const tbody = document.getElementById("my-activity-body");
  tbody.innerHTML = "";

  const { data, error } = await supabase
    .from("fridge_log_entries")
    .select("*")
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Activity load error:", error);
    tbody.innerHTML = `<tr><td colspan="7">Error loading activity</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7">No recent activity.</td></tr>`;
    return;
  }

  const [events, floors, fridges, drinks] = await Promise.all([
    supabase.from("events").select("id,name"),
    supabase.from("floors").select("id,name"),
    supabase.from("fridges").select("id,name,floor_id"),
    supabase.from("drink_types").select("id,name"),
  ]);

  const eMap = Object.fromEntries(events.data.map(e => [e.id, e.name]));
  const fMap = Object.fromEntries(floors.data.map(f => [f.id, f.name]));
  const frMap = Object.fromEntries(fridges.data.map(fr => [fr.id, fr]));
  const dMap = Object.fromEntries(drinks.data.map(d => [d.id, d.name]));

  data.forEach(row => {
    const fr = frMap[row.fridge_id];
    tbody.innerHTML += `
      <tr>
        <td>${new Date(row.created_at).toLocaleString()}</td>
        <td>${eMap[row.event_id] || ""}</td>
        <td>${fr ? fMap[fr.floor_id] : ""}</td>
        <td>${fr ? fr.name : ""}</td>
        <td>${dMap[row.drink_type_id] || ""}</td>
        <td>${row.action_type}</td>
        <td>${row.amount}</td>
      </tr>`;
  });
}

/* -----------------------------
   Submit log entry
------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("log-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const mode = getSelectedMode();

    const event_id = document.getElementById("event-select").value;
    const fridge_id = document.getElementById("fridge-select").value;
    const drink_type_id = document.getElementById("drink-select").value;

    // ✅ get amount from correct block
    const amount =
      mode === "start"
        ? document.getElementById("start-count").value
        : mode === "restock"
        ? document.getElementById("restock-count").value
        : document.getElementById("end-count").value;

    const status = document.getElementById("log-status");
    status.textContent = "";
    status.className = "status-text";

    if (!amount || amount < 0) {
      status.textContent = "❌ Enter a valid number.";
      status.classList.add("error");
      return;
    }

    const { error } = await supabase.from("fridge_log_entries").insert([
      {
        event_id,
        fridge_id,
        drink_type_id,
        action_type: mode,
        amount: parseInt(amount, 10),
        user_id: currentUserId,
      },
    ]);

    if (error) {
      console.error("Insert error:", error);
      status.textContent = "❌ Error saving.";
      status.classList.add("error");
      return;
    }

    status.textContent = "✅ Saved!";
    status.classList.add("success");

    // ✅ Reset only relevant field
    document.getElementById(`${mode}-count`).value = "";

    // ✅ Refresh UI
    loadHistory();
    loadMyActivity();
  });

  // ✅ reload history & fridges when selection changes
  document.getElementById("floor-select").addEventListener("change", loadFridges);
  ["event-select", "fridge-select", "drink-select"].forEach(id =>
    document.getElementById(id).addEventListener("change", loadHistory)
  );
});

/* -----------------------------
   INIT APP
------------------------------*/
document.addEventListener("DOMContentLoaded", async () => {
  await loadCurrentUser();
  await loadEvents();
  await loadFloors();
  await loadDrinkTypes();
  await loadHistory();
  await loadMyActivity();
});





