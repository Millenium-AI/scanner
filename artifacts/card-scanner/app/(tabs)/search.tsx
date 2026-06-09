import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardDetailModal } from "@/components/CardDetailModal";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

// Rarity options sourced from PokeWallet card_info.rarity field values
const RARITIES = [
  "All",
  "Common",
  "Uncommon",
  "Rare",
  "Holo Rare",
  "Double Rare",
  "Art Rare",
  "Super Rare",
  "Special Art Rare",
  "Ultra Rare",
  "Secret Rare",
  "Promo",
];

// Search hint examples pulled directly from PokeWallet /search docs
const SEARCH_HINTS = [
  { label: "By name", example: "charizard ex" },
  { label: "By set code", example: "SV2a" },
  { label: "By number", example: "148/165" },
  { label: "Set ID + number", example: "24541 148" },
];

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // Client-side post-fetch filters
  const [rarityFilter, setRarityFilter] = useState("All");
  const [maxPrice, setMaxPrice] = useState("");

  const handleSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(
        `${API_BASE}/search?q=${encodeURIComponent(q.trim())}&limit=20`
      );
      const data = await res.json();
      setResults(data.cards ?? data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => handleSearch(text), 400);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setSearched(false);
    setRarityFilter("All");
    setMaxPrice("");
  };

  // Client-side filter applied to API results
  const filtered = useMemo(() => {
    return results.filter((item) => {
      const rarity = item.card_info?.rarity ?? item.rarity ?? "";
      if (rarityFilter !== "All" && rarity !== rarityFilter) return false;
      const price =
        item.tcgplayer?.prices?.[0]?.market_price ??
        item.cardmarket?.prices?.[0]?.trend ??
        item.marketPrice ??
        null;
      const max = parseFloat(maxPrice);
      if (!isNaN(max) && max > 0 && (price == null || price > max)) return false;
      return true;
    });
  }, [results, rarityFilter, maxPrice]);

  const bottomPad = Math.max(insets.bottom, 20) + 49 + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: colors.accent }]}>Search</Text>

        {/* Search input */}
        <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Icon name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Name, set code, number, or set ID + number…"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={handleQueryChange}
            onSubmitEditing={() => handleSearch(query)}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={handleClear}>
              <Icon name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Search hints — shown before first search */}
        {!searched && (
          <View style={styles.hintsWrap}>
            {SEARCH_HINTS.map((h) => (
              <Pressable
                key={h.label}
                style={[styles.hintChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setQuery(h.example); handleSearch(h.example); }}
              >
                <Text style={[styles.hintLabel, { color: colors.mutedForeground }]}>{h.label}</Text>
                <Text style={[styles.hintExample, { color: colors.foreground }]}>{h.example}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Client-side filters — shown once results exist */}
        {searched && (
          <View style={styles.filtersWrap}>
            {/* Rarity pill row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {RARITIES.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRarityFilter(r)}
                  style={[
                    styles.pill,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    rarityFilter === r && { backgroundColor: colors.accent, borderColor: colors.accent },
                  ]}
                >
                  <Text style={[
                    styles.pillText,
                    { color: rarityFilter === r ? colors.background : colors.foreground },
                  ]}>
                    {r}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Max price input */}
            <View style={[styles.priceRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Icon name="pricetag-outline" size={14} color={colors.mutedForeground} />
              <TextInput
                style={[styles.priceInput, { color: colors.foreground }]}
                placeholder="Max price (USD)"
                placeholderTextColor={colors.mutedForeground}
                value={maxPrice}
                onChangeText={setMaxPrice}
                keyboardType="decimal-pad"
              />
              {maxPrice.length > 0 && (
                <Pressable onPress={() => setMaxPrice("")}>
                  <Icon name="close-circle" size={14} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      {/* ── Body ── */}
      {loading ? (
        <View style={[styles.centered, { flex: 1 }]}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : !searched ? (
        <View style={[styles.centered, { flex: 1 }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Icon name="search-outline" size={36} color={colors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Search Cards</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Tap a hint above or type to search 50,000+ cards
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={[styles.centered, { flex: 1 }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Icon name="sad-outline" size={36} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No results</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            {results.length > 0
              ? "Try adjusting the rarity or price filter"
              : "Try a different search term"}
          </Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          renderItem={({ item }) => {
            const info = item.card_info ?? item;
            const price =
              item.tcgplayer?.prices?.[0]?.market_price ??
              item.cardmarket?.prices?.[0]?.trend ??
              item.marketPrice ??
              null;
            const imageUrl = item.imageUrl ?? null;
            return (
              <Pressable
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => { setSelectedCard(item); setDetailVisible(true); }}
              >
                <View style={styles.thumbWrap}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.thumb} contentFit="contain" />
                  ) : (
                    <View style={[styles.thumbPlaceholder, { backgroundColor: colors.surface }]}>
                      <Icon name="image-outline" size={24} color={colors.mutedForeground} />
                    </View>
                  )}
                </View>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
                    {info.name ?? info.clean_name}
                  </Text>
                  <Text style={[styles.cardSet, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {info.set_name ?? info.set?.name ?? info.setName}
                  </Text>
                  {info.card_number || info.number ? (
                    <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>
                      #{info.card_number ?? info.number}
                    </Text>
                  ) : null}
                  {info.rarity ? (
                    <Text style={[styles.cardRarity, { color: colors.mutedForeground }]}>
                      {info.rarity}
                    </Text>
                  ) : null}
                  {price != null && (
                    <Text style={[styles.cardPrice, { color: colors.accent }]}>
                      ${price.toFixed(2)}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <CardDetailModal
        visible={detailVisible}
        card={selectedCard}
        onClose={() => setDetailVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Poppins_400Regular" },
  // Hints
  hintsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hintChip: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  hintLabel: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  hintExample: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  // Filters
  filtersWrap: { gap: 8 },
  pillRow: { gap: 6, paddingRight: 4 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  priceInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular" },
  // States
  centered: { alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontFamily: "Poppins_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center" },
  // List
  list: { paddingHorizontal: 16, paddingTop: 4 },
  card: { flexDirection: "row", gap: 12, padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1 },
  thumbWrap: { width: 56, alignItems: "center", justifyContent: "center" },
  thumb: { width: 56, height: 78, borderRadius: 6 },
  thumbPlaceholder: { width: 56, height: 78, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1, gap: 3, justifyContent: "center" },
  cardName: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  cardSet: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  cardNumber: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  cardRarity: { fontSize: 11, fontFamily: "Poppins_400Regular", fontStyle: "italic" },
  cardPrice: { fontSize: 14, fontFamily: "Poppins_700Bold", marginTop: 2 },
});
