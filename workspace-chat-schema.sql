-- Database schema for Workspace AI Chat feature
-- Run this in Supabase SQL Editor

-- Table to store chat messages
CREATE TABLE IF NOT EXISTS workspace_chats (
  id BIGSERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Table to store chat sessions (optional, for organizing conversations)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id BIGSERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New Chat',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workspace_chats_workspace_id ON workspace_chats(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_chats_timestamp ON workspace_chats(workspace_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_workspace_id ON chat_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);

-- Enable Row Level Security
ALTER TABLE workspace_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workspace_chats
CREATE POLICY "Users can view their workspace chats"
  ON workspace_chats FOR SELECT
  USING (
    user_id = auth.uid() OR
    workspace_id IN (
      SELECT id FROM workspaces WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their workspace chats"
  ON workspace_chats FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    workspace_id IN (
      SELECT id FROM workspaces WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their workspace chats"
  ON workspace_chats FOR DELETE
  USING (
    user_id = auth.uid() OR
    workspace_id IN (
      SELECT id FROM workspaces WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for chat_sessions
CREATE POLICY "Users can view their chat sessions"
  ON chat_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their chat sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their chat sessions"
  ON chat_sessions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their chat sessions"
  ON chat_sessions FOR DELETE
  USING (user_id = auth.uid());

-- Function to update last_message_at on chat_sessions
CREATE OR REPLACE FUNCTION update_chat_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_sessions
  SET last_message_at = NEW.timestamp
  WHERE workspace_id = NEW.workspace_id
    AND user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update session timestamp
CREATE TRIGGER update_chat_session_timestamp_trigger
AFTER INSERT ON workspace_chats
FOR EACH ROW
EXECUTE FUNCTION update_chat_session_timestamp();

-- Grant access
GRANT ALL ON workspace_chats TO authenticated;
GRANT ALL ON chat_sessions TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMENT ON TABLE workspace_chats IS 'Stores AI chat messages for each workspace';
COMMENT ON TABLE chat_sessions IS 'Stores chat session metadata for organizing conversations';
