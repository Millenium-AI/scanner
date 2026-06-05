import { Ionicons } from "@expo/vector-icons";
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

const GAME_ICONS: Record<string, string> = {
  pokemon: "⚡",
  "magic: the gathering": "🔮",
  "yu-gi-oh!": "⭐",
  sports: "🏆",
};

export function CardListItem({ card, subtitle, rightContent, onPress, onLongPress }: CardListItemProps) {
  const colors = useColors();

  const gameIcon = GAME_ICONS[card.game.toLowerCase()] ?? "🃏";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }
      ]}
      onPress={onPress}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onLongPress?.();
      }}
    >
      <View style={[styles.iconContainer, { backgroundColor: colors.secondary }]}>
        <Text style={styles.gameIcon}>{gameIcon}</Text>
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {subtitle ?? `${card.game} · ${card.set}`}
        </Text>
      </View>

      {rightContent ?? (
        card.marketValue !== undefined ? (
          <View style={styles.valueContainer}>
            <Text style={[styles.value, { color: colors.primary }]}>
              ${card.marketValue.toFixed(2)}
            </Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        )
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
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  gameIcon: {
    fontSize: 20,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  meta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  valueContainer: {
    alignItems: "flex-end",
  },
  value: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
});
