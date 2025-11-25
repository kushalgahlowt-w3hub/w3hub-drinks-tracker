// runner.js

let currentUserId = null;

// -------------------------
// Detect selected action mode
// -------------------------
function getSelectedMode() {
  const radios = document.querySelectorAll('input[name="action-type"]');
  for (const r of radios) {
    if (r.checked) return r.value;
  }
  return "start";
}

// -------------------------
// Load current Supabase user
// -------------------------
async function loadCurrentUser() {
  const { data } = await supabase.auth.getUser();
  if (data?.user?.id) {
    currentUserId = data.user.id;
    console.log("Current user:", currentUserId);
  }
}

// -------------------------
// Load dropdowns from DB
// -------------------------
async function loadEvents() {
  const el = document.getElementById("event-select");
  const { data } = await supabase.from("events").select("*").order("event_date");
  el.innerHTML = data.map(e => `<option value="${e.id}">${e.name} (${e.event_date})</option>`).join("");
}

async function loadFloors() {
  const el = document.getElementById("floor-select");
  const { data } = await supabase.from("floors").select("*");
  el.innerHTML = data.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
  await loadFridges();
}

async function loadFridges() {
  const floorId = document.getElementById("floor-select").value;
  const el = document.getElementById("fridge-select");
  const { data } = await supabase.from("fridges").select("*").eq("floor_id", floorId);
  el.innerHTML = data.map(fr => `<option value="${fr.id}">${fr.name}</option>`).join("");
}

async function loadDrinkTypes() {
  const el = document.getElementById("drink-select");
  const { data } = await supabase.from("drink_types").select("*");
  el.innerHTML = data.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
}

// -------------------------
// Load history for selected combo
// -------------------------
async function loadHistory() {
  const event_id = document.getElementById("event-select").value;
  const fridge_id = document.getElementById("fridge-select").value;
  const drink_type_id = document.getElementById("drink-select").value;

  const tbody = document.getElementById("history-body");
  tbody.innerHTML = "";

  if (!event_id || !fridge_id || !drink_type_id) return;

  const { data } = await supabase
    .from("fridge_log_entries")
    .select("*")
    .eq("event_id", event_id)
    .eq("fridge_id", fridge_id)
    .eq("drink_type_id", drink_type_id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3">No history yet.</td></tr>`;
    return;
  }

  data.forEach(row => {
    const t = new Date(row.created_at).toLocaleString();
    tbody.innerHTML += `
      <tr>
        <td>${t}</td>
        <td>${row.action_type}</td>
        <td>${row.amount}</td>
      </tr>`;
  });
}

// -------------------------
// Load last 20 actions by this user
// -------------------------
async function loadMyActivity() {
  if (!currentUserId) return;
  const tbody = document.getElementById("my-activity-body");
  tbody.innerHTML = "";

  const { data } = await supabase
    .from("fridge_log_entries")
    .select("*")
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">No recent activity.</td></tr>`;
    return;
  }

  // lookup names
  const [events, floors, fridges, drinks] = await Promise.all([
    supabase.from("events").select("id,name"),
    supabase.from("floors").select("id,name"),
    supabase.from("fridges").select("id,name,floor_id"),
    supabase.from("drink_types").select("id,name"),
  ]);

  const eMap = Object.fromEntries(events.data.map(e => [e.id, e.name]));
  const fMap = Object.fromEntries(floors.data.map(f => [f.id, f.name]));
  const fridgeMap = Object.fromEntries(fridges.data.map(fr => [fr.id, fr]));
  const dMap = Object.fromEntries(drinks.data.map(d => [d.id, d.name]));

  data.forEach(row => {
    const fr = fridgeMap[row.fridge_id];
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

// -------------------------
// FORM SUBMIT — INSERT LOG
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("runner-form");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const event_id = document.getElementById("event-select").value;
    const fridge_id = document.getElementById("fridge-select").value;
    const drink_type_id = document.getElementById("drink-select").value;
    const amount = parseInt(document.getElementById("amount-input").value, 10);
    const action_type = getSelectedMode();
    const status = document.getElementById("log-status");

    if (!amount || amount < 0) {
      status.textContent = "❌ Amount must be valid.";
      status.className = "error";
      return;
    }

    const { error } = await supabase.from("fridge_log_entries").insert([
      {
        event_id,
        fridge_id,
        drink_type_id,
        action_type,
        amount,
        user_id: currentUserId,
      },
    ]);

    if (error) {
      console.error(error);
      status.textContent = "❌ Error saving.";
      status.className = "error";
      return;
    }

    status.textContent = "✅ Saved!";
    status.className = "success";
    document.getElementById("amount-input").value = "";

    loadHistory();
    loadMyActivity();
  });

  // reload when selections change
  ["event-select", "floor-select", "fridge-select", "drink-select"].forEach(id =>
    document.getElementById(id)?.addEventListener("change", () => {
      loadFridges();
      loadHistory();
    })
  );
});

// -------------------------
// INIT
// -------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await loadCurrentUser();
  await loadEvents();
  await loadFloors();
  await loadDrinkTypes();
  await loadHistory();
  await loadMyActivity();
});




