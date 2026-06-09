import * as Haptics from "expo-haptics";
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
import { Image } from "expo-image";

import { Icon } from "@/components/Icon";
import { CardDetailModal } from "@/components/CardDetailModal";
import { useColors } from "@/hooks/useColors";
import { searchCards } from "@/services/cardScanService";
import { CardScanResult } from "@/context/ScanContext";

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardScanResult | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setSearched(true);
    try {
      const cards = await searchCards(query.trim());
      setResults(cards);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price?: number) =>
    price != null ? `$${price.toFixed(2)}` : "N/A";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: colors.accent }]}>Search</Text>
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
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : !searched ? (
        <View style={styles.centered}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Icon name="search-outline" size={36} color={colors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Search Cards</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Search by card name, set, or number</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centered}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Icon name="sad-outline" size={36} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No results</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Try a different search term</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 20) + 49 + 16 }]}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelectedCard(item); setDetailVisible(true); }}
            >
              <View style={styles.thumbWrap}>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.thumb}
                    contentFit="contain"
                  />
                ) : (
                  <View style={[styles.thumbPlaceholder, { backgroundColor: colors.surface }]}>
                    <Icon name="image-outline" size={28} color={colors.mutedForeground} />
                  </View>
                )}
              </View>
              <View style={styles.info}>
                <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>{item.name}</Text>
                {item.setName && (
                  <Text style={[styles.cardSet, { color: colors.mutedForeground }]} numberOfLines={1}>{item.setName}</Text>
                )}
                {item.number && (
                  <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>#{item.number}</Text>
                )}
                <Text style={[styles.cardPrice, { color: colors.accent }]}>{formatPrice(item.marketPrice)}</Text>
              </View>
            </Pressable>
          )}
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
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 8, gap: 10 },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Poppins_400Regular", padding: 0 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Poppins_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center" },
  list: { paddingHorizontal: 12, paddingTop: 8 },
  card: { flexDirection: "row", gap: 14, padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1 },
  thumbWrap: {
    width: 72, height: 100,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  thumb: { width: 72, height: 100, borderRadius: 6 },
  thumbPlaceholder: {
    width: 72, height: 100, borderRadius: 6,
    alignItems: "center", justifyContent: "center",
  },
  info: { flex: 1, gap: 3 },
  cardName: { fontSize: 15, fontFamily: "Poppins_600SemiBold", lineHeight: 20 },
  cardSet: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  cardNumber: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  cardPrice: { fontSize: 16, fontFamily: "Poppins_700Bold", marginTop: 4 },
});
