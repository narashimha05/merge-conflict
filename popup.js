// Check authentication first and refresh user data from database
chrome.storage.local.get(["user"], async (result) => {
  if (!result.user || !result.user.session) {
    // Not authenticated, open auth page in new tab
    chrome.tabs.create({ url: chrome.runtime.getURL("auth.html") });
    window.close();
    return;
  }

  // Fetch fresh user data from Supabase to ensure we have latest subscription status
  const supabaseClient = supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey
  );

  const { data: freshUser, error } = await supabaseClient
    .from("users")
    .select("*")
    .eq("id", result.user.id)
    .single();

  if (!error && freshUser) {
    // Update local storage with fresh data
    const updatedUser = { ...result.user, ...freshUser };
    await chrome.storage.local.set({ user: updatedUser });

    // Initialize with fresh data
    initializePopup(updatedUser);
  } else {
    // Fallback to cached data if fetch fails
    initializePopup(result.user);
  }
});

function initializePopup(user) {
  const toggleBtn = document.getElementById("toggle-capture");
  const toggleIcon = document.getElementById("toggle-icon");
  const toggleText = document.getElementById("toggle-text");
  const captureBtn = document.getElementById("capture-now");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const lastCapture = document.getElementById("last-capture");
  const captureCount = document.getElementById("capture-count");
  const sessionTime = document.getElementById("session-time");

  // Populate user profile
  const userAvatar = document.getElementById("user-avatar");
  const userName = document.getElementById("user-name");
  const userTier = document.getElementById("user-tier");

  const firstInitial = user.first_name
    ? user.first_name.charAt(0)
    : user.email.charAt(0);
  userAvatar.textContent = firstInitial;
  userName.textContent = user.first_name || user.email.split("@")[0];
  // All users are on the free plan with full access
  // userTier.textContent = "Free";
  // userTier.className = "user-tier free";

  // Setup account details toggle
  setupSubscriptionDetails(user);

  // Hide lock icons since there is no paid tier
  const lockIcons = document.querySelectorAll(".lock-icon");
  lockIcons.forEach((icon) => (icon.style.display = "none"));

  // Update UI based on current state
  function updateUI(enabled, lastCaptureTime) {
    if (enabled) {
      statusDot.classList.add("active");
      statusText.textContent = "Running";
      statusText.classList.remove("stopped");
      toggleBtn.classList.remove("btn-primary");
      toggleBtn.classList.add("btn-danger");
      toggleIcon.innerHTML =
        '<rect x="6" y="6" width="12" height="12" rx="1" />';
      toggleText.textContent = "Stop";
    } else {
      statusDot.classList.remove("active");
      statusText.textContent = "Stopped";
      statusText.classList.add("stopped");
      toggleBtn.classList.remove("btn-danger");
      toggleBtn.classList.add("btn-primary");
      toggleIcon.innerHTML = '<polygon points="5,3 19,12 5,21" />';
      toggleText.textContent = "Start";
    }

    if (lastCaptureTime) {
      const date = new Date(lastCaptureTime);
      lastCapture.textContent = date.toLocaleString();
      sessionTime.textContent = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      lastCapture.textContent = "None";
      sessionTime.textContent = "--";
    }
  }

  // Update badge icon
  function updateBadge(enabled) {
    if (enabled) {
      chrome.action.setBadgeText({ text: "●" });
      chrome.action.setBadgeBackgroundColor({ color: "#00B894" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  }

  // Load initial state
  chrome.storage.sync.get({ enabled: false, lastCapture: null }, (s) => {
    updateUI(s.enabled, s.lastCapture);
    updateBadge(s.enabled);
  });

  // Load capture count from background
  chrome.runtime.sendMessage({ type: "get_count" }, (response) => {
    if (response && response.count !== undefined) {
      captureCount.textContent = response.count;
    } else {
      captureCount.textContent = "0";
    }
  });

  // Helper to check if content script is ready
  async function ensureContentScript(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "ping" });
      return true;
    } catch (e) {
      // Content script not loaded, try to inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["content.js"],
        });
        // Wait a bit for initialization
        await new Promise((resolve) => setTimeout(resolve, 500));
        return true;
      } catch (err) {
        return false;
      }
    }
  }

  // Toggle button (Start/Stop)
  toggleBtn.addEventListener("click", async () => {
    const result = await chrome.storage.sync.get({ enabled: false });
    const newState = !result.enabled;

    chrome.storage.sync.set({ enabled: newState }, async () => {
      updateUI(newState, null);
      updateBadge(newState);
      // Notify content script (if on Meet page)
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (
        tabs &&
        tabs[0] &&
        tabs[0].url &&
        tabs[0].url.includes("meet.google.com")
      ) {
        const ready = await ensureContentScript(tabs[0].id);
        if (ready) {
          chrome.tabs
            .sendMessage(tabs[0].id, {
              type: "toggle_enabled",
              enabled: newState,
            })
            .catch(() => {});
        }
      }
    });
  });

  // Capture now button
  captureBtn.addEventListener("click", async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) return;

    if (!tabs[0].url || !tabs[0].url.includes("meet.google.com")) {
      alert("Please open a Google Meet tab first");
      return;
    }

    const ready = await ensureContentScript(tabs[0].id);
    if (!ready) {
      alert(
        "Could not initialize capture. Please refresh the Meet page and try again."
      );
      return;
    }

    try {
      await chrome.tabs.sendMessage(tabs[0].id, { type: "capture_now" });
    } catch (e) {
      alert(
        "Could not capture. Make sure you are viewing shared content in the Meet call."
      );
    }
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      if (changes.lastCapture) {
        const newTime = changes.lastCapture.newValue;
        lastCapture.textContent = newTime
          ? new Date(newTime).toLocaleString()
          : "None";
        sessionTime.textContent = newTime
          ? new Date(newTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "--";

        // Update count when new capture is added
        chrome.runtime.sendMessage({ type: "get_count" }, (response) => {
          if (response && response.count !== undefined) {
            captureCount.textContent = response.count;
          }
        });
      }
      if (changes.enabled !== undefined) {
        updateUI(changes.enabled.newValue, null);
        updateBadge(changes.enabled.newValue);
      }
    }
  });
}

