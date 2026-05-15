import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPhysiqueKey,
  encryptPhoto,
  decryptPhoto,
  preparePhoto,
  packEncryptedBlob,
  unpackEncryptedBlob,
  toBase64,
} from '@/lib/physiqueEncryption';
import {
  analyzePhysiqueSingle,
  analyzePhysiqueCompare,
  type PhysiqueSingleResponse,
  type PhysiqueCompareResponse,
} from '@/lib/api/edgeFunctions';

const REMINDER_KEY = 'physique_reminder_id';

export type PhysiqueCheckin = {
  id: string;
  user_id: string;
  date: string;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  pose_count: number;
  front_path: string;
  side_path: string | null;
  back_path: string | null;
  front_thumb: string;
  side_thumb: string | null;
  back_thumb: string | null;
  fullness_score: number | null;
  leanness_score: number | null;
  symmetry_score: number | null;
  auto_narrative: string | null;
  scored_at: string | null;
  created_at: string;
};

export type PhysiqueAnalysis = {
  id: string;
  checkin_a_id: string;
  checkin_b_id: string;
  fullness_a: number | null;
  leanness_a: number | null;
  symmetry_a: number | null;
  fullness_b: number | null;
  leanness_b: number | null;
  symmetry_b: number | null;
  narrative: string;
  persona: string;
  created_at: string;
};

// ─── Fetch all check-ins (newest first) ──────────────────────────────────────

export function usePhysiqueCheckins() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['physique_checkins', user?.id],
    queryFn: async (): Promise<PhysiqueCheckin[]> => {
      if (!user) return [];
      const { data, error } = await (supabase.from('physique_checkins') as any)
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Decrypt a single encrypted blob path from Storage ───────────────────────

export async function decryptStorageBlob(userId: string, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from('physique-photos').download(path);
  if (error || !data) throw new Error('Failed to download encrypted blob');
  const packed = new Uint8Array(await data.arrayBuffer());
  const blob = unpackEncryptedBlob(packed);
  const key = await getPhysiqueKey(userId);
  return decryptPhoto(key, blob);
}

// ─── Submit a new check-in ────────────────────────────────────────────────────

export function useSubmitCheckin() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      date: string;
      cadence: 'weekly' | 'biweekly' | 'monthly';
      persona: string;
      frontUri: string;
      sideUri?: string;
      backUri?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const key = await getPhysiqueKey(user.id);
      const checkinId = crypto.randomUUID();

      async function uploadEncrypted(uri: string, pose: string, size: number, quality: number): Promise<{ path: string; jpeg: Uint8Array }> {
        const jpeg = await preparePhoto(uri, size, quality);
        const blob = await encryptPhoto(key, jpeg);
        const packed = packEncryptedBlob(blob);
        const path = `${user!.id}/${checkinId}/${pose}.enc`;
        const { error } = await supabase.storage
          .from('physique-photos')
          .upload(path, packed, { contentType: 'application/octet-stream', upsert: false });
        if (error) throw error;
        return { path, jpeg };
      }

      // Upload full-size + thumbnails
      const { path: frontPath, jpeg: frontJpeg } = await uploadEncrypted(params.frontUri, 'front', 1024, 0.8);
      const frontThumb = (await uploadEncrypted(params.frontUri, 'front-thumb', 200, 0.6)).path;
      const sideResult = params.sideUri ? await uploadEncrypted(params.sideUri, 'side', 1024, 0.8) : null;
      const sidePath = sideResult?.path ?? null;
      const sideThumb = params.sideUri ? (await uploadEncrypted(params.sideUri, 'side-thumb', 200, 0.6)).path : null;
      const backResult = params.backUri ? await uploadEncrypted(params.backUri, 'back', 1024, 0.8) : null;
      const backPath = backResult?.path ?? null;
      const backThumb = params.backUri ? (await uploadEncrypted(params.backUri, 'back-thumb', 200, 0.6)).path : null;

      const poseCount = 1 + (sidePath ? 1 : 0) + (backPath ? 1 : 0);

      // Auto-score via edge function — reuse already-prepared jpeg bytes (no re-download needed)
      const frontB64 = toBase64(frontJpeg);
      const sideB64 = sideResult ? toBase64(sideResult.jpeg) : undefined;
      const backB64 = backResult ? toBase64(backResult.jpeg) : undefined;

      let scores: PhysiqueSingleResponse | null = null;
      try {
        scores = await analyzePhysiqueSingle(params.persona, frontB64, sideB64, backB64);
      } catch {
        // Non-fatal — scoring can be retried; checkin is still saved
      }

      const payload: Record<string, unknown> = {
        id: checkinId,
        user_id: user.id,
        date: params.date,
        cadence: params.cadence,
        pose_count: poseCount,
        front_path: frontPath,
        front_thumb: frontThumb,
        side_path: sidePath,
        side_thumb: sideThumb,
        back_path: backPath,
        back_thumb: backThumb,
      };

      if (scores) {
        payload.fullness_score = scores.fullness;
        payload.leanness_score = scores.leanness;
        payload.symmetry_score = scores.symmetry;
        payload.auto_narrative = scores.narrative;
        payload.scored_at = new Date().toISOString();
      }

      const { error: insertError } = await (supabase.from('physique_checkins') as any).insert(payload);
      if (insertError) throw insertError;

      return { checkinId, scores };
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: ['physique_checkins', user?.id] });
      scheduleCheckinReminder(params.cadence, params.date);
    },
  });
}

