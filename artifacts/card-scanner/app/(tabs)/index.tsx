import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { CardResultSheet } from "@/components/CardResultSheet";
import { VariantPickerModal } from "@/components/VariantPickerModal";
import {
  ScanFilterSheet,
  ScanFilters,
  EMPTY_FILTERS,
  activeFilterCount,
} from "@/components/ScanFilterSheet";
import { CardScanResult, useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";
import { identifyCard } from "@/services/cardScanService";
import WebCameraScanner, {
  WebCameraScannerHandle,
} from "@/components/WebCameraScanner";
import { useAutoScanWeb } from "@/hooks/useAutoScanWeb";

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

const CONFIDENCE_THRESHOLD = 0.85;
const AUTO_SCAN_INTERVAL_MS = 3000;
const AUTO_SCAN_BACKOFF_MS = 6000;
const SCREEN_W = Dimensions.get("window").width;
const SCREEN_H = Dimensions.get("window").height;

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

// ─── Filter badge icon ────────────────────────────────────────────────────────
function FilterIconButton({
  count,
  onPress,
  dark,
  colors,
}: {
  count: number;
  onPress: () => void;
  dark?: boolean;
  colors: any;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[
        fStyles.btn,
        dark
          ? { backgroundColor: "rgba(255,255,255,0.15)" }
          : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 },
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons
        name="options-outline"
        size={19}
        color={dark ? "rgba(255,255,255,0.85)" : colors.foreground}
      />
      {count > 0 && (
        <View style={[fStyles.badge, { backgroundColor: colors.accent }]}>
          <Text style={[fStyles.badgeText, { color: colors.background }]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── List Dropdown ────────────────────────────────────────────────────────────
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
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveScanListId(list.id);
                  onClose();
                }}
              >
                <View style={[ddStyles.dot, { backgroundColor: list.color }]} />
                <Text style={[ddStyles.itemText, { color: active ? colors.foreground : colors.mutedForeground }]}>
                  {list.name}
                </Text>
                {active && <Ionicons name="checkmark" size={16} color={colors.accent} />}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Web version ─────────────────────────────────────────────────────────────
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
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const backoffRef = useRef<() => void>(() => {});

  // Auto-scan should pause whenever we're busy or showing a result.
  const autoScanEnabled =
    !cameraDenied &&
    scanState === "idle" &&
    !showResult &&
    !showVariantPicker;

  const runIdentify = useCallback(
    async (uri: string, auto = false) => {
      setScanState("scanning");
      setErrorMsg("");
      try {
        const result = await identifyCard(uri, filtersRef.current);
        if (result.type === "variants") {
          setVariantCards(result.cards);
          setShowVariantPicker(true);
          setScanState("idle");
          return;
        }
        const card = result.card;
        if (
          auto &&
          typeof card.confidence === "number" &&
          card.confidence < CONFIDENCE_THRESHOLD
        ) {
          // Low-confidence auto scan: back off and keep streaming.
          backoffRef.current?.();
          setScanState("idle");
          return;
        }
        setResultCard(card);
        setShowResult(true);
        setScanState("success");
      } catch (err: unknown) {
        if (auto) {
          // Don't surface auto-scan errors; just back off and retry.
          backoffRef.current?.();
          setScanState("idle");
          return;
        }
        setErrorMsg(err instanceof Error ? err.message : "Failed to identify card");
        setScanState("error");
      }
    },
    []
  );

  const handleAutoCapture = useCallback(
    (dataUri: string) => {
      void runIdentify(dataUri, true);
    },
    [runIdentify]
  );

  const { triggerBackoff } = useAutoScanWeb({
    cameraRef,
    enabled: autoScanEnabled,
    intervalMs: AUTO_SCAN_INTERVAL_MS,
    backoffMs: AUTO_SCAN_BACKOFF_MS,
    onCapture: handleAutoCapture,
  });
  useEffect(() => { backoffRef.current = triggerBackoff; }, [triggerBackoff]);

  const handleVariantSelect = (card: CardScanResult) => {
    setShowVariantPicker(false);
    setVariantCards([]);
    setResultCard(card);
    setShowResult(true);
    setScanState("success");
  };

  const handleVariantCancel = () => {
    setShowVariantPicker(false);
    setVariantCards([]);
    setScanState("idle");
  };

  const handleCapture = async () => {
    if (scanState === "scanning" || !cameraRef.current) return;
    const dataUri = await cameraRef.current.captureFrame();
    if (dataUri) await runIdentify(dataUri, false);
  };

  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.85 });
    if (!result.canceled && result.assets[0]) await runIdentify(result.assets[0].uri, false);
  };

  const handleScanAgain = () => {
    setShowResult(false);
    setResultCard(null);
    setScanState("idle");
    setErrorMsg("");
  };

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {/* Live camera fills the screen behind the overlay */}
      <View style={StyleSheet.absoluteFill}>
        {!cameraDenied ? (
          <WebCameraScanner
            ref={cameraRef}
            frameWidth={SCREEN_W}
            frameHeight={SCREEN_H}
            accentColor={colors.accent}
            onPermissionDenied={() => setCameraDenied(true)}
          />
        ) : (
          <View style={[styles.centered, { backgroundColor: colors.background, flex: 1, paddingTop: insets.top }]}>
            <View style={[styles.permIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="camera-outline" size={40} color={colors.accent} />
            </View>
            <Text style={[styles.permTitle, { color: colors.foreground }]}>Camera Access Required</Text>
            <Text style={[styles.permSub, { color: colors.mutedForeground }]}>
              Allow camera access in your browser settings and reload to scan cards in real time.
            </Text>
            <Pressable onPress={handleUpload} style={styles.uploadLink}>
              <Text style={[styles.uploadLinkText, { color: colors.mutedForeground }]}>Upload a photo instead</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Header */}
      <View style={[styles.nativeHeader, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.nativeHeaderTitle}>Scan Card</Text>
        <View style={styles.headerRight}>
          <FilterIconButton count={filterCount} onPress={() => setShowFilters(true)} colors={colors} dark />
          <Pressable style={styles.listBadgeDark} onPress={() => setShowListDrop(true)}>
            <View style={[styles.listDot, { backgroundColor: activeList?.color ?? colors.accent }]} />
            <Text style={styles.listBadgeDarkText}>{activeList?.name ?? "My Lists"}</Text>
            <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>
      </View>

      {filterCount > 0 && !cameraDenied && (
        <View style={[styles.nativeFilterPills, { top: insets.top + 64 }]}>
          <ActiveFilterPills
            filters={filters}
            colors={colors}
            dark
            onClear={(key) => setFilters(f => ({ ...f, [key]: null }))}
          />
        </View>
      )}

      {/* Centered hint */}
      {!cameraDenied && (
        <View style={styles.frameOverlay} pointerEvents="none">
          <Text style={styles.nativeHint}>
            {scanState === "scanning" ? "Identifying" :
              scanState === "error" ? errorMsg :
              "Hold card steady \u2014 scanning automatically"}
          </Text>
        </View>
      )}

      {/* Bottom controls */}
      {!cameraDenied && (
        <View style={[styles.nativeBottom, { paddingBottom: insets.bottom + 90 }]}>
          <Pressable style={styles.nativeUpload} onPress={handleUpload} disabled={scanState === "scanning"}>
            <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.7)" />
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
                  : <Ionicons name="scan" size={26} color={colors.background} />
                }
              </View>
            </View>
          </Pressable>
          <View style={styles.nativeUpload} />
        </View>
      )}

      {showListDrop && <ListDropdown colors={colors} onClose={() => setShowListDrop(false)} />}
      <ScanFilterSheet
        visible={showFilters}
        filters={filters}
        onChange={setFilters}
        onClose={() => setShowFilters(false)}
      />
      <VariantPickerModal
        visible={showVariantPicker}
        variants={variantCards}
        onSelect={handleVariantSelect}
        onCancel={handleVariantCancel}
      />
      <CardResultSheet visible={showResult} result={resultCard} onClose={handleScanAgain} onScanAgain={handleScanAgain} />
    </View>
  );
}

// ─── Native version ───────────────────────────────────────────────────────────
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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [permission, requestPermission] = useCameraPermissions!();
  const activeList = lists.find((l) => l.id === activeScanListId);
  const filterCount = activeFilterCount(filters);

  const filtersRef = useRef<ScanFilters>(EMPTY_FILTERS);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const scanStateRef = useRef<ScanState>("idle");
  const showResultRef = useRef(false);
  const showVariantPickerRef = useRef(false);
  const inflightRef = useRef(false);
  const backoffUntilRef = useRef<number>(0);

  const [frameLayout, setFrameLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const frameLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => { scanStateRef.current = scanState; }, [scanState]);
  useEffect(() => { showResultRef.current = showResult; }, [showResult]);
  useEffect(() => { showVariantPickerRef.current = showVariantPicker; }, [showVariantPicker]);

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopPulse = () => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  };

  const handleFrameLayout = useCallback((e: any) => {
    const node = e.target ?? e.nativeEvent?.target;
    if (node && typeof node.measure === "function") {
      node.measure((_fx: number, _fy: number, width: number, height: number, pageX: number, pageY: number) => {
        const layout = { x: pageX, y: pageY, width, height };
        setFrameLayout(layout);
        frameLayoutRef.current = layout;
      });
    } else {
      const { x, y, width, height } = e.nativeEvent.layout;
      const layout = { x, y, width, height };
      setFrameLayout(layout);
      frameLayoutRef.current = layout;
    }
  }, []);

  const runIdentify = useCallback(async (uri: string, auto = false) => {
    setScanState("scanning");
    setErrorMsg("");
    startPulse();
    try {
      const result = await identifyCard(uri, filtersRef.current);

      if (result.type === "variants") {
        setVariantCards(result.cards);
        setShowVariantPicker(true);
        setScanState("idle");
        stopPulse();
        inflightRef.current = false;
        return;
      }

      const card = result.card;
      if (auto && typeof card.confidence === "number" && card.confidence < CONFIDENCE_THRESHOLD) {
        backoffUntilRef.current = Date.now() + AUTO_SCAN_BACKOFF_MS;
        setScanState("idle");
        return;
      }
      setResultCard(card);
      setShowResult(true);
      setScanState("success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      console.warn("[runIdentify] error:", err);
      if (auto) {
        backoffUntilRef.current = Date.now() + AUTO_SCAN_BACKOFF_MS;
        setScanState("idle");
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Failed to identify card");
        setScanState("error");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      stopPulse();
      inflightRef.current = false;
    }
  }, []);

  const handleVariantSelect = (card: CardScanResult) => {
    setShowVariantPicker(false);
    setVariantCards([]);
    setResultCard(card);
    setShowResult(true);
    setScanState("success");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleVariantCancel = () => {
    setShowVariantPicker(false);
    setVariantCards([]);
    setScanState("idle");
    backoffUntilRef.current = 0;
  };

  useEffect(() => {
    const interval = setInterval(async () => {
      if (showResultRef.current) return;
      if (showVariantPickerRef.current) return;
      if (scanStateRef.current !== "idle") return;
      if (inflightRef.current) return;
      if (Date.now() < backoffUntilRef.current) return;
      if (!cameraRef.current) return;
      if (!frameLayoutRef.current) return;

      inflightRef.current = true;

      try {
        const photo = await (cameraRef.current as any).takePictureAsync({
          quality: 0.9,
          base64: false,
          skipProcessing: true,
        }).catch((err: unknown) => {
          console.warn("[auto-scan] takePictureAsync failed:", err);
          return null;
        });

        if (!photo?.uri || !photo?.width || !photo?.height) {
          inflightRef.current = false;
          return;
        }

        const cropped = await cropToFrame(photo.uri, photo.width, photo.height, frameLayoutRef.current);
        await runIdentify(cropped, true);
      } catch (err) {
        console.warn("[auto-scan] unexpected error:", err);
        inflightRef.current = false;
      }
    }, AUTO_SCAN_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [runIdentify]);

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
      await runIdentify(uri, false);
    } catch (err) {
      console.warn("[handleCapture] error:", err);
      setScanState("error");
      setErrorMsg("Failed to capture photo");
    }
  };

  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.85 });
    if (!result.canceled && result.assets[0]) await runIdentify(result.assets[0].uri, false);
  };

  const handleScanAgain = () => {
    setShowResult(false);
    setResultCard(null);
    setScanState("idle");
    setErrorMsg("");
    backoffUntilRef.current = 0;
  };

  if (!permission) {
    return <View style={[styles.centered, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.permIcon, { backgroundColor: colors.surface }]}>
          <Ionicons name="camera-outline" size={40} color={colors.accent} />
        </View>
        <Text style={[styles.permTitle, { color: colors.foreground }]}>Camera Access Required</Text>
        <Text style={[styles.permSub, { color: colors.mutedForeground }]}>
          Allow camera access to scan trading cards in real time
        </Text>
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
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <NativeCam
        ref={cameraRef as React.Ref<unknown>}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flash}
      />

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
            <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>
      </View>

      {/* Active filter pills — shown on camera view */}
      {filterCount > 0 && (
        <View style={[styles.nativeFilterPills, { top: insets.top + 64 }]}>
          <ActiveFilterPills
            filters={filters}
            colors={colors}
            dark
            onClear={(key) => setFilters(f => ({ ...f, [key]: null }))}
          />
        </View>
      )}

      <View style={styles.frameOverlay} pointerEvents="none">
        <Animated.View
          style={[styles.scanBox, { transform: [{ scale: pulseAnim }] }]}
          onLayout={handleFrameLayout}
        >
          <View style={[styles.corner, styles.cornerTL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: colors.accent }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: colors.accent }]} />
        </Animated.View>
        <Text style={styles.nativeHint}>
          {scanState === "scanning" ? "Identifying" :
            scanState === "error" ? errorMsg :
            "Hold card steady \u2014 scanning automatically"}
        </Text>
      </View>

      <View style={[styles.nativeBottom, { paddingBottom: insets.bottom + 90 }]}>
        <Pressable style={styles.nativeUpload} onPress={handleUpload} disabled={scanState === "scanning"}>
          <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.7)" />
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
                : <Ionicons name="scan" size={26} color={colors.background} />
              }
            </View>
          </View>
        </Pressable>
        <Pressable style={styles.nativeUpload} onPress={() => setFlash(f => f === "off" ? "on" : "off")}>
          <Ionicons
            name={flash === "on" ? "flash" : "flash-off"}
            size={22}
            color={flash === "on" ? colors.accent : "rgba(255,255,255,0.7)"}
          />
        </Pressable>
      </View>

      {showListDrop && <ListDropdown colors={colors} onClose={() => setShowListDrop(false)} />}
      <ScanFilterSheet
        visible={showFilters}
        filters={filters}
        onChange={setFilters}
        onClose={() => setShowFilters(false)}
      />
      <VariantPickerModal
        visible={showVariantPicker}
        variants={variantCards}
        onSelect={handleVariantSelect}
        onCancel={handleVariantCancel}
      />
      <CardResultSheet visible={showResult} result={resultCard} onClose={handleScanAgain} onScanAgain={handleScanAgain} />
    </View>
  );
}

