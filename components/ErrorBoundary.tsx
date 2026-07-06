import { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';
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
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={this.handleRetry}>
            <Text style={styles.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, backgroundColor: Colors.background,
  },
  emoji: { fontSize: 48, marginBottom: Spacing.md },
  title: { ...Typography.h3, marginBottom: Spacing.sm },
  message: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg },
  btn: {
    backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
});
