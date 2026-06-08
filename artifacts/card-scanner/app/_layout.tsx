import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScanProvider } from "@/context/ScanContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// On web, @expo/vector-icons uses CSS @font-face — useFonts() won't wire it up.
// We inject the rule manually so Ionicons glyphs resolve on first render.
function useIoniconsFontWeb() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (document.getElementById("ionicons-font-face")) return;
    const style = document.createElement("style");
    style.id = "ionicons-font-face";
    // The .ttf is served by Expo's web bundler from node_modules automatically
    style.textContent = `
      @font-face {
        font-family: 'Ionicons';
        src: url('./assets/fonts/Ionicons.ttf') format('truetype'),
             url('../assets/fonts/Ionicons.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
    `;
    document.head.appendChild(style);
  }, []);
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  useIoniconsFontWeb();

  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <ScanProvider>
                <RootLayoutNav />
              </ScanProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
