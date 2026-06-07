import { Ionicons } from "@expo/vector-icons";
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.handleWrap}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Header */}
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Multiple Variants Found
          </Text>
          <Pressable
            onPress={onCancel}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Select the exact version you scanned
        </Text>

        {/* Scrollable variant list */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.list}
        >
          {variants.map((card, idx) => {
            const imageSource = card.imageUrl
              ? card.imageUrl.includes("assets.tcgdex.net")
                ? { uri: card.imageUrl, headers: { Accept: "image/webp,image/*" } }
                : { uri: card.imageUrl }
              : null;

            return (
              <Pressable
                key={card.cardId ?? String(idx)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelect(card);
                }}
              >
                {/* Thumbnail */}
                {imageSource ? (
                  <Image
                    source={imageSource}
                    style={styles.thumb}
                    contentFit="contain"
                    transition={150}
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View
                    style={[
                      styles.thumbPlaceholder,
                      { backgroundColor: colors.border },
                    ]}
                  >
                    <Ionicons
                      name="image-outline"
                      size={20}
                      color={colors.mutedForeground}
                    />
                  </View>
                )}

                {/* Card info */}
                <View style={styles.info}>
                  <Text
                    style={[styles.cardName, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {card.name}
                  </Text>
                  {card.rarity ? (
                    <Text
                      style={[styles.rarity, { color: colors.accent }]}
                      numberOfLines={1}
                    >
                      {card.rarity}
                    </Text>
                  ) : null}
                  <Text
                    style={[styles.setLine, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {card.set}
                    {card.number ? ` · #${card.number}` : ""}
                  </Text>
                  {card.marketValue !== undefined && (
                    <Text
                      style={[styles.price, { color: colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      ${card.marketValue.toFixed(2)}
                    </Text>
                  )}
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.mutedForeground}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    maxHeight: "80%",
  },
  handleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    marginTop: 8,
  },
  title: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  subtitle: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    marginBottom: 16,
  },
  list: { gap: 10, paddingBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  thumb: { width: 50, height: 70, borderRadius: 6 },
  thumbPlaceholder: {
    width: 50,
    height: 70,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1 },
  cardName: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 2,
  },
  rarity: { fontSize: 12, fontFamily: "Poppins_500Medium", marginBottom: 2 },
  setLine: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  price: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 2 },
});
