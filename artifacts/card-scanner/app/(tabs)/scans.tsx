import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardDetailModal } from "@/components/CardDetailModal";
import { CardListItem } from "@/components/CardListItem";
import { Icon } from "@/components/Icon";
import { LIST_COLORS, ScanItem, ScanList, useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

const PRESETS = [70, 80, 85];

function TradeCalculator({ totalValue, colors }: { totalValue: number; colors: any }) {
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customPct, setCustomPct] = useState<number | null>(null);

  const activePct = activePreset === -1 && customPct !== null ? customPct : activePreset;
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
        <Text style={[calcStyles.label, { color: colors.mutedForeground }]}>Trade value</Text>
        <View style={calcStyles.presets}>
          {PRESETS.map((pct) => (
            <Pressable
              key={pct}
              onPress={() => handlePreset(pct)}
              style={[
                calcStyles.preset,
                { borderColor: colors.border, backgroundColor: colors.surface },
                activePct === pct && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
            >
              <Text style={[calcStyles.presetText, { color: activePct === pct ? colors.background : colors.foreground }]}>
                {pct}%
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setCustomModalVisible(true)}
            style={[
              calcStyles.preset,
              { borderColor: colors.border, backgroundColor: colors.surface },
              activePreset === -1 && { backgroundColor: colors.accent, borderColor: colors.accent },
            ]}
          >
            <Text style={[calcStyles.presetText, { color: activePreset === -1 ? colors.background : colors.foreground }]}>
              {activePreset === -1 && customPct !== null ? `${customPct}%` : "Custom"}
            </Text>
          </Pressable>
        </View>
        {tradeValue !== null && (
          <Text style={[calcStyles.result, { color: colors.accent }]}>
            ${tradeValue.toFixed(2)}
          </Text>
        )}
      </View>
      <Modal visible={customModalVisible} transparent animationType="fade" onRequestClose={() => setCustomModalVisible(false)}>
        <Pressable style={calcStyles.modalOverlay} onPress={() => setCustomModalVisible(false)}>
          <View style={[calcStyles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[calcStyles.modalTitle, { color: colors.foreground }]}>Custom percentage</Text>
            <TextInput
              style={[calcStyles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              keyboardType="decimal-pad"
              placeholder="e.g. 75"
              placeholderTextColor={colors.mutedForeground}
              value={customInput}
              onChangeText={setCustomInput}
              autoFocus
            />
            <View style={calcStyles.modalBtns}>
              <Pressable style={[calcStyles.modalBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setCustomModalVisible(false)}>
                <Text style={[calcStyles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[calcStyles.modalBtn, { backgroundColor: colors.accent }]} onPress={handleCustomConfirm}>
                <Text style={[calcStyles.modalBtnText, { color: colors.background }]}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function ScansScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lists, scans, selectedListId, setSelectedListId, removeFromList, createList, deleteList } = useScanContext();
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);
  const [showListDrop, setShowListDrop] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ScanItem | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [search, setSearch] = useState("");

  const selectedList = lists.find((l) => l.id === selectedListId) ?? lists[0];
  const listScans = useMemo(
    () => scans.filter((s) => s.listId === selectedList?.id),
    [scans, selectedList?.id]
  );
  const totalValue = useMemo(
    () => listScans.reduce((sum, s) => sum + (s.card.marketPrice ?? 0), 0),
    [listScans]
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const WEB_HOME_INDICATOR_H = 20;
  const TAB_BAR_H = 49;
  const bottomInset = Math.max(insets.bottom, WEB_HOME_INDICATOR_H);
  const bottomPad = bottomInset + TAB_BAR_H + 16;

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    createList(newListName.trim(), newListColor);
    setNewListName("");
    setNewListColor(LIST_COLORS[0]);
    setShowNewListDialog(false);
  };

  const handleDeleteList = (list: ScanList) => {
    Alert.alert(
      "Delete List",
      `Delete "${list.name}" and all its scans?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteList(list.id) },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: colors.accent }]}>Lists</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Pressable
            style={[styles.newBtn, { backgroundColor: colors.accent }]}
            onPress={() => setShowNewListDialog(true)}
          >
            <Icon name="add" size={16} color={colors.background} />
            <Text style={[styles.newBtnText, { color: colors.background }]}>New</Text>
          </Pressable>
          <Pressable
            style={[styles.dropdownBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowListDrop(true)}
          >
            {selectedList && <View style={[styles.dropDot, { backgroundColor: selectedList.color }]} />}
            <Text style={[styles.dropdownLabel, { color: colors.foreground }]} numberOfLines={1}>{selectedList?.name ?? "Select list"}</Text>
            <Icon name="chevron-down" size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {/* Stats + filter — mirrors Collection tab */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.accent }]}>{listScans.length}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Cards</Text>
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

      {listScans.length > 0 && (
        <TradeCalculator totalValue={totalValue} colors={colors} />
      )}

      <FlatList
        data={search.trim() ? listScans.filter(s => s.card.name?.toLowerCase().includes(search.toLowerCase()) || s.card.setName?.toLowerCase().includes(search.toLowerCase())) : listScans}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CardListItem
            card={item.card}
            title={item.card.name}
            subtitle={formatDate(item.scannedAt)}
            onPress={() => { setSelectedCard(item); setDetailVisible(true); }}
            onDelete={() => removeFromList(item.id)}
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="albums-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No scans in this list</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Go to the Scan tab to add cards</Text>
          </View>
        }
      />

      {/* List picker dropdown */}
      {showListDrop && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowListDrop(false)}>
          <Pressable style={styles.dropOverlay} onPress={() => setShowListDrop(false)}>
            <View style={[styles.dropMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.dropMenuTitle, { color: colors.mutedForeground }]}>SELECT LIST</Text>
              {lists.map((list) => (
                <Pressable
                  key={list.id}
                  style={[
                    styles.dropItem,
                    list.id === selectedList?.id && { backgroundColor: colors.surface },
                  ]}
                  onPress={() => { setSelectedListId(list.id); setShowListDrop(false); }}
                  onLongPress={() => handleDeleteList(list)}
                >
                  <View style={[styles.dropDot, { backgroundColor: list.color }]} />
                  <Text style={[styles.dropdownLabel, { color: colors.foreground }]}>{list.name}</Text>
                  {list.id === selectedList?.id && <Icon name="checkmark" size={16} color={colors.accent} />}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      )}

      {/* New list dialog */}
      {showNewListDialog && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowNewListDialog(false)}>
          <Pressable style={styles.dropOverlay} onPress={() => setShowNewListDialog(false)}>
            <View style={[styles.dropMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.dropMenuTitle, { color: colors.mutedForeground }]}>NEW LIST</Text>
              <TextInput
                style={[styles.newListInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                placeholder="List name"
                placeholderTextColor={colors.mutedForeground}
                value={newListName}
                onChangeText={setNewListName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreateList}
              />
              <View style={styles.colorRow}>
                {LIST_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setNewListColor(c)}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      newListColor === c && styles.colorSwatchActive,
                    ]}
                  />
                ))}
              </View>
              <View style={styles.btnGroup}>
                <Pressable
                  style={[styles.dialogBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
                  onPress={() => setShowNewListDialog(false)}
                >
                  <Text style={[styles.dialogBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.dialogBtn, { backgroundColor: colors.accent }]}
                  onPress={handleCreateList}
                >
                  <Text style={[styles.dialogBtnText, { color: colors.background }]}>Create</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}

      <CardDetailModal
        visible={detailVisible}
        card={selectedCard?.card ?? null}
        onClose={() => setDetailVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12 },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 10 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontFamily: "Poppins_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Poppins_500Medium" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Poppins_400Regular" },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  dropdownBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, maxWidth: 140 },
  dropDot: { width: 8, height: 8, borderRadius: 4 },
  dropdownLabel: { flex: 1, fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 17, fontFamily: "Poppins_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center" },
  dropOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  dropMenu: { width: "100%", borderRadius: 18, borderWidth: 1, paddingVertical: 8, overflow: "hidden" },
  dropMenuTitle: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 18, paddingVertical: 10 },
  dropItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  newListInput: { marginHorizontal: 16, marginVertical: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Poppins_400Regular" },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  colorSwatch: { width: 28, height: 28, borderRadius: 14 },
  colorSwatchActive: { transform: [{ scale: 1.25 }], shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  btnGroup: { flex: 1, flexDirection: "row", gap: 6, flexWrap: "wrap", paddingHorizontal: 16, paddingBottom: 16 },
  dialogBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  dialogBtnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  divider: { width: 1, height: "100%", alignSelf: "stretch" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
  modalBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
});

const calcStyles = StyleSheet.create({
  bar: { marginHorizontal: 16, marginBottom: 8, borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  label: { fontSize: 12, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  presets: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  preset: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  presetText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  result: { fontSize: 22, fontFamily: "Poppins_700Bold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
  modalBox: { width: "100%", borderRadius: 18, borderWidth: 1, padding: 20, gap: 16 },
  modalTitle: { fontSize: 17, fontFamily: "Poppins_600SemiBold" },
  modalInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Poppins_400Regular" },
  modalBtns: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", borderWidth: 1 },
  modalBtnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});
