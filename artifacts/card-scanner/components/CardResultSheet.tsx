import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardScanResult, useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

interface CardResultSheetProps {
  visible: boolean;
  result: CardScanResult | null;
  onClose: () => void;
  onScanAgain: () => void;
}

const GAME_COLORS: Record<string, string> = {
  pokemon: "#FFCB05",
  "magic: the gathering": "#A62D2D",
  "yu-gi-oh!": "#8B5CF6",
  sports: "#3B82F6",
};

function getGameColor(game: string): string {
  return GAME_COLORS[game.toLowerCase()] ?? "#00C4CC";
}

function formatValue(val?: number): string {
  if (val === undefined || val === null) return "—";
  return `$${val.toFixed(2)}`;
}

export function CardResultSheet({ visible, result, onClose, onScanAgain }: CardResultSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addScan, addToCollection, lists, activeScanListId } = useScanContext();

  if (!result) return null;

  const gameColor = getGameColor(result.game);
  const confidencePct = Math.round(result.confidence * 100);

  const handleSaveToScans = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addScan(result);
    onClose();
  };

  const handleAddToCollection = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCollection(result);
    addScan(result);
    onClose();
  };

  const activeList = lists.find((l) => l.id === activeScanListId);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <Pressable onPress={() => {}}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.header}>
                <View style={[styles.gameBadge, { backgroundColor: gameColor + "20" }]}>
                  <Text style={[styles.gameBadgeText, { color: gameColor }]}>
                    {result.game.toUpperCase()}
                  </Text>
                </View>
                <View style={[styles.confidenceBadge, {
                  backgroundColor: confidencePct >= 80 ? colors.success + "20" : colors.warning + "20"
                }]}>
                  <Text style={[styles.confidenceText, {
                    color: confidencePct >= 80 ? colors.success : colors.warning
                  }]}>
                    {confidencePct}% match
                  </Text>
                </View>
              </View>

              <Text style={[styles.cardName, { color: colors.foreground }]}>{result.name}</Text>
              <Text style={[styles.setName, { color: colors.mutedForeground }]}>
                {result.set}{result.number ? ` · #${result.number}` : ""}
                {result.rarity ? ` · ${result.rarity}` : ""}
              </Text>

              {result.marketValue !== undefined && (
                <View style={[styles.valueCard, { backgroundColor: colors.accent }]}>
                  <View style={styles.valueRow}>
                    <View style={styles.valueItem}>
                      <Text style={[styles.valueLabel, { color: colors.mutedForeground }]}>Low</Text>
                      <Text style={[styles.valueAmount, { color: colors.foreground }]}>
                        {formatValue(result.lowValue)}
                      </Text>
                    </View>
                    <View style={[styles.valueDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.valueItem}>
                      <Text style={[styles.valueLabel, { color: colors.mutedForeground }]}>Market</Text>
                      <Text style={[styles.valueAmountMain, { color: colors.primary }]}>
                        {formatValue(result.marketValue)}
                      </Text>
                    </View>
                    <View style={[styles.valueDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.valueItem}>
                      <Text style={[styles.valueLabel, { color: colors.mutedForeground }]}>High</Text>
                      <Text style={[styles.valueAmount, { color: colors.foreground }]}>
                        {formatValue(result.highValue)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {result.condition && (
                <Text style={[styles.condition, { color: colors.mutedForeground }]}>
                  Condition: <Text style={{ color: colors.foreground }}>{result.condition}</Text>
                </Text>
              )}

              <View style={styles.actions}>
                <Pressable
                  style={[styles.actionBtn, styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={handleAddToCollection}
                >
                  <Ionicons name="albums" size={18} color={colors.primaryForeground} />
                  <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>
                    Add to Collection
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, styles.secondaryBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                  onPress={handleSaveToScans}
                >
                  <Ionicons name="bookmark-outline" size={18} color={colors.foreground} />
                  <Text style={[styles.actionBtnText, { color: colors.foreground }]}>
                    Save to {activeList?.name ?? "Scans"}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, styles.outlineBtn, { borderColor: colors.border }]}
                  onPress={onScanAgain}
                >
                  <Ionicons name="scan" size={18} color={colors.mutedForeground} />
                  <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>
                    Scan Again
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: "80%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  gameBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  gameBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  confidenceText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  cardName: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  setName: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  valueCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  valueItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  valueDivider: {
    width: 1,
    height: 36,
  },
  valueLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  valueAmount: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  valueAmountMain: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  condition: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  primaryBtn: {},
  secondaryBtn: {
    borderWidth: 1,
  },
  outlineBtn: {
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  success: {},
  warning: {},
});
