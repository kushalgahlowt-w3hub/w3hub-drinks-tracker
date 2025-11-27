// admin_users.js
// ------------------------------------------------------
// NOTE:
// This file manages rows in your public "users" table
// (id, email, role). It does NOT create or delete
// Supabase Auth accounts. You must still create the
// actual login in Supabase Auth > Users.
// ------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  initUserManagement().catch(err => {
    console.error("Error initialising user management:", err);
    const s = document.getElementById("user-status");
    if (s) {
      s.textContent = "Error initialising user management.";
      s.classList.add("error");
    }
  });
});

// ------------------------------------------------------
// Initialise page: load table + wire up form
// ------------------------------------------------------
async function initUserManagement() {
  await loadUsersTable();

  const form = document.getElementById("create-user-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await handleCreateUserSubmit();
    });
  }
}

// Small helper to centralise status messages
function setUserStatus(message, type = "info") {
  const statusEl = document.getElementById("user-status");
  if (!statusEl) return;

  statusEl.textContent = message || "";
  statusEl.className = "status-text";

  if (type === "error") {
    statusEl.classList.add("error");
  } else if (type === "success") {
    statusEl.classList.add("success");
  }
}

// ------------------------------------------------------
// Load all users into the table
// ------------------------------------------------------
async function loadUsersTable() {
  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("email", { ascending: true }); // safe ordering by email

  if (error) {
    console.error("Error loading users:", error);
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Error loading users.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  if (!data || data.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No users found.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  data.forEach(user => addUserRow(user));
}

// ------------------------------------------------------
// Add a single row to the users table UI
// ------------------------------------------------------
function addUserRow(user) {
  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;

  const row = document.createElement("tr");

  // Email cell
  const emailCell = document.createElement("td");
  emailCell.textContent = user.email || "";
  row.appendChild(emailCell);

  // Role dropdown
  const roleCell = document.createElement("td");
  const select = document.createElement("select");
  select.innerHTML = `
    <option value="runner" ${user.role === "runner" ? "selected" : ""}>Runner</option>
    <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
  `;
  select.addEventListener("change", () => updateUserRole(user.id, select.value));
  roleCell.appendChild(select);
  row.appendChild(roleCell);

  // Created column placeholder (not using created_at from DB)
  const createdCell = document.createElement("td");
  createdCell.textContent = "-";
  row.appendChild(createdCell);

  // Delete button
  const actionCell = document.createElement("td");
  const delBtn = document.createElement("button");
  delBtn.textContent = "Remove";
  delBtn.classList.add("danger-btn");
  delBtn.addEventListener("click", () => deleteUser(user.id));
  actionCell.appendChild(delBtn);
  row.appendChild(actionCell);

  tbody.appendChild(row);
}

// ------------------------------------------------------
// Handle create user form submit
// (inserts email + role into mapping table only)
// ------------------------------------------------------
async function handleCreateUserSubmit() {
  const emailInput = document.getElementById("new-user-email");
  const roleSelect = document.getElementById("new-user-role");

  if (!emailInput || !roleSelect) {
    console.warn("Create user inputs not found in DOM.");
    return;
  }

  const email = emailInput.value.trim().toLowerCase();
  const role = roleSelect.value;

  if (!email) {
    setUserStatus("Email is required.", "error");
    return;
  }

  setUserStatus("Saving user mapping…", "info");

  const { error } = await supabase
    .from("users")
    .insert([{ email, role }]);

  if (error) {
    console.error("Error creating user:", error);
    setUserStatus("Error creating user mapping: " + error.message, "error");
    return;
  }

  setUserStatus(
    "User mapping added! Remember: create the login in Supabase Auth as well.",
    "success"
  );

  emailInput.value = "";
  await loadUsersTable();
}

// ------------------------------------------------------
// Update role for existing user mapping
// ------------------------------------------------------
async function updateUserRole(id, newRole) {
  if (!id) return;
  setUserStatus("Updating role…", "info");

  const { error } = await supabase
    .from("users")
    .update({ role: newRole })
    .eq("id", id);

  if (error) {
    console.error("Error updating role:", error);
    setUserStatus("Error updating role: " + error.message, "error");
    return;
  }

  setUserStatus("Role updated!", "success");
  await loadUsersTable();
}

// ------------------------------------------------------
// Delete a user mapping (does NOT delete Auth user)
// ------------------------------------------------------
async function deleteUser(id) {
  if (!id) return;

  setUserStatus("Removing user mapping…", "info");

  const { error } = await supabase
    .from("users")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting user mapping:", error);
    setUserStatus("Error deleting user: " + error.message, "error");
    return;
  }

  setUserStatus("User mapping removed!", "success");
  await loadUsersTable();
}




