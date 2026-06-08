import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/useColors";

// ── Native-only modules — loaded with require() so Metro does not attempt to
// resolve them when bundling for web (top-level imports always get resolved).
let isLiquidGlassAvailable: (() => boolean) | null = null;
let NativeTabs: any = null;
let NativeTabsIcon: any = null;
let NativeTabsLabel: any = null;
let SymbolView: any = null;

if (Platform.OS !== "web") {
  try {
    const glassEffect = require("expo-glass-effect");
    isLiquidGlassAvailable = glassEffect.isLiquidGlassAvailable;
  } catch {}
  try {
    const nativeTabs = require("expo-router/unstable-native-tabs");
    NativeTabs = nativeTabs.NativeTabs;
    NativeTabsIcon = nativeTabs.Icon;
    NativeTabsLabel = nativeTabs.Label;
  } catch {}
  try {
    const symbols = require("expo-symbols");
    SymbolView = symbols.SymbolView;
  } catch {}
}

function NativeTabLayout() {
  if (!NativeTabs) return null;
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="scans">
        <NativeTabsIcon sf={{ default: "list.bullet.rectangle", selected: "list.bullet.rectangle.fill" }} />
        <NativeTabsLabel>Lists</NativeTabsLabel>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="index">
        <NativeTabsIcon sf={{ default: "camera.viewfinder", selected: "camera.viewfinder" }} />
        <NativeTabsLabel>Scan</NativeTabsLabel>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <NativeTabsIcon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} />
        <NativeTabsLabel>Search</NativeTabsLabel>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="collection">
        <NativeTabsIcon sf={{ default: "square.stack.3d.up", selected: "square.stack.3d.up.fill" }} />
        <NativeTabsLabel>Collection</NativeTabsLabel>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ) : null,
        tabBarLabelStyle: { fontFamily: "Poppins_500Medium", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="scans"
        options={{
          title: "Lists",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView
              ? <SymbolView name="list.bullet.rectangle" tintColor={color} size={24} />
              : <Ionicons name="list-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Scan",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView
              ? <SymbolView name="camera.viewfinder" tintColor={color} size={24} />
              : <Ionicons name="scan-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView
              ? <SymbolView name="magnifyingglass" tintColor={color} size={24} />
              : <Ionicons name="search-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: "Collection",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView
              ? <SymbolView name="square.stack.3d.up" tintColor={color} size={24} />
              : <Ionicons name="albums-outline" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  // On web, isLiquidGlassAvailable is null — always use ClassicTabLayout
  if (Platform.OS !== "web" && isLiquidGlassAvailable?.()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