// ─── Active filter pills (shared web+native) ──────────────────────────────────
function ActiveFilterPills({
  filters,
  colors,
  dark,
  onClear,
}: {
  filters: ScanFilters;
  colors: any;
  dark?: boolean;
  onClear: (key: keyof ScanFilters) => void;
}) {
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
          style={[
            pillStyles.pill,
            dark
              ? { backgroundColor: "rgba(255,255,255,0.18)" }
              : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onClear(key);
          }}
        >
          <Text style={[pillStyles.pillText, { color: dark ? "#fff" : colors.foreground }]}>
            {label}
          </Text>
          <Ionicons name="close" size={11} color={dark ? "rgba(255,255,255,0.7)" : colors.mutedForeground} />
        </Pressable>
      ))}
    </View>
  );
}

export default function ScannerScreen() {
  if (Platform.OS === "web") return <WebScannerScreen />;
  return <NativeScannerScreen />;
}

const FRAME_W = 300;
const FRAME_H = 420;

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  listBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  listBadgeText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  listDot: { width: 8, height: 8, borderRadius: 4 },
  scanArea: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardFrame: { width: FRAME_W, height: FRAME_H, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 14, position: "relative" },
  cameraIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  frameHint: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", paddingHorizontal: 24 },
  actions: { paddingHorizontal: 24, paddingTop: 20, gap: 10 },
  captureBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 16, gap: 10 },
  captureBtnText: { fontSize: 16, fontFamily: "Poppins_600SemiBold" },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: 16, gap: 8, borderWidth: 1 },
  uploadBtnText: { fontSize: 14, fontFamily: "Poppins_500Medium" },
  dimRegion: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  nativeHeader: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12, zIndex: 10 },
  nativeHeaderTitle: { color: "#fff", fontSize: 22, fontFamily: "Poppins_700Bold" },
  listBadgeDark: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)" },
  listBadgeDarkText: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  frameOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 20, pointerEvents: "none" as "none" },
  scanBox: { width: FRAME_W, height: FRAME_H, position: "relative" },
  nativeHint: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", paddingHorizontal: 40 },
  corner: { position: "absolute", width: 26, height: 26, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  nativeBottom: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 40 },
  nativeUpload: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  nativeCapture: { alignItems: "center", justifyContent: "center" },
  nativeCaptureRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  nativeCaptureCore: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  permIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  permTitle: { fontSize: 20, fontFamily: "Poppins_700Bold", textAlign: "center" },
  permSub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },
  permBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  permBtnText: { fontSize: 16, fontFamily: "Poppins_600SemiBold" },
  uploadLink: { marginTop: 12, padding: 8 },
  uploadLinkText: { fontSize: 14, fontFamily: "Poppins_400Regular", textDecorationLine: "underline" },
  nativeFilterPills: { position: "absolute", left: 0, right: 0, zIndex: 9, paddingHorizontal: 20 },
});

const ddStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  menu: { width: "100%", borderRadius: 18, borderWidth: 1, paddingVertical: 8, overflow: "hidden" },
  menuTitle: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 18, paddingVertical: 10 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  itemText: { flex: 1, fontSize: 15, fontFamily: "Poppins_500Medium" },
});

const fStyles = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { fontSize: 10, fontFamily: "Poppins_700Bold", lineHeight: 14 },
});

const pillStyles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 20, paddingBottom: 12 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  pillText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
});
