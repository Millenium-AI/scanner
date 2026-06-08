import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardDetailModal } from "@/components/CardDetailModal";
import { Icon } from "@/components/Icon";
import { CardScanResult, useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

const LANGUAGE_FILTERS = [
  { label: "All", value: "all" },
  { label: "English", value: "en" },
  { label: "Japanese", value: "ja" },
];

const GAMES = [
  { label: "Pokemon", value: "pokemon" },
  { label: "One Piece", value: "one piece" },
];

async function searchCards(q: string, game: string, lang: string): Promise<CardScanResult[]> {
  const res = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(q)}&game=${encodeURIComponent(game)}&lang=${lang}&limit=30`);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json();
}

interface SearchCardRowProps {
  card: CardScanResult;
  onAdd: () => void;
  onPress: () => void;
}

function SearchCardRow({ card, onAdd, onPress }: SearchCardRowProps) {
  const colors = useColors();
  const foilType = (card as any).foilType as string | undefined;

  return (
    <Pressable style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={onPress}>
      <View style={styles.thumbWrap}>
        {card.imageUrl ? (
          <Image source={{ uri: card.imageUrl }} style={styles.thumb} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.thumbPlaceholder, { backgroundColor: colors.surface }]}>
            <Icon name="image-outline" size={22} color={colors.mutedForeground} />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>{card.name}</Text>
        <Text style={[styles.setName, { color: colors.mutedForeground }]} numberOfLines={1}>{card.set}</Text>
        {card.number || card.rarity ? (
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {[card.number ? `#${card.number}` : null, card.rarity].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        {foilType ? (
          <View style={[styles.foilBadge, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "44" }]}>
            <Text style={[styles.foilText, { color: colors.accent }]}>{foilType}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.priceCol}>
        {card.marketValue !== undefined ? (
          <>
            <Text style={[styles.price, { color: colors.accent }]}>${card.marketValue.toFixed(2)}</Text>
            <Text style={[styl