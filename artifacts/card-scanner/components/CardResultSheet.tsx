import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardScanResult, LIST_COLORS, useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

const SCREEN_H = Dimensions.get("window").height;
const DISMISS_THRESHOLD = 60; // slightly easier swipe to dismiss

interface CardResultSheetProps {
  visible: boolean;
  result: CardScanResult | null;
  onClose: () => void;
  onScanAgain: () => void;
}

const GAME_COLORS: Record<string, string> = {
  pokemon: "#FBBF24",
  "one piece": "#F97316",
  "magic: the gathering": "#DC2626",
  "yu-gi-oh!": "#8B5CF6",
  sports: "#3B82F6",
};

function gameColor(game: string): string {
  return GAME_COLORS[game.toLowerCase()] ?? "#00E5FF";
}

function fmt(val?: number): string {
  if (val === undefined || val === null) return "\u2014";
  return `$${val.toFixed(2)}`;
}

// ─── Main Result Sheet ───────────────────────────────────────────────────────
export function CardResultSheet({ visible, result, onClose, onScanAgain }: CardResultSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addScan, addToCollection, lists, activeScanListId, setActiveScanListId, createList } = useScanContext();

  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);

  const translateY = useRef(new Animated.Value(0)).current;

  // Reset local state whenever the sheet is closed or result changes
  useEffect(() => {
    if (!visible || !result) {
      setShowCreateList(false);
      setNewListName("");
      setNewListColor(LIST_COLORS[0]);
      translateY.setValue(0);
    }
  }, [visible, result, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => {
        const isVertical = Math.abs(g.dy) > Math.abs(g.dx);
        return isVertical && Math.abs(g.dy) > 6;
      },
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_THRESHOLD) {
          Animated.timing(translateY, {
            toValue: SCREEN_H,
            duration: 220,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!result) return null;

  const gc = gameColor(result.game);
  const confPct = Math.round(result.confidence * 100);
  const activeList = lists.find((l) => l.id === activeScanListId);
  const activeListName = activeList?.name ?? "My Scans";

  const handleCollection = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCollection(result);
    addScan(result);
    onClose();
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addScan(result);
    onClose();
  };

  const handleTCGPlayer = async () => {
    const url = (result as any).tcg_url;
    if (url) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        toolbarColor: "#1A56DB",
        enableBarCollapsing: true,
      });
    }
  };

  const handleCreateList = () => {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const list = createList(trimmed, newListColor);
    setActiveScanListId(list.id);
    addScan(result, list.id);
    setShowCreateList(false);
    setNewListName("");
    setNewListColor(LIST_COLORS[0]);
    onClose();
  };

  const handleCancelCreateList = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCreateList(false);
    setNewListName("");
    setNewListColor(LIST_COLORS[0]);
    Keyboard.dismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlayWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.bottom}
      >
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 },
            { transform: [{ translateY }] },
          ]}
        >
          {/* Drag handle (gesture attached here so it never conflicts with ScrollView) */}
          <View {...panResponder.panHandlers} style={styles.dragHandleTouch}>
            <View style={styles.dragHandle}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
            </View>
          </View>

          {showCreateList ? (
            // Inline Create List view, replaces card content
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Create New List</Text>
              <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>
                Name your list —{" "}
                <Text
                  style={{
                    color: colors.foreground,
                    fontFamily: "Poppins_600SemiBold",
                  }}
                >
                  {result.name}
                </Text>{" "}
                will be added automatically
              </Text>

              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="List name"
                placeholderTextColor={colors.mutedForeground}
                value={newListName}
                onChangeText={setNewListName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  handleCreateList();
                }}
              />

              <Text style={[styles.colorLabel, { color: colors.mutedForeground }]}>Color</Text>
              <View style={styles.colorRow}>
                {LIST_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      newListColor === c && styles.colorDotActive,
                    ]}
                    onPress={() => setNewListColor(c)}
                  />
                ))}
              </View>

              <Pressable
                style={[
                  styles.createBtn,
                  {
                    backgroundColor: newListName.trim()
                      ? colors.accent
                      : colors.surface,
                  },
                ]}
                onPress={handleCreateList}
                disabled={!newListName.trim()}
              >
                <Text
                  style={[
                    styles.createBtnText,
                    {
                      color: newListName.trim()
                        ? colors.background
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  Create &amp; Add Card
                </Text>
              </Pressable>

              <Pressable
                style={[styles.btn, styles.btnGhost, { borderColor: colors.border, marginTop: 12 }]}
                onPress={handleCancelCreateList}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color={colors.mutedForeground}
                />
                <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
            </ScrollView>
          ) : (
            // Default card detail view
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {result.imageUrl ? (
                <View style={styles.imageWrapper}>
                  <Image
                    source={{ uri: result.imageUrl }}
                    style={styles.cardImage}
                    contentFit="contain"
                    transition={200}
                  />
                </View>
              ) : (
                <View
                  style={[
                    styles.imagePlaceholder,
                    { backgroundColor: colors.surface },
                  ]}
                >
                  <Ionicons
                    name="image-outline"
                    size={40}
                    color={colors.mutedForeground}
                  />
                </View>
              )}

              <View style={styles.badges}>
                <View
                  style={[
                    styles.gameBadge,
                    {
                      backgroundColor: gc + "20",
                      borderColor: gc + "50",
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text style={[styles.gameBadgeText, { color: gc }]}>
                    {result.game.toUpperCase()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.confBadge,
                    {
                      backgroundColor:
                        (confPct >= 80 ? colors.success : colors.warning) + "20",
                      borderColor:
                        (confPct >= 80 ? colors.success : colors.warning) + "50",
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.confText,
                      {
                        color:
                          confPct >= 80 ? colors.success : colors.warning,
                      },
                    ]}
                  >
                    {confPct}% match
                  </Text>
                </View>
              </View>

              <Text style={[styles.cardName, { color: colors.foreground }]}>
                {result.name}
              </Text>
              <Text style={[styles.setLine, { color: colors.mutedForeground }]}>
                {result.set}
                {result.number ? ` \u00b7 #${result.number}` : ""}
                {result.rarity ? ` \u00b7 ${result.rarity}` : ""}
              </Text>

              {result.marketValue !== undefined && (
                <View
                  style={[
                    styles.marketRow,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <View style={styles.marketLeft}>
                    <Text
                      style={[
                        styles.marketLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      MARKET
                    </Text>
                    <Text
                      style={[styles.marketValue, { color: colors.accent }]}
                    >
                      {fmt(result.marketValue)}
                    </Text>
                  </View>
                  {(result as any).tcg_url && (
                    <Pressable
                      style={[
                        styles.tcgBtn,
                        {
                          backgroundColor: colors.accent + "18",
                          borderColor: colors.accent + "40",
                          borderWidth: 1,
                        },
                      ]}
                      onPress={handleTCGPlayer}
                    >
                      <Ionicons
                        name="open-outline"
                        size={15}
                        color={colors.accent}
                      />
                      <Text
                        style={[styles.tcgBtnText, { color: colors.accent }]}
                      >
                        TCGplayer
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={styles.actions}>
                <Pressable
                  style={[
                    styles.btn,
                    styles.btnGhost,
                    { borderColor: colors.border },
                  ]}
                  onPress={onScanAgain}
                >
                  <Ionicons
                    name="scan"
                    size={18}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[styles.btnText, { color: colors.mutedForeground }]}
                  >
                    Scan Again
                  </Text>
                </Pressable>

                <View style={styles.listBtnRow}>
                  <Pressable
                    style={[
                      styles.btn,
                      styles.btnSecondary,
                      styles.btnFlex,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={handleSave}
                  >
                    <Ionicons
                      name="bookmark-outline"
                      size={16}
                      color={colors.foreground}
                    />
                    <Text
                      style={[styles.btnTextSm, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      Add to {activeListName}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.btn,
                      styles.btnSecondary,
                      styles.btnCreate,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowCreateList(true);
                    }}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={16}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.btnTextSm,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      New List
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[
                    styles.btn,
                    styles.btnPrimary,
                    { backgroundColor: colors.accent },
                  ]}
                  onPress={handleCollection}
                >
                  <Ionicons
                    name="albums"
                    size={18}
                    color={colors.background}
                  />
                  <Text
                    style={[styles.btnText, { color: colors.background }]}
                  >
                    Add to Collection
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  dismissArea: { flex: 1 },
  dragHandleTouch: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  dragHandle: { alignItems: "center", paddingBottom: 8 },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    maxHeight: "92%",
  },
  handle: { width: 36, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 20, fontFamily: "Poppins_700Bold", marginBottom: 8 },
  sheetSub: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    marginBottom: 20,
    lineHeight: 20,
  },

  imageWrapper: {
    alignSelf: "center",
    width: 140,
    height: 196,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  cardImage: { width: "100%", height: "100%", borderRadius: 8 },
  imagePlaceholder: {
    alignSelf: "center",
    width: 140,
    height: 196,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  badges: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  gameBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  gameBadgeText: {
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 0.5,
  },
  confBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  confText: { fontSize: 11, fontFamily: "Poppins_600SemiBold" },

  cardName: { fontSize: 22, fontFamily: "Poppins_700Bold", marginBottom: 4 },
  setLine: { fontSize: 13, fontFamily: "Poppins_400Regular", marginBottom: 16 },

  marketRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  marketLeft: { gap: 2 },
  marketLabel: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  marketValue: { fontSize: 28, fontFamily: "Poppins_700Bold" },
  tcgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tcgBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  actions: { gap: 10, marginTop: 4, paddingBottom: 8 },
  listBtnRow: { flexDirection: "row", gap: 8 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 14,
    gap: 8,
  },
  btnFlex: { flex: 1 },
  btnCreate: { paddingHorizontal: 14 },
  btnPrimary: {},
  btnSecondary: { borderWidth: 1 },
  btnGhost: { borderWidth: 1 },
  btnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  btnTextSm: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    marginBottom: 20,
  },
  colorLabel: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  colorRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 24,
  },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  createBtn: { paddingVertical: 15, borderRadius: 14, alignItems: "center" },
  createBtnText: { fontSize: 16, fontFamily: "Poppins_600SemiBold" },
});
