// Supabase Client for Chrome Extension
// Supabase JS is loaded via supabase.js file
importScripts("supabase.js");

let supabaseClient = null;

// Initialize Supabase client
function initSupabase() {
  if (!supabaseClient && typeof supabase !== "undefined") {
    supabaseClient = supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey
    );
  }
  return supabaseClient;
}

// Auth helper functions
const SupabaseAuth = {
  // Sign up new user
  async signUp(email, password, firstName, lastName) {
    const client = initSupabase();

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

    // Create user profile in users table
    if (data.user) {
      const { error: profileError } = await client.from("users").insert([
        {
          id: data.user.id,
          email: email,
          first_name: firstName,
          last_name: lastName,
          subscription_tier: SUBSCRIPTION_TIERS.FREE,
        },
      ]);

      if (profileError) console.error("Profile creation error:", profileError);
    }

    return data;
  },

  // Sign in existing user
  async signIn(email, password) {
    const client = initSupabase();

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  // Sign out
  async signOut() {
    const client = initSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  },

  // Get current session
  async getSession() {
    const client = initSupabase();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  // Get current user
  async getUser() {
    const client = initSupabase();
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    return data.user;
  },

  // Reset password (send OTP)
  async resetPassword(email) {
    const client = initSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: chrome.runtime.getURL("auth.html?mode=reset"),
    });
    if (error) throw error;
  },

  // Update password with OTP
  async updatePassword(newPassword) {
    const client = initSupabase();
    const { error } = await client.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  },

  // Get user profile with subscription tier
  async getUserProfile(userId) {
    const client = initSupabase();
    const { data, error } = await client
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) throw error;
    return data;
  },
};

// Cloud storage functions (Pro tier only)
const SupabaseStorage = {
  // Save capture to cloud
  async saveCapture(userId, dataUrl, timestamp) {
    const client = initSupabase();

    const { data, error } = await client
      .from("captures")
      .insert([
        {
          user_id: userId,
          data_url: dataUrl,
          timestamp: timestamp,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get all captures for user
  async getAllCaptures(userId) {
    const client = initSupabase();

    const { data, error } = await client
      .from("captures")
      .select("*")
      .eq("user_id", userId)
      .order("timestamp", { ascending: true });

    if (error) throw error;
    return data;
  },

  // Delete capture
  async deleteCapture(captureId, userId) {
    const client = initSupabase();

    const { error } = await client
      .from("captures")
      .delete()
      .eq("id", captureId)
      .eq("user_id", userId);

    if (error) throw error;
  },

  // Clear all captures
  async clearAllCaptures(userId) {
    const client = initSupabase();

    const { error } = await client
      .from("captures")
      .delete()
      .eq("user_id", userId);

    if (error) throw error;
  },

  // Get capture count
  async getCaptureCount(userId) {
    const client = initSupabase();

    const { count, error } = await client
      .from("captures")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    if (error) throw error;
    return count;
  },
};
