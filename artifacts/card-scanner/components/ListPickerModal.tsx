import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Icon } from "@/components/Icon";
import { useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

interface ListPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (listId: string) => void;
}

export function ListPickerModal({ visible, onClose, onSelect }: ListPickerModalProps) {
  const colors = useColors();
  const { lists, activeScanListId } = useScanContext();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.mutedForeground }]}>SELECT LIST</Text>
          {lists.map((list) => (
            <Pressable
              key={list.id}
              style={[
                styles.item,
                list.id === activeScanListId && { backgroundColor: colors.surface },
              ]}
              onPress={() => onSelect(list.id)}
            >
              <View style={[styles.dot, { backgroundColor: list.color }]} />
              <Text style={[styles.label, { color: colors.foreground }]}>{list.name}</Text>
              {list.id === activeScanListId && (
                <Icon name="checkmark" size={16} color={colors.accent} />
              )}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  menu: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 8,
    overflow: "hidden",
  },
  title: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});
