// admin_users.js
// Manages rows in your public "users" table (id, email, role)
// Does NOT create/delete Supabase Auth users (for security reasons).

let currentAdminEmail = null;

document.addEventListener("DOMContentLoaded", () => {
  initUserManagement().catch(err => {
    console.error("Error initialising user management:", err);
    const s = document.getElementById("user-status");
    if (s) s.textContent = "Error initialising user management.";
  });
});

async function initUserManagement() {
  // Identify the currently logged-in admin (for safety checks)
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (!userErr && userData?.user?.email) {
    currentAdminEmail = userData.user.email;
  }

  // Wire up form
  const form = document.getElementById("user-form");
  form.addEventListener("submit", handleAddUser);

  // Load existing users into table
  await loadUsersTable();
}

/* ---------------------------------------
   LOAD USERS
---------------------------------------- */
async function loadUsersTable() {
  const tbody = document.getElementById("users-table-body");
  tbody.innerHTML = "";

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("email", { ascending: true });

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
    cell.textContent = "No users yet. Add one above.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  data.forEach(userRow => {
    const tr = document.createElement("tr");

    // Email
    const emailTd = document.createElement("td");
    emailTd.textContent = userRow.email;
    tr.appendChild(emailTd);

    // Role (with dropdown)
    const roleTd = document.createElement("td");
    const roleSelect = document.createElement("select");
    roleSelect.innerHTML = `
      <option value="runner">Runner</option>
      <option value="admin">Admin</option>
    `;
    roleSelect.value = userRow.role || "runner";
    roleSelect.onchange = () => updateUserRole(userRow.id, roleSelect.value, userRow.email);
    roleTd.appendChild(roleSelect);
    tr.appendChild(roleTd);

    // ID
    const idTd = document.createElement("td");
    idTd.textContent = userRow.id;
    tr.appendChild(idTd);

    // Actions
    const actionsTd = document.createElement("td");
    actionsTd.style.whiteSpace = "nowrap";

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Remove";
    deleteBtn.className = "btn-secondary";
    deleteBtn.style.fontSize = "11px";
    deleteBtn.style.padding = "6px 10px";
    deleteBtn.onclick = () => deleteUserMapping(userRow.id, userRow.email);

    actionsTd.appendChild(deleteBtn);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
}

/* ---------------------------------------
   ADD USER MAPPING
---------------------------------------- */
async function handleAddUser(e) {
  e.preventDefault();

  const statusEl = document.getElementById("user-status");
  statusEl.textContent = "";
  statusEl.className = "status-text";

  const id = document.getElementById("user-id").value.trim();
  const email = document.getElementById("user-email").value.trim();
  const role = document.getElementById("user-role").value;

  if (!id || !email || !role) {
    statusEl.textContent = "Please fill out all fields.";
    return;
  }

  // Insert into users table
  const { error } = await supabase.from("users").insert([
    { id, email, role }
  ]);

  if (error) {
    console.error("Error inserting user mapping:", error);
    statusEl.textContent = "Error adding user: " + error.message;
    statusEl.classList.add("error");
    return;
  }

  statusEl.textContent = "User mapping added.";
  statusEl.classList.add("success");

  // Clear form
  document.getElementById("user-id").value = "";
  document.getElementById("user-email").value = "";
  document.getElementById("user-role").value = "runner";

  // Reload table
  await loadUsersTable();
}

/* ---------------------------------------
   UPDATE USER ROLE
---------------------------------------- */
async function updateUserRole(id, newRole, email) {
  const statusEl = document.getElementById("user-status");
  statusEl.textContent = "";

  // Prevent demoting yourself if you are the only admin (we'd need a full check, but keep it simple)
  if (email === currentAdminEmail && newRole !== "admin") {
    statusEl.textContent = "You cannot remove your own admin role here.";
    statusEl.classList.add("error");
    // Reload table to reset dropdown
    await loadUsersTable();
    return;
  }

  const { error } = await supabase
    .from("users")
    .update({ role: newRole })
    .eq("id", id);

  if (error) {
    console.error("Error updating role:", error);
    statusEl.textContent = "Error updating role: " + error.message;
    statusEl.classList.add("error");
    return;
  }

  statusEl.textContent = `Role updated to "${newRole}".`;
  statusEl.classList.add("success");
}

/* ---------------------------------------
   DELETE USER MAPPING
---------------------------------------- */
async function deleteUserMapping(id, email) {
  const statusEl = document.getElementById("user-status");
  statusEl.textContent = "";
  statusEl.className = "status-text";

  if (email === currentAdminEmail) {
    statusEl.textContent = "You cannot remove your own user mapping.";
    statusEl.classList.add("error");
    return;
  }

  const confirmMsg =
    `Remove mapping for ${email}? This will block their access to the app.\n` +
    `You may also want to remove them from Supabase Auth → Users.`;

  if (!window.confirm(confirmMsg)) return;

  const { error } = await supabase
    .from("users")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting user mapping:", error);
    statusEl.textContent = "Error removing user: " + error.message;
    statusEl.classList.add("error");
    return;
  }

  statusEl.textContent = "User mapping removed. They can no longer use the app.";
  statusEl.classList.add("success");

  await loadUsersTable();
}

