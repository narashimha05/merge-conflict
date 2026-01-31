// Check authentication before showing settings
chrome.storage.local.get(["user"], (result) => {
  if (!result.user || !result.user.session) {
    // Not authenticated, open auth page in new tab
    chrome.tabs.create({ url: chrome.runtime.getURL("auth.html") });
    window.close();
    return;
  }

  // All authenticated users can access settings (no paid tiers)
  initializeSettings();
});

function initializeSettings() {
  const defaults = {
    intervalMs: 1000,
    minPercentForSlide: 0.08,
    ignorePercentThreshold: 0.01,
    popupMasks: [
      { x: 0, y: 0.72, w: 0.55, h: 0.28 },
      { x: 0.28, y: 0.72, w: 0.44, h: 0.28 },
      { x: 0.7, y: 0, w: 0.3, h: 0.25 },
    ],
    debounceSeconds: 2,
    useHashDedup: true,
    smallChangeThreshold: 45,
    enabled: false,
    ocrEnabled: false,
  };

  function showMessage(text, isError = false) {
    const msg = document.getElementById("msg");
    msg.textContent = text;
    msg.classList.add("show");
    if (isError) msg.style.background = "#FF4757";
    else msg.style.background = "#2D3436";
    setTimeout(() => {
      msg.classList.remove("show");
    }, 2000);
  }

  function load() {
    chrome.storage.sync.get(defaults, (s) => {
      document.getElementById("interval").value = s.intervalMs;
      document.getElementById("minPercent").value = Math.round(
        s.minPercentForSlide * 100
      );
      document.getElementById("ignorePercent").value = Math.round(
        s.ignorePercentThreshold * 100
      );
      document.getElementById("debounce").value = s.debounceSeconds;
      document.getElementById("ocrEnabled").checked = !!s.ocrEnabled;
    });
  }

  function save() {
    try {
      const payload = {
        intervalMs: Number(document.getElementById("interval").value),
        minPercentForSlide:
          Number(document.getElementById("minPercent").value) / 100,
        ignorePercentThreshold:
          Number(document.getElementById("ignorePercent").value) / 100,
        debounceSeconds: Number(document.getElementById("debounce").value),
        ocrEnabled: document.getElementById("ocrEnabled").checked,
      };
      chrome.storage.sync.set(payload, () => {
        showMessage("Settings saved successfully!");
      });
    } catch (e) {
      showMessage("Error: " + e.message, true);
    }
  }

  function restore() {
    chrome.storage.sync.set(defaults, () => {
      load();
      showMessage("Defaults restored!");
    });
  }

  document.addEventListener("DOMContentLoaded", load);
  document.getElementById("save").addEventListener("click", save);
  document.getElementById("restore").addEventListener("click", restore);
}
