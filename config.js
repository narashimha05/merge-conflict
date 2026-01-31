// Supabase Configuration
// Replace these with your actual Supabase project credentials
const SUPABASE_CONFIG = {
  url: "https://saafvnbatxpyymhubqqf.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYWZ2bmJhdHhweXltaHVicXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NTQ3NTksImV4cCI6MjA4MDQzMDc1OX0.9YQYMcohGad4_-hW0xcvheVxEBeX6kFcdrG6VDM3_Us", // Paste your actual anon key here (starts with eyJ...)
};

// Subscription tiers
const SUBSCRIPTION_TIERS = {
  FREE: "free",
  PRO: "pro",
};

// Feature flags
const FEATURES = {
  SETTINGS: "settings",
  EXPORT_PDF: "export_pdf",
  CLOUD_SYNC: "cloud_sync",
};

// Check if feature is available for user tier
function hasFeatureAccess(userTier, feature) {
  const proFeatures = [
    FEATURES.SETTINGS,
    FEATURES.EXPORT_PDF,
    FEATURES.CLOUD_SYNC,
  ];

  if (proFeatures.includes(feature)) {
    return userTier === SUBSCRIPTION_TIERS.PRO;
  }

  return true; // Free features available to all
}
