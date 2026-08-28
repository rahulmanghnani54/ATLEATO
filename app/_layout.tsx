import '@/lib/domExceptionPolyfill'; // must be first — livekit/ElevenLabs needs DOMException
import { initSentry, Sentry } from '@/lib/sentry';
initSentry(); // crash + error reporting — env-gated, no-op until DSN is set
import { initAnalytics, identify as identifyAnalytics, reset as resetAnalytics } from '@/lib/analytics';
initAnalytics(); // product analytics — env-gated, no-op until POSTHOG key is set
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
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { hasActiveSession, WORKOUT_SESSION_NOTIF_ID } from '@/lib/activeSession';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { useThemeStore } from '@/stores/themeStore';
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
import { personaFromProgramId } from '@/lib/personaTheme';
import { syncAppIconToCoach } from '@/lib/appIcon';
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
  const { tokens } = useTheme();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      // Analytics identity follows auth. Sentry's equivalent (setSentryUser)
      // lives in authStore.setUser; this is the same moment, one layer up.
      // Id only — never the email/name on the session.
      if (!session?.user) resetAnalytics();
      if (session?.user) {
        identifyAnalytics(session.user.id);
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
    // Poll every 2.5s (was 1s). A coach call rings for far longer than that, so
    // in-app routing still feels instant — but we stop hammering the native
    // notifications bridge every single second for the whole app lifetime.
    const timer = setInterval(checkAndRoute, 2500);
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

  // AUTO app-icon color: the launcher ring follows the ACTIVE coach, no matter
  // WHERE the coach was changed (onboarding, Coach tab, Workouts tab, or any
  // future path) — one central watcher, so it can never be missed again.
  useEffect(() => {
    if (!profile?.selected_program) return;
    const personaId = personaFromProgramId(profile.selected_program).id;
    syncAppIconToCoach(personaId);
  }, [profile?.selected_program]);

  // contentStyle overrides React Navigation's default light card background —
  // without it every screen (and every push transition) paints white under the
  // dark scheme. In light mode tokens.bg is #FFFFFF, so this is a no-op there.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.bg } }} />
  );
}

// Consumes useTheme(), so it has to sit BELOW <ThemeProvider> — RootLayout mounts
// the provider and therefore can't read the context it is creating.
function ThemedShell() {
  const { tokens, scheme } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={tokens.bg}
      />
      <OfflineBanner />
      <RootNavigator />
    </View>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
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
  // useFonts leaves `loaded` false forever when a face fails to resolve, which
  // would pin the app on the splash screen permanently. Missing fonts degrade to
  // the system face — a dead launch is the far worse outcome.
  const fontsReady = fontsLoaded || !!fontError;
  const loading = useAuthStore((s) => s.loading);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const themeHydrated = useThemeStore((s) => s.hydrated);

  // Kick off theme hydration here rather than leaving it to ThemeProvider: this
  // component renders null until the fonts resolve, so the provider mounts late
  // and the AsyncStorage read would be serialised behind font loading.
  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

  // Reconcile the ongoing-workout chip at boot.
  //
  // workout-session deliberately LEAVES the chip up when you navigate away, so an
  // unfinished session stays resumable. But the chip is `ongoing` (non-dismissable)
  // and outlives a force-kill, while getActiveSession() self-deletes a session older
  // than SESSION_STALE_MS. Without this, killing the app mid-workout and coming back
  // the next day leaves a chip the user cannot swipe away pointing at a session that
  // no longer exists. Only clears when there is genuinely nothing to resume.
  useEffect(() => {
    (async () => {
      try {
        if (!(await hasActiveSession())) {
          await notifee.cancelNotification(WORKOUT_SESSION_NOTIF_ID);
        }
      } catch { /* a stuck chip must never block startup */ }
    })();
  }, []);

  // Hold the logo splash for a SHORT minimum (~700ms) so it still reads as a
  // branded intro without feeling like a wait. We hide once BOTH the app is
  // ready AND the min time passed. (Was 1600ms — too long; the app felt slow to
  // open even when fonts + auth resolved instantly.)
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinSplashElapsed(true), 700);
    return () => clearTimeout(t);
  }, []);

  // themeHydrated gates the hide too — painting the default scheme and then
  // flipping once storage resolves is worse than a few more ms of splash.
  useEffect(() => {
    if (fontsReady && !loading && minSplashElapsed && themeHydrated) SplashScreen.hideAsync();
  }, [fontsReady, loading, minSplashElapsed, themeHydrated]);

  if (!fontsReady) return null;

  return (
    <ErrorBoundary>
      {/* Outermost provider inside the boundary: every useSafeAreaInsets() /
          SafeAreaView consumer lives under ThemedShell → RootNavigator → Stack,
          so this is the only place that provably covers all of them. Without it
          the context default is all-zero insets and the whole app silently
          renders under the status bar and the gesture bar.
          initialMetrics seeds the first frame from the native window metrics —
          otherwise the tree still paints one zero-inset frame before the
          provider measures, which is the same bug for the length of a frame. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ThemedShell />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

// Sentry.wrap enables automatic error/performance instrumentation of the root.
// No-op-safe: if Sentry isn't initialised (no DSN), wrap just returns the app.
export default Sentry.wrap(RootLayout);
