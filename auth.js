// -----------------------------
// Supabase Client (already loaded in HTML)
// -----------------------------
// NOTE: Do NOT create the client here. It is created in each HTML using:
// const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// -----------------------------

// Helper: get current page filename
function currentPage() {
    const path = window.location.pathname;
    return path.substring(path.lastIndexOf("/") + 1);
}

// List of protected pages
const ADMIN_ONLY_PAGES = [
    "admin_reports.html",
    "dashboard.html",
    "admin_users.html"
];

const RUNNER_ALLOWED_PAGES = [
    "runner.html"
];

// LOGIN PAGE
const LOGIN_PAGE = "index.html";

// -----------------------------
// MAIN AUTH CHECK
// -----------------------------
async function checkAuth() {
    const page = currentPage();

    // First: check current user session
    const {
        data: { session }
    } = await supabase.auth.getSession();

    // -----------------------------
    // NOT LOGGED IN
    // -----------------------------
    if (!session) {
        // Anyone not logged-in MUST be on the login page
        if (page !== LOGIN_PAGE) {
            window.location.href = LOGIN_PAGE;
        }
        return;
    }

    // User is logged in → get profile from "users" table
    const userEmail = session.user.email;

    const { data: userRow, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", userEmail)
        .single();

    if (error || !userRow) {
        // Logged in but no role assigned → logout for safety
        await supabase.auth.signOut();
        window.location.href = LOGIN_PAGE;
        return;
    }

    const role = userRow.role; // "admin" or "runner"

    // -----------------------------
    // REDIRECT LOGGED-IN USERS AWAY FROM LOGIN PAGE
    // -----------------------------
    if (page === LOGIN_PAGE) {
        if (role === "admin") {
            window.location.href = "admin_reports.html";
            return;
        }
        if (role === "runner") {
            window.location.href = "runner.html";
            return;
        }
    }

    // -----------------------------
    // ADMIN PAGE PROTECTION
    // -----------------------------
    if (ADMIN_ONLY_PAGES.includes(page)) {
        if (role !== "admin") {
            // Runner tries to access admin page → redirect
            window.location.href = "runner.html";
            return;
        }
    }

    // -----------------------------
    // RUNNER PAGE PROTECTION
    // -----------------------------
    if (RUNNER_ALLOWED_PAGES.includes(page)) {

        // RUNNER allowed
        if (role === "runner") return;

        // ADMIN ALSO allowed
        if (role === "admin") return;

        // Unknown → logout
        await supabase.auth.signOut();
        window.location.href = LOGIN_PAGE;
        return;
    }
}

// -----------------------------
// LOGOUT HANDLER
// -----------------------------
async function logoutUser() {
    await supabase.auth.signOut();
    window.location.href = LOGIN_PAGE;
}

// Expose logout function globally
window.logoutUser = logoutUser;

// Run auth check on every protected page EXCEPT login page
document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
});
