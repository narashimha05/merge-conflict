// Import IndexedDB helper
importScripts("db.js");

// Initialize IndexedDB
let dbReady = false;
captureDB
  .init()
  .then(() => {
    dbReady = true;
  })
  .catch((err) => {
    // Initialization error - extension will not function properly
  });

// Set uninstall URL for feedback form
// Replace this URL with your own Google Form or feedback page URL
chrome.runtime.setUninstallURL("https://forms.gle/JC8VjPu4pWXX8qdC8");

// Initialize badge on install/startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ enabled: false }, (s) => {
    updateBadge(s.enabled);
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get({ enabled: false }, (s) => {
    updateBadge(s.enabled);
  });
});

function updateBadge(enabled) {
  if (enabled) {
    chrome.action.setBadgeText({ text: "●" });
    chrome.action.setBadgeBackgroundColor({ color: "#00B894" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// Listen for storage changes to update badge
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled !== undefined) {
    updateBadge(changes.enabled.newValue);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === "save_capture" && msg.dataUrl) {
    const timestamp = msg.timestamp || new Date().toISOString();

    // Save to IndexedDB
    if (dbReady) {
      captureDB
        .addCapture(msg.dataUrl, timestamp)
        .then(() => {
          //log("✓ Capture saved to IndexedDB");
          chrome.storage.sync.set({ lastCapture: timestamp });
          sendResponse({ ok: true });
        })
        .catch((err) => {
          //error("✗ Failed to save capture:", err);
          sendResponse({ ok: false, error: err.message });
        });
      return true; // Keep message channel open for async response
    } else {
      //error("✗ Database not ready");
      sendResponse({ ok: false, error: "Database not ready" });
    }
  } else if (msg.type === "clear_gallery") {
    if (dbReady) {
      captureDB
        .clearAll()
        .then(() => {
          //log("✓ Gallery cleared");
          sendResponse({ ok: true });
        })
        .catch((err) => {
          //error("✗ Failed to clear gallery:", err);
          sendResponse({ ok: false, error: err.message });
        });
      return true;
    } else {
      sendResponse({ ok: false, error: "Database not ready" });
    }
  } else if (msg.type === "clear_all_captures") {
    // Same as clear_gallery - clears all captures from IndexedDB
    if (dbReady) {
      captureDB
        .clearAll()
        .then(() => {
          //log("✓ All captures cleared");
          sendResponse({ ok: true });
        })
        .catch((err) => {
          //error("✗ Failed to clear captures:", err);
          sendResponse({ ok: false, error: err.message });
        });
      return true;
    } else {
      sendResponse({ ok: false, error: "Database not ready" });
    }
  } else if (msg.type === "get_count") {
    if (dbReady) {
      captureDB
        .getCount()
        .then((count) => {
          sendResponse({ count });
        })
        .catch((err) => {
          sendResponse({ count: 0 });
        });
      return true;
    } else {
      sendResponse({ count: 0 });
    }
  } else if (msg.type === "get_all_captures") {
    if (dbReady) {
      captureDB
        .getAllCaptures()
        .then((captures) => {
          sendResponse({ captures });
        })
        .catch((err) => {
          //error("✗ Failed to get captures:", err);
          sendResponse({ captures: [] });
        });
      return true;
    } else {
      sendResponse({ captures: [] });
    }
  } else if (msg.type === "delete_capture") {
    if (dbReady && msg.id) {
      captureDB
        .deleteCapture(msg.id)
        .then(() => {
          sendResponse({ ok: true });
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err.message });
        });
      return true;
    } else {
      sendResponse({ ok: false, error: "Database not ready or invalid ID" });
    }
  } else if (msg.type === "show_notification") {
    // Show browser notification
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/AutoCapture.png",
      title: msg.title || "Slide Capture",
      message: msg.message || "",
      priority: 2,
    });
    sendResponse({ ok: true });
  }
});
