(function () {
  // Settings with sane defaults
  let settings = {
    intervalMs: 1000,
    minPercentForSlide: 0.08, // more sensitive for PDF slides
    ignorePercentThreshold: 0.01, // ignore tiny cursor moves
    popupMasks: [
      { x: 0, y: 0.72, w: 0.55, h: 0.28 },
      { x: 0.28, y: 0.72, w: 0.44, h: 0.28 },
      { x: 0.7, y: 0, w: 0.3, h: 0.25 },
    ],
    folderTemplate: "MeetSlides",
    debounceSeconds: 2,
    useHashDedup: true,
    smallChangeThreshold: 45,
    enabled: false, // Default to false, user must start
    ocrEnabled: false, // false by default to avoid heavy CPU use
  };

  // Monitoring interval reference
  let monitoringInterval = null;

  chrome.storage.sync.get(settings, (stored) => {
    settings = Object.assign(settings, stored);
    if (settings.enabled) startMonitoring();
  });

  // Listen for enable/disable toggle from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "ping") {
      sendResponse({ ok: true, ready: true });
      return true;
    }
    if (msg && msg.type === "toggle_enabled") {
      settings.enabled = msg.enabled;
      if (msg.enabled) {
        startMonitoring();
      } else {
        stopMonitoring();
      }
      sendResponse({ ok: true });
      return true; // Keep channel open for async
    }
    if (msg && msg.type === "capture_now") {
      try {
        // Make sure canvas has content
        const video = getPresentationVideo();
        if (!video) {
          sendResponse({ ok: false, err: "No video found" });
          return true;
        }
        cmpCanvas.width = video.videoWidth;
        cmpCanvas.height = video.videoHeight;
        cmpCtx.drawImage(video, 0, 0, cmpCanvas.width, cmpCanvas.height);
        const dataUrl = cmpCanvas.toDataURL("image/png");
        saveCapture(dataUrl);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, err: e.message });
      }
      return true; // Keep channel open for async
    }
  });

  // Listen for storage changes (backup method)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.enabled !== undefined) {
      settings.enabled = changes.enabled.newValue;
      if (settings.enabled) {
        startMonitoring();
      } else {
        stopMonitoring();
      }
    }
  });

  function getPresentationVideo() {
    const videos = Array.from(document.querySelectorAll("video")).filter(
      (v) => v.videoWidth && v.videoHeight
    );
    if (!videos.length) return null;
    videos.sort(
      (a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight
    );
    return videos[0];
  }

  // canvas for comparisons (willReadFrequently hint)
  const cmpCanvas = document.createElement("canvas");
  const cmpCtx = cmpCanvas.getContext("2d", { willReadFrequently: true });

  let lastImageData = null;
  let lastHash = null;
  let lastCaptureTime = 0;

  // faster average-based dHash-like signature (grayscale 32x8 -> 256 bits)
  function computeFastHash(canvas) {
    const w = 32,
      h = 8;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let vals = [];
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      vals.push(v);
      sum += v;
    }
    const avg = sum / vals.length;
    // produce hex string
    let bits = "";
    for (const v of vals) bits += v > avg ? "1" : "0";
    // convert to hex
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      hex += parseInt(bits.substr(i, 4), 2).toString(16);
    }
    return hex;
  }

  function inPopupMask(px, py, w, h) {
    for (const m of settings.popupMasks) {
      const mx1 = Math.floor(m.x * w),
        my1 = Math.floor(m.y * h);
      const mx2 = Math.floor(mx1 + m.w * w),
        my2 = Math.floor(my1 + m.h * h);
      if (px >= mx1 && px < mx2 && py >= my1 && py < my2) return true;
    }
    return false;
  }

  function frameChanged(prev, next, width, height) {
    let changed = 0,
      total = 0,
      th = settings.smallChangeThreshold;
    for (let i = 0; i < prev.length; i += 4) {
      const idx = i / 4,
        x = idx % width,
        y = Math.floor(idx / width);
      if (inPopupMask(x, y, width, height)) continue;
      total++;
      const diff =
        Math.abs(prev[i] - next[i]) +
        Math.abs(prev[i + 1] - next[i + 1]) +
        Math.abs(prev[i + 2] - next[i + 2]);
      if (diff > th) changed++;
    }
    const pct = changed / total;
    if (pct < settings.ignorePercentThreshold) return { changed: false, pct };
    // Use minPercentForSlide threshold (default 0.13 or 13%)
    return { changed: pct >= settings.minPercentForSlide, pct };
  }

  function saveCapture(dataUrl, meta) {
    const timestamp = new Date().toISOString();

    // Always save capture with no plan-based limits
    chrome.runtime.sendMessage({
      type: "save_capture",
      dataUrl,
      timestamp,
      folderTemplate: settings.folderTemplate,
    });

    // Update last capture timestamp in sync storage
    chrome.storage.sync.set({ lastCapture: timestamp });
  }

  // OCR helper (uses Tesseract if enabled; lazy-load via CDN when used)
  async function doOcrFromCanvas(canvas) {
    if (!settings.ocrEnabled) return null;
    // lazy load Tesseract if needed
    if (!window.Tesseract) {
      try {
        await loadScript(
          "https://unpkg.com/tesseract.js@v2.1.5/dist/tesseract.min.js"
        );
      } catch (e) {
        return null;
      }
    }
    try {
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      const {
        data: { text },
      } = await Tesseract.recognize(blob, "eng");
      return text;
    } catch (e) {
      return null;
    }
  }

  function loadScript(url) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  function stopMonitoring() {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
  }

  function startMonitoring() {
    // Don't start if already running
    if (monitoringInterval) {
      return;
    }

    // Don't start if not enabled
    if (!settings.enabled) {
      return;
    }

    let video = getPresentationVideo();
    if (!video) {
      setTimeout(() => {
        if (settings.enabled) startMonitoring();
      }, 1200);
      return;
    }

    cmpCanvas.width = video.videoWidth;
    cmpCanvas.height = video.videoHeight;

    // Take initial capture immediately
    cmpCtx.drawImage(video, 0, 0, cmpCanvas.width, cmpCanvas.height);
    lastImageData = cmpCtx
      .getImageData(0, 0, cmpCanvas.width, cmpCanvas.height)
      .data.slice();
    lastHash = computeFastHash(cmpCanvas);

    // Save initial frame
    const initialDataUrl = cmpCanvas.toDataURL("image/png");
    saveCapture(initialDataUrl, { hash: lastHash });
    lastCaptureTime = Date.now();

    monitoringInterval = setInterval(async () => {
      // Check if still enabled
      if (!settings.enabled) {
        stopMonitoring();
        return;
      }

      video = getPresentationVideo();
      if (!video) return;
      if (
        cmpCanvas.width !== video.videoWidth ||
        cmpCanvas.height !== video.videoHeight
      ) {
        cmpCanvas.width = video.videoWidth;
        cmpCanvas.height = video.videoHeight;
      }
      cmpCtx.drawImage(video, 0, 0, cmpCanvas.width, cmpCanvas.height);
      const current = cmpCtx.getImageData(
        0,
        0,
        cmpCanvas.width,
        cmpCanvas.height
      );

      const res = frameChanged(
        lastImageData,
        current.data,
        cmpCanvas.width,
        cmpCanvas.height
      );
      const now = Date.now();

      if (res.changed) {
        if (now - lastCaptureTime < settings.debounceSeconds * 1000) {
          // Skip capture due to debounce, but don't update baseline
          return;
        }
        const hash = computeFastHash(cmpCanvas);
        if (settings.useHashDedup && lastHash && hash === lastHash) {
          // Duplicate hash - skip but don't update baseline
          return;
        }

        // Optionally perform OCR (slow); run in background so it doesn't block capture
        let ocrText = null;
        if (settings.ocrEnabled) {
          doOcrFromCanvas(cmpCanvas)
            .then((txt) => {
              // OCR result could be stored into storage for later search
            })
            .catch(() => {});
        }

        const dataUrl = cmpCanvas.toDataURL("image/png");
        saveCapture(dataUrl, { hash });
        lastCaptureTime = now;
        lastImageData = current.data.slice();
        lastHash = hash;
      }
      // Don't update lastImageData in else block - keep comparing to last captured frame
    }, settings.intervalMs);
  }
})();
