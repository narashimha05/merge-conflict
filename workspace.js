// Workspace Management
let supabaseClient = null;
let currentUser = null;
let currentWorkspace = null;
let workspaces = [];

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
      },
    );
    // Make it globally accessible for chat
    window.supabaseClient = supabaseClient;
  }
  return supabaseClient;
}

// Check authentication
chrome.storage.local.get(["workspace_user"], async (result) => {
  console.log("Workspace auth check:", result);

  if (!result.workspace_user) {
    console.log("No workspace_user found, redirecting to login");
    window.location.href = "workspace-login.html";
    return;
  }

  if (!result.workspace_user.session) {
    console.log("No session found in workspace_user, redirecting to login");
    window.location.href = "workspace-login.html";
    return;
  }

  currentUser = result.workspace_user;
  document.getElementById("user-email").textContent = currentUser.email;

  await loadWorkspaces();
});

const toast = document.getElementById("toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// Load all workspaces
async function loadWorkspaces() {
  try {
    const client = initSupabase();

    // Set the session for authenticated requests
    if (currentUser.session) {
      await client.auth.setSession({
        access_token: currentUser.session.access_token,
        refresh_token: currentUser.session.refresh_token,
      });
    }

    const { data, error } = await client
      .from("workspaces")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load workspaces error:", error);
      throw error;
    }

    workspaces = data || [];
    console.log("Loaded workspaces:", workspaces);
    renderWorkspaces();
  } catch (error) {
    console.error("Failed to load workspaces:", error);
    showToast("Failed to load workspaces: " + error.message);
  }
}

