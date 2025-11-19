// app.js – login + session persistence

const SUPABASE_URL = "https://trcnszlkdunbbybdyjag.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyY25zemxrZHVuYmJ5YmR5amFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzODM4MTYsImV4cCI6MjA3ODk1OTgxNn0.wCAAHfsBOeU6rp4v_7JhdMI9NlucX1cT1_3GTZ0GR8M";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function setError(msg) {
  const el = document.getElementById("error-message");
  if (el) el.textContent = msg || "";
}

function setButtonState(loading) {
  const btn = document.querySelector("#login-form button[type='submit']");
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "Logging in…" : "Log in";
}

async function fetchUserRole(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data.role;
}

function redirectForRole(role) {
  if (role === "admin") {
    window.location.href = "admin_reports.html";
  } else if (role === "runner") {
    window.location.href = "runner.html";
  } else {
    setError("Your account does not have a valid role. Please contact an admin.");
  }
}

async function handleExistingSession() {
  // Check if user is already logged in
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return;

  const role = await fetchUserRole(data.user.id);
  if (!role) return;

  // Already logged in → skip login form and redirect
  redirectForRole(role);
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("login-form");
  if (!form) return;

  // If already logged in, redirect based on role
  await handleExistingSession();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    setButtonState(true);

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      setError("Please enter your email and password.");
      setButtonState(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Login failed: " + error.message);
      setButtonState(false);
      return;
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      setError("Authentication issue. Please try again.");
      setButtonState(false);
      return;
    }

    const userId = userData.user.id;
    const role = await fetchUserRole(userId);
    if (!role) {
      setError("No role found for this user. Ask an admin to add you to the users table.");
      setButtonState(false);
      return;
    }

    redirectForRole(role);
  });
});
