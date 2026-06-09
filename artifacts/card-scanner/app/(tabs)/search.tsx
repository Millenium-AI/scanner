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
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardDetailModal } from "@/components/CardDetailModal";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(data.cards ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

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
      ) : results.length === 0 ? (
        <View style={[styles.centered, { flex: 1 }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
            <Icon name="sad-outline" size={36} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No results</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Try a different search term</Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
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
                {item.number && <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>#{item.number}</Text>}
                {item.marketPrice != null && (
                  <Text style={[styles.cardPrice, { color: colors.accent }]}>${item.marketPrice.toFixed(2)}</Text>
                )}
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
  container: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Poppins_400Regular" },
  centered: { alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontFamily: "Poppins_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center" },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  card: { flexDirection: "row", gap: 12, padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1 },
  thumbWrap: { width: 56, alignItems: "center", justifyContent: "center" },
  thumb: { width: 56, height: 78, borderRadius: 6 },
  thumbPlaceholder: { width: 56, height: 78, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1, gap: 3, justifyContent: "center" },
  cardName: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  cardSet: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  cardNumber: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  cardPrice: { fontSize: 14, fontFamily: "Poppins_700Bold", marginTop: 2 },
});
