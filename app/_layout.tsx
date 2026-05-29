import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SplashScreen } from 'expo-router';
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
  setupCallKeep, wireCallKeepEvents, handleWakeupBackground,
  ringForegroundServiceRunner,
} from '@/lib/wakeupCalls';
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
  const { user, profile, loading, setUser, setSession, setLoading, fetchProfile } = useAuthStore();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
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
      // CallKeep — proper system-level incoming call escalation.
      try {
        await setupCallKeep();
        wireCallKeepEvents({
          onAnswered: () => {
            // When the user taps "Answer" in the system call UI, open our
            // in-app call screen. The persona comes from the active wake-up
            // schedule (last-known persona).
            router.push('/incoming-call' as any);
          },
          onDeclined: () => {
            // The user declined the system call. Nothing routes — we already
            // let the persona vent via TTS inside the existing handler.
          },
        });
      } catch { /* ignore */ }
    })();
    return () => { try { unsub?.(); } catch { /* ignore */ } };
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

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (!user) {
      if (!inAuth) router.replace('/(auth)/login');
    } else if (profile && !profile.onboarding_complete) {
      if (!inOnboarding) router.replace('/(onboarding)/step1-goal');
    } else if (profile?.onboarding_complete) {
      if (inAuth || inOnboarding) router.replace('/(tabs)');
    } else if (user && !profile) {
      if (!inOnboarding) router.replace('/(onboarding)/step1-goal');
    }
  }, [user, profile, loading, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ArchivoBlack_400Regular,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    if (fontsLoaded && !loading) SplashScreen.hideAsync();
  }, [fontsLoaded, loading]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <View style={{ flex: 1, backgroundColor: '#0a0b0d' }}>
          <OfflineBanner />
          <RootNavigator />
        </View>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
