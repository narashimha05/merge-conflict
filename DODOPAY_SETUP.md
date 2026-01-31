# DodoPay Integration Setup Guide

This guide walks you through setting up DodoPay for your Chrome extension's Pro subscription ($10/month).

## Prerequisites

1. DodoPay account at https://dodopayments.com
2. Supabase project with users table
3. Chrome extension installed

## Step 1: Get DodoPay Credentials

1. Sign up or log in to https://dodopayments.com
2. Create a new business (if not already created)
3. Note your **Business ID** from the dashboard
4. Create a subscription product:
   - Name: "Pro Subscription"
   - Price: $10/month
   - Recurring: Yes
5. Note the **Product ID** after creating the product

## Step 2: Update dodopay-config.js

Open `dodopay-config.js` and replace the placeholder values:

```javascript
const DODOPAY_CONFIG = {
  businessId: "YOUR_BUSINESS_ID_HERE", // Replace with your Business ID
  productId: "YOUR_PRODUCT_ID_HERE", // Replace with your Product ID
  successUrl: "payment-success.html", // Keep as is
  cancelUrl: "upgrade.html", // Keep as is
  checkoutUrl: "https://checkout.dodopayments.com", // Keep as is
};
```

## Step 3: Update Database Schema

Add DodoPay-specific columns to your Supabase `users` table:

```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS dodopay_customer_id TEXT,
ADD COLUMN IF NOT EXISTS dodopay_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMPTZ;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);
```

Run this in your Supabase SQL Editor.

## Step 4: Configure Webhooks (Recommended)

Webhooks automatically handle subscription lifecycle events (renewals, cancellations, failed payments).

### 4.1: Check DodoPay Webhook Documentation

1. Visit https://docs.dodopayments.com (or contact their support)
2. Find the webhooks section to understand:
   - Available webhook events
   - Webhook payload structure
   - How to verify webhook signatures
   - Webhook endpoint requirements

### 4.2: Create Supabase Edge Function for Webhook

**Option A: Using Supabase CLI (if installed)**

1. Install Supabase CLI (if not already):

   ```bash
   scoop install supabase
   ```

2. Initialize Supabase in your project:

   ```bash
   cd C:\Users\chinn\Downloads\meet_slide_capture_v6_full
   supabase init
   ```

3. Create webhook function:

   ```bash
   supabase functions new dodopay-webhook
   ```

4. Edit `supabase/functions/dodopay-webhook/index.ts` with the code below

**Option B: Using Supabase Dashboard (Easier)**

1. Go to your Supabase project dashboard
2. Navigate to **Database** > **Functions** (or **Edge Functions** in newer UI)
3. Click **"Create a new function"**
4. Name it: `dodopay-webhook`
5. Paste the code below

