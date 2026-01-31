// Handle payment success and activate Pro subscription

async function activateProSubscription() {
  const contentDiv = document.getElementById("content");

  try {
    // Get URL parameters from DodoPay redirect
    const urlParams = new URLSearchParams(window.location.search);
    const paymentId = urlParams.get("payment_id");
    const status = urlParams.get("status");

    console.log("Payment redirect parameters:", {
      paymentId,
      status,
      allParams: Object.fromEntries(urlParams),
    });

    // Check payment status (DodoPay may send "succeeded" or "active")
    const validStatuses = ["succeeded", "success", "active", "completed"];
    if (!status || !validStatuses.includes(status.toLowerCase())) {
      throw new Error(
        `Payment was not successful. Status: ${status || "unknown"}`
      );
    }

    // Get current user
    const { user } = await chrome.storage.local.get(["user"]);

    if (!user || !user.id) {
      throw new Error("User not found. Please sign in again.");
    }

    // Initialize Supabase
    const supabaseClient = supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey
    );

    // Check if webhook already updated the subscription (DodoPay doesn't send payment_id in redirect)
    console.log("Checking if webhook already activated Pro subscription...");
    console.log("Querying database for user:", user.id, "email:", user.email);

    const { data: updatedUser, error: fetchError } = await supabaseClient
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (fetchError) {
      console.error("Error checking user subscription:", fetchError);
      throw new Error("Failed to verify subscription status.");
    }

    console.log("Full user record from database:", updatedUser);
    console.log("subscription_tier:", updatedUser.subscription_tier);
    console.log("subscription_status:", updatedUser.subscription_status);

    // If already Pro (webhook updated it), just update local storage and show success
    if (updatedUser.subscription_tier === "pro") {
      console.log("✓ Webhook already activated Pro subscription!");

      // Update local storage
      await chrome.storage.local.set({
        user: {
          ...user,
          subscription_tier: "pro",
          subscription_status: updatedUser.subscription_status || "active",
        },
      });

      // Show success and redirect
      showSuccessUI();
      return;
    }

    // If not Pro yet, webhook might still be processing - show waiting message
    console.log("Subscription not yet activated, webhook may be processing...");
    contentDiv.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p style="color: #718096; margin-top: 20px;">
          Processing your payment...<br>
          <small>This usually takes a few seconds</small>
        </p>
      </div>
    `;

    // Poll for status change (webhook should update it soon)
    let pollAttempts = 0;
    const maxPolls = 15; // 30 seconds max

    const pollInterval = setInterval(async () => {
      pollAttempts++;
      console.log(`Polling attempt ${pollAttempts}/${maxPolls}...`);

      const { data: checkUser } = await supabaseClient
        .from("users")
        .select("subscription_tier, subscription_status")
        .eq("id", user.id)
        .single();

      if (checkUser?.subscription_tier === "pro") {
        clearInterval(pollInterval);
        console.log("✓ Pro subscription activated!");

        await chrome.storage.local.set({
          user: {
            ...user,
            subscription_tier: "pro",
            subscription_status: checkUser.subscription_status || "active",
          },
        });

        showSuccessUI();
      } else if (pollAttempts >= maxPolls) {
        clearInterval(pollInterval);
        console.log("Polling timeout - showing manual refresh message");

        // Log debug info
        console.log("Debug: Webhook may not have updated the database yet");
        console.log("User email:", user.email);
        console.log("User ID:", user.id);
        console.log("Expected: subscription_tier = 'pro'");

        contentDiv.innerHTML = `
          <div class="success-icon">⏳</div>
          <h1>Payment Processing...</h1>
          <p class="subtitle">
            Your payment is being processed. This may take a moment.<br>
            Please refresh this page or check back in a minute.
          </p>
          <button id="refresh-btn" style="margin-top: 20px; padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">
            Refresh Page
          </button>
          <p style="margin-top: 20px; font-size: 12px; color: #999;">
            Payment completed successfully. If Pro features don't activate after refresh, please contact support with your email: ${user.email}
          </p>
        `;

        // Add event listener instead of inline onclick
        document.getElementById("refresh-btn").addEventListener("click", () => {
          location.reload();
        });
      }
    }, 2000); // Check every 2 seconds
  } catch (error) {
    console.error("Error activating Pro subscription:", error);
    showErrorUI(error.message);
  }
}

function showSuccessUI() {
  const contentDiv = document.getElementById("content");
  contentDiv.innerHTML = `
    <div class="success-icon">✓</div>
    <div class="pro-badge">PRO MEMBER</div>
    <h1>Welcome to Pro!</h1>
    <p class="subtitle">Your subscription has been activated successfully</p>
    
    <div class="features-unlocked">
      <h3>🎉 All Pro Features Now Active:</h3>
      <ul>
        <li>✨ Advanced capture settings & customization</li>
        <li>📄 Export all slides as searchable PDF</li>
        <li>☁️ Cloud sync across all your devices</li>
        <li>💾 Unlimited cloud storage for all captures</li>
        <li>📁 Multiple workspaces for organization</li>
        <li>🔄 Sync local captures to cloud workspaces</li>
        <li>🎯 Priority customer support</li>
        <li>🚀 Early access to new features</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin-top: 20px; padding: 16px; background: #f7fafc; border-radius: 8px;">
      <p style="margin: 0; font-size: 14px; color: #4a5568;">
        🎊 Redirecting to your extension in <strong id="countdown">3</strong> seconds...
      </p>
    </div>
    
    <button class="btn-continue" id="continue-btn">Go to Extension Now</button>
  `;

  // Countdown timer
  let countdown = 3;
  const countdownEl = document.getElementById("countdown");

  const timer = setInterval(() => {
    countdown--;
    if (countdownEl) {
      countdownEl.textContent = countdown;
    }

    if (countdown <= 0) {
      clearInterval(timer);
      redirectToExtension();
    }
  }, 1000);

  // Manual button click
  document.getElementById("continue-btn").addEventListener("click", () => {
    clearInterval(timer);
    redirectToExtension();
  });
}

function redirectToExtension() {
  // Try multiple redirect strategies

  // Strategy 1: Try to open popup (may not work from extension pages)
  chrome.action.openPopup().catch(() => {
    console.log("Could not open popup programmatically, trying alternative...");
  });

  // Strategy 2: Always open in new tab as fallback
  setTimeout(() => {
    chrome.tabs.create(
      {
        url: chrome.runtime.getURL("popup.html?new_pro=true"),
        active: true,
      },
      (tab) => {
        console.log("Opened popup in new tab:", tab.id);
        // Close the success page after opening popup
        setTimeout(() => {
          window.close();
        }, 500);
      }
    );
  }, 100);
}

function showErrorUI(errorMessage) {
  const contentDiv = document.getElementById("content");
  contentDiv.innerHTML = `
    <div class="error">${errorMessage}</div>
    <h1>Oops! Something went wrong</h1>
    <p class="subtitle">Don't worry, if payment was successful, we'll activate your account shortly.</p>
    <button class="btn-continue" id="retry-btn">Try Again</button>
    <button class="btn-continue" style="background: #e2e8f0; color: #4a5568; margin-top: 12px;" id="close-btn">Close</button>
  `;

  document.getElementById("retry-btn").addEventListener("click", () => {
    location.reload();
  });

  document.getElementById("close-btn").addEventListener("click", () => {
    window.close();
  });
}

// Start activation process when page loads
document.addEventListener("DOMContentLoaded", () => {
  activateProSubscription();
});
