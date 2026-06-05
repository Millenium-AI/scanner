import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardListItem } from "@/components/CardListItem";
import { CollectionCard, useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

type SortKey = "name" | "value" | "game" | "recent";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "value", label: "Value" },
  { key: "name", label: "Name" },
  { key: "game", label: "Game" },
];

export default function CollectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { collection, removeFromCollection, updateCollectionQuantity, totalCollectionValue } =
    useScanContext();

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

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
      case "name":
        items.sort((a, b) => a.card.name.localeCompare(b.card.name));
        break;
      case "value":
        items.sort((a, b) => (b.card.marketValue ?? 0) - (a.card.marketValue ?? 0));
        break;
      case "game":
        items.sort((a, b) => a.card.game.localeCompare(b.card.game));
        break;
      case "recent":
      default:
        items.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    }
    return items;
  }, [collection, search, sortKey]);

  const handleRemove = (item: CollectionCard) => {
    Alert.alert("Remove Card", `Remove "${item.card.name}" from collection?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          removeFromCollection(item.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      },
    ]);
  };

  const handleQtyChange = (item: CollectionCard, delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty < 1) {
      handleRemove(item);
      return;
    }
    updateCollectionQuantity(item.id, newQty);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const totalCards = collection.reduce((s, c) => s + c.quantity, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>Collection</Text>
        <View style={[styles.valuePill, { backgroundColor: colors.accent }]}>
          <Text style={[styles.valueText, { color: colors.primary }]}>
            ${totalCollectionValue.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={[styles.statsRow]}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{collection.length}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Unique</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{totalCards}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            ${totalCards > 0 ? (totalCollectionValue / totalCards).toFixed(2) : "0.00"}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Avg</Text>
        </View>
      </View>

      <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search cards..."
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
            style={[
              styles.sortBtn,
              sortKey === opt.key
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 },
            ]}
            onPress={() => setSortKey(opt.key)}
          >
            <Text style={[styles.sortBtnText, { color: sortKey === opt.key ? colors.primaryForeground : colors.foreground }]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        scrollEnabled={!!filtered.length}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {search ? "No results" : "Collection is empty"}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              {search ? "Try a different search" : "Scan a card and add it to your collection"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <CardListItem
            card={item.card}
            subtitle={`${item.card.game} · ${item.card.set}`}
            rightContent={
              <View style={styles.qtyControls}>
                <Pressable
                  style={[styles.qtyBtn, { backgroundColor: colors.secondary }]}
                  onPress={() => handleQtyChange(item, -1)}
                >
                  <Ionicons name="remove" size={16} color={colors.foreground} />
                </Pressable>
                <Text style={[styles.qty, { color: colors.foreground }]}>×{item.quantity}</Text>
                <Pressable
                  style={[styles.qtyBtn, { backgroundColor: colors.secondary }]}
                  onPress={() => handleQtyChange(item, 1)}
                >
                  <Ionicons name="add" size={16} color={colors.foreground} />
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
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  valuePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  valueText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  sortRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  sortBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  sortBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  qty: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    minWidth: 28,
    textAlign: "center",
  },
});
