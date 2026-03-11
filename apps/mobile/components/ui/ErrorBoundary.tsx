import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function ErrorFallback({
  error,
  onReset,
}: {
  error: Error | null;
  onReset: () => void;
}) {
  return (
    <View className="flex-1 bg-background items-center justify-center px-8">
      <Ionicons name="alert-circle-outline" size={56} color="#A09A90" />
      <Text className="text-foreground text-xl font-sans-bold mt-4 mb-2 text-center">
        Something went wrong
      </Text>
      <Text className="text-muted text-sm font-sans text-center mb-8 leading-5">
        {error?.message ?? "An unexpected error occurred. Please try again."}
      </Text>
      <Pressable
        onPress={onReset}
        className="bg-primary px-6 py-3 rounded-2xl"
      >
        <Text className="text-white font-sans-semibold text-base">
          Try Again
        </Text>
      </Pressable>
    </View>
  );
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback error={this.state.error} onReset={this.handleReset} />
      );
    }
    return this.props.children;
  }
}
