// Authentication Logic
let supabaseClient = null;

// Initialize Supabase
function initSupabase() {
  if (!supabaseClient) {
    supabaseClient = supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey
    );
  }
  return supabaseClient;
}

// DOM Elements
const signinForm = document.getElementById("signin-form");
const signupForm = document.getElementById("signup-form");
const forgotForm = document.getElementById("forgot-form");
const resetForm = document.getElementById("reset-form");
const errorMessage = document.getElementById("error-message");
const successMessage = document.getElementById("success-message");
const formTitle = document.getElementById("form-title");
const formSubtitle = document.getElementById("form-subtitle");

// Show/hide helpers
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = "block";
  successMessage.style.display = "none";
  setTimeout(() => {
    errorMessage.style.display = "none";
  }, 5000);
}

function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.style.display = "block";
  errorMessage.style.display = "none";
  setTimeout(() => {
    successMessage.style.display = "none";
  }, 5000);
}

function setLoading(button, loading) {
  if (loading) {
    button.disabled = true;
    button.innerHTML = '<span class="loading"></span>' + button.textContent;
  } else {
    button.disabled = false;
    button.innerHTML = button.textContent.replace(
      '<span class="loading"></span>',
      ""
    );
  }
}

// Form visibility toggles
document.getElementById("show-signup").addEventListener("click", (e) => {
  e.preventDefault();
  signinForm.classList.add("hidden");
  signupForm.classList.remove("hidden");
  formTitle.textContent = "Create your account";
  formSubtitle.textContent = "Start capturing slides for free";
  errorMessage.style.display = "none";
});

document.getElementById("show-signin").addEventListener("click", (e) => {
  e.preventDefault();
  signupForm.classList.add("hidden");
  signinForm.classList.remove("hidden");
  formTitle.textContent = "Welcome back";
  formSubtitle.textContent = "Sign in to continue";
  errorMessage.style.display = "none";
});

document.getElementById("show-forgot").addEventListener("click", (e) => {
  e.preventDefault();
  signinForm.classList.add("hidden");
  forgotForm.classList.remove("hidden");
  formTitle.textContent = "Reset your password";
  formSubtitle.textContent = "We'll send you a reset link";
  errorMessage.style.display = "none";
});

document.getElementById("back-to-signin").addEventListener("click", (e) => {
  e.preventDefault();
  forgotForm.classList.add("hidden");
  signinForm.classList.remove("hidden");
  formTitle.textContent = "Welcome back";
  formSubtitle.textContent = "Sign in to continue";
  errorMessage.style.display = "none";
});

// Sign In
signinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = document.getElementById("signin-btn");
  setLoading(button, true);

  const email = document.getElementById("signin-email").value;
  const password = document.getElementById("signin-password").value;

  try {
    const client = initSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Get user profile
    const { data: profile, error: profileError } = await client
      .from("users")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (profileError) throw profileError;

    // Store session
    await chrome.storage.local.set({
      user: {
        id: data.user.id,
        email: data.user.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        subscription_tier: profile.subscription_tier,
        session: data.session,
      },
    });

    showSuccess("Signed in successfully!");
    setTimeout(() => {
      window.close();
    }, 1000);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(button, false);
  }
});

// Sign Up
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = document.getElementById("signup-btn");
  setLoading(button, true);

  const firstName = document.getElementById("signup-firstname").value;
  const lastName = document.getElementById("signup-lastname").value;
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  try {
    const client = initSupabase();

    // Sign up user
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (error) throw error;

    // Wait a moment for auth to be established
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Create user profile (now authenticated)
    const { error: profileError } = await client.from("users").insert([
      {
        id: data.user.id,
        email: email,
        first_name: firstName,
        last_name: lastName,
        subscription_tier: SUBSCRIPTION_TIERS.FREE,
      },
    ]);

    if (profileError) throw profileError;

    // Get session from signup data
    const session = data.session;

    // Store session
    await chrome.storage.local.set({
      user: {
        id: data.user.id,
        email: data.user.email,
        first_name: firstName,
        last_name: lastName,
        subscription_tier: SUBSCRIPTION_TIERS.FREE,
        session: session,
      },
    });

    showSuccess("Account created!");
    setTimeout(() => {
      window.close();
    }, 1000);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(button, false);
  }
});

// Forgot Password
forgotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = document.getElementById("forgot-btn");
  setLoading(button, true);

  const email = document.getElementById("forgot-email").value;

  try {
    const client = initSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: chrome.runtime.getURL("auth.html?mode=reset"),
    });

    if (error) throw error;

    showSuccess("Password reset link sent! Check your email.");
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(button, false);
  }
});

// Reset Password
resetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = document.getElementById("reset-btn");
  setLoading(button, true);

  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;

  if (newPassword !== confirmPassword) {
    showError("Passwords do not match");
    setLoading(button, false);
    return;
  }

  try {
    const client = initSupabase();
    const { error } = await client.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;

    showSuccess("Password updated! Redirecting to sign in...");
    setTimeout(() => {
      window.location.href = "auth.html";
    }, 2000);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(button, false);
  }
});

// Check URL parameters for reset mode
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");

  if (mode === "reset") {
    signinForm.classList.add("hidden");
    resetForm.classList.remove("hidden");
    formTitle.textContent = "Set new password";
    formSubtitle.textContent = "Enter your new password";
  }
});

// Check if already logged in
chrome.storage.local.get(["user"], (result) => {
  if (result.user && result.user.session) {
    window.location.href = "popup.html";
  }
});
