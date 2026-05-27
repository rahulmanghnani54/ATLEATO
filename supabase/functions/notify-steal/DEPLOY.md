# Deploy `notify-steal` Push Notification Edge Function

The territory game enqueues steal notifications in `pending_steal_notifications`
whenever someone takes your cells. This edge function drains the queue and
fires Expo pushes. Without it deployed, users never get notified.

## One-time setup (5 minutes)

### 1. Make sure Supabase CLI is logged in

```cmd
supabase login
```

(Opens browser, click Authorize.)

### 2. Link to your project (only if not already linked)

```cmd
cd C:\Dev\fitai-pro-app
supabase link --project-ref kbldncrurztfwlqzajen
```

It'll prompt for your DB password. Skip if you've already linked.

### 3. Deploy the function

```cmd
supabase functions deploy notify-steal --no-verify-jwt
```

(`--no-verify-jwt` lets the cron job call it without an auth token.)

Should print:
```
Deployed Function: notify-steal
Function URL: https://kbldncrurztfwlqzajen.functions.supabase.co/notify-steal
```

### 4. Schedule it to run every minute

Open: https://supabase.com/dashboard/project/kbldncrurztfwlqzajen/database/cron-jobs

If you see "Enable pg_cron" or "Enable pg_net" — click both **Enable** first.

Click **+ Create a new cron job**, fill in:

- **Name:** `notify-steal-every-minute`
- **Schedule:** `* * * * *`  (every minute)
- **Type:** SQL Snippet
- **SQL:**
  ```sql
  SELECT net.http_post(
    url := 'https://kbldncrurztfwlqzajen.functions.supabase.co/notify-steal',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  ```

Click **Create**.

### 5. Test it works

In the Supabase SQL Editor, run:

```sql
SELECT * FROM net._http_response ORDER BY id DESC LIMIT 5;
```

You should see entries from the cron job. Status code 200 = working.

Or insert a fake notification to test:

```sql
INSERT INTO pending_steal_notifications (victim_id, thief_id, cells_lost)
VALUES (auth.uid(), auth.uid(), 5);
```

Wait <60 seconds. You should get a push notification on your phone.

## Troubleshooting

- **No notifications arrive**: Check `push_tokens` table — does your row exist?
  If not, open the app's home screen so `registerPushTokenIfNeeded()` fires.

- **Edge function logs**: Supabase dashboard → Edge Functions → notify-steal → Logs

- **pg_net errors**: enable `pg_net` extension via Database → Extensions.
