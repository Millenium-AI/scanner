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
            />
            <View style={calcStyles.modalBtns}>
              <Pressable style={[calcStyles.modalBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={() => setCustomModalVisible(false)}>
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
  const { lists, activeList, setActiveList, scans, removeFromList, createList, deleteList } = useScanContext();

  const bottomPad = insets.bottom + 90;

  const [showListDrop, setShowListDrop] = useState(false);
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);
  const [selectedCard, setSelectedCard] = useState<ScanItem | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const activeScanList: ScanList | undefined = useMemo(
    () => lists.find((l) => l.id === activeList),
    [lists, activeList]
  );

  const selectedList = activeScanList;

  const listScans = useMemo(
    () => scans.filter((s) => s.listId === activeList),
    [scans, activeList]
  );

  const totalValue = useMemo(
    () => listScans.reduce((sum, s) => sum + (s.card.marketValue ?? 0), 0),
    [listScans]
  );

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

      {listScans.length > 0 && (
        <TradeCalculator totalValue={totalValue} colors={colors} />
      )}

      <FlatList
        data={listScans}
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
              <Text style={[styles.dropMenuTitle, { color: colors.mutedForeground }]}>YOUR LISTS</Text>
              {lists.map((list) => {
                const active = list.id === activeList;
                const count = scans.filter((s) => s.listId === list.id).length;
                return (
                  <Pressable
                    key={list.id}
                    style={[styles.dropItem, active && { backgroundColor: colors.surface }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveList(list.id); setShowListDrop(false); }}
                    onLongPress={() => handleDeleteList(list)}
                  >
                    <View style={[styles.dropDot, { backgroundColor: list.color }]} />
                    <Text style={[styles.dropItemText, { color: active ? colors.foreground : colors.mutedForeground }]}>{list.name}</Text>
                    <Text style={[styles.dropItemCount, { color: colors.mutedForeground }]}>{count}</Text>
                    {active && <Icon name="checkmark" size={16} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Modal>
      )}

      {/* New list dialog */}
      {showNewListDialog && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowNewListDialog(false)}>
          <Pressable style={styles.dropOverlay} onPress={() => setShowNewListDialog(false)}>
            <Pressable style={[styles.dialogBox, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
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
              <View style={styles.dialogBtns}>
                <Pressable style={[styles.dialogBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={() => setShowNewListDialog(false)}>
                  <Text style={[styles.dialogBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.dialogBtn, { backgroundColor: colors.accent }]} onPress={handleCreateList}>
                  <Text style={[styles.dialogBtnText, { color: colors.background }]}>Create</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <CardDetailModal
        card={selectedCard?.card ?? null}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
      />
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  dropdownBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, maxWidth: 160 },
  dropDot: { width: 8, height: 8, borderRadius: 4 },
  dropdownLabel: { flex: 1, fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  dropdownCount: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Poppins_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  dropOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  dropMenu: { width: "100%", borderRadius: 18, borderWidth: 1, paddingVertical: 8, overflow: "hidden" },
  dropMenuTitle: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 18, paddingVertical: 10 },
  dropItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  dropItemText: { flex: 1, fontSize: 15, fontFamily: "Poppins_500Medium" },
  dropItemCount: { fontSize: 13, fontFamily: "Poppins_400Regular", marginRight: 4 },
  dialogBox: { width: "100%", borderRadius: 20, padding: 24 },
  dialogTitle: { fontSize: 18, fontFamily: "Poppins_700Bold", marginBottom: 16 },
  dialogInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontFamily: "Poppins_400Regular", marginBottom: 20 },
  colorLabel: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  colorSwatch: { width: 28, height: 28, borderRadius: 14 },
  colorSwatchActive: { borderWidth: 3, borderColor: "#fff" },
  dialogBtns: { flexDirection: "row", gap: 10 },
  dialogBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  dialogBtnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});

const calcStyles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, borderRadius: 16, borderWidth: 1, padding: 12, gap: 12 },
  totalBlock: { alignItems: "center", minWidth: 72 },
  totalLabel: { fontSize: 9, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.8 },
  totalAmt: { fontSize: 20, fontFamily: "Poppins_700Bold" },
  divider: { width: 1, height: "100%", alignSelf: "stretch" },
  btnGroup: { flex: 1, flexDirection: "row", gap: 6, flexWrap: "wrap" },
  pctBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  pctBtnText: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  result: { marginHorizontal: 16, marginBottom: 8, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resultLabel: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  resultAmt: { fontSize: 20, fontFamily: "Poppins_700Bold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
  modalBox: { width: "100%", borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 17, fontFamily: "Poppins_600SemiBold", textAlign: "center" },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 22, fontFamily: "Poppins_700Bold", textAlign: "center", marginVertical: 16 },
  modalBtns: { flexDirection: "row", gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
  modalBtnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});
