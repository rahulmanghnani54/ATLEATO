import { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Spacing, Typography } from '@/constants/theme';
import { useThemedStyles, type SemanticTokens } from '@/lib/theme';
import { captureError } from '@/lib/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    if (__DEV__) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
    // Report the crash so WE see it, not just the user staring at the fallback.
    captureError(error, { componentStack: info.componentStack });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <ErrorFallback message={this.state.error?.message} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

// The boundary itself has to stay a class (only classes can catch), and a class
// cannot call useThemedStyles — so the fallback UI lives in its own function
// component, which can.
function ErrorFallback({ message, onRetry }: { message?: string; onRetry: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>
        {message ?? 'An unexpected error occurred.'}
      </Text>
      <TouchableOpacity style={styles.btn} onPress={onRetry}>
        <Text style={styles.btnText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    container: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      padding: Spacing.xl, backgroundColor: t.bgAlt,
    },
    emoji: { fontSize: 48, marginBottom: Spacing.md },
    // Typography presets carry the frozen LIGHT colour, so it is re-stated here.
    title: { ...Typography.h3, color: t.text, marginBottom: Spacing.sm },
    message: { ...Typography.body, color: t.textSecondary, textAlign: 'center', marginBottom: Spacing.lg },
    btn: {
      backgroundColor: t.accent, paddingHorizontal: 24, paddingVertical: 12,
      borderRadius: 8, borderWidth: 1, borderColor: t.accentLine,
    },
    // White on the brand emerald is 2.54:1; the dark emerald ink is 7.38:1.
    btnText: { color: t.accentInk, fontFamily: 'Inter_600SemiBold' },
  });
