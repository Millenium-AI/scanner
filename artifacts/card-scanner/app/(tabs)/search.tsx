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
  const res = await fetch(
    `${BACKEND_URL}/search?q=${encodeURIComponent(q)}&game=${encodeURIComponent(game)}&lang=${lang}&limit=30`
  );
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
    <Pressable
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
    >
      <View style={styles.thumbWrap}>
        {card.imageUrl ? (
          <Image
            source={{ uri: card.imageUrl }}
            style={styles.thumb}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.thumbPlaceholder, { backgroundColor: colors.surface }]}>
            <Icon name="image-outline" size={22} color={colors.mutedForeground} />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={[styles.setName, { color: colors.mutedForeground }]} numberOfLines={1}>
          {card.set}
        </Text>
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
            <Text style={[styles.price, { color: colors.accent }]}>
              ${card.marketValue.toFixed(2)}
            </Text>
            <Text style={[styles.priceSource, { color: colors.mutedForeground }]}>TCGPlayer</Text>
          </>
        ) : (
          <Text style={[styles.priceSource, { color: colors.mutedForeground }]}>No price</Text>
        )}
        <Pressable
          style={[styles.addBtn, { backgroundColor: colors.accent }]}
          onPress={(e) => { e.stopPropagation?.(); onAdd(); }}
          hitSlop={6}
        >
          <Text style={[styles.addBtnText, { color: colors.background }]}>Add</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addScan, addToCollection, lists, activeScanListId } = useScanContext();
  const activeList = lists.find((l) => l.id === activeScanListId);

  const [query, setQuery] = useState("");
  const [game, setGame] = useState("pokemon");
  const [lang, setLang] = useState("all");
  const [results, setResults] = useState<CardScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardScanResult | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const runSearch = async (q = query, g = game, l = lang) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await searchCards(q.trim(), g, l);
      setResults(data);
      setSearched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setSearched(false);
    setError(null);
  };

  const handleAddToList = (card: CardScanResult) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addScan(card);
  };

  const handleCardPress = (card: CardScanResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCard(card);
    setModalVisible(true);
  };

  const handleAddToCollection = () => {
    if (!selectedCard) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCollection(selectedCard);
    setModalVisible(false);
  };

  const handleModalAddToList = () => {
    if (!selectedCard) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addScan(selectedCard);
    setModalVisible(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.accent }]}>Search Cards</Text>
          {searched && (
            <Pressable onPress={handleClear} hitSlop={8}>
              <Text style={[styles.clearBtn, { color: colors.mutedForeground }]}>Clear</Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search..."
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={() => runSearch()}
            autoCorrect={false}
            autoCapitalize="none"
            blurOnSubmit={false}
          />
          {query.length > 0 && (
            <Pressable onPress={handleClear} hitSlop={8}>
              <Icon name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          For best results, search name + number or set — e.g. "Charizard ex 006"
        </Text>

        <View style={styles.pillRow}>
          {GAMES.map((g) => (
            <Pressable
              key={g.value}
              style={[
                styles.pill,
                {
                  backgroundColor: game === g.value ? colors.accent : colors.surface,
                  borderColor: game === g.value ? colors.accent : colors.border,
                },
              ]}
              onPress={() => { setGame(g.value); setResults([]); setSearched(false); }}
            >
              <Text style={[styles.pillText, { color: game === g.value ? colors.background : colors.mutedForeground }]}>
                {g.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {game === "pokemon" && (
          <View style={styles.pillRow}>
            {LANGUAGE_FILTERS.map((l) => (
              <Pressable
                key={l.value}
                style={[
                  styles.pill,
                  {
                    backgroundColor: lang === l.value ? colors.accent + "22" : colors.surface,
                    borderColor: lang === l.value ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => { setLang(l.value); if (searched) runSearch(query, game, l.value); }}
              >
                <Text style={[styles.pillText, { color: lang === l.value ? colors.accent : colors.mutedForeground }]}>
                  {l.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Icon name="alert-circle-outline" size={40} color={colors.warning} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{error}</Text>
        </View>
      ) : !searched ? (
        <View style={styles.centered}>
          <Icon name="search-outline" size={52} color={colors.mutedForeground + "60"} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Type a card name and tap Search
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centered}>
          <Icon name="file-tray-outline" size={52} color={colors.mutedForeground + "60"} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No cards found for "{query}"
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.cardId}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110 }]}
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => (
            <SearchCardRow
              card={item}
              onAdd={() => handleAddToList(item)}
              onPress={() => handleCardPress(item)}
            />
          )}
        />
      )}

      <CardDetailModal
        card={selectedCard}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        extraInfo={
          selectedCard ? (
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={handleModalAddToList}
              >
                <Icon name="bookmark-outline" size={16} color={colors.foreground} />
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>
                  Add to {activeList?.name ?? "My Scans"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.accent }]}
                onPress={handleAddToCollection}
              >
                <Icon name="albums" size={16} color={colors.background} />
                <Text style={[styles.modalBtnText, { color: colors.background }]}>
                  Add to Collection
                </Text>
              </Pressable>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 8, gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  clearBtn: { fontSize: 15, fontFamily: "Poppins_500Medium" },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Poppins_400Regular", padding: 0 },
  hint: { fontSize: 12, fontFamily: "Poppins_400Regular", lineHeight: 18 },
  pillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyText: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },
  list: { paddingHorizontal: 12, paddingTop: 8 },
  row: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 16, borderWidth: 1,
    padding: 10, marginBottom: 10, gap: 12,
  },
  thumbWrap: {
    width: 72, height: 100,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 5,
  },
  thumb: { width: 72, height: 100, borderRadius: 6 },
  thumbPlaceholder: {
    width: 72, height: 100, borderRadius: 6,
    alignItems: "center", justifyContent: "center",
  },
  info: { flex: 1, gap: 3 },
  cardName: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  setName: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  meta: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  foilBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, borderWidth: 1, marginTop: 2,
  },
  foilText: { fontSize: 10, fontFamily: "Poppins_600SemiBold" },
  priceCol: { alignItems: "flex-end", gap: 4, minWidth: 80 },
  price: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  priceSource: { fontSize: 10, fontFamily: "Poppins_400Regular" },
  addBtn: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20, marginTop: 2,
  },
  addBtnText: { fontSize: 13, fontFamily: "Poppins_700Bold" },
  modalActions: { width: "100%", gap: 10, marginTop: 4 },
  modalBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  modalBtnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});
