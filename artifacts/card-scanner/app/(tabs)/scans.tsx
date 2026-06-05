import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardListItem } from "@/components/CardListItem";
import { LIST_COLORS, ScanList, useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

export default function ScansScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { scans, lists, activeScanListId, setActiveScanListId, removeScan, createList, deleteList } =
    useScanContext();

  const [selectedListId, setSelectedListId] = useState<string>("all");
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 90;

  const filteredScans =
    selectedListId === "all" ? scans : scans.filter((s) => s.listId === selectedListId);

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
    Alert.alert("Delete List", `Delete "${list.name}" and its scans?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => {
          deleteList(list.id);
          if (selectedListId === list.id) setSelectedListId("all");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const handleDeleteScan = (id: string) => {
    Alert.alert("Remove Scan", "Remove this scan?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: () => { removeScan(id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); },
      },
    ]);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>Scans</Text>
        <Pressable
          style={[styles.newBtn, { backgroundColor: colors.accent }]}
          onPress={() => setShowNewList(true)}
        >
          <Ionicons name="add" size={20} color={colors.background} />
          <Text style={[styles.newBtnText, { color: colors.background }]}>New List</Text>
        </Pressable>
      </View>

      {/* List tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listTabs}>
        <Pressable
          style={[styles.tab, selectedListId === "all"
            ? { backgroundColor: colors.primary }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }
          ]}
          onPress={() => setSelectedListId("all")}
        >
          <Text style={[styles.tabText, { color: selectedListId === "all" ? "#fff" : colors.mutedForeground }]}>
            All ({scans.length})
          </Text>
        </Pressable>
        {lists.map((list) => {
          const count = scans.filter((s) => s.listId === list.id).length;
          const active = selectedListId === list.id;
          return (
            <Pressable
              key={list.id}
              style={[styles.tab, active
                ? { backgroundColor: list.color }
                : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }
              ]}
              onPress={() => setSelectedListId(list.id)}
              onLongPress={() => handleDeleteList(list)}
            >
              {!active && <View style={[styles.tabDot, { backgroundColor: list.color }]} />}
              <Text style={[styles.tabText, { color: active ? "#fff" : colors.mutedForeground }]}>
                {list.name} ({count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Scan list */}
      <FlatList
        data={filteredScans}
        keyExtractor={(item) => item.id}
        scrollEnabled={!!filteredScans.length}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
              <Ionicons name="scan-outline" size={36} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No scans yet</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Scan a card to see it here
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <CardListItem
            card={item.card}
            subtitle={formatDate(item.scannedAt)}
            onLongPress={() => handleDeleteScan(item.id)}
          />
        )}
      />

      {/* New List modal */}
      <Modal visible={showNewList} transparent animationType="slide" onRequestClose={() => setShowNewList(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowNewList(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
            <Pressable onPress={() => {}}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>New List</Text>

              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
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
                    style={[styles.colorDot, { backgroundColor: c }, newListColor === c && styles.colorDotActive]}
                    onPress={() => setNewListColor(c)}
                  />
                ))}
              </View>

              <Pressable
                style={[styles.createBtn, { backgroundColor: newListName.trim() ? colors.accent : colors.surface }]}
                onPress={handleCreateList}
                disabled={!newListName.trim()}
              >
                <Text style={[styles.createBtnText, { color: newListName.trim() ? colors.background : colors.mutedForeground }]}>
                  Create List
                </Text>
              </Pressable>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  listTabs: { paddingHorizontal: 16, gap: 8, flexDirection: "row", marginBottom: 16 },
  tab: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6 },
  tabDot: { width: 7, height: 7, borderRadius: 4 },
  tabText: { fontSize: 13, fontFamily: "Poppins_500Medium" },

  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Poppins_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Poppins_400Regular" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 20 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontFamily: "Poppins_700Bold", marginBottom: 20 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontFamily: "Poppins_400Regular", marginBottom: 20 },
  colorLabel: { fontSize: 11, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  colorRow: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginBottom: 24 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: { borderWidth: 3, borderColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4 },
  createBtn: { paddingVertical: 15, borderRadius: 14, alignItems: "center" },
  createBtnText: { fontSize: 16, fontFamily: "Poppins_600SemiBold" },
});
