// admin_users.js – simple role management UI for admins

async function loadUsers() {
  const status = document.getElementById("users-status");
  const tbody = document.querySelector("#users-table tbody");
  tbody.innerHTML = "";
  status.textContent = "Loading…";

  const { data, error } = await supabase
    .from("users")
    .select("id, email, role")
    .order("email", { ascending: true });

  if (error) {
    status.textContent = "Error loading users: " + error.message;
    return;
  }

  if (!data || !data.length) {
    status.textContent = "No users found.";
    return;
  }

  status.textContent = "";

  data.forEach((u) => {
    const tr = document.createElement("tr");

    const emailTd = document.createElement("td");
    emailTd.textContent = u.email || "";
    tr.appendChild(emailTd);

    const roleTd = document.createElement("td");
    const select = document.createElement("select");
    ["admin", "runner"].forEach((role) => {
      const opt = document.createElement("option");
      opt.value = role;
      opt.textContent = role;
      if (u.role === role) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", async () => {
      await updateUserRole(u.id, select.value);
    });
    roleTd.appendChild(select);
    tr.appendChild(roleTd);

    const actionTd = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove link";
    removeBtn.style.fontSize = "11px";
    removeBtn.style.padding = "4px 8px";
    removeBtn.addEventListener("click", async () => {
      if (!confirm("Remove this user row from the users table?")) return;
      await removeUserRow(u.id);
    });
    actionTd.appendChild(removeBtn);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });
}

async function updateUserRole(id, role) {
  const status = document.getElementById("users-status");
  const { error } = await supabase
    .from("users")
    .update({ role })
    .eq("id", id);

  if (error) {
    status.textContent = "Error updating role: " + error.message;
  } else {
    status.textContent = "Role updated.";
  }
}

async function removeUserRow(id) {
  const status = document.getElementById("users-status");
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) {
    status.textContent = "Error removing user row: " + error.message;
  } else {
    status.textContent = "User row removed.";
    await loadUsers();
  }
}

async function saveOrUpdateUser(email, role) {
  const status = document.getElementById("user-add-status");
  status.style.color = "#e9e9e9";
  status.textContent = "Saving…";

  // Try to find existing row by email
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    status.style.color = "#ff8c8c";
    status.textContent = "Error: " + error.message;
    return;
  }

  if (data && data.id) {
    // Update role only
    const { error: upErr } = await supabase
      .from("users")
      .update({ role })
      .eq("id", data.id);
    if (upErr) {
      status.style.color = "#ff8c8c";
      status.textContent = "Error updating: " + upErr.message;
      return;
    }
    status.style.color = "#b8ffb5";
    status.textContent = "Updated existing user role.";
  } else {
    // Insert new row – note: id should be set by trigger or manually later
    const { error: insErr } = await supabase.from("users").insert([{ email, role }]);
    if (insErr) {
      status.style.color = "#ff8c8c";
      status.textContent = "Error inserting: " + insErr.message;
      return;
    }
    status.style.color = "#b8ffb5";
    status.textContent = "Added new user row. Link it to auth.user via id if needed.";
  }

  await loadUsers();
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("user-add-form");
  const emailInput = document.getElementById("user-email");
  const roleSelect = document.getElementById("user-role");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const role = roleSelect.value;
    if (!email) return;
    await saveOrUpdateUser(email, role);
  });

  loadUsers();
});
