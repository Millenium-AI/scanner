import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { openURL } from "expo-linking";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  "pokemon": "#FBBF24",
  "magic: the gathering": "#DC2626",
  "yu-gi-oh!": "#8B5CF6",
  "sports": "#3B82F6",
};

function gameColor(game: string): string {
  return GAME_COLORS[game.toLowerCase()] ?? "#1A56DB";
}

function fmt(val?: number): string {
  if (val === undefined || val === null) return "—";
  return `$${val.toFixed(2)}`;
}

export function CardResultSheet({ visible, result, onClose, onScanAgain }: CardResultSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addScan, addToCollection, lists, activeScanListId } = useScanContext();

  if (!result) return null;

  const gc = gameColor(result.game);
  const confPct = Math.round(result.confidence * 100);
  const activeList = lists.find((l) => l.id === activeScanListId);

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

  const handleTCGPlayer = () => {
    if ((result as any).tcg_url) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      openURL((result as any).tcg_url);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
          <Pressable onPress={() => {}}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {/* Game + confidence badges */}
              <View style={styles.badges}>
                <View style={[styles.gameBadge, { backgroundColor: gc + "20", borderColor: gc + "50", borderWidth: 1 }]}>
                  <Text style={[styles.gameBadgeText, { color: gc }]}>{result.game.toUpperCase()}</Text>
                </View>
                <View style={[
                  styles.confBadge,
                  { backgroundColor: confPct >= 80 ? colors.success + "20" : colors.warning + "20",
                    borderColor: (confPct >= 80 ? colors.success : colors.warning) + "50",
                    borderWidth: 1 }
                ]}>
                  <Text style={[styles.confText, { color: confPct >= 80 ? colors.success : colors.warning }]}>
                    {confPct}% match
                  </Text>
                </View>
              </View>

              <Text style={[styles.cardName, { color: colors.foreground }]}>{result.name}</Text>
              <Text style={[styles.setLine, { color: colors.mutedForeground }]}>
                {result.set}{result.number ? ` · #${result.number}` : ""}
                {result.rarity ? ` · ${result.rarity}` : ""}
              </Text>

              {/* Market price row + TCGplayer button */}
              {result.marketValue !== undefined && (
                <View style={[styles.marketRow, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                  <View style={styles.marketLeft}>
                    <Text style={[styles.marketLabel, { color: colors.mutedForeground }]}>MARKET</Text>
                    <Text style={[styles.marketValue, { color: colors.accent }]}>{fmt(result.marketValue)}</Text>
                  </View>
                  {(result as any).tcg_url && (
                    <Pressable
                      style={[styles.tcgBtn, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "40", borderWidth: 1 }]}
                      onPress={handleTCGPlayer}
                    >
                      <Ionicons name="open-outline" size={15} color={colors.accent} />
                      <Text style={[styles.tcgBtnText, { color: colors.accent }]}>TCGplayer</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {result.condition && (
                <Text style={[styles.condition, { color: colors.mutedForeground }]}>
                  Condition: <Text style={{ color: colors.foreground, fontFamily: "Poppins_600SemiBold" }}>{result.condition}</Text>
                </Text>
              )}

              {/* Actions */}
              <View style={styles.actions}>
                <Pressable style={[styles.btn, styles.btnGhost, { borderColor: colors.border }]} onPress={onScanAgain}>
                  <Ionicons name="scan" size={18} color={colors.mutedForeground} />
                  <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Scan Again</Text>
                </Pressable>

                <Pressable style={[styles.btn, styles.btnSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={handleSave}>
                  <Ionicons name="bookmark-outline" size={18} color={colors.foreground} />
                  <Text style={[styles.btnText, { color: colors.foreground }]}>
                    Add to List
                  </Text>
                </Pressable>

                <Pressable style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.accent }]} onPress={handleCollection}>
                  <Ionicons name="albums" size={18} color={colors.background} />
                  <Text style={[styles.btnText, { color: colors.background }]}>Add to Collection</Text>
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
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingHorizontal: 20, maxHeight: "82%" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 22 },

  badges: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  gameBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  gameBadgeText: { fontSize: 11, fontFamily: "Poppins_700Bold", letterSpacing: 0.5 },
  confBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  confText: { fontSize: 11, fontFamily: "Poppins_600SemiBold" },

  cardName: { fontSize: 24, fontFamily: "Poppins_700Bold", marginBottom: 4 },
  setLine: { fontSize: 13, fontFamily: "Poppins_400Regular", marginBottom: 16 },

  marketRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, marginBottom: 16 },
  marketLeft: { gap: 2 },
  marketLabel: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.8 },
  marketValue: { fontSize: 28, fontFamily: "Poppins_700Bold" },
  tcgBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  tcgBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  condition: { fontSize: 13, fontFamily: "Poppins_400Regular", marginBottom: 16 },

  actions: { gap: 10, marginTop: 4 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 15, borderRadius: 14, gap: 8 },
  btnPrimary: {},
  btnSecondary: { borderWidth: 1 },
  btnGhost: { borderWidth: 1 },
  btnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});
