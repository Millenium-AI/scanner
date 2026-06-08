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

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScanProvider } from "@/context/ScanContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  /**
   * WHY WE LOAD IONICONS HERE
   * --------------------------
   * @expo/vector-icons v14+ (SDK 50+) dropped automatic font registration on
   * Metro web. The font must be explicitly included in the Metro asset graph by
   * require()-ing the .ttf file. We copy Ionicons.ttf into assets/fonts/ via
   * `scripts/copy-fonts.js` (also runs as postinstall), then load it here.
   *
   * Using the font-family name 'Ionicons' is critical — it must match the name
   * that @expo/vector-icons uses internally when it calls createIconSet().
   */
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    // Ionicons loaded from local asset so Metro bundles the TTF on web.
    // The key 'Ionicons' MUST match what @expo/vector-icons registers internally.
    Ionicons: require("../assets/fonts/Ionicons.ttf"),
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
