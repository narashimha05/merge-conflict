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
      }
    );
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
    const { data, error } = await client
      .from("workspaces")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    workspaces = data || [];
    renderWorkspaces();
  } catch (error) {
    showToast("Failed to load workspaces");
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
    workspaces.map((w) => getWorkspaceCaptureCount(w.id))
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
  `
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
    const { count, error } = await client
      .from("workspace_captures")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    return 0;
  }
}

// Select workspace
async function selectWorkspace(workspaceId) {
  currentWorkspace = workspaces.find((w) => w.id === workspaceId);
  if (!currentWorkspace) return;

  document.getElementById("workspace-title").textContent =
    currentWorkspace.name;
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
      `
        )
        .join("")}
    </div>
  `;

  try {
    const client = initSupabase();
    const { data, error } = await client
      .from("workspace_captures")
      .select("*")
      .eq("workspace_id", currentWorkspace.id)
      .order("timestamp", { ascending: true });

    if (error) throw error;

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
                capture.timestamp
              ).toLocaleString()}</span>
              <div class="gallery-item-actions">
                <button class="icon-btn" onclick="downloadCapture('${
                  capture.data_url
                }', ${capture.id})" title="Download">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
                <button class="icon-btn" onclick="deleteWorkspaceCapture(${
                  capture.id
                })" title="Delete">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  } catch (error) {
    showToast("Failed to load captures");
  }
}

// Download single capture
window.downloadCapture = function (dataUrl, captureId) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `capture-${captureId}-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Download started");
};

// Delete workspace capture
window.deleteWorkspaceCapture = async function (captureId) {
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
};

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
      `Delete workspace "${currentWorkspace.name}" and all its captures?`
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