// ─── Fetch or trigger a comparison analysis ───────────────────────────────────

export function usePhysiqueAnalysis(
  checkinAId: string | null,
  checkinBId: string | null,
  persona: string,
) {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['physique_analysis', checkinAId, checkinBId],
    queryFn: async (): Promise<PhysiqueAnalysis | null> => {
      if (!user || !checkinAId || !checkinBId) return null;

      // Check cache first
      const { data: existing } = await (supabase.from('physique_analyses') as any)
        .select('*')
        .or(`and(checkin_a_id.eq.${checkinAId},checkin_b_id.eq.${checkinBId}),and(checkin_a_id.eq.${checkinBId},checkin_b_id.eq.${checkinAId})`)
        .maybeSingle();
      if (existing) return existing as PhysiqueAnalysis;

      // Fetch both checkins to get image paths
      const { data: checkins } = await (supabase.from('physique_checkins') as any)
        .select('*')
        .in('id', [checkinAId, checkinBId]);
      if (!checkins || checkins.length < 2) return null;

      const checkinA: PhysiqueCheckin = checkins.find((c: PhysiqueCheckin) => c.id === checkinAId);
      const checkinB: PhysiqueCheckin = checkins.find((c: PhysiqueCheckin) => c.id === checkinBId);
      if (!checkinA || !checkinB) return null;

      // Decrypt images
      async function toB64(path: string | null): Promise<string | undefined> {
        if (!path) return undefined;
        return toBase64(await decryptStorageBlob(user!.id, path));
      }

      const aImages = {
        front: await toB64(checkinA.front_path),
        side: await toB64(checkinA.side_path),
        back: await toB64(checkinA.back_path),
      };
      const bImages = {
        front: await toB64(checkinB.front_path),
        side: await toB64(checkinB.side_path),
        back: await toB64(checkinB.back_path),
      };

      const result: PhysiqueCompareResponse = await analyzePhysiqueCompare(
        persona,
        aImages,
        bImages,
        checkinA.date,
        checkinB.date,
      );

      const analysisPayload = {
        user_id: user.id,
        checkin_a_id: checkinAId,
        checkin_b_id: checkinBId,
        fullness_a: result.scoresA.fullness,
        leanness_a: result.scoresA.leanness,
        symmetry_a: result.scoresA.symmetry,
        fullness_b: result.scoresB.fullness,
        leanness_b: result.scoresB.leanness,
        symmetry_b: result.scoresB.symmetry,
        narrative: result.narrative,
        persona,
      };

      const { data: saved, error } = await (supabase.from('physique_analyses') as any)
        .insert(analysisPayload)
        .select()
        .single();
      if (error) throw error;

      return saved as PhysiqueAnalysis;
    },
    enabled: !!user && !!checkinAId && !!checkinBId,
    staleTime: Infinity, // analyses are immutable once generated
  });
}

// ─── Schedule/reschedule check-in reminder notification ──────────────────────

async function scheduleCheckinReminder(
  cadence: 'weekly' | 'biweekly' | 'monthly',
  lastDateStr: string,
) {
  try {
    // Cancel previous reminder
    const prevId = await AsyncStorage.getItem(REMINDER_KEY);
    if (prevId) await Notifications.cancelScheduledNotificationAsync(prevId);

    const cadenceDays = cadence === 'weekly' ? 7 : cadence === 'biweekly' ? 14 : 30;
    const triggerDate = new Date(lastDateStr);
    triggerDate.setDate(triggerDate.getDate() + cadenceDays);
    triggerDate.setHours(9, 0, 0, 0);

    if (triggerDate <= new Date()) return; // already past — skip

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '📸 Physique check-in due',
        body: `Time to take your ${cadence} progress photo. Keep the streak going.`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });

    await AsyncStorage.setItem(REMINDER_KEY, id);
  } catch {
    // Non-fatal — notification scheduling is optional
  }
}
