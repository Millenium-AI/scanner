import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CardScanResult } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

interface CardListItemProps {
  card: CardScanResult;
  subtitle?: string;
  rightContent?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
}

const GAME_COLORS: Record<string, string> = {
  "pokemon": "#FBBF24",
  "magic: the gathering": "#DC2626",
  "yu-gi-oh!": "#8B5CF6",
  "sports": "#3B82F6",
};

function getGameColor(game: string): string {
  return GAME_COLORS[game.toLowerCase()] ?? "#1A56DB";
}

const GAME_LABELS: Record<string, string> = {
  "pokemon": "PKM",
  "magic: the gathering": "MTG",
  "yu-gi-oh!": "YGO",
  "sports": "SPT",
};

function getGameLabel(game: string): string {
  return GAME_LABELS[game.toLowerCase()] ?? game.slice(0, 3).toUpperCase();
}

export function CardListItem({ card, subtitle, rightContent, onPress, onLongPress }: CardListItemProps) {
  const colors = useColors();
  const gc = getGameColor(card.game);
  const gl = getGameLabel(card.game);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
      onPress={onPress}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onLongPress?.();
      }}
    >
      {/* Game tag */}
      <View style={[styles.gameTag, { backgroundColor: gc + "20" }]}>
        <Text style={[styles.gameTagText, { color: gc }]}>{gl}</Text>
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{card.name}</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
          {subtitle ?? `${card.game} · ${card.set}`}
        </Text>
      </View>

      {rightContent ?? (
        card.marketValue !== undefined ? (
          <Text style={[styles.value, { color: colors.accent }]}>${card.marketValue.toFixed(2)}</Text>
        ) : null
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  gameTag: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  gameTagText: {
    fontSize: 11,
    fontFamily: "Poppins_700Bold",
    letterSpacing: 0.5,
  },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  value: { fontSize: 15, fontFamily: "Poppins_700Bold" },
});
