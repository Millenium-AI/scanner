import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardResultSheet } from "@/components/CardResultSheet";
import { VariantPickerModal } from "@/components/VariantPickerModal";
import {
  ScanFilterSheet,
  ScanFilters,
  EMPTY_FILTERS,
  activeFilterCount,
} from "@/components/ScanFilterSheet";
import { CardScanResult, useScanContext } from "@/context/ScanContext";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { identifyCard } from "@/services/cardScanService";
import WebCameraScanner, {
  WebCameraScannerHandle,
} from "@/components/WebCameraScanner";

let CameraView: React.ComponentType<{
  ref?: React.Ref<unknown>;
  style?: object;
  facing?: "back" | "front";
  flash?: "on" | "off" | "auto";
}> | null = null;

let useCameraPermissions: (() => [
  { granted: boolean; canAskAgain: boolean } | null,
  () => Promise<void>
]) | null = null;

if (Platform.OS !== "web") {
  const cam = require("expo-camera");
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
}

type ScanState = "idle" | "scanning" | "success" | "error";

const SCREEN_W = Dimensions.get("window").width;
const SCREEN_H = Dimensions.get("window").height;

const FRAME_W = SCREEN_W * 0.82;
const FRAME_H = FRAME_W * 1.4;

const TAB_BAR_H = 49;

// Minimum bottom inset for iOS PWA where insets.bottom returns 0 (home indicator height)
const WEB_HOME_INDICATOR_H = 20;

