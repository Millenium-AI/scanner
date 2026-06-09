import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
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

const RARITIES = [
  "Common",
  "Uncommon",
  "Rare",
  "Rare Holo",
  "Rare Ultra",
  "Rare Secret",
  "Amazing Rare",
  "Promo",
];

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // ── Query & results ─────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // ── Client-side filters ─────────────────────────────────────────────────
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [maxPrice, setMaxPrice] = useState("");
  const [showRarityPicker, setShowRarityPicker] = useState(false);

  // ── Detail modal ────────────────────────────────────────────────────────
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  // ── API call — limit=20 ─────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    // Reset client-side filters on every new search
    setRarityFilter(null);
    setMaxPrice("");
    try {
      const res = await fetch(
        `${API_BASE}/search?q=${encodeURIComponent(query.trim())}&limit=20`
      );
      const data = await res.json();
      setResults(data.cards ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Client-side filter — runs on already-loaded results, no API call ────
  const filtered = useMemo(() => {
    return results.filter((item) => {
      if (rarityFilter && item.rarity !== rarityFilter) return false;
      const max = parseFloat(maxPrice);
      if (!isNaN(max) && max > 0 && (item.marketPrice ?? 0) > max) return false;
      return true;
    });
  }, [results, rarityFilter, maxPrice]);

  const hasActiveFilters = rarityFilter !== null || maxPrice.trim().length > 0;

  const bottomPad = Math.max(insets.bottom, 20) + 49 + 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: colors.accent }]}>Search</Text>

        {/* Search input — submit fires API call */}
        <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Icon name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Card name, set, number…"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(""); setResults([]); setSearched(false); }}>
              <Icon name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Filter chips — appear after a search completes */}
        {searched && !loading && (
          <View style={styles.filterRow}>
            {/* Rarity picker chip */}
            <Pressable
              style={[
                styles.filterChip,
                { backgroundColor: colors.card, borderColor: colors.border },
                rarityFilter !== null && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
              onPress={() => setShowRarityPicker(true)}
            >
              <Icon
                name="sparkles-outline"
                size={13}
                color={rarityFilter !== null ? colors.background : colors.mutedForeground}
              />
              <Text style={[styles.filterChipText, { color: rarityFilter !== null ? colors.background : colors.foreground }]}>
                {rarityFilter ?? "Rarity"}
              </Text>
              {rarityFilter !== null && (
                <Pressable onPress={() => setRarityFilter(null)}>
                  <Icon name="close-circle" size={13} color={colors.background} />
                </Pressable>
              )}
            </Pressable>

            {/* Max price chip */}
            <View
              style={[
                styles.filterChip,
                { backgroundColor: colors.card, borderColor: colors.border },
                maxPrice.length > 0 && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
            >
              <Icon
                name="pricetag-outline"
                size={13}
                color={maxPrice.length > 0 ? colors.background : colors.mutedForeground}
              />
              <TextInput
                style={[
                  styles.priceInput,
                  { color: maxPrice.length > 0 ? colors.background : colors.foreground },
                ]}
                placeholder="Max $"
                placeholderTextColor={maxPrice.length > 0 ? colors.background : colors.mutedForeground}
                value={maxPrice}
                onChangeText={setMaxPrice}
                keyboardType="decimal-pad"
              />
              {maxPrice.length > 0 && (
                <Pressable onPress={() => setMaxPrice("")}>
                  <Icon name="close-circle" size={13} color={colors.background} />
                </Pressable>
              )}
            </View>

            {/* Clear all */}
            {hasActiveFilters && (
              <Pressable
                style={[styles.filterChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setRarityFilter(null); setMaxPrice(""); }}
              >
                <Text style={[styles.filterChipText, { color: colors.mutedForeground }]}>Clear</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Result count */}
      {searched && !loading && results.length > 0 && (
        <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
          {filtered.length} of {results.length} results
          {hasActiveFilters ? " (filtered)" : ""}
        </Text>
      )}

      {/* ── Content ── */}
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
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Search by card name, set, or number</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={[styles.centered, { flex: 1 }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Icon name="sad-outline" size={36} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {hasActiveFilters ? "No matching results" : "No results"}
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            {hasActiveFilters ? "Try adjusting or clearing filters" : "Try a different search term"}
          </Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelectedCard(item); setDetailVisible(true); }}
            >
              <View style={styles.thumbWrap}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="contain" />
                ) : (
                  <View style={[styles.thumbPlaceholder, { backgroundColor: colors.surface }]}>
                    <Icon name="image-outline" size={24} color={colors.mutedForeground} />
                  </View>
                )}
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.cardSet, { color: colors.mutedForeground }]} numberOfLines={1}>{item.set?.name ?? item.setName}</Text>
                {item.number && (
                  <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>#{item.number}</Text>
                )}
                {item.rarity && (
                  <Text style={[styles.cardRarity, { color: colors.mutedForeground }]}>{item.rarity}</Text>
                )}
                {item.marketPrice != null && (
                  <Text style={[styles.cardPrice, { color: colors.accent }]}>${item.marketPrice.toFixed(2)}</Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}

      {/* ── Rarity picker modal ── */}
      <Modal
        visible={showRarityPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRarityPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowRarityPicker(false)}>
          <View style={[styles.pickerBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.mutedForeground }]}>SELECT RARITY</Text>
            <ScrollView bounces={false}>
              {RARITIES.map((r) => (
                <Pressable
                  key={r}
                  style={[
                    styles.pickerItem,
                    r === rarityFilter && { backgroundColor: colors.surface },
                  ]}
                  onPress={() => {
                    setRarityFilter(r === rarityFilter ? null : r);
                    setShowRarityPicker(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, { color: colors.foreground }]}>{r}</Text>
                  {r === rarityFilter && <Icon name="checkmark" size={16} color={colors.accent} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

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
  // Filters
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
  priceInput: { fontSize: 13, fontFamily: "Poppins_500Medium", minWidth: 48, maxWidth: 72 },
  // Result count
  resultCount: { fontSize: 12, fontFamily: "Poppins_400Regular", paddingHorizontal: 20, marginBottom: 6 },
  // Empty / centered
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
  cardRarity: { fontSize: 12, fontFamily: "Poppins_400Regular", fontStyle: "italic" },
  cardPrice: { fontSize: 14, fontFamily: "Poppins_700Bold", marginTop: 2 },
  // Rarity modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  pickerBox: { width: "100%", borderRadius: 18, borderWidth: 1, paddingVertical: 8, maxHeight: 400, overflow: "hidden" },
  pickerTitle: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 18, paddingVertical: 10 },
  pickerItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14 },
  pickerItemText: { fontSize: 15, fontFamily: "Poppins_400Regular" },
});
