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
    selectedListId === "all"
      ? scans
      : scans.filter((s) => s.listId === selectedListId);

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
    Alert.alert(
      "Delete List",
      `Delete "${list.name}" and all its scans?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteList(list.id);
            if (selectedListId === list.id) setSelectedListId("all");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  };

  const handleDeleteScan = (id: string) => {
    Alert.alert("Remove Scan", "Remove this scan from the list?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          removeScan(id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      },
    ]);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>Scans</Text>
        <Pressable
          style={[styles.newListBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowNewList(true)}
        >
          <Ionicons name="add" size={18} color={colors.primaryForeground} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listTabs}
      >
        <Pressable
          style={[
            styles.listTab,
            selectedListId === "all"
              ? { backgroundColor: colors.primary }
              : { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 },
          ]}
          onPress={() => setSelectedListId("all")}
        >
          <Text style={[styles.listTabText, { color: selectedListId === "all" ? colors.primaryForeground : colors.foreground }]}>
            All ({scans.length})
          </Text>
        </Pressable>

        {lists.map((list) => {
          const count = scans.filter((s) => s.listId === list.id).length;
          const isSelected = selectedListId === list.id;
          return (
            <Pressable
              key={list.id}
              style={[
                styles.listTab,
                isSelected
                  ? { backgroundColor: list.color }
                  : { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 },
              ]}
              onPress={() => setSelectedListId(list.id)}
              onLongPress={() => handleDeleteList(list)}
            >
              {!isSelected && <View style={[styles.tabDot, { backgroundColor: list.color }]} />}
              <Text style={[styles.listTabText, { color: isSelected ? "#fff" : colors.foreground }]}>
                {list.name} ({count})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={filteredScans}
        keyExtractor={(item) => item.id}
        scrollEnabled={!!filteredScans.length}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="scan-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No scans yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
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

      <Modal visible={showNewList} transparent animationType="slide" onRequestClose={() => setShowNewList(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewList(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
            <Pressable onPress={() => {}}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>New List</Text>

              <TextInput
                style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                placeholder="List name"
                placeholderTextColor={colors.mutedForeground}
                value={newListName}
                onChangeText={setNewListName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreateList}
              />

              <Text style={[styles.colorLabel, { color: colors.mutedForeground }]}>Color</Text>
              <View style={styles.colorPicker}>
                {LIST_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      newListColor === c && styles.colorDotSelected,
                    ]}
                    onPress={() => setNewListColor(c)}
                  />
                ))}
              </View>

              <Pressable
                style={[styles.createBtn, { backgroundColor: newListName.trim() ? colors.primary : colors.muted }]}
                onPress={handleCreateList}
                disabled={!newListName.trim()}
              >
                <Text style={[styles.createBtnText, { color: newListName.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
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
  newListBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  listTabs: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
    flexDirection: "row",
  },
  listTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  tabDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listTabText: {
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 20,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  colorLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  colorPicker: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 24,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  createBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  createBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
