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

              {/* Value card */}
              {result.marketValue !== undefined && (
                <View style={[styles.valueCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                  <View style={styles.valueRow}>
                    {[
                      { label: "Low", val: result.lowValue, main: false },
                      { label: "Market", val: result.marketValue, main: true },
                      { label: "High", val: result.highValue, main: false },
                    ].map((v, i) => (
                      <React.Fragment key={v.label}>
                        {i > 0 && <View style={[styles.vDivider, { backgroundColor: colors.border }]} />}
                        <View style={styles.valItem}>
                          <Text style={[styles.valLabel, { color: colors.mutedForeground }]}>{v.label}</Text>
                          <Text style={[v.main ? styles.valMain : styles.valAmt,
                            { color: v.main ? colors.accent : colors.foreground }]}>
                            {fmt(v.val)}
                          </Text>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              )}

              {result.condition && (
                <Text style={[styles.condition, { color: colors.mutedForeground }]}>
                  Condition: <Text style={{ color: colors.foreground, fontFamily: "Poppins_600SemiBold" }}>{result.condition}</Text>
                </Text>
              )}

              {/* Actions */}
              <View style={styles.actions}>
                <Pressable style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.accent }]} onPress={handleCollection}>
                  <Ionicons name="albums" size={18} color={colors.background} />
                  <Text style={[styles.btnText, { color: colors.background }]}>Add to Collection</Text>
                </Pressable>

                <Pressable style={[styles.btn, styles.btnSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={handleSave}>
                  <Ionicons name="bookmark-outline" size={18} color={colors.foreground} />
                  <Text style={[styles.btnText, { color: colors.foreground }]}>
                    Save to {activeList?.name ?? "Scans"}
                  </Text>
                </Pressable>

                {(result as any).tcg_url && (
                  <Pressable style={[styles.btn, styles.btnSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={handleTCGPlayer}>
                    <Ionicons name="open-outline" size={18} color={colors.foreground} />
                    <Text style={[styles.btnText, { color: colors.foreground }]}>View on TCGplayer</Text>
                  </Pressable>
                )}

                <Pressable style={[styles.btn, styles.btnGhost, { borderColor: colors.border }]} onPress={onScanAgain}>
                  <Ionicons name="scan" size={18} color={colors.mutedForeground} />
                  <Text style={[styles.btnText, { color: colors.mutedForeground }]}>Scan Again</Text>
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
  setLine: { fontSize: 13, fontFamily: "Poppins_400Regular", marginBottom: 20 },

  valueCard: { borderRadius: 16, padding: 16, marginBottom: 16 },
  valueRow: { flexDirection: "row", alignItems: "center" },
  valItem: { flex: 1, alignItems: "center", gap: 4 },
  vDivider: { width: 1, height: 40 },
  valLabel: { fontSize: 11, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  valAmt: { fontSize: 16, fontFamily: "Poppins_600SemiBold" },
  valMain: { fontSize: 24, fontFamily: "Poppins_700Bold" },

  condition: { fontSize: 13, fontFamily: "Poppins_400Regular", marginBottom: 20 },

  actions: { gap: 10, marginTop: 4 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 15, borderRadius: 14, gap: 8 },
  btnPrimary: {},
  btnSecondary: { borderWidth: 1 },
  btnGhost: { borderWidth: 1 },
  btnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});
