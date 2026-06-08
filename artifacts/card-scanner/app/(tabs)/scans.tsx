import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
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
        <View style={calcStyles.totalBlock}>
          <Text style={[calcStyles.totalLabel, { color: colors.mutedForeground }]}>LIST VALUE</Text>
          <Text style={[calcStyles.totalAmt, { color: colors.accent }]}>${totalValue.toFixed(2)}</Text>
        </View>
        <View style={[calcStyles.divider, { backgroundColor: colors.border }]} />
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
              <Text style={[calcStyles.pctBtnText, { color: activePreset === pct ? colors.background : colors.mutedForeground }]}>{pct}%</Text>
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

      {tradeValue !== null && (
        <View style={[calcStyles.result, { backgroundColor: colors.success + "15", borderColor: colors.success + "40", borderWidth: 1 }]}>
          <Text style={[calcStyles.resultLabel, { color: colors.mutedForeground }]}>At {activePct}% trade value</Text>
          <Text style={[calcStyles.resultAmt, { color: colors.success }]}>${tradeValue.toFixed(2)}</Text>
        </View>
      )}

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

export default function ScansScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { scans, lists, activeScanListId, setActiveScanListId, removeScan, createList, deleteList } = useScanContext();

  const [selectedListId, setSelectedListId] = useState<string>(lists[0]?.id ?? "default");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);
  const [selectedScan, setSelectedScan] = useState<ScanItem | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 90;

  const selectedList = lists.find((l) => l.id === selectedListId) ?? lists[0];
  const filteredScans = scans.filter((s) => s.listId === selectedList?.id);

  const listTotalValue = useMemo(() => {
    return filteredScans.reduce((sum, s) => sum + (s.card.marketValue ?? 0), 0);
  }, [filteredScans]);

  const handleSelectList = (id: string) => { setSelectedListId(id); setActiveScanListId(id); setShowDropdown(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    const list = createList(newListName.trim(), newListColor);
    setActiveScanListId(list.id);
    setSelectedListId(list.id);
    setNewListName("");
    setNewListColor(LIST_COLORS[0]);
    setShowNewList(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteList = (list: ScanList) => {
    if (list.id === "default") return;
    Alert.alert("Delete List", `Delete "${list.name}" and all its scans?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => {
          deleteList(list.id);
          if (selectedListId === list.id) setSelectedListId(lists[0]?.id ?? "default");
          setShowDropdown(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const handleDeleteScan = (id: string) => {
    Alert.alert("Remove Scan", "Remove this scan?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { removeScan(id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } },
    ]);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>Lists</Text>
        <Pressable style={[styles.newBtn, { backgroundColor: colors.accent }]} onPress={() => setShowNewList(true)}>
          <Icon name="add" size={20} color={colors.background} />
          <Text style={[styles.newBtnText, { color: colors.background }]}>New List</Text>
        </Pressable>
      </View>

      <View style={styles.calcWrapper}>
        <TradeCalculator totalValue={listTotalValue} colors={colors} />
      </View>

      <View style={styles.dropdownWrapper}>
        <Pressable
          style={[styles.dropdownTrigger, { backgroundColor: colors.card, borderColor: selectedList?.color ?? colors.accent }]}
          onPress={() => setShowDropdown(true)}
        >
          <View style={[styles.dropdownDot, { backgroundColor: selectedList?.color ?? colors.accent }]} />
          <Text style={[styles.dropdownLabel, { color: colors.foreground }]} numberOfLines={1}>{selectedList?.name ?? "Select list"}</Text>
          <Text style={[styles.dropdownCount, { color: colors.mutedForeground }]}>{filteredScans.length} card{filteredScans.length !== 1 ? "s" : ""}</Text>
          <Icon name="chevron-down" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <FlatList
        data={filteredScans}
        keyExtractor={(item) => item.id}
        scrollEnabled={!!filteredScans.length}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
              <Icon name="scan-outline" size={36} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No scans in this list</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Scan a card and add it to this list</Text>
          </View>
        }
        renderItem={({ item }) => (
          <CardListItem
            card={item.card}
            subtitle={formatDate(item.scannedAt)}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedScan(item); }}
            onLongPress={() => handleDeleteScan(item.id)}
          />
        )}
      />

      <Modal visible={showDropdown} transparent animationType="fade" onRequestClose={() => setShowDropdown(false)}>
        <Pressable style={styles.dropOverlay} onPress={() => setShowDropdown(false)}>
          <Pressable onPress={() => {}} style={[styles.dropMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.dropMenuTitle, { color: colors.mutedForeground }]}>SELECT LIST</Text>
            {lists.map((list) => {
              const count = scans.filter((s) => s.listId === list.id).length;
              const active = selectedListId === list.id;
              return (
                <Pressable key={list.id} style={[styles.dropItem, active && { backgroundColor: colors.surface }]} onPress={() => handleSelectList(list.id)}>
                  <View style={[styles.dropDot, { backgroundColor: list.color }]} />
                  <Text style={[styles.dropItemText, { color: active ? colors.foreground : colors.mutedForeground }]}>{list.name}</Text>
                  <Text style={[styles.dropItemCount, { color: colors.mutedForeground }]}>{count}</Text>
                  {active && <Icon name="checkmark" size={16} color={colors.accent} />}
                  {list.id !== "default" && (
                    <Pressable hitSlop={12} onPress={() => handleDeleteList(list)} style={[styles.dropDeleteBtn, { backgroundColor: colors.danger + "20" }]}>
                      <Icon name="trash-outline" size={14} color={colors.danger} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showNewList} transparent animationType="fade" onRequestClose={() => setShowNewList(false)}>
        <Pressable style={styles.dialogOverlay} onPress={() => setShowNewList(false)}>
          <Pressable onPress={() => {}} style={[styles.dialogBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.dialogTitle, { color: colors.foreground }]}>New List</Text>
            <TextInput
              style={[styles.dialogInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
              placeholder="List name"
              placeholderTextColor={colors.mutedForeground}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateList}
            />
            <Text style={[styles.colorLabel, { color: colors.mutedForeground }]}>Color</Text>
            <View style={styles.colorRow}>
              {LIST_COLORS.map((c) => (
                <Pressable key={c} style={[styles.colorDot, { backgroundColor: c }, newListColor === c && styles.colorDotActive]} onPress={() => setNewListColor(c)} />
              ))}
            </View>
            <View style={styles.dialogActions}>
              <Pressable style={[styles.dialogBtn, { borderColor: colors.border, borderWidth: 1 }]} onPress={() => { setShowNewList(false); setNewListName(""); setNewListColor(LIST_COLORS[0]); }}>
                <Text style={[styles.dialogBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.dialogBtn, { backgroundColor: newListName.trim() ? colors.accent : colors.surface }]} onPress={handleCreateList} disabled={!newListName.trim()}>
                <Text style={[styles.dialogBtnText, { color: newListName.trim() ? colors.background : colors.mutedForeground }]}>Create</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <CardDetailModal visible={!!selectedScan} card={selectedScan?.card ?? null} onClose={() => setSelectedScan(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  calcWrapper: { paddingHorizontal: 16, marginBottom: 14, gap: 8 },
  dropdownWrapper: { paddingHorizontal: 16, marginBottom: 14 },
  dropdownTrigger: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  dropdownDot: { width: 10, height: 10, borderRadius: 5 },
  dropdownLabel: { flex: 1, fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  dropdownCount: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Poppins_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  dropOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  dropMenu: { width: "100%", borderRadius: 18, borderWidth: 1, paddingVertical: 8, overflow: "hidden" },
  dropMenuTitle: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 18, paddingVertical: 10 },
  dropItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  dropDot: { width: 10, height: 10, borderRadius: 5 },
  dropItemText: { flex: 1, fontSize: 15, fontFamily: "Poppins_500Medium" },
  dropItemCount: { fontSize: 13, fontFamily: "Poppins_400Regular", marginRight: 4 },
  dropDeleteBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dialogOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", paddingHorizontal: 28 },
  dialogBox: { width: "100%", borderRadius: 20, borderWidth: 1, padding: 24, gap: 0 },
  dialogTitle: { fontSize: 18, fontFamily: "Poppins_700Bold", marginBottom: 16 },
  dialogInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontFamily: "Poppins_400Regular", marginBottom: 20 },
  colorLabel: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  colorRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginBottom: 24 },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorDotActive: { borderWidth: 3, borderColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4 },
  dialogActions: { flexDirection: "row", gap: 10 },
  dialogBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  dialogBtnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
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
