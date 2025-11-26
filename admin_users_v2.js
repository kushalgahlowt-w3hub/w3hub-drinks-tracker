// admin_users.js
// Manages rows in your public "users" table (id, email, role)
// Does NOT create/delete Supabase Auth users — only maps roles.

document.addEventListener("DOMContentLoaded", () => {
  initUserManagement().catch(err => {
    console.error("Error initialising user management:", err);
    const s = document.getElementById("user-status");
    if (s) s.textContent = "Error initialising user management.";
  });
});

async function initUserManagement() {
  await loadUsersTable();

  const form = document.getElementById("create-user-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await createUser();
    });
  }
}

// ✅ Load all users into table
async function loadUsersTable() {
  const tbody = document.getElementById("users-table-body");
  tbody.innerHTML = "";

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("email", { ascending: true }); // ✅ Safe ordering

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

// ✅ Add a row to users table UI
function addUserRow(user) {
  const tbody = document.getElementById("users-table-body");
  const row = document.createElement("tr");

  // Email cell
  const emailCell = document.createElement("td");
  emailCell.textContent = user.email;
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

  // Created column placeholder (not required)
  const createdCell = document.createElement("td");
  createdCell.textContent = "-"; // ✅ avoids needing created_at column
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

// ✅ Create new User → inserts email + role into mapping table
async function createUser() {
  const emailInput = document.getElementById("new-user-email");
  const roleSelect = document.getElementById("new-user-role");
  const statusEl = document.getElementById("user-status");

  const email = emailInput.value.trim().toLowerCase();
  const role = roleSelect.value;

  if (!email) {
    statusEl.textContent = "Email is required.";
    statusEl.classList.add("error");
    return;
  }

  const { error } = await supabase
    .from("users")
    .insert([{ email, role }]);

  if (error) {
    console.error("Error creating user:", error);
    statusEl.textContent = "Error creating user: " + error.message;
    statusEl.classList.add("error");
    return;
  }

  statusEl.textContent = "User added successfully!";
  statusEl.classList.remove("error");
  statusEl.classList.add("success");

  emailInput.value = "";
  await loadUsersTable();
}

// ✅ Update role
async function updateUserRole(id, newRole) {
  const statusEl = document.getElementById("user-status");

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

  statusEl.textContent = "Role updated!";
  statusEl.classList.remove("error");
  statusEl.classList.add("success");

  await loadUsersTable();
}

// ✅ Delete user mapping
async function deleteUser(id) {
  const statusEl = document.getElementById("user-status");

  const { error } = await supabase
    .from("users")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting user mapping:", error);
    statusEl.textContent = "Error deleting user: " + error.message;
    statusEl.classList.add("error");
    return;
  }

  statusEl.textContent = "User removed!";
  statusEl.classList.remove("error");
  statusEl.classList.add("success");

  await loadUsersTable();
}