**Webhook Handler Code:**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dodopay-signature",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get webhook secret from environment
    const WEBHOOK_SECRET = Deno.env.get("DODOPAY_WEBHOOK_SECRET");

    // Verify webhook signature (check DodoPay docs for exact header name)
    const signature =
      req.headers.get("x-dodopay-signature") ||
      req.headers.get("x-webhook-signature");

    if (WEBHOOK_SECRET && signature !== WEBHOOK_SECRET) {
      console.error("Invalid webhook signature");
      return new Response("Unauthorized", { status: 401 });
    }

    // Parse webhook payload
    const payload = await req.json();
    console.log("Received webhook:", JSON.stringify(payload, null, 2));

    // Extract event type and data (adjust based on DodoPay's actual structure)
    const eventType = payload.event || payload.type;
    const eventData = payload.data || payload;

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Handle different event types
    switch (eventType) {
      case "subscription.created":
      case "payment.succeeded":
      case "subscription.activated":
        console.log(
          "Activating Pro subscription for:",
          eventData.customer_email
        );

        const { error: activateError } = await supabaseAdmin
          .from("users")
          .update({
            subscription_tier: "pro",
            dodopay_customer_id: eventData.customer_id || eventData.customerId,
            dodopay_subscription_id:
              eventData.subscription_id || eventData.subscriptionId,
            subscription_status: "active",
            subscription_start_date: new Date().toISOString(),
          })
          .eq("email", eventData.customer_email || eventData.customerEmail);

        if (activateError) {
          console.error("Error activating subscription:", activateError);
          throw activateError;
        }

        console.log("✓ Subscription activated successfully");
        break;

      case "subscription.canceled":
      case "subscription.cancelled":
      case "subscription.expired":
        console.log("Canceling subscription:", eventData.subscription_id);

        const { error: cancelError } = await supabaseAdmin
          .from("users")
          .update({
            subscription_tier: "free",
            subscription_status: "canceled",
          })
          .eq(
            "dodopay_subscription_id",
            eventData.subscription_id || eventData.subscriptionId
          );

        if (cancelError) {
          console.error("Error canceling subscription:", cancelError);
          throw cancelError;
        }

        console.log("✓ Subscription canceled successfully");
        break;

      case "payment.failed":
        console.log(
          "Payment failed for subscription:",
          eventData.subscription_id
        );

        const { error: failedError } = await supabaseAdmin
          .from("users")
          .update({
            subscription_status: "payment_failed",
          })
          .eq(
            "dodopay_subscription_id",
            eventData.subscription_id || eventData.subscriptionId
          );

        if (failedError) {
          console.error("Error updating payment failed status:", failedError);
          throw failedError;
        }

        console.log("✓ Payment failure recorded");
        break;

      default:
        console.log("Unhandled event type:", eventType);
    }

    return new Response(JSON.stringify({ received: true, event: eventType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.toString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
```

### 4.3: Set Environment Variables

1. In Supabase Dashboard, go to **Settings** > **Edge Functions**
2. Add these secrets:
   - `DODOPAY_WEBHOOK_SECRET`: (get this from DodoPay dashboard)
   - `SUPABASE_URL`: (your project URL, usually auto-set)
   - `SUPABASE_SERVICE_ROLE_KEY`: (found in Settings > API)

**Or using CLI:**

```bash
supabase secrets set DODOPAY_WEBHOOK_SECRET="your_secret_from_dodopay"
```

### 4.4: Deploy the Function

**Via Dashboard:** Click "Deploy" button

**Via CLI:**

```bash
supabase functions deploy dodopay-webhook
```

### 4.5: Configure Webhook in DodoPay

1. Log in to DodoPay dashboard
2. Go to **Settings** > **Webhooks** (or **Developers** > **Webhooks**)
3. Click **"Add Webhook"** or **"New Endpoint"**
4. Enter your webhook URL:

   ```
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/dodopay-webhook
   ```

   (Replace `YOUR_PROJECT_REF` with your actual Supabase project reference)

5. Select events to listen for:

   - `subscription.created`
   - `subscription.activated`
   - `subscription.canceled`
   - `subscription.expired`
   - `payment.succeeded`
   - `payment.failed`

6. Copy the webhook secret and add it to Supabase secrets (Step 4.3)

7. Click **"Test Webhook"** to verify it's working

## Step 5: Test the Payment Flow

### 5.1: Enable Test/Sandbox Mode

1. Check if DodoPay provides test credentials or sandbox mode
2. If yes, use test credentials in `dodopay-config.js` first
3. If no sandbox, skip to production testing (you can refund test payments)

### 5.2: Test Complete Payment Flow

1. **Reload Extension:**

   - Open Chrome > Extensions (`chrome://extensions/`)
   - Click reload icon on your extension
   - Or remove and re-add the extension folder

2. **Sign In:**

   - Click extension icon
   - Sign in with your test account (must be registered in Supabase)

3. **Initiate Upgrade:**

   - Click "Upgrade to Pro" button
   - Verify popup window opens with DodoPay checkout
   - Check browser console for any errors

4. **Complete Payment:**

   - Fill in payment details:
     - **Test Card** (if sandbox): Use test card from DodoPay docs
     - **Production**: Use real card (you can refund immediately)
   - Common test cards:
     - Success: `4242 4242 4242 4242`
     - Decline: `4000 0000 0000 0002`
     - Expiry: Any future date (e.g., 12/30)
     - CVC: Any 3 digits (e.g., 123)

5. **Verify Success Page:**

   - Should redirect to `payment-success.html`
   - Should show loading spinner → success message
   - Should display Pro badge and unlocked features
   - Check browser console for logs

6. **Verify Database Update:**

   - Open Supabase Dashboard
   - Go to **Table Editor** > **users**
   - Find your test user
   - Verify columns updated:
     - `subscription_tier`: "pro"
     - `dodopay_customer_id`: (should have value)
     - `dodopay_subscription_id`: (should have value)
     - `subscription_status`: "active"
     - `subscription_start_date`: (current timestamp)

7. **Verify Extension UI:**

   - Close and reopen extension popup
   - Verify lock icons are hidden/removed
   - Try accessing Pro features (Advanced Settings, Workspace, etc.)
   - Should work without restrictions

8. **Check chrome.storage:**
   - Open DevTools in extension popup (right-click > Inspect)
   - Console: `chrome.storage.local.get(['user'], (r) => console.log(r.user))`
   - Verify `subscription_tier` is "pro"

### 5.3: Test Webhook (If Configured)

1. **Trigger Test Event:**

   - Go to DodoPay dashboard > Webhooks
   - Click "Send Test Event" or "Test Webhook"
   - Select event type (e.g., `subscription.created`)

2. **Check Webhook Logs:**

   - Supabase Dashboard > **Edge Functions** > **dodopay-webhook**
   - Click "Logs" tab
   - Should see event received and processed
   - Check for any errors

3. **Test Cancellation:**
   - In DodoPay dashboard, manually cancel the test subscription
   - Wait 30-60 seconds for webhook delivery
   - Refresh user in Supabase
   - Verify `subscription_tier` changed to "free" and `subscription_status` to "canceled"

### 5.4: Test Error Scenarios

1. **Unsigned User Upgrade:**

   - Sign out from extension
   - Try clicking "Upgrade to Pro"
   - Should show "Please sign in first" alert

2. **Payment Failure:**

   - Use a test card that declines (e.g., `4000 0000 0000 0002`)
   - Should show error message
   - User should remain on free tier

3. **Canceled Payment:**
   - Start checkout process
   - Click "Cancel" or close popup window
   - Should return to upgrade page
   - User should remain on free tier

## Step 6: Row Level Security (RLS) Policies

Secure your database with proper RLS policies:

### 6.1: Enable RLS on Users Table

```sql
-- Enable RLS if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
```

### 6.2: Create Read Policy

```sql
-- Allow users to read their own data
CREATE POLICY "Users can read own data"
ON users
FOR SELECT
TO authenticated
USING (auth.uid() = id);
```

### 6.3: Create Update Policy for Users

```sql
-- Allow users to update their own non-subscription fields
CREATE POLICY "Users can update own profile"
ON users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND subscription_tier = (SELECT subscription_tier FROM users WHERE id = auth.uid())
  AND subscription_status = (SELECT subscription_status FROM users WHERE id = auth.uid())
);
```

### 6.4: Create Service Role Policy

```sql
-- Allow service role (webhook) to update subscription fields
CREATE POLICY "Service role can update subscriptions"
ON users
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);
```

### 6.5: Create Insert Policy (for new signups)

```sql
-- Allow authenticated users to insert their own record
CREATE POLICY "Users can insert own data"
ON users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);
```

### 6.6: Verify Policies

```sql
-- List all policies on users table
SELECT * FROM pg_policies WHERE tablename = 'users';
```

In Supabase Dashboard:

1. Go to **Authentication** > **Policies**
2. Select `users` table
3. Verify all policies are listed and enabled

## Step 7: Production Deployment

### 7.1: Switch to Production Credentials

1. Get production credentials from DodoPay:

   - Production Business ID
   - Production Product ID

2. Update `dodopay-config.js`:

   ```javascript
   const DODOPAY_CONFIG = {
     businessId: "prod_business_id_here",
     productId: "prod_product_id_here",
     successUrl: "payment-success.html",
     cancelUrl: "upgrade.html",
     checkoutUrl: "https://checkout.dodopayments.com",
   };
   ```

3. Update webhook endpoint in DodoPay to production URL

### 7.2: Final Testing Checklist

Before going live, verify:

- [ ] Production credentials configured in `dodopay-config.js`
- [ ] Database schema updated with DodoPay columns
- [ ] RLS policies properly configured
- [ ] Webhook endpoint deployed and verified
- [ ] Webhook secret set in Supabase environment
- [ ] Test payment completed successfully
- [ ] User upgraded to Pro after payment
- [ ] Pro features unlocked in extension
- [ ] Webhook handles subscription cancellation
- [ ] Error handling works (failed payments, sign-in required)

### 7.3: Package Extension for Distribution

1. **Remove test data:**

   ```sql
   -- Clean up test subscriptions
   UPDATE users
   SET subscription_tier = 'free',
       subscription_status = NULL,
       dodopay_customer_id = NULL,
       dodopay_subscription_id = NULL
   WHERE email LIKE '%test%';
   ```

2. **Create production build:**

   - Ensure all files are present
   - Remove any development/debug code
   - Check manifest.json version

3. **Test in fresh Chrome profile:**
   - Create new Chrome profile
   - Load unpacked extension
   - Complete full signup → upgrade flow

### 7.4: Submit to Chrome Web Store

1. Prepare listing:

   - Screenshots (capture signup, upgrade, Pro features)
   - Description mentioning Pro subscription
   - Privacy policy (include payment processing disclosure)

2. Submit for review:
   - Upload ZIP of extension
   - Set pricing to "Free with in-app purchases"
   - Declare payment features

## Step 8: Monitoring & Maintenance

### 8.1: Set Up Monitoring

**DodoPay Dashboard:**

- Monitor payment success rate
- Track MRR (Monthly Recurring Revenue)
- Set up email alerts for failed payments

**Supabase:**

- Monitor Edge Function logs
- Set up alerts for webhook failures
- Track subscription tier distribution:
  ```sql
  SELECT
    subscription_tier,
    COUNT(*) as user_count,
    COUNT(CASE WHEN subscription_status = 'active' THEN 1 END) as active_count
  FROM users
  GROUP BY subscription_tier;
  ```

### 8.2: Handle Failed Payments

Create a grace period policy:

```sql
-- Add grace_period_end column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ;
```

Update webhook to set grace period:

```typescript
case "payment.failed":
  await supabaseAdmin
    .from("users")
    .update({
      subscription_status: "payment_failed",
      grace_period_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    })
    .eq("dodopay_subscription_id", eventData.subscription_id);
  break;
```

Create a scheduled job to downgrade after grace period:

```sql
-- Run daily to downgrade expired grace periods
UPDATE users
SET subscription_tier = 'free',
    subscription_status = 'expired'
WHERE grace_period_end < NOW()
  AND subscription_status = 'payment_failed';
```

### 8.3: Customer Support

Prepare support responses for common issues:

1. **"Payment succeeded but still on Free tier"**

   - Check Supabase user record
   - Verify webhook received event
   - Manually update if needed:
     ```sql
     UPDATE users
     SET subscription_tier = 'pro',
         subscription_status = 'active'
     WHERE email = 'customer@email.com';
     ```

2. **"Want to cancel subscription"**

   - Direct to DodoPay customer portal (check if available)
   - Or manually cancel in DodoPay dashboard
   - Webhook will auto-downgrade user

3. **"Lost Pro features after payment issue"**
   - Check payment status in DodoPay
   - Update payment method
   - Manually reactivate if payment resolved

### 8.4: Analytics & Optimization

Track key metrics:

```sql
-- Conversion rate (signups → Pro)
SELECT
  COUNT(DISTINCT CASE WHEN subscription_tier = 'pro' THEN id END)::float /
  COUNT(DISTINCT id)::float * 100 as conversion_rate_pct
FROM users;

-- Revenue projections
SELECT
  COUNT(*) * 10 as monthly_revenue_usd,
  COUNT(*) * 120 as annual_revenue_usd
FROM users
WHERE subscription_tier = 'pro'
  AND subscription_status = 'active';

-- Churn rate (cancellations this month)
SELECT
  COUNT(*) as churned_users
FROM users
WHERE subscription_status = 'canceled'
  AND updated_at > NOW() - INTERVAL '30 days';
```

### Payment window doesn't open

- Check browser popup blocker settings
- Ensure `dodopay-config.js` is loaded before `upgrade.js`
- Check console for errors

### Payment succeeds but tier doesn't update

- Check `payment-success.js` console logs
- Verify Supabase credentials in `config.js`
- Check RLS policies on `users` table
- Verify user ID matches between local storage and Supabase

### Webhook not receiving events

- Verify webhook URL is correct in DodoPay dashboard
- Check webhook secret matches environment variable
- Test webhook with DodoPay's webhook testing tool
- Check Supabase Edge Function logs

### User downgraded unexpectedly

- Check DodoPay subscription status in dashboard
- Verify webhook is processing `subscription.canceled` events correctly
- Check payment method is valid and not expired

## Security Best Practices

1. **Never commit credentials**: Keep `dodopay-config.js` values secure
2. **Use HTTPS**: Ensure all URLs use HTTPS protocol
3. **Verify webhooks**: Always validate webhook signatures
4. **Rate limiting**: Implement rate limiting on webhook endpoint
5. **Audit logging**: Log all subscription changes for compliance

## Support

- DodoPay Documentation: https://docs.dodopayments.com
- DodoPay Support: support@dodopayments.com
- Chrome Extension: Check browser console for detailed error logs

## Next Steps

After successful setup:

1. Monitor DodoPay dashboard for payment analytics
2. Set up email notifications for failed payments
3. Create customer support process for subscription issues
4. Add subscription management page for users to view/cancel
5. Implement grace period for failed payments before downgrading
