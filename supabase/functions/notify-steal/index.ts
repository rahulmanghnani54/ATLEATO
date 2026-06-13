/**
 * notify-steal — drains pending_steal_notifications and sends Expo pushes.
 *
 * Trigger via Supabase scheduled job (every minute), or invoke ad-hoc from
 * the client. The function:
 *   1. Selects up to 500 pending rows
 *   2. Looks up each victim's push token
 *   3. Sends a single "Lifter #thief took N cells" push per victim
 *   4. Deletes the rows it processed
 *
 * No client secrets are exposed — calls Expo's push API directly with no auth
 * required for non-Apple-VOIP tokens.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL         = 'https://exp.host/--/api/v2/push/send';
// Shared secret — function is deployed with --no-verify-jwt so cron can call it,
// which means it's publicly invokable. Require this header so only the cron
// (configured with the same secret) can drain the queue.
// Set via: supabase secrets set NOTIFY_STEAL_CRON_SECRET=<random-32-bytes-hex>
// Then update the pg_cron job SQL to pass it:
//   headers := jsonb_build_object('x-cron-secret', '<same-secret>')
const CRON_SECRET = Deno.env.get('NOTIFY_STEAL_CRON_SECRET') || '';

interface PendingRow {
  id:          number;
  victim_id:   string;
  thief_id:    string;
  cells_lost:  number;
}

// Constant-time compare so reject paths don't leak timing info.
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  // ── Gate: require cron secret in production ──
  // Without this, anyone discovering the function URL can POST it repeatedly,
  // burning Expo push quota and prematurely draining the queue.
  if (CRON_SECRET) {
    const provided = req.headers.get('x-cron-secret') || '';
    if (!timingSafeEq(provided, CRON_SECRET)) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { 'content-type': 'application/json' },
      });
    }
  } else {
    console.warn('NOTIFY_STEAL_CRON_SECRET unset — accepting unauthenticated invocation (DEV ONLY)');
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // 1. Drain pending (oldest first, up to 500)
    const { data: pending, error: e1 } = await admin
      .from('pending_steal_notifications')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(500);

    if (e1) throw e1;
    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // 2. Aggregate per victim (one push per victim regardless of # of rows)
    const perVictim = new Map<string, { totalLost: number; thiefIds: Set<string>; ids: number[] }>();
    for (const row of pending as PendingRow[]) {
      const cur = perVictim.get(row.victim_id) ?? {
        totalLost: 0, thiefIds: new Set<string>(), ids: [] as number[],
      };
      cur.totalLost += row.cells_lost;
      cur.thiefIds.add(row.thief_id);
      cur.ids.push(row.id);
      perVictim.set(row.victim_id, cur);
    }

    // 3. Look up push tokens
    const victimIds = Array.from(perVictim.keys());
    const { data: tokens, error: e2 } = await admin
      .from('push_tokens')
      .select('user_id, token, platform')
      .in('user_id', victimIds);
    if (e2) throw e2;

    const tokenByUser = new Map<string, string>();
    for (const t of tokens ?? []) tokenByUser.set(t.user_id, t.token);

    // 4. Build Expo push messages
    const messages = victimIds
      .map((vid) => {
        const token = tokenByUser.get(vid);
        const info  = perVictim.get(vid)!;
        if (!token) return null;
        const thiefLabel = info.thiefIds.size === 1
          ? `Lifter #${hashHandle(Array.from(info.thiefIds)[0])}`
          : `${info.thiefIds.size} other lifters`;
        return {
          to: token,
          sound: 'default',
          title: '🌍 Territory lost',
          body: `${thiefLabel} just took ${info.totalLost} cell${info.totalLost === 1 ? '' : 's'} from you. Run to take them back.`,
          data: { type: 'territory_steal', cellsLost: info.totalLost },
          priority: 'high',
        };
      })
      .filter(Boolean);

    if (messages.length > 0) {
      // Expo accepts batches of up to 100
      for (let i = 0; i < messages.length; i += 100) {
        const batch = messages.slice(i, i + 100);
        await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'accept-encoding': 'gzip, deflate',
            'content-type': 'application/json',
          },
          body: JSON.stringify(batch),
        });
      }
    }

    // 5. Delete the rows we just processed
    const allIds = pending.map((r: PendingRow) => r.id);
    await admin.from('pending_steal_notifications').delete().in('id', allIds);

    return new Response(JSON.stringify({
      processed:    pending.length,
      pushed:       messages.length,
      victims:      victimIds.length,
    }), { headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});

// Deterministic 4-digit Lifter handle from a UUID (matches the SQL formula)
function hashHandle(uuid: string): string {
  let h = 0;
  for (let i = 0; i < uuid.length; i++) {
    h = (h * 31 + uuid.charCodeAt(i)) | 0;
  }
  return String((Math.abs(h) % 9000) + 1000).padStart(4, '0');
}
