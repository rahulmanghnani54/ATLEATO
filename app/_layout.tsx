import '@/lib/domExceptionPolyfill'; // must be first — livekit/ElevenLabs needs DOMException
import { useEffect, useState } from 'react';
import { View, AppState, StatusBar } from 'react-native';
import { Stack, useRouter, useSegments, useGlobalSearchParams , SplashScreen } from 'expo-router';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { ArchivoBlack_400Regular } from '@expo-google-fonts/archivo-black';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';
// Direction C — Plus Jakarta Sans is the new display font (v1 theme).
// Archivo Black + JetBrains Mono still loaded for legacy screens not yet migrated.
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import {
  configureNotificationHandler, setupAndroidChannels, setupCallActionCategory,
  declineCoachCall, cancelRingingChain,
} from '@/lib/coachCallScheduler';
import {
  setupCallChannel, registerCallEventHandler,
} from '@/lib/notifeeCallScheduler';
import {
  handleWakeupBackground,
  ringForegroundServiceRunner,
} from '@/lib/wakeupCalls';
import { initBilling, refreshReferralReward } from '@/lib/subscriptionManager';
import { resyncCoachCalls } from '@/hooks/useCoachReminders';
import { initBranchReferral } from '@/lib/branchReferral';
import notifee from '@notifee/react-native';
import type { PersonaId } from '@/lib/personaTheme';

// Notifee background event handler — fires even when app is fully killed.
// Catches our wake-up trigger and escalates it into a real ring via CallKeep.
notifee.onBackgroundEvent(handleWakeupBackground);

// Register the foreground-service runner that keeps the ring loop alive
// while the user's phone is dark / app is backgrounded. MUST be at module
// load (top-level), not inside a component.
notifee.registerForegroundService(ringForegroundServiceRunner);
import type { CallKind } from '@/lib/coachCallScheduler';

