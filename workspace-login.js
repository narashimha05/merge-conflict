// Workspace Login Logic
let supabaseClient = null;

function initSupabase() {
  if (!supabaseClient) {
    supabaseClient = supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey,
      {
        auth: {
          persistSession: false, // Don't persist auth session (we manage it manually)
          storageKey: "workspace-auth", // Use different storage key
        },
      }
    );
  }
  return supabaseClient;
}

const loginForm = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");
const errorMessage = document.getElementById("error-message");
const backBtn = document.getElementById("back-btn");

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add("show");
  setTimeout(() => {
    errorMessage.classList.remove("show");
  }, 5000);
}

function setLoading(loading) {
  if (loading) {
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="loading"></span>Signing in...';
  } else {
    loginBtn.disabled = false;
    loginBtn.innerHTML = "Sign In to Workspace";
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoading(true);

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const client = initSupabase();

    // Sign in
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

    // Store workspace session separately
    await chrome.storage.local.set({
      workspace_user: {
        id: data.user.id,
        email: data.user.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        subscription_tier: profile.subscription_tier,
        session: data.session,
      },
    });

    // Verify storage was set successfully
    const verification = await chrome.storage.local.get(["workspace_user"]);
    if (!verification.workspace_user) {
      throw new Error("Failed to save session. Please try again.");
    }

    // Redirect to workspace
    window.location.href = "workspace.html";
  } catch (error) {
    showError(error.message);
    setLoading(false);
  }
});

backBtn.addEventListener("click", (e) => {
  e.preventDefault();
  window.close();
});
