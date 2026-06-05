import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { CardResultSheet } from "@/components/CardResultSheet";
import { CardScanResult, useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";
import { identifyCard } from "@/services/cardScanService";

// Lazy-load expo-camera only on native to avoid web crashes
let CameraView: React.ComponentType<{
  ref?: React.Ref<unknown>;
  style?: object;
  facing?: "back" | "front";
}> | null = null;

let useCameraPermissions: (() => [
  { granted: boolean; canAskAgain: boolean } | null,
  () => Promise<void>
]) | null = null;

if (Platform.OS !== "web") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cam = require("expo-camera");
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
}

type ScanState = "idle" | "scanning" | "success" | "error";

function WebScannerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [resultCard, setResultCard] = useState<CardScanResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const { lists, activeScanListId } = useScanContext();

  const activeList = lists.find((l) => l.id === activeScanListId);
  const topPad = 67;
  const bottomPad = 34 + 84;

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setScanState("scanning");
    setErrorMsg("");
    try {
      const card = await identifyCard(result.assets[0].uri);
      setResultCard(card);
      setShowResult(true);
      setScanState("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to identify card";
      setErrorMsg(msg);
      setScanState("error");
    }
  };

  const handleScanAgain = () => {
    setShowResult(false);
    setResultCard(null);
    setScanState("idle");
    setErrorMsg("");
  };

  return (
    <View style={[styles.webContainer, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>Scanner</Text>
        <Pressable
          style={[styles.listPillWeb, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={() => router.push("/(tabs)/scans")}
        >
          <View style={[styles.listDot, { backgroundColor: activeList?.color ?? colors.primary }]} />
          <Text style={[styles.listPillText, { color: colors.foreground }]}>{activeList?.name ?? "My Scans"}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.webUploadArea}>
        <View style={[styles.scanBoxWeb, { borderColor: colors.border }]}>
          <View style={[styles.corner, styles.cornerTL, { borderColor: colors.primary }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: colors.primary }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: colors.primary }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: colors.primary }]} />
          <Ionicons name="camera-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.webHint, { color: colors.mutedForeground }]}>
            {scanState === "scanning" ? "Identifying card..." :
              scanState === "error" ? errorMsg :
              "Upload a card photo to identify it"}
          </Text>
        </View>
      </View>

      <View style={[styles.webBottomBar, { paddingBottom: bottomPad }]}>
        <Pressable
          style={[styles.webPickBtn, { backgroundColor: scanState === "scanning" ? colors.muted : colors.primary }]}
          onPress={handlePickImage}
          disabled={scanState === "scanning"}
        >
          {scanState === "scanning"
            ? <ActivityIndicator color={colors.primaryForeground} />
            : <>
                <Ionicons name="image-outline" size={20} color={colors.primaryForeground} />
                <Text style={[styles.webPickBtnText, { color: colors.primaryForeground }]}>
                  Choose Photo
                </Text>
              </>
          }
        </Pressable>
      </View>

      <CardResultSheet
        visible={showResult}
        result={resultCard}
        onClose={handleScanAgain}
        onScanAgain={handleScanAgain}
      />
    </View>
  );
}

function NativeScannerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<unknown>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [resultCard, setResultCard] = useState<CardScanResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const { lists, activeScanListId } = useScanContext();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [permission, requestPermission] = useCameraPermissions!();
  const activeList = lists.find((l) => l.id === activeScanListId);

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopPulse = () => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  };

  const handleCapture = async () => {
    if (scanState === "scanning" || !cameraRef.current) return;
    setScanState("scanning");
    setErrorMsg("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startPulse();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const photo = await (cameraRef.current as any).takePictureAsync({
        quality: 0.8,
        base64: false,
        skipProcessing: false,
      });
      if (!photo) throw new Error("Failed to capture photo");
      const result = await identifyCard(photo.uri);
      setResultCard(result);
      setShowResult(true);
      setScanState("success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to identify card";
      setErrorMsg(msg);
      setScanState("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      stopPulse();
    }
  };

  const handleScanAgain = () => {
    setShowResult(false);
    setResultCard(null);
    setScanState("idle");
    setErrorMsg("");
  };

  if (!permission) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={64} color={colors.mutedForeground} />
        <Text style={[styles.permTitle, { color: colors.foreground }]}>Camera Access Needed</Text>
        <Text style={[styles.permSubtitle, { color: colors.mutedForeground }]}>
          Allow camera access to scan trading cards
        </Text>
        {permission.canAskAgain && (
          <Pressable
            style={[styles.permBtn, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
          >
            <Text style={[styles.permBtnText, { color: colors.primaryForeground }]}>
              Allow Camera
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  const NativeCam = CameraView!;

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <NativeCam
        ref={cameraRef as React.Ref<unknown>}
        style={StyleSheet.absoluteFill}
        facing="back"
      />

      <View style={[styles.overlay, StyleSheet.absoluteFill]}>
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.topTitle}>Scanner</Text>
          <Pressable
            style={[styles.listPill, { backgroundColor: "rgba(255,255,255,0.15)" }]}
            onPress={() => router.push("/(tabs)/scans")}
          >
            <View style={[styles.listDot, { backgroundColor: activeList?.color ?? colors.primary }]} />
            <Text style={styles.listPillText}>{activeList?.name ?? "My Scans"}</Text>
            <Ionicons name="chevron-down" size={14} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.scanFrame}>
          <Animated.View style={[styles.scanBox, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[styles.corner, styles.cornerTL, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: colors.primary }]} />
            {scanState === "scanning" && (
              <View style={[styles.scanLine, { backgroundColor: colors.primary }]} />
            )}
          </Animated.View>
          <Text style={styles.scanHint}>
            {scanState === "scanning" ? "Identifying card..." :
              scanState === "error" ? errorMsg :
              "Position card within frame"}
          </Text>
        </View>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 100 }]}>
          <Pressable
            style={({ pressed }) => [
              styles.captureOuter,
              { borderColor: colors.primary, opacity: pressed ? 0.85 : 1 }
            ]}
            onPress={handleCapture}
            disabled={scanState === "scanning"}
          >
            <View style={[styles.captureInner, {
              backgroundColor: scanState === "scanning" ? colors.mutedForeground : colors.primary
            }]}>
              {scanState === "scanning"
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="scan" size={26} color="#fff" />
              }
            </View>
          </Pressable>
        </View>
      </View>

      <CardResultSheet
        visible={showResult}
        result={resultCard}
        onClose={handleScanAgain}
        onScanAgain={handleScanAgain}
      />
    </View>
  );
}

export default function ScannerScreen() {
  if (Platform.OS === "web") {
    return <WebScannerScreen />;
  }
  return <NativeScannerScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webContainer: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  overlay: {
    justifyContent: "space-between",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  topTitle: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  listPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  listPillWeb: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
  },
  listDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listPillText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  scanFrame: {
    alignItems: "center",
    gap: 20,
  },
  scanBox: {
    width: 280,
    height: 196,
    position: "relative",
  },
  scanBoxWeb: {
    width: 280,
    height: 220,
    position: "relative",
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 6,
  },
  scanLine: {
    position: "absolute",
    top: "50%",
    left: 8,
    right: 8,
    height: 2,
    opacity: 0.8,
    borderRadius: 1,
  },
  scanHint: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  webHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  bottomBar: {
    alignItems: "center",
  },
  webUploadArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  webBottomBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  webPickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
  },
  webPickBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  captureOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  permTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  permSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  permBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  permBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
