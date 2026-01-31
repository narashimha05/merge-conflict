// AI Chat with Cerebras Cloud AI and OCR
class WorkspaceChat {
  constructor() {
    this.currentSessionId = null;
    this.currentWorkspaceId = null;
    this.messages = [];
    this.cerebrasApiKey = null;
    this.isProcessing = false;
    this.supabase = null;
    this.uiInitialized = false; // Track if UI has been initialized
  }

  async init() {
    // Load Supabase client
    await this.loadSupabaseClient();

    // Load API key from storage
    await this.loadApiKey();

    // Get current workspace ID
    this.currentWorkspaceId = await this.getCurrentWorkspaceId();

    // Initialize UI
    this.initializeUI();

    // Don't initialize session here - wait for workspace selection
    // Session will be initialized when workspace is selected via selectWorkspace()
  }

  async loadSupabaseClient() {
    try {
      // Reuse the Supabase client from workspace.js
      // Wait for it to be initialized
      let retries = 0;
      while (!window.supabaseClient && retries < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
      }

      if (!window.supabaseClient) {
        console.error("Supabase client not initialized by workspace.js");
        return;
      }

      this.supabase = window.supabaseClient;

      // Set session for authenticated requests
      const { workspace_user } =
        await chrome.storage.local.get("workspace_user");
      if (workspace_user && workspace_user.session) {
        await this.supabase.auth.setSession({
          access_token: workspace_user.session.access_token,
          refresh_token: workspace_user.session.refresh_token,
        });
      }
    } catch (error) {
      console.error("Failed to load Supabase:", error);
    }
  }

  async loadApiKey() {
    const { cerebrasApiKey } = await chrome.storage.local.get("cerebrasApiKey");
    this.cerebrasApiKey = cerebrasApiKey;
  }

  async saveApiKey(apiKey) {
    await chrome.storage.local.set({ cerebrasApiKey: apiKey });
    this.cerebrasApiKey = apiKey;
  }

  async getCurrentWorkspaceId() {
    // Check URL parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get("id");

    if (urlId) {
      return urlId;
    }

    // Check if currentWorkspace is already selected
    if (window.currentWorkspace) {
      return window.currentWorkspace.id;
    }

    return null;
  }

  updateWorkspaceDisplay(workspaceName) {
    const subtitle = document.getElementById("chat-workspace-name");
    if (subtitle && workspaceName) {
      subtitle.textContent = workspaceName;
    }
  }

