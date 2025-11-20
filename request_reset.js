// request_reset.js
// Sends password reset email and directs users to the real reset_password.html

const SUPABASE_URL = "https://trcnszlkdunbbybdyjag.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyY25zemxrZHVuYmJ5YmR5amFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzODM4MTYsImV4cCI6MjA3ODk1OTgxNn0.wCAAHfsBOeU6rp4v_7JhdMI9NlucX1cT1_3GTZ0GR8M";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("reset-form");
  const statusEl = document.getElementById("reset-status");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.style.color = "#e9e9e9";
    statusEl.textContent = "Sending reset email…";

    const email = document.getElementById("reset-email").value.trim();
    if (!email) {
      statusEl.style.color = "#ff8c8c";
      statusEl.textContent = "Please enter your email.";
      return;
    }

    // Important: specify redirectTo → reset_password.html
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://w3hub.netlify.app/reset_password.html"
    });

    if (error) {
      console.error(error);
      statusEl.style.color = "#ff8c8c";
      statusEl.textContent = "Error: " + error.message;
      return;
    }

    statusEl.style.color = "#b8ffb5";
    statusEl.textContent =
      "If an account exists with that email, a reset link has been sent.";
  });
});

