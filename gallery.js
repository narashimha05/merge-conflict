// Check authentication first
chrome.storage.local.get(["user"], (result) => {
  if (!result.user || !result.user.session) {
    // Not authenticated, open auth page in new tab
    chrome.tabs.create({ url: chrome.runtime.getURL("auth.html") });
    window.close();
    return;
  }

  // User is authenticated, initialize gallery
  initializeGallery(result.user);
});

async function initializeGallery(currentUser) {
  const grid = document.getElementById("grid");
  const emptyState = document.getElementById("empty-state");
  const btnPdf = document.getElementById("export-pdf");
  const btnClear = document.getElementById("clear");
  const btnDownloadAll = document.getElementById("download-all");
  const toast = document.getElementById("toast");

  // Populate user profile
  const userAvatar = document.getElementById("user-avatar");
  const userName = document.getElementById("user-name");
  const userTier = document.getElementById("user-tier");
  const btnWorkspace = document.getElementById("btn-workspace");

  const firstInitial = currentUser.first_name
    ? currentUser.first_name.charAt(0)
    : currentUser.email.charAt(0);
  userAvatar.textContent = firstInitial;
  userName.textContent =
    currentUser.first_name || currentUser.email.split("@")[0];
  // All users are on the free plan with full feature access
  userTier.textContent = "Free";
  userTier.className = "user-tier free";

  // Show Workspace and Sync buttons for all users
  const btnSyncWorkspace = document.getElementById("btn-sync-workspace");
  btnWorkspace.style.display = "inline-flex";
  if (btnSyncWorkspace) {
    btnSyncWorkspace.style.display = "inline-flex";
  }

  // Hide lock icons since there is no paid tier
  const lockIcons = document.querySelectorAll(".lock-icon");
  lockIcons.forEach((icon) => (icon.style.display = "none"));

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
  }

  function downloadImage(dataUrl, filename) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function deleteCapture(id) {
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "delete_capture", id },
          (response) => {
            if (response && response.ok) {
              resolve();
            } else {
              reject(new Error(response?.error || "Delete failed"));
            }
          }
        );
      });
      showToast("Capture deleted");
      await loadAndRender();
    } catch (err) {
      showToast("Failed to delete");
    }
  }

  async function loadAndRender() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "get_all_captures" }, (response) => {
        const list = response?.captures || [];
        render(list);
        resolve();
      });
    });
  }

  function render(list) {
    grid.innerHTML = "";

    if (!list || list.length === 0) {
      emptyState.style.display = "block";
      grid.style.display = "none";
      return;
    }

    emptyState.style.display = "none";
    grid.style.display = "grid";

    list.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "gallery-item";

      const img = document.createElement("img");
      img.src = item.dataUrl;
      img.alt = `Slide ${idx + 1}`;

      const info = document.createElement("div");
      info.className = "gallery-item-info";

      const time = document.createElement("span");
      time.className = "gallery-item-time";
      time.textContent = new Date(item.ts).toLocaleString();

      const actions = document.createElement("div");
      actions.className = "gallery-item-actions";

      // Download button
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "icon-btn";
      downloadBtn.title = "Download";
      downloadBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>`;
      downloadBtn.addEventListener("click", () => {
        const filename = `slide-${new Date(item.ts)
          .toISOString()
          .replace(/[:.]/g, "-")}.png`;
        downloadImage(item.dataUrl, filename);
        showToast("Download started");
      });

      // Delete button
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "icon-btn";
      deleteBtn.title = "Delete";
      deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>`;
      deleteBtn.addEventListener("click", () => {
        if (confirm("Delete this capture?")) {
          deleteCapture(item.id);
        }
      });

      actions.appendChild(downloadBtn);
      actions.appendChild(deleteBtn);
      info.appendChild(time);
      info.appendChild(actions);
      card.appendChild(img);
      card.appendChild(info);
      grid.appendChild(card);
    });
  }

  // Load initial captures
  await loadAndRender();

  // Clear all
  btnClear.addEventListener("click", async () => {
    if (confirm("Are you sure you want to delete all captures?")) {
      btnClear.disabled = true;
      try {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "clear_gallery" }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.ok) {
              resolve();
            } else {
              reject(new Error(response?.error || "Clear failed"));
            }
          });
        });
        showToast("Gallery cleared");
        await loadAndRender();
      } catch (err) {
        showToast("Failed to clear gallery");
      } finally {
        btnClear.disabled = false;
      }
    }
  });

  // Workspace button (Pro feature)
  btnWorkspace.addEventListener("click", () => {
    // Open workspace-login.html in new tab
    window.open(chrome.runtime.getURL("workspace-login.html"), "_blank");
  });

  // Sync to Workspace button (Pro feature)
  if (btnSyncWorkspace) {
    btnSyncWorkspace.addEventListener("click", async () => {
      // Check if user has local captures
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "get_all_captures" }, resolve);
      });
      const localCaptures = response?.captures || [];

      if (localCaptures.length === 0) {
        showToast("No local captures to sync");
        return;
      }

      // Check if workspace_user session exists
      chrome.storage.local.get(["workspace_user"], async (result) => {
        if (!result.workspace_user || !result.workspace_user.session) {
          // No workspace session, redirect to login
          showToast("Please login to workspace first");
          setTimeout(() => {
            window.open(
              chrome.runtime.getURL("workspace-login.html"),
              "_blank"
            );
          }, 1000);
          return;
        }

        // Load workspaces and show modal
        await loadWorkspacesForSync(result.workspace_user, localCaptures);
      });
    });
  }

  // Sync to Workspace Modal Logic
  const syncModal = document.getElementById("sync-workspace-modal");
  const syncForm = document.getElementById("sync-workspace-form");
  const workspaceSelect = document.getElementById("workspace-select");
  const newWorkspaceName = document.getElementById("new-workspace-name");
  const btnSyncCancel = document.getElementById("btn-sync-cancel");

  let workspacesForSync = [];
  let capturesForSync = [];
  let workspaceUser = null;

  async function loadWorkspacesForSync(user, captures) {
    workspaceUser = user;
    capturesForSync = captures;

    try {
      // Initialize Supabase client with workspace user session
      const supabaseClient = supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey,
        {
          auth: {
            persistSession: false,
            storageKey: "workspace-auth",
          },
        }
      );

      // Set the session for the workspace user
      if (user.session) {
        await supabaseClient.auth.setSession({
          access_token: user.session.access_token,
          refresh_token: user.session.refresh_token,
        });
      }

      // Load user's workspaces
      const { data, error } = await supabaseClient
        .from("workspaces")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }

      workspacesForSync = data || [];

      // Populate select dropdown
      workspaceSelect.innerHTML =
        '<option value="">Choose a workspace...</option>';
      workspacesForSync.forEach((ws) => {
        const option = document.createElement("option");
        option.value = ws.id;
        option.textContent = ws.name;
        workspaceSelect.appendChild(option);
      });

      // Show modal
      syncModal.classList.add("show");
      showToast(`Ready to sync ${captures.length} captures`);
    } catch (error) {
      console.error("Failed to load workspaces:", error);
      showToast(
        "Failed to load workspaces: " + (error.message || "Unknown error")
      );
    }
  }

  if (btnSyncCancel) {
    btnSyncCancel.addEventListener("click", () => {
      syncModal.classList.remove("show");
      workspaceSelect.value = "";
      newWorkspaceName.value = "";
    });
  }

  if (syncForm) {
    syncForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const selectedWorkspaceId = workspaceSelect.value;
      const newName = newWorkspaceName.value.trim();

      if (!selectedWorkspaceId && !newName) {
        showToast("Please select or create a workspace");
        return;
      }

      try {
        const supabaseClient = supabase.createClient(
          SUPABASE_CONFIG.url,
          SUPABASE_CONFIG.anonKey,
          {
            auth: {
              persistSession: false,
              storageKey: "workspace-auth",
            },
          }
        );

        // Set the session for the workspace user
        if (workspaceUser && workspaceUser.session) {
          await supabaseClient.auth.setSession({
            access_token: workspaceUser.session.access_token,
            refresh_token: workspaceUser.session.refresh_token,
          });
        }

        let workspaceId = selectedWorkspaceId;

        // Create new workspace if name provided
        if (newName) {
          showToast("Creating workspace...");
          const { data, error } = await supabaseClient
            .from("workspaces")
            .insert([{ user_id: workspaceUser.id, name: newName }])
            .select()
            .single();

          if (error) {
            console.error("Create workspace error:", error);
            throw error;
          }
          workspaceId = data.id;
        }

        // Sync all captures to workspace
        showToast(`Syncing ${capturesForSync.length} captures...`);

        const captureData = capturesForSync.map((capture) => ({
          workspace_id: parseInt(workspaceId),
          user_id: workspaceUser.id,
          data_url: capture.dataUrl,
          timestamp: new Date(capture.ts).toISOString(),
        }));

        const { error: insertError } = await supabaseClient
          .from("workspace_captures")
          .insert(captureData);

        if (insertError) {
          console.error("Insert captures error:", insertError);
          throw insertError;
        }

        showToast("✓ Sync complete!");

        // Close modal first
        syncModal.classList.remove("show");
        workspaceSelect.value = "";
        newWorkspaceName.value = "";

        // Ask if user wants to clear local captures
        setTimeout(() => {
          if (
            confirm(
              `Sync successful! Clear local captures?\n\nThis will free up local storage while keeping your captures in the cloud workspace.`
            )
          ) {
            chrome.runtime.sendMessage(
              { type: "clear_all_captures" },
              async (response) => {
                if (response && response.ok) {
                  showToast("Local captures cleared");
                  await loadAndRender();
                } else {
                  showToast("Failed to clear local captures");
                }
              }
            );
          }
        }, 500);
      } catch (error) {
        console.error("Sync error:", error);
        showToast("Sync failed: " + error.message);
      }
    });
  }

  // Download all - Create ZIP file (Pro feature)
  btnDownloadAll.addEventListener("click", async () => {
    // Disable button during processing
    btnDownloadAll.disabled = true;

    // Get captures with proper promise handling
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "get_all_captures" }, (response) => {
        // Ensure we always get a response
        if (chrome.runtime.lastError) {
          resolve({ captures: [] });
        } else {
          resolve(response || { captures: [] });
        }
      });
    });

    const list = response?.captures || [];

    if (!list || list.length === 0) {
      showToast("No captures to download");
      btnDownloadAll.disabled = false;
      return;
    }

    showToast(`Preparing ${list.length} captures...`);

    try {
      // JSZip is now loaded from local file
      if (!window.JSZip) {
        throw new Error("JSZip library not loaded");
      }

      showToast("Creating zip file...");

      const zip = new JSZip();
      const folder = zip.folder("meet-slides");

      // Add all images to zip with progress
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const filename = `slide-${String(i + 1).padStart(3, "0")}-${new Date(
          item.ts
        )
          .toISOString()
          .replace(/[:.]/g, "-")}.png`;

        try {
          // Convert data URL to blob
          const parts = item.dataUrl.split(",");
          if (parts.length === 2) {
            const base64Data = parts[1];
            folder.file(filename, base64Data, { base64: true });
          }
        } catch (err) {
          // Skip slides that fail to load
        }

        // Update progress every 5 slides
        if ((i + 1) % 5 === 0 || i === list.length - 1) {
          showToast(`Processing ${i + 1}/${list.length}...`);
        }
      }

      showToast("Compressing...");

      // Generate zip file with compression (no workers to avoid "No SW" error)
      const content = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
        streamFiles: false, // Disable streaming to avoid Service Worker requirement
      });

      // Download zip
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `meet-slides-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up after a delay
      setTimeout(() => {
        URL.revokeObjectURL(link.href);
      }, 1000);

      showToast(`✓ Downloaded ${list.length} captures as ZIP`);
    } catch (error) {
      showToast("Failed to create ZIP: " + error.message);

      // Fallback: download individually
      if (
        confirm("ZIP creation failed. Download images individually instead?")
      ) {
        for (let i = 0; i < list.length; i++) {
          setTimeout(() => {
            const item = list[i];
            const filename = `slide-${String(i + 1).padStart(
              3,
              "0"
            )}-${new Date(item.ts).toISOString().replace(/[:.]/g, "-")}.png`;
            downloadImage(item.dataUrl, filename);
          }, i * 300);
        }
        showToast("Downloading individually...");
      }
    } finally {
      // Re-enable button
      btnDownloadAll.disabled = false;
    }
  });

  // Export PDF (Pro feature)
  btnPdf.addEventListener("click", async () => {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "get_all_captures" }, resolve);
    });
    const list = response?.captures || [];

    if (!list.length) {
      showToast("No captures to export");
      return;
    }
    // Create a simple PDF using browser print
    const w = window.open("about:blank");
    let html = `<!DOCTYPE html>
      <html>
      <head>
        <title>Slides PDF Export</title>
        <style>
          body { margin: 0; padding: 0; }
          .page { page-break-after: always; display: flex; align-items: center; justify-content: center; height: 100vh; }
          .page:last-child { page-break-after: avoid; }
          img { max-width: 100%; max-height: 100vh; object-fit: contain; }
        </style>
      </head>
      <body>`;
    list.forEach((it) => {
      html += `<div class="page"><img src="${it.dataUrl}"></div>`;
    });
    html += "</body></html>";
    w.document.write(html);
    w.document.close();
    showToast("PDF preview opened - use Print to save");
  });
}
