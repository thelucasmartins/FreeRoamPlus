import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort safety net for render-time exceptions (a malformed on-device
 * overlay file that slips past a loader's own try/catch, a bad geometry
 * MapLibre chokes on, etc.). Without this, React unmounts the whole tree on
 * any uncaught error and the app shows a blank/crashed screen with no way
 * back short of force-quitting. "Try again" just resets local state — the
 * overlay loaders already fall back to sample data on their own next run,
 * so a reset is usually enough to recover.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error in render tree:', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Pressable style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f1ea',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#a02c2c',
  },
  message: {
    fontSize: 14,
    color: '#5d5347',
    textAlign: 'center',
    marginTop: 12,
  },
  button: {
    backgroundColor: '#4a6b3a',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
