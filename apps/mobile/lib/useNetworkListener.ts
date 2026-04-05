import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useAppStore } from "../store/useAppStore";

/**
 * Subscribes to real-time network connectivity changes via NetInfo and
 * pushes updates into the Zustand store.  Mount this once at the app root.
 *
 * When connectivity is restored and there is a `pendingRetryMessage` in the
 * store the chat screen picks it up and auto-retries — see ChatScreen.
 */
export function useNetworkListener() {
  const setIsConnected = useAppStore((s) => s.setIsConnected);

  useEffect(() => {
    // Seed the initial state immediately
    NetInfo.fetch().then((state) => {
      setIsConnected(state.isConnected ?? false);
    });

    // Subscribe to all subsequent changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? false);
    });

    return () => {
      unsubscribe();
    };
  }, [setIsConnected]);
}