// Render workspaces in sidebar
async function renderWorkspaces() {
  const list = document.getElementById("workspaces-list");

  if (workspaces.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #636e72; font-size: 13px;">
        <p>No workspaces yet</p>
        <p style="margin-top: 8px; font-size: 12px;">Click "New Workspace" to create one</p>
      </div>
    `;
    return;
  }

  // Get capture counts for each workspace
  const counts = await Promise.all(
    workspaces.map((w) => getWorkspaceCaptureCount(w.id)),
  );

  list.innerHTML = workspaces
    .map(
      (workspace, idx) => `
    <div class="workspace-item ${
      currentWorkspace && currentWorkspace.id === workspace.id ? "active" : ""
    }" 
         data-id="${workspace.id}">
      <div class="workspace-name">${workspace.name}</div>
      <div class="workspace-count">${counts[idx]}</div>
    </div>
  `,
    )
    .join("");

  // Add click handlers
  document.querySelectorAll(".workspace-item").forEach((item) => {
    item.addEventListener("click", () => {
      const id = parseInt(item.dataset.id);
      selectWorkspace(id);
    });
  });
}

// Get capture count for workspace
async function getWorkspaceCaptureCount(workspaceId) {
  try {
    const client = initSupabase();

    // Set the session for authenticated requests
    if (currentUser && currentUser.session) {
      await client.auth.setSession({
        access_token: currentUser.session.access_token,
        refresh_token: currentUser.session.refresh_token,
      });
    }

    const { count, error } = await client
      .from("workspace_captures")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error("Get capture count error:", error);
    return 0;
  }
}

// Select workspace
async function selectWorkspace(workspaceId) {
  currentWorkspace = workspaces.find((w) => w.id === workspaceId);
  if (!currentWorkspace) return;

  document.getElementById("workspace-title").textContent =
    currentWorkspace.name;

  // Update chat with workspace info
  if (window.workspaceChat) {
    window.workspaceChat.currentWorkspaceId = workspaceId;
    window.workspaceChat.supabase = supabaseClient; // Ensure supabase is set
    window.workspaceChat.updateWorkspaceDisplay(currentWorkspace.name);
    await window.workspaceChat.initializeSession();
  }

  await loadWorkspaceCaptures();
  renderWorkspaces(); // Re-render to update active state
}

// Load captures for current workspace
async function loadWorkspaceCaptures() {
  const capturesArea = document.getElementById("captures-area");

  // Show loading skeleton
  capturesArea.innerHTML = `
    <div class="captures-grid">
      ${Array(6)
        .fill(0)
        .map(
          () => `
        <div class="gallery-item skeleton">
          <div class="skeleton-img"></div>
          <div class="gallery-item-info">
            <div class="skeleton-text"></div>
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;

  try {
    const client = initSupabase();

    // Set the session for authenticated requests
    if (currentUser && currentUser.session) {
      await client.auth.setSession({
        access_token: currentUser.session.access_token,
        refresh_token: currentUser.session.refresh_token,
      });
    }

    const { data, error } = await client
      .from("workspace_captures")
      .select("*")
      .eq("workspace_id", currentWorkspace.id)
      .order("timestamp", { ascending: true });

    if (error) {
      console.error("Load captures error:", error);
      throw error;
    }

    const captures = data || [];

    if (captures.length === 0) {
      capturesArea.innerHTML = `
        <div class="empty-workspace">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
          </svg>
          <h3>No captures in this workspace</h3>
          <p>Sync captures from the gallery to add them here</p>
        </div>
      `;
      return;
    }

    capturesArea.innerHTML = `
      <div class="captures-grid">
        ${captures
          .map(
            (capture, idx) => `
          <div class="gallery-item">
            <img src="${capture.data_url}" alt="Slide ${idx + 1}">
            <div class="gallery-item-info">
              <span class="gallery-item-time">${new Date(
                capture.timestamp,
              ).toLocaleString()}</span>
              <div class="gallery-item-actions">
                <button class="icon-btn btn-extract-text" data-image="${capture.data_url}" data-id="${capture.id}" title="Extract Text (OCR)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                </button>
                <button class="icon-btn btn-download-capture" data-image="${capture.data_url}" data-id="${capture.id}" title="Download">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
                <button class="icon-btn btn-delete-capture" data-id="${capture.id}" title="Delete">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  } catch (error) {
    showToast("Failed to load captures");
  }
}

// Download single capture
function downloadCapture(dataUrl, captureId) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `capture-${captureId}-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Download started");
}

// Extract text from capture using OCR.space API
async function extractTextFromCapture(dataUrl, captureId) {
  try {
    showToast("Extracting text from image...");

    const OCR_API_KEY = "K89171548388957";
    const OCR_API_URL = "https://api.ocr.space/parse/image";

    // Prepare form data for OCR.space API
    const formData = new FormData();
    formData.append("base64Image", dataUrl);
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("detectOrientation", "true");
    formData.append("scale", "true");
    formData.append("OCREngine", "2");

    // Call OCR.space API
    const response = await fetch(OCR_API_URL, {
      method: "POST",
      headers: {
        apikey: OCR_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OCR API error: ${response.status}`);
    }

    const result = await response.json();

    if (result.IsErroredOnProcessing) {
      throw new Error(result.ErrorMessage || "OCR processing failed");
    }

    if (result.ParsedResults && result.ParsedResults.length > 0) {
      const extractedText = result.ParsedResults[0].ParsedText;

      if (!extractedText || extractedText.trim().length === 0) {
        showToast("No text detected in this image");
        return;
      }

      // Show extracted text in a modal with copy button
      showExtractedTextModal(extractedText.trim(), captureId);
    } else {
      showToast("No text could be extracted");
    }
  } catch (error) {
    console.error("OCR error:", error);
    showToast(`OCR failed: ${error.message}`);
  }
}

// Show extracted text modal
function showExtractedTextModal(text, captureId) {
  // Create modal if it doesn't exist
  let modal = document.getElementById("ocr-text-modal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "ocr-text-modal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h2>Extracted Text - Slide ${captureId}</h2>
          <button class="icon-btn btn-close-ocr-modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <textarea id="ocr-extracted-text" readonly style="width: 100%; min-height: 300px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-family: monospace; font-size: 14px; resize: vertical;"></textarea>
        </div>
        <div class="modal-footer" style="display: flex; gap: 12px; justify-content: flex-end; padding-top: 20px; border-top: 1px solid #e0e0e0; margin-top: 20px;">
          <button class="btn-secondary btn-close-ocr-modal" style="padding: 10px 20px; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.2s;">Close</button>
          <button class="btn-primary btn-copy-text" style="padding: 10px 20px; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px;">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy Text
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Set the text and show modal
  document.getElementById("ocr-extracted-text").value = text;
  modal.style.display = "flex";
  showToast("Text extraction complete!");
}

// Close OCR modal
function closeOCRModal() {
  const modal = document.getElementById("ocr-text-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

// Copy extracted text to clipboard
function copyExtractedText() {
  const textarea = document.getElementById("ocr-extracted-text");
  textarea.select();
  document.execCommand("copy");
  showToast("Text copied to clipboard!");
}

// Delete workspace capture
async function deleteWorkspaceCapture(captureId) {
  if (!confirm("Delete this capture?")) return;

  try {
    const client = initSupabase();
    const { error } = await client
      .from("workspace_captures")
      .delete()
      .eq("id", captureId);

    if (error) throw error;

    showToast("Capture deleted");
    await loadWorkspaceCaptures();
    await renderWorkspaces(); // Update counts
  } catch (error) {
    showToast("Failed to delete capture");
  }
}

// New Workspace Modal
const newWorkspaceModal = document.getElementById("new-workspace-modal");
const newWorkspaceForm = document.getElementById("new-workspace-form");
const btnNewWorkspace = document.getElementById("btn-new-workspace");
const btnModalCancel = document.getElementById("btn-modal-cancel");

btnNewWorkspace.addEventListener("click", () => {
  newWorkspaceModal.classList.add("show");
  document.getElementById("workspace-name").value = "";
  document.getElementById("workspace-name").focus();
});

btnModalCancel.addEventListener("click", () => {
  newWorkspaceModal.classList.remove("show");
});

newWorkspaceForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("workspace-name").value.trim();
  if (!name) return;

  try {
    const client = initSupabase();
    const { data, error } = await client
      .from("workspaces")
      .insert([
        {
          user_id: currentUser.id,
          name: name,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    showToast("Workspace created");
    newWorkspaceModal.classList.remove("show");
    await loadWorkspaces();
    selectWorkspace(data.id);
  } catch (error) {
    showToast("Failed to create workspace");
  }
});

// Rename Workspace
const renameModal = document.getElementById("rename-workspace-modal");
const renameForm = document.getElementById("rename-workspace-form");
const btnRename = document.getElementById("btn-rename");
const btnRenameCancel = document.getElementById("btn-rename-cancel");

btnRename.addEventListener("click", () => {
  if (!currentWorkspace) {
    showToast("Select a workspace first");
    return;
  }

  document.getElementById("rename-workspace-name").value =
    currentWorkspace.name;
  renameModal.classList.add("show");
  document.getElementById("rename-workspace-name").focus();
});

btnRenameCancel.addEventListener("click", () => {
  renameModal.classList.remove("show");
});

renameForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const newName = document.getElementById("rename-workspace-name").value.trim();
  if (!newName || !currentWorkspace) return;

  try {
    const client = initSupabase();
    const { error } = await client
      .from("workspaces")
      .update({ name: newName, updated_at: new Date().toISOString() })
      .eq("id", currentWorkspace.id);

    if (error) throw error;

    currentWorkspace.name = newName;
    document.getElementById("workspace-title").textContent = newName;
    showToast("Workspace renamed");
    renameModal.classList.remove("show");
    await loadWorkspaces();
  } catch (error) {
    showToast("Failed to rename workspace");
  }
});

// Delete Workspace
const btnDelete = document.getElementById("btn-delete");
btnDelete.addEventListener("click", async () => {
  if (!currentWorkspace) {
    showToast("Select a workspace first");
    return;
  }

  if (
    !confirm(
      `Delete workspace "${currentWorkspace.name}" and all its captures?`,
    )
  )
    return;

  try {
    const client = initSupabase();
    const { error } = await client
      .from("workspaces")
      .delete()
      .eq("id", currentWorkspace.id);

    if (error) throw error;

    showToast("Workspace deleted");
    currentWorkspace = null;
    document.getElementById("workspace-title").textContent =
      "Select a workspace";
    document.getElementById("captures-area").innerHTML = `
      <div class="empty-workspace">
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
        <h3>No workspace selected</h3>
        <p>Select a workspace from the sidebar or create a new one</p>
      </div>
    `;
    await loadWorkspaces();
  } catch (error) {
    showToast("Failed to delete workspace");
  }
});

// Download Workspace as ZIP
const btnDownload = document.getElementById("btn-download");
btnDownload.addEventListener("click", async () => {
  if (!currentWorkspace) {
    showToast("Select a workspace first");
    return;
  }

  try {
    const client = initSupabase();
    const { data, error } = await client
      .from("workspace_captures")
      .select("*")
      .eq("workspace_id", currentWorkspace.id)
      .order("timestamp", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      showToast("No captures to download");
      return;
    }

    // Use JSZip if available (load from gallery page logic)
    if (!window.JSZip) {
      showToast("Loading ZIP library...");
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "jszip.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    showToast(`Creating ZIP with ${data.length} captures...`);

    const zip = new JSZip();
    const folder = zip.folder(currentWorkspace.name);

    for (let i = 0; i < data.length; i++) {
      const capture = data[i];
      const filename = `slide-${String(i + 1).padStart(3, "0")}.png`;

      const parts = capture.data_url.split(",");
      if (parts.length === 2) {
        folder.file(filename, parts[1], { base64: true });
      }
    }

    const content = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      streamFiles: false,
    });

    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentWorkspace.name}-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast("Download started");
  } catch (error) {
    showToast("Failed to download workspace");
  }
});

// Initialize AI Chat after page loads
// Initialize AI Chat after DOM is fully loaded
document.addEventListener("DOMContentLoaded", async () => {
  // Wait for all scripts to load
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (typeof WorkspaceChat !== "undefined") {
    console.log("Initializing WorkspaceChat...");
    window.workspaceChat = new WorkspaceChat();
    await window.workspaceChat.init();
    console.log("WorkspaceChat initialized");
  } else {
    console.error("WorkspaceChat class not loaded");
  }
});

// Event delegation for dynamically created buttons
document.addEventListener("click", (e) => {
  // Extract text button
  if (e.target.closest(".btn-extract-text")) {
    const btn = e.target.closest(".btn-extract-text");
    const dataUrl = btn.dataset.image;
    const captureId = btn.dataset.id;
    extractTextFromCapture(dataUrl, parseInt(captureId));
  }

  // Download capture button
  if (e.target.closest(".btn-download-capture")) {
    const btn = e.target.closest(".btn-download-capture");
    const dataUrl = btn.dataset.image;
    const captureId = btn.dataset.id;
    downloadCapture(dataUrl, parseInt(captureId));
  }

  // Delete capture button
  if (e.target.closest(".btn-delete-capture")) {
    const btn = e.target.closest(".btn-delete-capture");
    const captureId = btn.dataset.id;
    deleteWorkspaceCapture(parseInt(captureId));
  }

  // Close OCR modal button
  if (e.target.closest(".btn-close-ocr-modal")) {
    closeOCRModal();
  }

  // Copy text button
  if (e.target.closest(".btn-copy-text")) {
    copyExtractedText();
  }
});