async function cropToFrame(
  photoUri: string,
  photoWidth: number,
  photoHeight: number,
  frame: { x: number; y: number; width: number; height: number }
): Promise<string> {
  try {
    const scaleX = photoWidth / SCREEN_W;
    const scaleY = photoHeight / SCREEN_H;
    const cropX = Math.max(0, Math.round(frame.x * scaleX));
    const cropY = Math.max(0, Math.round(frame.y * scaleY));
    const cropW = Math.min(Math.round(frame.width * scaleX), photoWidth - cropX);
    const cropH = Math.min(Math.round(frame.height * scaleY), photoHeight - cropY);
    const result = await ImageManipulator.manipulateAsync(
      photoUri,
      [{ crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (err) {
    console.warn("[cropToFrame] failed, using original:", err);
    return photoUri;
  }
}

function FilterIconButton({
  count, onPress, dark, colors,
}: { count: number; onPress: () => void; dark?: boolean; colors: any }) {
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={[
        fStyles.btn,
        dark
          ? { backgroundColor: "rgba(255,255,255,0.15)" }
          : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 },
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Icon name="options-outline" size={19} color={dark ? "rgba(255,255,255,0.85)" : colors.foreground} />
      {count > 0 && (
        <View style={[fStyles.badge, { backgroundColor: colors.accent }]}>
          <Text style={[fStyles.badgeText, { color: colors.background }]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

function ListDropdown({ colors, onClose }: { colors: any; onClose: () => void }) {
  const { lists, activeScanListId, setActiveScanListId } = useScanContext();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ddStyles.overlay} onPress={onClose}>
        <View style={[ddStyles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[ddStyles.menuTitle, { color: colors.mutedForeground }]}>SCAN TO LIST</Text>
          {lists.map((list) => {
            const active = list.id === activeScanListId;
            return (
              <Pressable
                key={list.id}
                style={[ddStyles.item, active && { backgroundColor: colors.surface }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveScanListId(list.id); onClose(); }}
              >
                <View style={[ddStyles.dot, { backgroundColor: list.color }]} />
                <Text style={[ddStyles.itemText, { color: active ? colors.foreground : colors.mutedForeground }]}>{list.name}</Text>
                {active && <Icon name="checkmark" size={16} color={colors.accent} />}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

function ActiveFilterPills({
  filters, colors, dark, onClear,
}: { filters: ScanFilters; colors: any; dark?: boolean; onClear: (key: keyof ScanFilters) => void }) {
  const pills: { key: keyof ScanFilters; label: string }[] = [];
  if (filters.game)     pills.push({ key: "game",     label: filters.game });
  if (filters.set)      pills.push({ key: "set",      label: filters.set });
  if (filters.language) pills.push({ key: "language", label: filters.language });
  if (filters.finish)   pills.push({ key: "finish",   label: filters.finish });
  return (
    <View style={pillStyles.row}>
      {pills.map(({ key, label }) => (
        <Pressable
          key={key}
          style={[pillStyles.pill, dark ? { backgroundColor: "rgba(255,255,255,0.18)" } : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClear(key); }}
        >
          <Text style={[pillStyles.pillText, { color: dark ? "#fff" : colors.foreground }]}>{label}</Text>
          <Icon name="close" size={11} color={dark ? "rgba(255,255,255,0.7)" : colors.mutedForeground} />
        </Pressable>
      ))}
    </View>
  );
}

// ─── Web scanner ─────────────────────────────────────────────────────────────
function WebScannerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<WebCameraScannerHandle | null>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [resultCard, setResultCard] = useState<CardScanResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showListDrop, setShowListDrop] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ScanFilters>(EMPTY_FILTERS);
  const [variantCards, setVariantCards] = useState<CardScanResult[]>([]);
  const [showVariantPicker, setShowVariantPicker] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const { lists, activeScanListId } = useScanContext();
  const activeList = lists.find((l) => l.id === activeScanListId);
  const filterCount = activeFilterCount(filters);
  const filtersRef = useRef<ScanFilters>(EMPTY_FILTERS);

  const bottomInset = Math.max(insets.bottom, WEB_HOME_INDICATOR_H);
  const bottomPad = bottomInset + TAB_BAR_H + 16;

  // Vertically center the frame between header bottom and bottom controls
  const frameTop = insets.top + 12 + 52 + (SCREEN_H - (insets.top + 12 + 52) - (bottomPad + 80) - FRAME_H) / 2;

  const runIdentify = useCallback(async (uri: string) => {
    setScanState("scanning"); setErrorMsg("");
    try {
      const result = await identifyCard(uri, filtersRef.current);
      if (result.type === "variants") {
        setVariantCards(result.cards); setShowVariantPicker(true); setScanState("idle"); return;
      }
      setResultCard(result.card); setShowResult(true); setScanState("success");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to identify card");
      setScanState("error");
    }
  }, []);

  const handleCapture = async () => {
    if (scanState === "scanning" || !cameraRef.current) return;
    const dataUri = await cameraRef.current.captureFrame();
    if (dataUri) await runIdentify(dataUri);
  };

  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.85 });
    if (!result.canceled && result.assets[0]) await runIdentify(result.assets[0].uri);
  };

  const handleScanAgain = () => { setShowResult(false); setResultCard(null); setScanState("idle"); setErrorMsg(""); };
  const handleVariantSelect = (card: CardScanResult) => { setShowVariantPicker(false); setVariantCards([]); setResultCard(card); setShowResult(true); setScanState("success"); };
  const handleVariantCancel = () => { setShowVariantPicker(false); setVariantCards([]); setScanState("idle"); };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={StyleSheet.absoluteFill}>
        {!cameraDenied ? (
          <WebCameraScanner
            ref={cameraRef}
            frameWidth={FRAME_W}
            frameHeight={FRAME_H}
            frameOffsetY={frameTop - SCREEN_H / 2 + FRAME_H / 2}
            accentColor={colors.accent}
            onPermissionDenied={() => setCameraDenied(true)}
          />
        ) : (
          <View style={[styles.centered, { backgroundColor: colors.background, flex: 1, paddingTop: insets.top + 12 }]}>
            <View style={[styles.permIcon, { backgroundColor: colors.surface }]}>
              <Icon name="camera-outline" size={40} color={colors.accent} />
            </View>
            <Text style={[styles.permTitle, { color: colors.foreground }]}>Camera Access Required</Text>
            <Text style={[styles.permSub, { color: colors.mutedForeground }]}>Allow camera access in your browser settings and reload.</Text>
            <Pressable onPress={handleUpload} style={styles.uploadLink}>
              <Text style={[styles.uploadLinkText, { color: colors.mutedForeground }]}>Upload a photo instead</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={[styles.nativeHeader, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.nativeHeaderTitle}>Scan Card</Text>
        <View style={styles.headerRight}>
          <FilterIconButton count={filterCount} onPress={() => setShowFilters(true)} colors={colors} dark />
          <Pressable style={styles.listBadgeDark} onPress={() => setShowListDrop(true)}>
            <View style={[styles.listDot, { backgroundColor: activeList?.color ?? colors.accent }]} />
            <Text style={styles.listBadgeDarkText}>{activeList?.name ?? "My Lists"}</Text>
            <Icon name="chevron-down" size={12} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>
      </View>

      {filterCount > 0 && !cameraDenied && (
        <View style={[styles.nativeFilterPills, { top: insets.top + 60 }]}>
          <ActiveFilterPills filters={filters} colors={colors} dark onClear={(key) => setFilters(f => ({ ...f, [key]: null }))} />
        </View>
      )}

      {!cameraDenied && (
        <View
          pointerEvents="none"
          style={[styles.scanBox, { top: frameTop, left: (SCREEN_W - FRAME_W) / 2 }]}
        >
          <View style={[styles.corner, styles.cornerTL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: colors.accent }]} />
        </View>
      )}

      {!cameraDenied && (
        <View style={[styles.hintRow, { top: frameTop + FRAME_H + 16 }]}>
          <Text style={styles.nativeHint}>
            {scanState === "scanning" ? "Identifying…" : scanState === "error" ? errorMsg : "Tap the button to scan"}
          </Text>
        </View>
      )}

      {!cameraDenied && (
        <View style={[styles.nativeBottom, { paddingBottom: bottomPad }]}>
          <Pressable style={styles.nativeUpload} onPress={handleUpload} disabled={scanState === "scanning"}>
            <Icon name="image-outline" size={22} color="rgba(255,255,255,0.7)" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.nativeCapture, { opacity: pressed || scanState === "scanning" ? 0.8 : 1 }]}
            onPress={handleCapture}
            disabled={scanState === "scanning"}
          >
            <View style={[styles.nativeCaptureRing, { borderColor: colors.accent }]}>
              <View style={[styles.nativeCaptureCore, { backgroundColor: colors.accent }]}>
                {scanState === "scanning"
                  ? <ActivityIndicator color={colors.background} size="small" />
                  : <Icon name="scan" size={26} color={colors.background} />
                }
              </View>
            </View>
          </Pressable>
          <View style={styles.nativeUpload} />
        </View>
      )}

      {showListDrop && <ListDropdown colors={colors} onClose={() => setShowListDrop(false)} />}
      <ScanFilterSheet visible={showFilters} filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />
      <VariantPickerModal visible={showVariantPicker} variants={variantCards} onSelect={handleVariantSelect} onCancel={handleVariantCancel} />
      <CardResultSheet visible={showResult} result={resultCard} onClose={handleScanAgain} onScanAgain={handleScanAgain} />
    </View>
  );
}

// ─── Native scanner ───────────────────────────────────────────────────────────
function NativeScannerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<unknown>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [resultCard, setResultCard] = useState<CardScanResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [flash, setFlash] = useState<"on" | "off">("off");
  const [showListDrop, setShowListDrop] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ScanFilters>(EMPTY_FILTERS);
  const [variantCards, setVariantCards] = useState<CardScanResult[]>([]);
  const [showVariantPicker, setShowVariantPicker] = useState(false);
  const { lists, activeScanListId } = useScanContext();
  const [permission, requestPermission] = useCameraPermissions!();
  const activeList = lists.find((l) => l.id === activeScanListId);
  const filterCount = activeFilterCount(filters);
  const filtersRef = useRef<ScanFilters>(EMPTY_FILTERS);
  const [frameLayout, setFrameLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const frameLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const bottomPad = insets.bottom + TAB_BAR_H + 16;

  const handleFrameLayout = useCallback((e: any) => {
    const node = e.target ?? e.nativeEvent?.target;
    if (node && typeof node.measure === "function") {
      node.measure((_fx: number, _fy: number, w: number, h: number, px: number, py: number) => {
        const layout = { x: px, y: py, width: w, height: h };
        setFrameLayout(layout); frameLayoutRef.current = layout;
      });
    } else {
      const { x, y, width, height } = e.nativeEvent.layout;
      const layout = { x, y, width, height };
      setFrameLayout(layout); frameLayoutRef.current = layout;
    }
  }, []);

  const runIdentify = useCallback(async (uri: string) => {
    setScanState("scanning"); setErrorMsg("");
    try {
      const result = await identifyCard(uri, filtersRef.current);
      if (result.type === "variants") {
        setVariantCards(result.cards); setShowVariantPicker(true); setScanState("idle"); return;
      }
      setResultCard(result.card); setShowResult(true); setScanState("success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to identify card");
      setScanState("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, []);

  const handleCapture = async () => {
    if (scanState === "scanning" || !cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await (cameraRef.current as any).takePictureAsync({ quality: 0.9, base64: false });
      if (!photo?.uri) return;
      const frame = frameLayoutRef.current;
      const uri = frame && photo.width && photo.height
        ? await cropToFrame(photo.uri, photo.width, photo.height, frame)
        : photo.uri;
      await runIdentify(uri);
    } catch (err) {
      console.warn("[handleCapture] error:", err);
      setScanState("error"); setErrorMsg("Failed to capture photo");
    }
  };

  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.85 });
    if (!result.canceled && result.assets[0]) await runIdentify(result.assets[0].uri);
  };

  const handleScanAgain = () => { setShowResult(false); setResultCard(null); setScanState("idle"); setErrorMsg(""); };
  const handleVariantSelect = (card: CardScanResult) => { setShowVariantPicker(false); setVariantCards([]); setResultCard(card); setShowResult(true); setScanState("success"); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };
  const handleVariantCancel = () => { setShowVariantPicker(false); setVariantCards([]); setScanState("idle"); };

  if (!permission) return <View style={[styles.centered, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
        <View style={[styles.permIcon, { backgroundColor: colors.surface }]}>
          <Icon name="camera-outline" size={40} color={colors.accent} />
        </View>
        <Text style={[styles.permTitle, { color: colors.foreground }]}>Camera Access Required</Text>
        <Text style={[styles.permSub, { color: colors.mutedForeground }]}>Allow camera access to scan trading cards in real time</Text>
        {permission.canAskAgain && (
          <Pressable style={[styles.permBtn, { backgroundColor: colors.accent }]} onPress={requestPermission}>
            <Text style={[styles.permBtnText, { color: colors.background }]}>Allow Camera</Text>
          </Pressable>
        )}
        <Pressable onPress={handleUpload} style={styles.uploadLink}>
          <Text style={[styles.uploadLinkText, { color: colors.mutedForeground }]}>Upload a photo instead</Text>
        </Pressable>
      </View>
    );
  }

  const NativeCam = CameraView!;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <NativeCam ref={cameraRef as React.Ref<unknown>} style={StyleSheet.absoluteFill} facing="back" flash={flash} />

      {frameLayout && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[styles.dimRegion, { top: 0, left: 0, right: 0, height: frameLayout.y }]} />
          <View style={[styles.dimRegion, { top: frameLayout.y + frameLayout.height, left: 0, right: 0, bottom: 0 }]} />
          <View style={[styles.dimRegion, { top: frameLayout.y, left: 0, width: frameLayout.x, height: frameLayout.height }]} />
          <View style={[styles.dimRegion, { top: frameLayout.y, left: frameLayout.x + frameLayout.width, right: 0, height: frameLayout.height }]} />
        </View>
      )}

      <View style={[styles.nativeHeader, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.nativeHeaderTitle}>Scan Card</Text>
        <View style={styles.headerRight}>
          <FilterIconButton count={filterCount} onPress={() => setShowFilters(true)} colors={colors} dark />
          <Pressable style={styles.listBadgeDark} onPress={() => setShowListDrop(true)}>
            <View style={[styles.listDot, { backgroundColor: activeList?.color ?? colors.accent }]} />
            <Text style={styles.listBadgeDarkText}>{activeList?.name ?? "My Lists"}</Text>
            <Icon name="chevron-down" size={12} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>
      </View>

      {filterCount > 0 && (
        <View style={[styles.nativeFilterPills, { top: insets.top + 60 }]}>
          <ActiveFilterPills filters={filters} colors={colors} dark onClear={(key) => setFilters(f => ({ ...f, [key]: null }))} />
        </View>
      )}

      <View style={styles.frameOverlay} pointerEvents="none">
        <View style={styles.scanBox} onLayout={handleFrameLayout}>
          <View style={[styles.corner, styles.cornerTL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: colors.accent }]} />
        </View>
        <Text style={styles.nativeHint}>
          {scanState === "scanning" ? "Identifying…" : scanState === "error" ? errorMsg : "Tap the button to scan"}
        </Text>
      </View>

      <View style={[styles.nativeBottom, { paddingBottom: bottomPad }]}>
        <Pressable style={styles.nativeUpload} onPress={handleUpload} disabled={scanState === "scanning"}>
          <Icon name="image-outline" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.nativeCapture, { opacity: pressed || scanState === "scanning" ? 0.8 : 1 }]}
          onPress={handleCapture}
          disabled={scanState === "scanning"}
        >
          <View style={[styles.nativeCaptureRing, { borderColor: colors.accent }]}>
            <View style={[styles.nativeCaptureCore, { backgroundColor: colors.accent }]}>
              {scanState === "scanning"
                ? <ActivityIndicator color={colors.background} size="small" />
                : <Icon name="scan" size={26} color={colors.background} />
              }
            </View>
          </View>
        </Pressable>
        <Pressable style={styles.nativeUpload} onPress={() => setFlash(f => f === "off" ? "on" : "off")}>
          <Icon name={flash === "on" ? "flash" : "flash-outline"} size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>

      {showListDrop && <ListDropdown colors={colors} onClose={() => setShowListDrop(false)} />}
      <ScanFilterSheet visible={showFilters} filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />
      <VariantPickerModal visible={showVariantPicker} variants={variantCards} onSelect={handleVariantSelect} onCancel={handleVariantCancel} />
      <CardResultSheet visible={showResult} result={resultCard} onClose={handleScanAgain} onScanAgain={handleScanAgain} />
    </View>
  );
}

export default function ScanScreen() {
  if (Platform.OS === "web") return <WebScannerScreen />;
  return <NativeScannerScreen />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  nativeHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12,
  },
  nativeHeaderTitle: { color: "#fff", fontSize: 26, fontFamily: "Poppins_700Bold" },
  listBadgeDark: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)" },
  listBadgeDarkText: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  listDot: { width: 8, height: 8, borderRadius: 4 },
  frameOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 20, pointerEvents: "none" as "none" },
  scanBox: { width: FRAME_W, height: FRAME_H, position: "relative" },
  hintRow: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  nativeHint: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center" },
  corner: { position: "absolute", width: 28, height: 28, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  nativeBottom: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 40 },
  nativeUpload: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  nativeCapture: { alignItems: "center", justifyContent: "center" },
  nativeCaptureRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  nativeCaptureCore: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  nativeFilterPills: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  dimRegion: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  permIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  permTitle: { fontSize: 20, fontFamily: "Poppins_700Bold", textAlign: "center" },
  permSub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },
  permBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  uploadLink: { paddingVertical: 12 },
  uploadLinkText: { fontSize: 13, fontFamily: "Poppins_400Regular", textDecorationLine: "underline" },
});

const fStyles = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -2, right: -2, width: 14, height: 14, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 8, fontFamily: "Poppins_700Bold" },
});

const ddStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  menu: { width: "100%", borderRadius: 18, borderWidth: 1, paddingVertical: 8, overflow: "hidden" },
  menuTitle: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 18, paddingVertical: 10 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  itemText: { flex: 1, fontSize: 15, fontFamily: "Poppins_500Medium" },
});

const pillStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  pillText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
});
