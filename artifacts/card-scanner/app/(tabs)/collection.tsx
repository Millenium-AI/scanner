import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardListItem } from "@/components/CardListItem";
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

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 90;

  const filtered = useMemo(() => {
    let items = [...collection];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (c) =>
          c.card.name.toLowerCase().includes(q) ||
          c.card.game.toLowerCase().includes(q) ||
          c.card.set.toLowerCase().includes(q)
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

  const totalCards = collection.reduce((s, c) => s + c.quantity, 0);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCollectionPrices();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRemove = (item: CollectionCard) => {
    Alert.alert("Remove Card", `Remove "${item.card.name}" from collection?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { removeFromCollection(item.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } },
    ]);
  };

  const handleQtyChange = (item: CollectionCard, delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty < 1) { handleRemove(item); return; }
    updateCollectionQuantity(item.id, newQty);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>Collection</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: "Unique", value: collection.length.toString() },
          { label: "Total Cards", value: totalCards.toString() },
          { label: "Total Value", value: `$${totalCollectionValue.toFixed(2)}`, accent: true },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: stat.accent ? colors.accent : colors.foreground }]}>
              {stat.value}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search cards\u2026"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Sort */}
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
            <Text style={[styles.sortText, { color: sortKey === opt.key ? "#fff" : colors.mutedForeground }]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        scrollEnabled={!!filtered.length}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
              <Ionicons name="albums-outline" size={36} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {search ? "No results" : "Collection is empty"}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {search ? "Try a different search" : "Scan a card and save it to your collection"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <CardListItem
            card={item.card}
            subtitle={`${item.card.game} \u00b7 ${item.card.set}`}
            rightContent={
              <View style={styles.qtyRow}>
                <Pressable style={[styles.qtyBtn, { backgroundColor: colors.surface }]} onPress={() => handleQtyChange(item, -1)}>
                  <Ionicons name="remove" size={14} color={colors.foreground} />
                </Pressable>
                <Text style={[styles.qty, { color: colors.foreground }]}>\u00d7{item.quantity}</Text>
                <Pressable style={[styles.qtyBtn, { backgroundColor: colors.surface }]} onPress={() => handleQtyChange(item, 1)}>
                  <Ionicons name="add" size={14} color={colors.foreground} />
                </Pressable>
              </View>
            }
            onLongPress={() => handleRemove(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },

  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1, gap: 3 },
  statValue: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },

  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, borderWidth: 1, gap: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Poppins_400Regular" },

  sortRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  sortText: { fontSize: 12, fontFamily: "Poppins_500Medium" },

  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Poppins_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", paddingHorizontal: 40 },

  qtyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  qty: { fontSize: 13, fontFamily: "Poppins_600SemiBold", minWidth: 26, textAlign: "center" },
});
