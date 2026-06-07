import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardListItem } from "@/components/CardListItem";
import { CollectionCard, useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

type SortKey = "recent" | "value" | "name" | "game";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "value", label: "Value" },
  { key: "name", label: "A–Z" },
  { key: "game", label: "Game" },
];

const PRESETS = [70, 80, 85];

function TradeCalculator({ totalValue, colors }: { totalValue: number; colors: any }) {
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customPct, setCustomPct] = useState<number | null>(null);

  const activePct = customPct !== null && activePreset === -1 ? customPct : activePreset;
  const tradeValue = activePct !== null ? (totalValue * activePct) / 100 : null;

  const handlePreset = (pct: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActivePreset(pct);
    setCustomPct(null);
  };

  const handleCustomConfirm = () => {
    const parsed = parseFloat(customInput);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 200) {
      setCustomPct(parsed);
      setActivePreset(-1);
    }
    setCustomModalVisible(false);
    setCustomInput("");
  };

  return (
    <>
      <View style={[calcStyles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Total value */}
        <View style={calcStyles.totalBlock}>
          <Text style={[calcStyles.totalLabel, { color: colors.mutedForeground }]}>TOTAL VALUE</Text>
          <Text style={[calcStyles.totalAmt, { color: colors.accent }]}>${totalValue.toFixed(2)}</Text>
        </View>

        {/* Divider */}
        <View style={[calcStyles.divider, { backgroundColor: colors.border }]} />

        {/* Preset buttons */}
        <View style={calcStyles.btnGroup}>
          {PRESETS.map((pct) => (
            <Pressable
              key={pct}
              style={[calcStyles.pctBtn,
                activePreset === pct
                  ? { backgroundColor: colors.accent }
                  : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }
              ]}
              onPress={() => handlePreset(pct)}
            >
              <Text style={[calcStyles.pctBtnText, { color: activePreset === pct ? colors.background : colors.mutedForeground }]}>
                {pct}%
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[calcStyles.pctBtn,
              activePreset === -1
                ? { backgroundColor: colors.accent }
                : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }
            ]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCustomModalVisible(true); }}
          >
            <Text style={[calcStyles.pctBtnText, { color: activePreset === -1 ? colors.background : colors.mutedForeground }]}>
              {activePreset === -1 && customPct !== null ? `${customPct}%` : "···"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Trade result */}
      {tradeValue !== null && (
        <View style={[calcStyles.result, { backgroundColor: colors.success + "15", borderColor: colors.success + "40", borderWidth: 1 }]}>
          <Text style={[calcStyles.resultLabel, { color: colors.mutedForeground }]}>
            At {activePct}% trade value
          </Text>
          <Text style={[calcStyles.resultAmt, { color: colors.success }]}>
            ${tradeValue.toFixed(2)}
          </Text>
        </View>
      )}

      {/* Custom % modal */}
      <Modal visible={customModalVisible} transparent animationType="fade" onRequestClose={() => setCustomModalVisible(false)}>
        <Pressable style={calcStyles.modalOverlay} onPress={() => setCustomModalVisible(false)}>
          <Pressable style={[calcStyles.modalBox, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[calcStyles.modalTitle, { color: colors.foreground }]}>Custom Percentage</Text>
            <TextInput
              style={[calcStyles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              keyboardType="decimal-pad"
              placeholder="e.g. 75"
              placeholderTextColor={colors.mutedForeground}
              value={customInput}
              onChangeText={setCustomInput}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCustomConfirm}
            />
            <View style={calcStyles.modalActions}>
              <Pressable style={[calcStyles.modalBtn, { borderColor: colors.border, borderWidth: 1 }]} onPress={() => setCustomModalVisible(false)}>
                <Text style={[calcStyles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[calcStyles.modalBtn, { backgroundColor: colors.accent }]} onPress={handleCustomConfirm}>
                <Text style={[calcStyles.modalBtnText, { color: colors.background }]}>Apply</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function CollectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { collection, removeFromCollection, updateCollectionQuantity, totalCollectionValue } = useScanContext();

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
      case "name": items.sort((a, b) => a.card.name.localeCompare(b.card.name)); break;
      case "value": items.sort((a, b) => (b.card.marketValue ?? 0) - (a.card.marketValue ?? 0)); break;
      case "game": items.sort((a, b) => a.card.game.localeCompare(b.card.game)); break;
      default: items.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
    }
    return items;
  }, [collection, search, sortKey]);

  const totalCards = collection.reduce((s, c) => s + c.quantity, 0);

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

      {/* Trade Calculator + Total Value bar */}
      <View style={styles.calcWrapper}>
        <TradeCalculator totalValue={totalCollectionValue} colors={colors} />
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: "Unique", value: collection.length.toString() },
          { label: "Total", value: totalCards.toString() },
          { label: "Avg Value", value: `$${totalCards > 0 ? (totalCollectionValue / totalCards).toFixed(2) : "0.00"}` },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: stat.label === "Avg Value" ? colors.accent : colors.foreground }]}>
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
          placeholder="Search cards…"
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
            subtitle={`${item.card.game} · ${item.card.set}`}
            rightContent={
              <View style={styles.qtyRow}>
                <Pressable style={[styles.qtyBtn, { backgroundColor: colors.surface }]} onPress={() => handleQtyChange(item, -1)}>
                  <Ionicons name="remove" size={14} color={colors.foreground} />
                </Pressable>
                <Text style={[styles.qty, { color: colors.foreground }]}>×{item.quantity}</Text>
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },

  calcWrapper: { paddingHorizontal: 16, marginBottom: 16, gap: 8 },

  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1, gap: 3 },
  statValue: { fontSize: 18, fontFamily: "Poppins_700Bold" },
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

const calcStyles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  totalBlock: { gap: 2 },
  totalLabel: { fontSize: 9, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.8 },
  totalAmt: { fontSize: 20, fontFamily: "Poppins_700Bold" },
  divider: { width: 1, height: 36, marginHorizontal: 4 },
  btnGroup: { flex: 1, flexDirection: "row", gap: 6, justifyContent: "flex-end" },
  pctBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, alignItems: "center", justifyContent: "center", minWidth: 42 },
  pctBtnText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  result: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginTop: 4 },
  resultLabel: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  resultAmt: { fontSize: 20, fontFamily: "Poppins_700Bold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  modalBox: { width: 280, borderRadius: 20, padding: 24, gap: 16 },
  modalTitle: { fontSize: 17, fontFamily: "Poppins_600SemiBold", textAlign: "center" },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 22, fontFamily: "Poppins_700Bold", textAlign: "center" },
  modalActions: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  modalBtnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});
