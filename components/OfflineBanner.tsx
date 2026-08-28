import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, AppState, type AppStateStatus } from 'react-native';
import { useThemedStyles, type SemanticTokens } from '@/lib/theme';

async function checkConnectivity(): Promise<boolean> {
  try {
    const response = await fetch('https://www.gstatic.com/generate_204', {
      method: 'HEAD',
      cache: 'no-cache',
    });
    return response.status === 204 || response.ok;
  } catch {
    return false;
  }
}

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const online = await checkConnectivity();
      if (mounted) setIsOffline(!online);
    };

    check();

    // Re-check when app comes to foreground
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') check();
    });

    // Poll every 30s
    const interval = setInterval(check, 30_000);

    return () => {
      mounted = false;
      sub.remove();
      clearInterval(interval);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>⚠️ No internet connection — data may be unavailable</Text>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    banner: {
      backgroundColor: t.warning,
      paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center',
    },
    // Dark ink on the amber fill, not a pale amber-on-amber pair — `crown` is
    // the darkest ink of the active scheme, so it clears AA on both ambers.
    text: { color: t.crown, fontSize: 12, fontFamily: 'Inter_500Medium' },
  });
