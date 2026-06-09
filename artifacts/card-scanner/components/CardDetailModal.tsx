import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
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
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";

interface CardDetailModalProps {
  card: CardScanResult | null;
  visible: boolean;
  onClose: () => void;
  extraInfo?: React.ReactNode;
}

function buildEbayWebUrl(card: CardScanResult): string {
  const parts = [card.name, card.set];
  if (card.number) parts.push(card.number);
  const q = encodeURIComponent(parts.join(" "));
  // LH_Complete=1 + LH_Sold=1 = sold/completed listings only, sorted by most recent
  return `https://www.ebay.com/sch/i.html?_nkw=${q}&_sacat=2536&LH_Complete=1&LH_Sold=1&_sop=13`;
}

function buildEbayAppUrl(card: CardScanResult): string {
  const parts = [card.name, card.set];
  if (card.number) parts.push(card.number);
  const q = encodeURIComponent(parts.join(" "));
  return `ebay://search?query=${q}&completed=true&sold=true`;
}

function buildTCGPlayerAppUrl(tcgUrl: string): string {
  // TCGPlayer deep link — opens product page in-app if installed
  return tcgUrl.replace("https://www.tcgplayer.com", "tcgplayer://");
}

async function openTCGPlayer(tcgUrl: string) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const appUrl = buildTCGPlayerAppUrl(tcgUrl);
  const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
  if (canOpen) {
    await Linking.openURL(appUrl);
  } else {
    await WebBrowser.openBrowserAsync(tcgUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      toolbarColor: "#1A56DB",
      enableBarCollapsing: true,
    });
  }
}

async function openEbay(card: CardScanResult) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const appUrl = buildEbayAppUrl(card);
  const webUrl = buildEbayWebUrl(card);
  const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
  if (canOpen) {
    await Linking.openURL(appUrl);
  } else {
    await WebBrowser.openBrowserAsync(webUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      toolbarColor: "#E53238",
      enableBarCollapsing: true,
    });
  }
}

export function CardDetailModal({ card, visible, onClose, extraInfo }: CardDetailModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (!card) return null;

  const tcgUrl = (card as any).tcg_url
    ? (card as any).tcg_url
    : `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(card.name + " " + card.set)}&view=grid`;

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
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Icon name="close" size={20} color={colors.mutedForeground} />
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
                <Icon name="image-outline" size={48} color={colors.mutedForeground} />
              </View>
            )}

            {/* Name + set */}
            <Text style={[styles.cardName, { color: colors.foreground }]}>{card.name}</Text>
            <Text style={[styles.cardSet, { color: colors.mutedForeground }]}>
              {card.set}{card.number ? ` · ${card.number}` : ""}
            </Text>

            {extraInfo && <View style={styles.extraInfo}>{extraInfo}</View>}

            {/* Market price */}
            <View style={[styles.marketBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.marketLabel, { color: colors.mutedForeground }]}>MARKET PRICE</Text>
              <Text style={[styles.marketValue, { color: colors.accent }]}>
                {card.marketValue !== undefined ? `$${card.marketValue.toFixed(2)}` : "—"}
              </Text>
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
                onPress={() => openTCGPlayer(tcgUrl)}
              >
                <Icon name="pricetag-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>TCGPlayer</Text>
              </Pressable>

              <Pressable
                style={[styles.actionBtn, { backgroundColor: "#E53238" }]}
                onPress={() => openEbay(card)}
              >
                <Icon name="cart-outline" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>eBay Sold</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, maxHeight: "90%" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  closeBtn: { position: "absolute", top: 16, right: 18, zIndex: 10, padding: 4 },
  content: { paddingHorizontal: 20, paddingBottom: 8, alignItems: "center" },
  imageWrapper: {
    width: 160, height: 224, marginVertical: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  cardImage: { width: "100%", height: "100%", borderRadius: 10 },
  imagePlaceholder: {
    width: 160, height: 224, borderRadius: 10, marginVertical: 12,
    alignItems: "center", justifyContent: "center",
  },
  cardName: { fontSize: 22, fontFamily: "Poppins_700Bold", textAlign: "center", marginTop: 4 },
  cardSet: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", marginBottom: 12 },
  extraInfo: { marginBottom: 12, alignItems: "center" },
  marketBox: {
    width: "100%", borderRadius: 16, borderWidth: 1,
    paddingVertical: 18, alignItems: "center", marginBottom: 14, gap: 4,
  },
  marketLabel: { fontSize: 10, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 1 },
  marketValue: { fontSize: 32, fontFamily: "Poppins_700Bold" },
  metaGrid: {
    flexDirection: "row", flexWrap: "wrap", width: "100%",
    borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 20,
  },
  metaCell: { width: "50%", padding: 12, borderBottomWidth: 1, borderRightWidth: 1, gap: 2 },
  metaLabel: { fontSize: 9, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.8 },
  metaValue: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  actionRow: { flexDirection: "row", width: "100%", gap: 12, marginBottom: 4 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14,
  },
  actionBtnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold", color: "#fff" },
});
