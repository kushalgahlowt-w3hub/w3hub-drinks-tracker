// auth.js – runs on protected pages

async function enforceAuth() {
  const requiredRole = document.body.dataset.role || null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    window.location.href = "index.html";
    return;
  }

  const userId = data.user.id;

  const { data: profile, error: profileErr } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    window.location.href = "index.html";
    return;
  }

  const role = profile.role;
  window.currentUserRole = role;

  if (requiredRole && role !== requiredRole) {
    window.location.href = "index.html";
    return;
  }
}

async function setupLogout() {
  const btn = document.getElementById("logout-btn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "index.html";
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await enforceAuth();
  await setupLogout();
});
