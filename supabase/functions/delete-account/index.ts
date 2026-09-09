// Supabase Edge Function — delete-account
//
// Google Play requires an in-app account-deletion path. The app calls this with
// the signed-in user's JWT; we verify it, then erase the user's data.
//
// TWO STORES, NOT ONE. ON DELETE CASCADE reaches the PUBLIC SCHEMA only:
// profiles.id -> auth.users, and every user table -> profiles(id)/auth.users.
// It does NOT remove bytes from Storage. This function used to be a single
// deleteUser() call on the strength of a comment claiming it erased everything,
// so every encrypted physique photo survived deletion — orphaned from any user
// row, therefore invisible to any later cleanup, while app/profile.tsx promised
// the user "permanently erases your account". That is a GDPR Art. 17 and Play
// data-deletion failure, not just untidiness.
//
// ORDER MATTERS: storage first, auth user second. If we deleted the auth user
// first and the storage sweep then failed, we would have destroyed the only
// record that the objects belong to anyone.
//
// FAILS CLOSED: a storage error aborts the whole deletion and returns 500. The
// user can retry, and a retry is far better than telling someone their photos
// are gone when they are not.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Must match hooks/usePhysiqueCheckins.ts and migration 005.
const PHOTO_BUCKET = 'physique-photos';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !serviceRole) return json({ error: 'Server not configured' }, 500);

    // 1. Identify the caller from their JWT — never trust a client-supplied id.
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Invalid or expired session' }, 401);

    const admin = createClient(url, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Storage sweep. Objects live at `${userId}/${checkinId}/${pose}.enc`
    //    (hooks/usePhysiqueCheckins.ts:147), so everything this user owns sits
    //    under one prefix. list() is not recursive — it returns a folder as an
    //    entry with a null id — so walk the two levels explicitly.
    let removed = 0;
    try {
      const bucket = admin.storage.from(PHOTO_BUCKET);
      const { data: checkinDirs, error: topErr } = await bucket.list(user.id, { limit: 1000 });

      // A missing bucket is not a failure to delete: there is nothing to delete.
      if (topErr && !/not.?found/i.test(topErr.message ?? '')) throw topErr;

      const paths: string[] = [];
      for (const dir of checkinDirs ?? []) {
        if (dir.id !== null) {
          // A file sitting directly under the user prefix rather than in a
          // check-in folder. Unexpected, but it is still their data.
          paths.push(`${user.id}/${dir.name}`);
          continue;
        }
        const { data: files, error: subErr } = await bucket.list(`${user.id}/${dir.name}`, { limit: 1000 });
        if (subErr) throw subErr;
        for (const f of files ?? []) {
          if (f.id !== null) paths.push(`${user.id}/${dir.name}/${f.name}`);
        }
      }

      // remove() caps at 1000 keys per call.
      for (let i = 0; i < paths.length; i += 500) {
        const { error: rmErr } = await bucket.remove(paths.slice(i, i + 500));
        if (rmErr) throw rmErr;
        removed += Math.min(500, paths.length - i);
      }
    } catch (storageErr) {
      // Loud: this is the branch where a user is told their data is gone when
      // it is not, so it must never be swallowed.
      console.error('[delete-account] storage sweep failed for', user.id, storageErr);
      return json({
        error: 'Could not delete your stored photos, so nothing was deleted. Please try again.',
        retryable: true,
      }, 500);
    }

    // 3. Hard-delete the auth user. ON DELETE CASCADE now wipes the profile and
    //    every user-owned table, and the object store is already empty.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true, deleted: user.id, objects_removed: removed }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
