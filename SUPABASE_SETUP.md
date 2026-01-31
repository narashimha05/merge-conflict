# Supabase Setup Instructions

## 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - Name: `autocapture`
   - Database Password: (generate a strong one)
   - Region: Choose closest to you
5. Wait for project to be created (~2 minutes)

## 2. Get Your Credentials

1. Go to Project Settings → API
2. Copy these values:

   - **Project URL** (e.g., https://xxxxx.supabase.co)
   - **anon public** key (starts with eyJ...)

3. Open `config.js` and replace:

```javascript
const SUPABASE_CONFIG = {
  url: "YOUR_SUPABASE_URL", // Replace with your Project URL
  anonKey: "YOUR_SUPABASE_ANON_KEY", // Replace with your anon public key
};
```

## 3. Create Database Tables

### Users Table

Go to SQL Editor in Supabase dashboard and run:

```sql
-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: Disable email confirmations in Supabase settings!
-- Go to Authentication → Settings → Email Auth → uncheck "Confirm email"

-- Allow inserts with valid structure (for signup)
CREATE POLICY "Allow signup inserts"
  ON users
  FOR INSERT
  WITH CHECK (id IS NOT NULL AND email IS NOT NULL AND first_name IS NOT NULL AND last_name IS NOT NULL);

-- Allow authenticated users to read their own data
CREATE POLICY "Users can read own profile"
  ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Allow authenticated users to update their own data
CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  USING (auth.uid() = id);
```

### Workspaces Table (for Pro users)

```sql
-- Create workspaces table
CREATE TABLE workspaces (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX workspaces_user_id_idx ON workspaces(user_id);

-- Enable Row Level Security
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only access their own workspaces
CREATE POLICY "Users can manage own workspaces"
  ON workspaces
  FOR ALL
  USING (auth.uid() = user_id);
```

### Workspace Captures Table (for Pro users)

```sql
-- Create workspace_captures table
CREATE TABLE workspace_captures (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_url TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX workspace_captures_workspace_id_idx ON workspace_captures(workspace_id);
CREATE INDEX workspace_captures_user_id_idx ON workspace_captures(user_id);
CREATE INDEX workspace_captures_timestamp_idx ON workspace_captures(timestamp);

-- Enable Row Level Security
ALTER TABLE workspace_captures ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only access their own workspace captures
CREATE POLICY "Users can manage own workspace captures"
  ON workspace_captures
  FOR ALL
  USING (auth.uid() = user_id);
```

### Captures Table (for Pro users - Legacy, kept for backward compatibility)

```sql
-- Create captures table for Pro users
CREATE TABLE captures (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_url TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX captures_user_id_idx ON captures(user_id);
CREATE INDEX captures_timestamp_idx ON captures(timestamp);

-- Enable Row Level Security
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only access their own captures
CREATE POLICY "Users can manage own captures"
  ON captures
  FOR ALL
  USING (auth.uid() = user_id);
```

## 4. Configure Email Authentication

1. Go to Authentication → Settings
2. Scroll to "Email Auth"
3. Enable:
   - ✅ Enable email confirmations (optional)
   - ✅ Enable email password recovery
4. Customize email templates if desired

## 5. Test Authentication

1. Reload your extension in Chrome
2. Click the extension icon
3. You should see the sign-up page
4. Create a test account
5. Check Supabase Dashboard → Authentication → Users to see your user

## 6. Testing Pro Features

To manually upgrade a user to Pro for testing:

```sql
-- Replace 'user@email.com' with your test account email
UPDATE users
SET subscription_tier = 'pro'
WHERE email = 'user@email.com';
```

## 7. Verify Everything Works

✅ Sign up creates user in both auth.users and users table
✅ Sign in works and redirects to popup
✅ Settings page only accessible to Pro users
✅ PDF export only works for Pro users
✅ Free users see upgrade prompt

## 8. Next Steps (Optional)

### Add Stripe Integration

- Install Stripe extension from Supabase marketplace
- Set up webhook for subscription updates
- Modify upgrade.html to integrate Stripe Checkout

### Email Templates

- Customize confirmation emails
- Customize password reset emails
- Add your branding

## Troubleshooting

**"Invalid API key" error:**

- Check config.js has correct credentials
- Make sure you're using the **anon** key, not service_role key

**Can't sign up:**

- Check SQL tables were created successfully
- Verify RLS policies are in place
- Check browser console for errors

**Session not persisting:**

- Clear chrome.storage.local
- Sign in again
- Check background.js console for errors

## Security Notes

- Never commit config.js with real credentials to GitHub
- Use environment variables for production
- The anon key is safe to expose (it's restricted by RLS policies)
- Always keep your service_role key secret
