import * as Haptics from "expo-haptics";
import { manipulateAsync } from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardDetailModal } from "@/components/CardDetailModal";
import { Icon } from "@/components/Icon";
import { ListPickerModal } from "@/components/ListPickerModal";
import { useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const SCREEN_H = Dimensions.get("window").height;
const FRAME_H = 260;
const TAB_BAR_H = 49;
// Minimum bottom inset for iOS PWA where insets.bottom returns 0 (home indicator height)
const WEB_HOME_INDICATOR_H = 20;

type ScanPhase = "idle" | "scanning" | "result" | "error";

type CropFrame = {
  frame: { x: number; y: number; width: number; height: number }
};

async function cropToFrame(
  uri: string,
  photoWidth: number,
  photoHeight: number,
  frame: { x: number; y: number; width: number; height: number }
) {
  const scaleX = photoWidth / Dimensions.get("window").width;
  const scaleY = photoHeight / SCREEN_H;
  const cropX = Math.round(frame.x * scaleX);
  const cropY = Math.round(frame.y * scaleY);
  const cropW = Math.round(frame.width * scaleX);
  const cropH = Math.min(Math.round(frame.height * scaleY), photoHeight - cropY);
  return manipulateAsync(
    uri,
    [{ crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } }],
    { compress: 0.92, base64: true }
  );
}

function ListBadge({ list, dark, onPress }: { list: any; dark: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        fStyles.badge,
        dark
          ? { backgroundColor: "rgba(255,255,255,0.15)" }
          : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 },
      ]}
    >
      <View style={[fStyles.badge, { backgroundColor: colors.accent }]}>
        <View style={[fStyles.dot, { backgroundColor: list?.color ?? colors.accent }]} />
      </View>
      <Text style={[fStyles.badgeText, { color: dark ? "#fff" : colors.foreground }]} numberOfLines={1}>
        {list?.name ?? "Select list"}
      </Text>
      <Icon name="chevron-down" size={12} color={dark ? "rgba(255,255,255,0.7)" : colors.mutedForeground} />
    </Pressable>
  );
}

