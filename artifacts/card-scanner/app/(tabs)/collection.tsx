import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { CardDetailModal } from "@/components/CardDetailModal";
import { Icon } from "@/components/Icon";
import { useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

export default function CollectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { scans, updateQuantity } = useScanContext();
  const [search, setSearch] = useState("");
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const WEB_HOME_INDICATOR_H = 20;
  const TAB_BAR_H = 49;
  const bottomInset = Math.max(insets.bottom, WEB_HOME_INDICATOR_H);
  const bottomPad = bottomInset + TAB_BAR_H + 16;

  const uniqueCards = useMemo(() => {
    const map = new Map<string, { card: any; qty: number; scanId: string }>();
    for (const s of scans) {
      const key = s.card.id;
      if (map.has(key)) {
        map.get(key)!.qty += s.quantity ?? 1;
      } else {
        map.set(key, { card: s.card, qty: s.quantity ?? 1, scanId: s.id });
      }
    }
    return Array.from(map.values());
  }, [scans]);

  const filtered = useMemo(() => {
    if (!search.trim()) return uniqueCards;
    const q = search.toLowerCase();
    return uniqueCards.filter(
      (c) => c.card.name?.toLowerCase().includes(q) || c.card.setName?.toLowerCase().includes(q)
    );
  }, [uniqueCards, search]);

  const totalValue = useMemo(
    () => uniqueCards.reduce((sum, c) => sum + (c.card.marketPrice ?? 0) * c.qty, 0),
    [uniqueCards]
  );
  const totalCards = useMemo(
    () => uniqueCards.reduce((sum, c) => sum + c.qty, 0),
    [uniqueCards]
  );
  const uniqueCount = uniqueCards.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: colors.accent }]}>Collection</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.accent }]}>{totalCards}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Cards</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.accent }]}>{uniqueCount}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Unique</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.accent }]}>${totalValue.toFixed(0)}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Value</Text>
        </View>
      </View>

      <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Icon name="search-outline" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Filter cards…"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Icon name="close-circle" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.scanId}
        numColumns={2}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.cardTile, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => { setSelectedCard(item.card); setDetailVisible(true); }}
          >
            {item.card.imageUrl ? (
              <Image source={{ uri: item.card.imageUrl }} style={styles.cardImage} contentFit="contain" />
            ) : (
              <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.surface }]}>
                <Icon name="image-outline" size={32} color={colors.mutedForeground} />
              </View>
            )}
            <View style={styles.cardInfo}>
              <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>{item.card.name}</Text>
              <Text style={[styles.cardPrice, { color: colors.accent }]}>
                {item.card.marketPrice != null ? `$${item.card.marketPrice.toFixed(2)}` : "N/A"}
              </Text>
            </View>
            <View style={styles.qtyRow}>
              <Pressable
                style={[styles.qtyBtn, { borderColor: colors.border }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateQuantity(item.scanId, Math.max(1, item.qty - 1)); }}
              >
                <Icon name="remove" size={14} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.qtyText, { color: colors.foreground }]}>{item.qty}</Text>
              <Pressable
                style={[styles.qtyBtn, { borderColor: colors.border }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateQuantity(item.scanId, item.qty + 1); }}
              >
                <Icon name="add" size={14} color={colors.foreground} />
              </Pressable>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="albums-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No cards yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Scan cards to build your collection</Text>
          </View>
        }
      />

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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontFamily: "Poppins_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Poppins_500Medium" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Poppins_400Regular" },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  row: { gap: 10, marginBottom: 10 },
  cardTile: { flex: 1, borderRadius: 14, borderWidth: 1, overflow: "hidden", padding: 10, gap: 8 },
  cardImage: { width: "100%", aspectRatio: 0.72, borderRadius: 6 },
  cardImagePlaceholder: { width: "100%", aspectRatio: 0.72, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  cardInfo: { gap: 2 },
  cardName: { fontSize: 12, fontFamily: "Poppins_500Medium", lineHeight: 16 },
  cardPrice: { fontSize: 13, fontFamily: "Poppins_700Bold" },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  qtyBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  qtyText: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 17, fontFamily: "Poppins_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center" },
});