// Show welcome overlay for new Pro users
function showProWelcome() {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease;
  `;

  overlay.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px;
      border-radius: 20px;
      text-align: center;
      max-width: 400px;
      color: white;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      animation: scaleIn 0.4s ease 0.1s backwards;
    ">
      <div style="font-size: 60px; margin-bottom: 20px;">🎉</div>
      <div style="
        display: inline-block;
        background: rgba(255,255,255,0.3);
        padding: 8px 20px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 16px;
      ">PRO MEMBER</div>
      <h2 style="font-size: 28px; margin-bottom: 12px; font-weight: 700;">Welcome to Pro!</h2>
      <p style="font-size: 14px; opacity: 0.95; margin-bottom: 24px; line-height: 1.6;">
        All premium features are now active. Enjoy unlimited cloud storage, 
        advanced settings, PDF exports, and workspace management!
      </p>
      <button id="close-welcome" style="
        background: white;
        color: #667eea;
        border: none;
        padding: 14px 32px;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='scale(1.05)'" 
         onmouseout="this.style.transform='scale(1)'">
        Get Started
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("close-welcome").addEventListener("click", () => {
    overlay.style.animation = "fadeOut 0.3s ease";
    setTimeout(() => overlay.remove(), 300);
  });

  // Auto close after 5 seconds
  setTimeout(() => {
    if (overlay.parentElement) {
      overlay.style.animation = "fadeOut 0.3s ease";
      setTimeout(() => overlay.remove(), 300);
    }
  }, 5000);
}

// Add CSS animations
const style = document.createElement("style");
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes scaleIn {
    from { transform: scale(0.8); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
`;
document.head.appendChild(style);

// Setup subscription details dropdown
function setupSubscriptionDetails(user) {
  const profileSection = document.getElementById("user-profile-section");
  const detailsSection = document.getElementById("subscription-details");
  const planType = document.getElementById("plan-type");
  const subscriptionStatus = document.getElementById("subscription-status");
  const nextBillingDate = document.getElementById("next-billing-date");
  const subscriptionStart = document.getElementById("subscription-start");
  const logoutBtn = document.getElementById("logout-btn");

  // Toggle dropdown on click
  profileSection.addEventListener("click", () => {
    const isExpanded = detailsSection.style.display === "block";
    detailsSection.style.display = isExpanded ? "none" : "block";
    profileSection.classList.toggle("expanded", !isExpanded);
  });

  // Populate static account details (no subscription or billing)
  // planType.textContent = "Free (all features included)";
  document.getElementById("status-row").style.display = "none";
  document.getElementById("next-billing-row").style.display = "none";
  document.getElementById("started-row").style.display = "none";

  // Logout button handler
  logoutBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to logout?")) {
      chrome.storage.local.remove(["user"], () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("auth.html") });
        window.close();
      });
    }
  });
}
