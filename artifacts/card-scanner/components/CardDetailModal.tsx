import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React from "react";
import {
  Linking,
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

interface CardDetailModalProps {
  card: CardScanResult | null;
  visible: boolean;
  onClose: () => void;
  /** Optional extra info shown below price row (e.g. quantity badge) */
  extraInfo?: React.ReactNode;
}

function buildEbayUrl(card: CardScanResult): string {
  // Construct search: name + set (+ number if available)
  const parts = [card.name, card.set];
  if (card.number) parts.push(card.number);
  const q = encodeURIComponent(parts.join(" "));
  // _nkw = keyword, _sacat=2536 = Trading Card Games
  return `https://www.ebay.com/sch/i.html?_nkw=${q}&_sacat=2536&LH_BIN=1&_sop=12`;
}

function buildEbayAppUrl(card: CardScanResult): string {
  // eBay app universal link — falls back to browser if app not installed
  const parts = [card.name, card.set];
  if (card.number) parts.push(card.number);
  const q = encodeURIComponent(parts.join(" "));
  return `ebay://search?query=${q}`;
}

export function CardDetailModal({ card, visible, onClose, extraInfo }: CardDetailModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (!card) return null;

  const hasTcg = !!card.imageUrl; // imageUrl presence correlates with a known TCGPlayer card
  // We store tcg_url on the scan result when available; fall back to search URL
  const tcgUrl = (card as any).tcg_url
    ? (card as any).tcg_url
    : `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(card.name + " " + card.set)}&view=grid`;

  const handleTCGPlayer = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Linking.openURL(tcgUrl);
  };

  const handleEbay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Try eBay app first, fall back to browser URL
    const appUrl = buildEbayAppUrl(card);
    const webUrl = buildEbayUrl(card);
    const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
    await Linking.openURL(canOpen ? appUrl : webUrl);
  };

  const priceItems = [
    { label: "Market", value: card.marketValue, accent: true },
    { label: "Low", value: card.lowValue, accent: false },
    { label: "High", value: card.highValue, accent: false },
  ];

  const metaItems = [
    { label: "Set", value: card.set || "—" },
    { label: "Number", value: card.number || "—" },
    { label: "Rarity", value: card.rarity || "—" },
    { label: "Game", value: card.game || "—" },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Close button */}
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={20} color={colors.mutedForeground} />
          </Pressable>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            bounces={false}
          >
            {/* Card image */}
            {card.imageUrl ? (
              <View style={styles.imageWrapper}>
                <Image
                  source={{ uri: card.imageUrl }}
                  style={styles.cardImage}
                  contentFit="contain"
                  transition={200}
                />
              </View>
            ) : (
              <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface }]}>
                <Ionicons name="image-outline" size={48} color={colors.mutedForeground} />
              </View>
            )}

            {/* Name + game tag */}
            <Text style={[styles.cardName, { color: colors.foreground }]}>{card.name}</Text>
            <Text style={[styles.cardSet, { color: colors.mutedForeground }]}>
              {card.set}{card.number ? ` · ${card.number}` : ""}
            </Text>

            {/* Extra info slot */}
            {extraInfo && <View style={styles.extraInfo}>{extraInfo}</View>}

            {/* Price row */}
            <View style={[styles.priceRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {priceItems.map(({ label, value, accent }) => (
                <View key={label} style={styles.priceCell}>
                  <Text style={[styles.priceAmount, { color: accent ? colors.accent : colors.foreground }]}>
                    {value !== undefined ? `$${value.toFixed(2)}` : "—"}
                  </Text>
                  <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Meta grid */}
            <View style={[styles.metaGrid, { borderColor: colors.border }]}>
              {metaItems.map(({ label, value }) => (
                <View key={label} style={[styles.metaCell, { borderColor: colors.border }]}>
                  <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  <Text style={[styles.metaValue, { color: colors.foreground }]} numberOfLines={2}>{value}</Text>
                </View>
              ))}
            </View>

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: "#1A56DB" }]}
                onPress={handleTCGPlayer}
              >
                <Ionicons name="pricetag-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>TCGPlayer</Text>
              </Pressable>

              <Pressable
                style={[styles.actionBtn, { backgroundColor: "#E53238" }]}
                onPress={handleEbay}
              >
                <Ionicons name="cart-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>eBay</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    maxHeight: "90%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 8,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 18,
    zIndex: 10,
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    alignItems: "center",
  },
  imageWrapper: {
    width: 160,
    height: 224,
    marginVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  cardImage: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
  },
  imagePlaceholder: {
    width: 160,
    height: 224,
    borderRadius: 10,
    marginVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: {
    fontSize: 22,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
    marginTop: 4,
  },
  cardSet: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    marginBottom: 12,
  },
  extraInfo: {
    marginBottom: 12,
    alignItems: "center",
  },
  priceRow: {
    flexDirection: "row",
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    marginBottom: 14,
  },
  priceCell: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  priceAmount: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
  },
  priceLabel: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 20,
  },
  metaCell: {
    width: "50%",
    padding: 12,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    gap: 2,
  },
  metaLabel: {
    fontSize: 9,
    fontFamily: "Poppins_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metaValue: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  actionRow: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
    marginBottom: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionBtnText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    color: "#fff",
  },
});
