import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardDetailModal } from "@/components/CardDetailModal";
import { CardListItem } from "@/components/CardListItem";
import { Icon } from "@/components/Icon";
import { CollectionCard, useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

type SortKey = "recent" | "value" | "name" | "game";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "value", label: "Value" },
  { key: "name", label: "A\u2013Z" },
  { key: "game", label: "Game" },
];

export default function CollectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { collection, removeFromCollection, updateCollectionQuantity, totalCollectionValue, refreshCollectionPrices } = useScanContext();

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CollectionCard | null>(null);

  const bottomPad = insets.bottom + 90;

  const totalCards = useMemo(() => collection.reduce((sum, c) => sum + c.quantity, 0), [collection]);

  const filtered = useMemo(() => {
    let items = [...collection];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (c) => c.card.name.toLowerCase().includes(q) || c.card.game.toLowerCase().includes(q) || c.card.set.toLowerCase().includes(q)
      );
    }
    switch (sortKey) {
      case "name": items.sort((a, b) => a.card.name.localeCompare(b.card.name)); break;
      case "value": items.sort((a, b) => (b.card.marketValue ?? 0) - (a.card.marketValue ?? 0)); break;
      case "game": items.sort((a, b) => a.card.game.localeCompare(b.card.game)); break;
      default: items.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    }
    return items;
  }, [collection, search, sortKey]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshCollectionPrices();
    setRefreshing(false);
  };

  const handleDelete = (card: CollectionCard) => {
    Alert.alert(
      "Remove Card",
      `Remove "${card.card.name}" from your collection?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removeFromCollection(card.id) },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: colors.accent }]}>Collection</Text>
        {refreshing && (
          <View style={styles.refreshBadge}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.refreshLabel, { color: colors.accent }]}>Updating Prices</Text>
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        {[
          { label: "Unique", value: collection.length.toString() },
          { label: "Total Cards", value: totalCards.toString() },
          { label: "Total Value", value: `$${totalCollectionValue.toFixed(2)}`, accent: true },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: stat.accent ? colors.accent : colors.foreground }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Icon name="search-outline" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search Collection"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.sortRow}>
        {SORT_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            style={[styles.sortBtn, sortKey === opt.key
              ? { backgroundColor: colors.primary }
              : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }
            ]}
            onPress={() => setSortKey(opt.key)}
          >
            <Text style={[styles.sortText, { color: sortKey === opt.key ? "#fff" : colors.mutedForeground }]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CardListItem
            card={item.card}
            title={item.card.name}
            subtitle={`${item.card.game} \u00b7 ${item.card.set}`}
            onPress={() => setSelectedCard(item)}
            onDelete={() => handleDelete(item)}
            rightContent={
              <View style={styles.qtyControl}>
                <Pressable
                  style={[styles.qtyBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateCollectionQuantity(item.id, item.quantity - 1); }}
                >
                  <Icon name="remove" size={14} color={colors.foreground} />
                </Pressable>
                <Text style={[styles.qty, { color: colors.foreground }]}>×{item.quantity}</Text>
                <Pressable
                  style={[styles.qtyBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateCollectionQuantity(item.id, item.quantity + 1); }}
                >
                  <Icon name="add" size={14} color={colors.foreground} />
                </Pressable>
              </View>
            }
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{search ? "No results" : "Collection is empty"}</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {search ? "Try a different search term" : "Scan cards or search to add them to your collection"}
            </Text>
          </View>
        }
      />

      <CardDetailModal
        card={selectedCard?.card ?? null}
        visible={!!selectedCard}
        onClose={() => setSelectedCard(null)}
        extraInfo={
          selectedCard ? (
            <View style={[styles.qtyBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.qtyBadgeText, { color: colors.foreground }]}>×{selectedCard.quantity} in collection</Text>
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  refreshBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  refreshLabel: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  statsRow: { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, gap: 8 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, alignItems: "center", gap: 2 },
  statValue: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, borderWidth: 1, gap: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Poppins_400Regular" },
  sortRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  sortText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Poppins_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", paddingHorizontal: 40 },
  qtyControl: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  qty: { fontSize: 13, fontFamily: "Poppins_600SemiBold", minWidth: 26, textAlign: "center" },
  qtyBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  qtyBadgeText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
});