  initializeUI() {
    // Prevent duplicate initialization
    if (this.uiInitialized) {
      console.log("UI already initialized, skipping...");
      return;
    }
    this.uiInitialized = true;

    // Chat button
    const chatBtn = document.getElementById("chat-float-btn");
    const chatPanel = document.getElementById("chat-panel");
    const minimizeBtn = document.getElementById("chat-minimize-btn");
    const closeBtn = document.getElementById("chat-close-btn");
    const settingsBtn = document.getElementById("chat-settings-btn");
    const historyBtn = document.getElementById("chat-sessions-btn");

    if (!chatBtn || !chatPanel) {
      console.error("Chat UI elements not found");
      return;
    }

    chatBtn.addEventListener("click", () => {
      console.log("Chat button clicked");
      chatPanel.classList.add("open");
      chatBtn.classList.add("hidden");
    });

    minimizeBtn.addEventListener("click", () => {
      chatPanel.classList.toggle("minimized");
    });

    closeBtn.addEventListener("click", () => {
      chatPanel.classList.remove("open");
      chatBtn.classList.remove("hidden");
    });

    settingsBtn.addEventListener("click", () => {
      this.openSettingsModal();
    });

    historyBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent event bubbling
      this.openHistoryModal();
    });

    // Chat input
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");

    sendBtn.addEventListener("click", () => {
      this.sendMessage();
    });

    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize textarea
    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height = chatInput.scrollHeight + "px";
    });

    // Quick actions
    document.querySelectorAll(".quick-action-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const action = e.target.textContent.trim();
        this.handleQuickAction(action);
      });
    });

    // Settings modal
    const settingsForm = document.getElementById("chat-settings-form");
    const closeSettingsBtn = document.getElementById(
      "btn-chat-settings-cancel",
    );

    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveSettingsFromModal();
    });

    closeSettingsBtn.addEventListener("click", () => {
      document.getElementById("chatSettingsModal").style.display = "none";
    });

    // History modale) => {
    e.stopPropagation(); // Prevent event bubbling
    const closeHistoryBtn = document.getElementById("btn-chat-history-close");
    const newChatBtn = document.getElementById("btn-chat-new-session");

    closeHistoryBtn.addEventListener("click", () => {
      document.getElementById("chat-history-modal").style.display = "none";
    });

    newChatBtn.addEventListener("click", async () => {
      await this.createNewSession();
    });

    // Close modals on outside click
    window.addEventListener("click", (e) => {
      const settingsModal = document.getElementById("chat-settings-modal");
      const historyModal = document.getElementById("chat-history-modal");

      if (e.target === settingsModal) {
        settingsModal.style.display = "none";
      }
      if (e.target === historyModal) {
        historyModal.style.display = "none";
      }
    });
  }

  async initializeSession() {
    // Try to load the most recent session for this workspace
    if (!this.supabase) return;

    const { data: sessions, error } = await this.supabase
      .from("chat_sessions")
      .select("*")
      .eq("workspace_id", this.currentWorkspaceId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error loading session:", error);
      return;
    }

    if (sessions && sessions.length > 0) {
      this.currentSessionId = sessions[0].id;
      await this.loadMessages();
    } else {
      // Create new session
      await this.createNewSession();
    }
  }

  async createNewSession() {
    if (!this.supabase) return;

    // Check if workspace is selected
    console.log("Creating new session for workspace:", this.currentWorkspaceId);
    if (!this.currentWorkspaceId) {
      console.error("Cannot create session: No workspace selected");
      this.showError("Please select a workspace first.");
      return;
    }

    // Close the history modal first
    const historyModal = document.getElementById("chat-history-modal");
    if (historyModal) {
      historyModal.style.display = "none";
    }

    // Get current user ID
    const {
      data: { user },
      error: userError,
    } = await this.supabase.auth.getUser();

    if (userError || !user) {
      console.error("Error getting user:", userError);
      this.showError("Failed to get user information");
      return;
    }

    const { data: session, error } = await this.supabase
      .from("chat_sessions")
      .insert([
        {
          workspace_id: this.currentWorkspaceId,
          user_id: user.id,
          title: `Chat ${new Date().toLocaleDateString()}`,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating session:", error);
      this.showError(`Failed to create chat session: ${error.message}`);
      return;
    }

    // Update current session and clear messages
    this.currentSessionId = session.id;
    this.messages = [];
    this.renderMessages();

    console.log("New session created:", session.id);
  }

  async loadMessages() {
    if (!this.supabase || !this.currentSessionId) return;

    const { data: messages, error } = await this.supabase
      .from("workspace_chats")
      .select("*")
      .eq("workspace_id", this.currentWorkspaceId)
      .order("timestamp", { ascending: true });

    if (error) {
      console.error("Error loading messages:", error);
      this.showError(`Failed to load messages: ${error.message}`);
      return;
    }

    this.messages = messages || [];
    this.renderMessages();
  }

  renderMessages() {
    const messagesContainer = document.getElementById("chat-messages");
    const welcomeScreen = messagesContainer.querySelector(".chat-welcome");

    if (this.messages.length === 0) {
      if (welcomeScreen) welcomeScreen.style.display = "block";
      return;
    }

    if (welcomeScreen) welcomeScreen.style.display = "none";

    messagesContainer.innerHTML = "";

    this.messages.forEach((msg) => {
      const messageDiv = document.createElement("div");
      messageDiv.className = `chat-message ${msg.role}`;

      messageDiv.innerHTML = `
        <div class="chat-message-avatar">
          ${msg.role === "user" ? "👤" : "🤖"}
        </div>
        <div>
          <div class="chat-message-content">${this.formatMessage(msg.message)}</div>
          <div class="chat-message-time">${this.formatTime(msg.timestamp)}</div>
        </div>
      `;

      messagesContainer.appendChild(messageDiv);
    });

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  formatMessage(content) {
    // Basic markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  async sendMessage() {
    const input = document.getElementById("chat-input");
    const message = input.value.trim();

    if (!message || this.isProcessing) return;

    console.log("Sending message:", message);
    console.log("Supabase:", this.supabase);
    console.log("Current Session ID:", this.currentSessionId);
    console.log("Current Workspace ID:", this.currentWorkspaceId);

    // Check if workspace is selected
    // if (!this.currentWorkspaceId) {
    //   this.showError("Please select a workspace first.");
    //   return;
    // }

    // Check if API key is set
    if (!this.cerebrasApiKey) {
      this.showError("Please set your Cerebras API key in settings first.");
      this.openSettingsModal();
      return;
    }

    // Check if session is initialized
    if (!this.currentSessionId) {
      console.log("No session, creating one...");
      await this.createNewSession();
      if (!this.currentSessionId) {
        this.showError("Failed to create chat session.");
        return;
      }
    }

    input.value = "";
    input.style.height = "auto";

    // Add user message
    await this.addMessage("user", message);

    // Show typing indicator
    this.showTypingIndicator();

    // Get AI response
    await this.getAIResponse(message);

    // Hide typing indicator
    this.hideTypingIndicator();
  }

  async addMessage(role, content) {
    if (!this.supabase || !this.currentSessionId) {
      console.error("Cannot add message - missing supabase or session ID");
      this.showError("Chat session not initialized. Please try again.");
      return;
    }

    // Get current user ID
    const {
      data: { user },
      error: userError,
    } = await this.supabase.auth.getUser();

    if (userError || !user) {
      console.error("Error getting user:", userError);
      this.showError(
        "Failed to get user information. Please refresh the page.",
      );
      return;
    }

    console.log("Adding message to database:", {
      role,
      content,
      user_id: user.id,
      workspace_id: this.currentWorkspaceId,
    });

    const { data: message, error } = await this.supabase
      .from("workspace_chats")
      .insert([
        {
          workspace_id: this.currentWorkspaceId,
          user_id: user.id,
          message: content,
          role: role,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error adding message:", error);
      this.showError(`Failed to save message: ${error.message}`);
      return;
    }

    console.log("Message saved successfully:", message);
    this.messages.push(message);
    this.renderMessages();
  }

  async getWorkspaceCapturesContext(extractText = false) {
    if (!this.supabase || !this.currentWorkspaceId) {
      console.log("No supabase or workspace ID");
      return { count: 0, timestamps: "", captures: [] };
    }

    try {
      // Convert to integer if it's a string
      const workspaceId = parseInt(this.currentWorkspaceId);

      console.log("Fetching captures for workspace ID:", workspaceId);

      const { data: captures, error } = await this.supabase
        .from("workspace_captures")
        .select("id, created_at, data_url")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        console.error("Error fetching captures:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        return { count: 0, timestamps: "", captures: [] };
      }

      console.log("Captures found:", captures?.length || 0);

      const count = captures?.length || 0;
      const timestamps =
        captures
          ?.map(
            (c, idx) =>
              `Capture ${idx + 1}: ${new Date(c.created_at).toLocaleString()}`,
          )
          .join(", ") || "";

      return { count, timestamps, captures: captures || [] };
    } catch (error) {
      console.error("Error getting workspace context:", error);
      return { count: 0, timestamps: "", captures: [] };
    }
  }

  async getAIResponse(userMessage) {
    this.isProcessing = true;

    try {
      // Get workspace captures context (without OCR extraction)
      const capturesContext = await this.getWorkspaceCapturesContext(false);

      // Build context from previous messages
      const conversationHistory = this.messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.message, // Use 'message' field from database
      }));

      // Add system prompt with workspace context
      let systemPrompt = `You are a helpful AI assistant for a workspace management tool.

IMPORTANT: This workspace currently has ${capturesContext.count} captured slide(s).
${capturesContext.count > 0 ? `\nCapture timestamps: ${capturesContext.timestamps}` : "\nThe workspace is empty - no slides have been captured yet."}

If users ask about slide content, inform them they can use the "Extract Text" button next to each slide to get OCR text extraction.

Provide helpful insights based on the workspace information.`;

      const messages = [
        {
          role: "system",
          content: systemPrompt,
        },
        ...conversationHistory,
        {
          role: "user",
          content: userMessage,
        },
      ];

      // Call Cerebras API
      const response = await fetch(
        "https://api.cerebras.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.cerebrasApiKey}`,
          },
          body: JSON.stringify({
            model: "llama3.1-8b",
            messages: messages,
            stream: false,
            max_tokens: 1000,
            temperature: 0.7,
            top_p: 0.95,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error?.message ||
          errorData.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const aiMessage = data.choices[0].message.content;

      // Add AI response to chat
      await this.addMessage("assistant", aiMessage);
    } catch (error) {
      console.error("Error getting AI response:", error);
      this.showError(`AI Error: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  showTypingIndicator() {
    const messagesContainer = document.getElementById("chat-messages");
    const typingDiv = document.createElement("div");
    typingDiv.id = "typingIndicator";
    typingDiv.className = "chat-message assistant";
    typingDiv.innerHTML = `
      <div class="chat-message-avatar">🤖</div>
      <div class="chat-typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  hideTypingIndicator() {
    const indicator = document.getElementById("typingIndicator");
    if (indicator) indicator.remove();
  }

  async handleQuickAction(action) {
    let prompt = "";

    if (action.includes("Summarize")) {
      prompt =
        "Can you provide a summary of all the captured slides in this workspace?";
    } else if (action.includes("List")) {
      prompt =
        "Can you list all the key topics covered in the captured slides?";
    } else if (action.includes("Insights")) {
      prompt =
        "What are the main insights and takeaways from the captured content?";
    }

    if (prompt) {
      document.getElementById("chat-input").value = prompt;
      await this.sendMessage();
    }
  }

  openSettingsModal() {
    const modal = document.getElementById("chat-settings-modal");
    const apiKeyInput = document.getElementById("cerebras-api-key");

    // Load current API key
    if (this.cerebrasApiKey) {
      apiKeyInput.value = this.cerebrasApiKey;
    }

    modal.style.display = "flex";
  }

  async saveSettingsFromModal() {
    const apiKey = document.getElementById("cerebras-api-key").value.trim();

    if (!apiKey) {
      alert("Please enter a valid API key");
      return;
    }

    await this.saveApiKey(apiKey);
    document.getElementById("chat-settings-modal").style.display = "none";
    this.showSuccess("API key saved successfully!");
  }

  async openHistoryModal() {
    const modal = document.getElementById("chat-history-modal");
    const listContainer = document.getElementById("chat-history-list");

    if (!this.supabase) return;

    // Check if workspace is selected
    console.log("Opening history for workspace:", this.currentWorkspaceId);
    if (!this.currentWorkspaceId) {
      console.error("Cannot open history: No workspace selected");
      this.showError("Please select a workspace first.");
      return;
    }

    // Load all sessions for this workspace
    const { data: sessions, error } = await this.supabase
      .from("chat_sessions")
      .select("*")
      .eq("workspace_id", this.currentWorkspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading sessions:", error);
      return;
    }

    listContainer.innerHTML = "";

    if (!sessions || sessions.length === 0) {
      listContainer.innerHTML =
        '<div style="padding: 20px; text-align: center; color: #636e72;">No chat history yet</div>';
    } else {
      sessions.forEach((session) => {
        const sessionDiv = document.createElement("div");
        sessionDiv.className = "chat-session-item";
        sessionDiv.innerHTML = `
          <div class="chat-session-info">
            <div class="chat-session-title">${session.title}</div>
            <div class="chat-session-date">${new Date(session.created_at).toLocaleString()}</div>
          </div>
          <div class="chat-session-actions">
            <button class="chat-session-delete" data-session-id="${session.id}">Delete</button>
          </div>
        `;

        sessionDiv
          .querySelector(".chat-session-info")
          .addEventListener("click", () => {
            this.loadSession(session.id);
          });

        sessionDiv
          .querySelector(".chat-session-delete")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            this.deleteSession(session.id);
          });

        listContainer.appendChild(sessionDiv);
      });
    }

    modal.style.display = "flex";
  }

  async loadSession(sessionId) {
    this.currentSessionId = sessionId;
    this.messages = [];
    await this.loadMessages();
    document.getElementById("chat-history-modal").style.display = "none";
  }

  async deleteSession(sessionId) {
    if (!confirm("Are you sure you want to delete this chat session?")) {
      return;
    }

    if (!this.supabase) return;

    // Delete the session
    const { error } = await this.supabase
      .from("chat_sessions")
      .delete()
      .eq("id", sessionId);

    if (error) {
      console.error("Error deleting session:", error);
      this.showError("Failed to delete session");
      return;
    }

    console.log("Session deleted:", sessionId);

    // If deleted current session, clear it and create a new one
    if (sessionId === this.currentSessionId) {
      this.currentSessionId = null;
      this.messages = [];
      this.renderMessages();

      // Only create new session if workspace is selected
      if (this.currentWorkspaceId) {
        await this.createNewSession();
      }
    }

    // Refresh history modal to reflect changes
    await this.openHistoryModal();
  }

  async analyzeCapture(captureId) {
    // Get capture image
    if (!this.supabase) return;

    const { data: capture, error } = await this.supabase
      .from("workspace_captures")
      .select("*")
      .eq("id", captureId)
      .single();

    if (error || !capture) {
      this.showError("Failed to load capture");
      return;
    }

    // Extract text from capture
    const extractedText = await this.extractTextFromCapture(capture.image_data);

    if (extractedText) {
      // Add to chat input
      const input = document.getElementById("chat-input");
      input.value = `Analyze this slide content:\n\n${extractedText.substring(0, 500)}...`;

      // Open chat panel
      document.getElementById("chat-panel").classList.add("open");
      document.getElementById("chat-float-btn").classList.add("hidden");
    }
  }

  showSuccess(message) {
    this.showNotification(message, "success");
  }

  showError(message) {
    this.showNotification(message, "error");
  }

  showInfo(message) {
    this.showNotification(message, "info");
  }

  showNotification(message, type) {
    // Create a simple notification
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === "error" ? "#ff6b35" : type === "success" ? "#00b894" : "#0984e3"};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = "slideOut 0.3s ease-out";
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Initialize chat when page loads
document.addEventListener("DOMContentLoaded", async () => {
  window.workspaceChat = new WorkspaceChat();
  await window.workspaceChat.init();
});
