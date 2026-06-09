import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardScanResult } from "@/context/ScanContext";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";

interface VariantPickerModalProps {
  visible: boolean;
  variants: CardScanResult[];
  onSelect: (card: CardScanResult) => void;
  onCancel: () => void;
}

export function VariantPickerModal({
  visible,
  variants,
  onSelect,
  onCancel,
}: VariantPickerModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.sheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.foreground }]}>Multiple Matches</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Select the correct card
              </Text>
            </View>
            <Pressable onPress={onCancel} hitSlop={12}>
              <Icon name="close" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            bounces={false}
          >
            {variants.map((card, idx) => (
              <Pressable
                key={idx}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed ? colors.surface : colors.card,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelect(card);
                }}
              >
                {/* Card thumbnail */}
                {card.imageUrl ? (
                  <Image
                    source={{ uri: card.imageUrl }}
                    style={styles.thumb}
                    contentFit="contain"
                    transition={150}
                  />
                ) : (
                  <View style={[styles.thumbPlaceholder, { backgroundColor: colors.surface }]}>
                    <Icon name="image-outline" size={24} color={colors.mutedForeground} />
                  </View>
                )}

                {/* Card info */}
                <View style={styles.info}>
                  <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>
                    {card.name}
                  </Text>
                  <Text style={[styles.cardSet, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {card.set}{card.number ? ` · ${card.number}` : ""}
                  </Text>
                  {card.rarity && (
                    <Text style={[styles.cardRarity, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {card.rarity}
                    </Text>
                  )}
                  {card.marketValue !== undefined && (
                    <Text style={[styles.cardPrice, { color: colors.accent }]}>
                      ${card.marketValue.toFixed(2)}
                    </Text>
                  )}
                </View>

                <Icon name="chevron-forward" size={18} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, maxHeight: "85%" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 12,
  },
  title: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Poppins_400Regular", marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, borderWidth: 1, padding: 12,
  },
  thumb: { width: 56, height: 78, borderRadius: 6 },
  thumbPlaceholder: { width: 56, height: 78, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 3 },
  cardName: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  cardSet: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  cardRarity: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  cardPrice: { fontSize: 14, fontFamily: "Poppins_700Bold", marginTop: 2 },
});
