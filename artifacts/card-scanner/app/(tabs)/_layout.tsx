import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";

// Native-only modules — lazy require so Metro doesn't resolve them on web
let isLiquidGlassAvailable: (() => boolean) | null = null;
let NativeTabs: any = null;
let NativeTabsIcon: any = null;
let NativeTabsLabel: any = null;
let SymbolView: any = null;

if (Platform.OS !== "web") {
  try {
    const g = require("expo-glass-effect");
    isLiquidGlassAvailable = g.isLiquidGlassAvailable;
  } catch {}
  try {
    const nt = require("expo-router/unstable-native-tabs");
    NativeTabs = nt.NativeTabs;
    NativeTabsIcon = nt.Icon;
    NativeTabsLabel = nt.Label;
  } catch {}
  try {
    SymbolView = require("expo-symbols").SymbolView;
  } catch {}
}

function NativeTabLayout() {
  if (!NativeTabs) return null;
  return (
    <NativeTabs initialRouteName="camera">
      <NativeTabs.Trigger name="list">
        <NativeTabsIcon sf={{ default: "list.bullet.rectangle", selected: "list.bullet.rectangle.fill" }} />
        <NativeTabsLabel>Lists</NativeTabsLabel>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="camera">
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
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === "ios";

  // PWA-safe bottom inset — mirrors env(safe-area-inset-bottom) with a minimum floor
  // on iOS PWA, insets.bottom returns 0 (known bug), so we force at least 20pt
  const WEB_HOME_INDICATOR_H = 20;
  const bottomInset =
    Platform.OS === "web"
      ? Math.max(insets.bottom, WEB_HOME_INDICATOR_H)
      : insets.bottom;

  const tabBarHeight = 49 + bottomInset;

  return (
    <Tabs
      initialRouteName="camera"
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
          height: tabBarHeight,
          paddingBottom: bottomInset,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ),
        tabBarLabelStyle: { fontFamily: "Poppins_500Medium", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="list"
        options={{
          title: "Lists",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView
              ? <SymbolView name="list.bullet.rectangle" tintColor={color} size={24} />
              : <Icon name="list-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: "Scan",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView
              ? <SymbolView name="camera.viewfinder" tintColor={color} size={24} />
              : <Icon name="scan-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView
              ? <SymbolView name="magnifyingglass" tintColor={color} size={24} />
              : <Icon name="search-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: "Collection",
          tabBarIcon: ({ color }) =>
            isIOS && SymbolView
              ? <SymbolView name="square.stack.3d.up" tintColor={color} size={24} />
              : <Icon name="albums-outline" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (Platform.OS !== "web" && isLiquidGlassAvailable?.()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
