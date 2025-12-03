// dashboard.js
// Admin setup logic (events, floors, fridges, drink types)

async function loadFloors() {
  const { data, error } = await supabase.from("floors").select("*");
  const dropdown = document.getElementById("fridge-floor");
  dropdown.innerHTML = "";
  if (error) return;

  data.forEach(f =>
    dropdown.innerHTML += `<option value="${f.id}">${f.name}</option>`
  );
}

loadFloors();

/* -------------------------
   ADD EVENT
------------------------- */
document.getElementById("event-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("event-name").value;
  const event_date = document.getElementById("event-date").value;

  const owned_by = document.getElementById("event-owned-by").value;
  const owned_by_other = document.getElementById("event-owned-by-other").value;

  const finalOwner = owned_by === "Other" ? owned_by_other : owned_by;

  const { error } = await supabase.from("events").insert([
    {
      name,
      event_date,
      owned_by: finalOwner,
      status: "open"
    }
  ]);

  const status = document.getElementById("event-status");
  if (error) {
    status.textContent = "❌ Error adding event";
    return;
  }

  status.textContent = "✅ Event added!";
  document.getElementById("event-form").reset();
  loadEventList();
});

/* -------------------------
   EVENT LIST (NEW)
------------------------- */
async function loadEventList() {
  const container = document.getElementById("event-list");
  container.innerHTML = "";

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("event_date", { ascending: true });

  if (error || !data) {
    container.innerHTML = "<p>Error loading events.</p>";
    return;
  }

  data.forEach(evt => {
    const card = document.createElement("div");
    card.className = "event-card";

    const statusClass = evt.status === "open"
      ? "event-status-open"
      : "event-status-closed";

    card.innerHTML = `
      <strong>${evt.name}</strong><br>
      Owner: ${evt.owned_by || "-"}<br>
      Status:
      <span class="${statusClass}">
        ${evt.status}
      </span>
      <br>
    `;

    // Add Close button if open
    if (evt.status === "open") {
      const btn = document.createElement("button");
      btn.textContent = "Close Event";
      btn.className = "close-btn";
      btn.onclick = () => closeEvent(evt.id);
      card.appendChild(btn);
    } else {
      const closedBadge = document.createElement("div");
      closedBadge.textContent = "Closed";
      closedBadge.style = "margin-top:6px;color:#777;font-weight:bold;";
      card.appendChild(closedBadge);
    }

    container.appendChild(card);
  });
}

async function closeEvent(id) {
  await supabase.from("events").update({ status: "closed" }).eq("id", id);
  loadEventList();
}

/* -------------------------
   ADD FLOOR
------------------------- */
document.getElementById("floor-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("floor-name").value;
  const status = document.getElementById("floor-status");

  const { error } = await supabase.from("floors").insert([{ name }]);
  if (error) {
    status.textContent = "❌ Error adding floor";
    return;
  }

  status.textContent = "✅ Floor added!";
  document.getElementById("floor-form").reset();
  loadFloors();
});

/* -------------------------
   ADD FRIDGE
------------------------- */
document.getElementById("fridge-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("fridge-name").value;
  const floor_id = document.getElementById("fridge-floor").value;
  const status = document.getElementById("fridge-status");

  const { error } = await supabase.from("fridges").insert([{ name, floor_id }]);
  if (error) {
    status.textContent = "❌ Error adding fridge";
    return;
  }

  status.textContent = "✅ Fridge added!";
  document.getElementById("fridge-form").reset();
});

/* -------------------------
   ADD DRINK TYPE
------------------------- */
document.getElementById("drink-type-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("drink-type-name").value;
  const status = document.getElementById("drink-type-status");

  const { error } = await supabase.from("drink_types").insert([{ name }]);
  if (error) {
    status.textContent = "❌ Error adding drink type";
    return;
  }

  status.textContent = "✅ Drink type added!";
  document.getElementById("drink-type-form").reset();
});

/* -------------------------  
   INITIAL LOAD  
------------------------- */
document.addEventListener("DOMContentLoaded", loadEventList);