function FilterPill({ label, active, dark, onPress }: { label: string; active: boolean; dark: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={
        [
          pillStyles.pill,
          dark ? { backgroundColor: "rgba(255,255,255,0.18)" } : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
          active && { backgroundColor: colors.accent, borderColor: colors.accent, borderWidth: 0 },
        ]
      }
    >
      <Text style={[pillStyles.label, { color: active ? colors.background : dark ? "#fff" : colors.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// Web fallback (no native camera)
function WebScanFallback() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lists, selectedListId, setSelectedListId } = useScanContext();
  const [listPickerVisible, setListPickerVisible] = useState(false);
  const activeList = lists.find((l) => l.id === selectedListId) ?? lists[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.centered, { backgroundColor: colors.background, flex: 1, paddingTop: insets.top + 12 }]}>
          <View style={[styles.permIcon, { backgroundColor: colors.surface }]}>
            <Icon name="camera-outline" size={36} color={colors.accent} />
          </View>
          <Text style={[styles.permTitle, { color: colors.foreground }]}>Camera not available</Text>
          <Text style={[styles.permSub, { color: colors.mutedForeground }]}>Card scanning requires a native app. Use Search to look up cards manually.</Text>
        </View>
      </View>
      <View style={[styles.nativeHeader, { paddingTop: insets.top + 12 }]}>
        <ListBadge list={activeList} dark={false} onPress={() => setListPickerVisible(true)} />
      </View>
      <View style={[styles.nativeFilterPills, { top: insets.top + 60 }]}>
        <FilterPill label="All" active={true} dark={false} onPress={() => {}} />
      </View>
      <ListPickerModal
        visible={listPickerVisible}
        onClose={() => setListPickerVisible(false)}
        onSelect={(id) => { setSelectedListId(id); setListPickerVisible(false); }}
      />
    </View>
  );
}

// Native camera scan view
function NativeScanView() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lists, selectedListId, setSelectedListId, addToList } = useScanContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [resultCard, setResultCard] = useState<any | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [filterMode, setFilterMode] = useState<"all" | "new" | "owned">("all");
  const [listPickerVisible, setListPickerVisible] = useState(false);
  const [frameLayout, setFrameLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const frameLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const bottomPad = insets.bottom + TAB_BAR_H + 16;
  const activeList = lists.find((l) => l.id === selectedListId) ?? lists[0];

  const onFrameLayout = useCallback((e: any) => {
    e.target.measure((_x: number, _y: number, w: number, h: number, px: number, py: number) => {
      const layout = { x: px, y: py, width: w, height: h };
      frameLayoutRef.current = layout;
      setFrameLayout(layout);
    });
    const { x, y, width, height } = e.nativeEvent.layout;
    const layout = { x, y, width, height };
    frameLayoutRef.current = layout;
    setFrameLayout(layout);
  }, []);

  const NativeCam = CameraView as any;
  const cameraRef = useRef<typeof NativeCam>(null);

  const handleCapture = useCallback(async () => {
    if (phase !== "idle" || !cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase("scanning");
    try {
      const photo = await (cameraRef.current as any).takePictureAsync({ quality: 0.92, base64: false });
      const frame = frameLayoutRef.current;
      const uri = frame && photo.width && photo.height
        ? await cropToFrame(photo.uri, photo.width, photo.height, frame)
        : { uri: photo.uri, base64: undefined };
      const form = new FormData();
      form.append("image", { uri: (uri as any).uri, type: "image/jpeg", name: "scan.jpg" } as any);
      const res = await fetch(`${API_BASE}/scan`, { method: "POST", body: form });
      const data = await res.json();
      if (data?.card) {
        setResultCard(data.card);
        setPhase("result");
        setDetailVisible(true);
      } else {
        setPhase("error");
        setTimeout(() => setPhase("idle"), 1800);
      }
    } catch {
      setPhase("error");
      setTimeout(() => setPhase("idle"), 1800);
    }
  }, [phase]);

  if (!permission) return <View style={[styles.centered, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;

  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
          <View style={[styles.permIcon, { backgroundColor: colors.surface }]}>
            <Icon name="camera-outline" size={36} color={colors.accent} />
          </View>
          <Text style={[styles.permTitle, { color: colors.foreground }]}>Camera access needed</Text>
          <Text style={[styles.permSub, { color: colors.mutedForeground }]}>Allow camera access to scan trading cards</Text>
          <Pressable style={[styles.permBtn, { backgroundColor: colors.accent }]} onPress={requestPermission}>
            <Text style={[styles.permBtnText, { color: colors.background }]}>Allow Camera</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const frameTop = insets.top + 12 + 52 + (SCREEN_H - (insets.top + 12 + 52) - (bottomPad + 80) - FRAME_H) / 2;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NativeCam ref={cameraRef as React.Ref<unknown>} style={StyleSheet.absoluteFill} facing="back" flash={flash} />

      {/* Dim overlay */}
      {frameLayout && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[styles.dimRegion, { top: 0, left: 0, right: 0, height: frameLayout.y }]} />
          <View style={[styles.dimRegion, { top: frameLayout.y + frameLayout.height, left: 0, right: 0, bottom: 0 }]} />
          <View style={[styles.dimRegion, { top: frameLayout.y, left: 0, width: frameLayout.x, height: frameLayout.height }]} />
          <View style={[styles.dimRegion, { top: frameLayout.y, left: frameLayout.x + frameLayout.width, right: 0, height: frameLayout.height }]} />
        </View>
      )}

      <View style={[styles.nativeHeader, { paddingTop: insets.top + 12 }]}>
        <ListBadge list={activeList} dark={true} onPress={() => setListPickerVisible(true)} />
        <View style={styles.headerRight}>
          <Pressable onPress={() => setFlash(f => f === "off" ? "on" : "off")}>
            <Icon name={flash === "on" ? "flash" : "flash-off-outline"} size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.nativeFilterPills, { top: insets.top + 60 }]}>
        {(["all", "new", "owned"] as const).map((mode) => (
          <FilterPill key={mode} label={mode.charAt(0).toUpperCase() + mode.slice(1)} active={filterMode === mode} dark={true} onPress={() => setFilterMode(mode)} />
        ))}
      </View>

      {/* Scan frame */}
      <View
        style={[styles.frameBox, { top: frameTop, width: Dimensions.get("window").width * 0.78, height: FRAME_H }]}
        onLayout={onFrameLayout}
        pointerEvents="none"
      >
        <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "#fff" }]} />
        <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderColor: "#fff" }]} />
        <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "#fff" }]} />
        <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "#fff" }]} />
        {phase === "scanning" && (
          <View style={styles.scanningOverlay}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.scanningText}>Scanning…</Text>
          </View>
        )}
        {phase === "error" && (
          <View style={styles.scanningOverlay}>
            <Icon name="close-circle" size={36} color="#ff6b6b" />
            <Text style={[styles.scanningText, { color: "#ff6b6b" }]}>Not recognised</Text>
          </View>
        )}
      </View>

      {/* Bottom controls */}
      <View style={[styles.nativeBottom, { bottom: bottomPad }]}>
        <View style={{ width: 44 }} />
        <Pressable
          onPress={handleCapture}
          disabled={phase !== "idle"}
          style={[styles.nativeCaptureBtn, phase !== "idle" && { opacity: 0.5 }]}
        >
          <View style={[styles.nativeCaptureCore, { backgroundColor: colors.accent }]} />
        </Pressable>
        <Pressable onPress={() => {}}>
          <Icon name="images-outline" size={28} color="#fff" />
        </Pressable>
      </View>

      <CardDetailModal
        visible={detailVisible}
        card={resultCard}
        onClose={() => {
          setDetailVisible(false);
          setPhase("idle");
          setResultCard(null);
        }}
        onAddToList={(listId) => {
          if (resultCard) addToList(resultCard, listId);
        }}
      />

      <ListPickerModal
        visible={listPickerVisible}
        onClose={() => setListPickerVisible(false)}
        onSelect={(id) => { setSelectedListId(id); setListPickerVisible(false); }}
      />
    </View>
  );
}

import { Platform } from "react-native";

export default function ScanScreen() {
  if (Platform.OS === "web") return <WebScanFallback />;
  return <NativeScanView />;
}

const styles = StyleSheet.create({
  container: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  nativeHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 10,
  },
  listBadgeDark: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)" },
  listDot: { width: 8, height: 8, borderRadius: 4 },
  frameOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 20, pointerEvents: "none" as "none" },
  frameBox: { position: "absolute", alignSelf: "center", alignItems: "center", justifyContent: "center" },
  corner: { position: "absolute", width: 28, height: 28, borderWidth: 3 },
  scanningOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 4 },
  scanningText: { color: "#fff", fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  nativeBottom: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 40 },
  nativeCaptureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  nativeCaptureCore: { width: 56, height: 56, borderRadius: 28 },
  nativeFilterPills: { position: "absolute", left: 0, right: 0, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, paddingHorizontal: 20 },
  dimRegion: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  permIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  permTitle: { fontSize: 19, fontFamily: "Poppins_700Bold", textAlign: "center" },
  permSub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center" },
  permBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  permBtnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});

const fStyles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontSize: 14, fontFamily: "Poppins_600SemiBold", maxWidth: 120 },
});

const pillStyles = StyleSheet.create({
  pill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  label: { fontSize: 13, fontFamily: "Poppins_500Medium" },
});