// Configure how foreground notifications behave (banner + sound).
configureNotificationHandler();

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const glob = useGlobalSearchParams<{ fromProfile?: string }>();
  const { user, profile, loading, setUser, setSession, setLoading, fetchProfile } = useAuthStore();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
        // Record today's app-open (powers the "active referral" definition —
        // 3+ open-days in first 7) + grant any earned referral reward. Both
        // best-effort, never block auth.
        try { (supabase.rpc as any)('record_app_open'); } catch { /* ignore */ }
        refreshReferralReward();
      }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // One-time setup: notification channels + Notifee call handler + CallKeep.
  // Wrapped so any setup failure can never block the app from rendering.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try { await setupAndroidChannels(); } catch { /* ignore */ }
      try { await setupCallActionCategory(); } catch { /* ignore */ }
      try { await setupCallChannel(); } catch { /* ignore */ }
      try {
        unsub = registerCallEventHandler((kind, personaId) => {
          router.push({
            pathname: '/incoming-call',
            params: { kind, personaId },
          } as any);
        });
      } catch { /* ignore */ }
      // Billing — resolve subscription tier from Google Play
      try { await initBilling(); } catch { /* ignore */ }
    })();
    // Branch deep-link install attribution (referral reward). No-ops when the
    // native module isn't present (before Branch key + rebuild). Returns an
    // unsubscribe we tear down on unmount.
    let branchUnsub: (() => void) | undefined;
    try { branchUnsub = initBranchReferral(); } catch { /* ignore */ }
    return () => {
      try { unsub?.(); } catch { /* ignore */ }
      try { branchUnsub?.(); } catch { /* ignore */ }
    };
  }, [router]);

  // Cold-launch routing: when the phone is locked and a coach call fires, the
  // full-screen intent launches the app from a killed state. Expo Router boots
  // to the default route — NOT the call screen. notifee.getInitialNotification()
  // returns the notification that launched us (press OR full-screen action), so
  // we read its data and route straight to /incoming-call. Runs once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const initial = await notifee.getInitialNotification();
        const data = initial?.notification?.data as
          | { kind?: CallKind; personaId?: PersonaId }
          | undefined;
        if (!cancelled && data?.kind && data?.personaId) {
          router.push({
            pathname: '/incoming-call',
            params: { kind: data.kind, personaId: data.personaId },
          } as any);
        }
      } catch {
        // getInitialNotification unavailable (Expo Go) — degrade gracefully
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  // Handle taps on Coach Call notifications.
  // - ANSWER (or notification body)  → silence ring, open the right screen
  // - DECLINE                          → silence ring, coach speaks "no excuses"
  //                                       via TTS + fires angry follow-up
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        kind?: CallKind; personaId?: PersonaId;
      };
      const actionId = response.actionIdentifier;

      if (!data?.kind || !data?.personaId) return;

      if (actionId === 'DECLINE') {
        declineCoachCall({ kind: data.kind, personaId: data.personaId });
        return;
      }

      // ANSWER, body-tap, or default response — open the full-screen
      // incoming-call UI. It handles the rest (answer / decline) and
      // cancels the ring chain on mount.
      router.push({
        pathname: '/incoming-call',
        params: { kind: data.kind, personaId: data.personaId },
      } as any);
    });
    return () => sub.remove();
  }, [router]);

  // Route to the incoming-call screen whenever a coach call is RINGING. This
  // covers every case: cold launch (handled above), resume from background
  // (AppState 'active'), AND — the one that kept failing — the alarm firing
  // while the app is ALREADY open (the 1s poll). Android only shows the
  // full-screen call when the screen is OFF; when you're looking at the app it's
  // just a heads-up + ring, so we have to navigate ourselves. The call screen
  // cancels the notification on mount, so the poll won't re-route after that.
  useEffect(() => {
    let lastRoute = 0;
    const checkAndRoute = async () => {
      if (AppState.currentState !== 'active') return;
      if (Date.now() - lastRoute < 6000) return; // debounce repeated routes
      try {
        const displayed = await notifee.getDisplayedNotifications();
        const hit = displayed.find((n) => {
          const d = (n.notification as any)?.data ?? {};
          return d?.kind && d?.personaId && d?.callId; // a coach-call notification
        });
        if (hit) {
          lastRoute = Date.now();
          const d = (hit.notification as any).data;
          router.push({
            pathname: '/incoming-call',
            params: { kind: d.kind, personaId: d.personaId },
          } as any);
        }
      } catch { /* ignore */ }
    };
    const timer = setInterval(checkAndRoute, 1000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') checkAndRoute(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [router]);

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    // OAuth deep-link callback (atleato://auth-callback): while it exchanges the
    // PKCE code the user isn't authenticated yet, so DON'T bounce it to login;
    // once signed in, route away from it just like we do from the auth group.
    const inAuthCallback = segments[0] === 'auth-callback';
    // Onboarding-complete users can intentionally re-enter onboarding screens to
    // EDIT settings (e.g. "Change program" / "Edit goals" from Profile). Those
    // links pass ?fromProfile=1 so the guard below doesn't bounce them to home.
    const editingFromProfile = glob.fromProfile === '1';

    if (!user) {
      if (!inAuth && !inAuthCallback) router.replace('/(auth)/login');
    } else if (profile && !profile.onboarding_complete) {
      if (!inOnboarding) router.replace('/(onboarding)/step1-goal');
    } else if (profile?.onboarding_complete) {
      if (inAuth || inAuthCallback) router.replace('/(tabs)');
      else if (inOnboarding && !editingFromProfile) router.replace('/(tabs)');
    } else if (user && !profile) {
      if (!inOnboarding) router.replace('/(onboarding)/step1-goal');
    }
  }, [user, profile, loading, segments, glob.fromProfile]);

  // Keep scheduled coach calls in sync with the ACTIVE coach. Fires on boot
  // (when the profile loads) and whenever the user switches program/coach on ANY
  // screen — so the scheduled call always rings with the current persona, never
  // a stale one. (The schedule bakes the persona in at schedule time.)
  useEffect(() => {
    if (profile?.selected_program) resyncCoachCalls();
  }, [profile?.selected_program]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // Direction C display family
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    // Legacy display + mono (kept for non-migrated screens)
    ArchivoBlack_400Regular,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  const loading = useAuthStore((s) => s.loading);

  // Hold the logo splash for a deliberate minimum (~1.6s) so it reads as a
  // branded intro like other apps — instead of flashing away the instant fonts
  // + auth resolve. We hide once BOTH the app is ready AND the min time passed.
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinSplashElapsed(true), 1600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (fontsLoaded && !loading && minSplashElapsed) SplashScreen.hideAsync();
  }, [fontsLoaded, loading, minSplashElapsed]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <View style={{ flex: 1, backgroundColor: '#F4F7F5' }}>
          <StatusBar barStyle="dark-content" backgroundColor="#F4F7F5" />
          <OfflineBanner />
          <RootNavigator />
        </View>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
