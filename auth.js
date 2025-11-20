// auth.js
// Route protection + role-based UI for w3.hub drinks tracker.
// Assumes each HTML page creates a global `supabase` client first.

// ------------- helpers -------------

function getPageKey() {
  let path = window.location.pathname; // e.g. /runner.html, /runner, /
  if (!path || path === "/") return "index";

  let last = path.split("/").pop();    // "runner" or "runner.html"
  if (!last) return "index";

  if (last.endsWith(".html")) {
    last = last.slice(0, -5);         // strip ".html"
  }
  return last;                         // e.g. "runner", "admin_reports"
}

const LOGIN_PAGE_KEY = "index";

const PUBLIC_PAGE_KEYS = [
  "index",
  "reset_password",
  "update_password",
];

const ADMIN_PAGE_KEYS = [
  "admin_reports",
  "dashboard",
  "admin_users",
];

const RUNNER_PAGE_KEYS = [
  "runner",
  "runner_activity" // if later we add a dedicated page
];

// ------------- main auth check -------------

async function checkAuth() {
  const page = getPageKey();

  // 1) Get current session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // --- NOT LOGGED IN ---
  if (!session) {
    // allow public pages without redirect
    if (!PUBLIC_PAGE_KEYS.includes(page)) {
      window.location.href = "index.html";
    }
    return;
  }

  // --- LOGGED IN: find role in users table ---
  const userEmail = session.user.email;

  const { data: userRow, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", userEmail)
    .single();

  if (error || !userRow) {
    // Auth user exists but no row in users table → log out
    await supabase.auth.signOut();
    window.location.href = "index.html";
    return;
  }

  const role = userRow.role; // "admin" or "runner"
  window.currentUserRole = role;

  // --- LOGGED IN BUT ON PUBLIC PAGE (except update_password) ---
  if (PUBLIC_PAGE_KEYS.includes(page) && page !== "update_password") {
    if (role === "admin") {
      window.location.href = "admin_reports.html";
    } else if (role === "runner") {
      window.location.href = "runner.html";
    }
    return;
  }

  // --- ADMIN PAGES ---
  if (ADMIN_PAGE_KEYS.includes(page)) {
    if (role !== "admin") {
      // runners get kicked to runner mode
      window.location.href = "runner.html";
      return;
    }
  }

  // --- RUNNER PAGES ---
  if (RUNNER_PAGE_KEYS.includes(page)) {
    if (role !== "admin" && role !== "runner") {
      await supabase.auth.signOut();
      window.location.href = "index.html";
      return;
    }
  }

  // Apply UI visibility rules
  applyRoleUI(role);
}

// ------------- role-based UI tweaks -------------

function applyRoleUI(role) {
  // Hide admin-only things for runners
  const adminOnlyEls = document.querySelectorAll("[data-role='admin-only']");
  adminOnlyEls.forEach((el) => {
    if (role !== "admin") {
      el.style.display = "none";
    }
  });

  // Hide runner-only things for admins (if desired)
  const runnerOnlyEls = document.querySelectorAll("[data-role='runner-only']");
  runnerOnlyEls.forEach((el) => {
    if (role === "admin") {
      el.style.display = "none";
    }
  });
}

// ------------- logout -------------

async function logoutUser() {
  await supabase.auth.signOut();
  window.location.href = "index.html";
}
window.logoutUser = logoutUser;

// ------------- clean stray auth params (fix token error) -------------

function cleanAuthQueryParams() {
  // Some Supabase flows leave ?code=...&state=... in the URL.
  // If code_verifier is missing (Safari / back button), Supabase complains.
  const url = new URL(window.location.href);
  let changed = false;

  if (url.searchParams.has("code")) {
    url.searchParams.delete("code");
    changed = true;
  }
  if (url.searchParams.has("state")) {
    url.searchParams.delete("state");
    changed = true;
  }

  if (changed) {
    const newUrl =
      url.pathname +
      (url.searchParams.toString()
        ? "?" + url.searchParams.toString()
        : "") +
      url.hash;
    window.history.replaceState({}, document.title, newUrl);
  }
}

// ------------- init -------------

document.addEventListener("DOMContentLoaded", () => {
  cleanAuthQueryParams();
  checkAuth();
});

