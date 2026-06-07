import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardDetailModal } from "@/components/CardDetailModal";
import { CardListItem } from "@/components/CardListItem";
import { CardScanResult, useScanContext } from "@/context/ScanContext";
import { useColors } from "@/hooks/useColors";

// This screen calls OUR backend only. PokeWallet API key stays server-side.
// EXPO_PUBLIC_BACKEND_URL is safe to expose - it's just our own server URL.
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

const GAMES = [
  { label: "Pokemon", value: "pokemon" },
  { label: "One Piece", value: "one piece" },
];

async function searchCards(q: string, game: string): Promise<CardScanResult[]> {
  const res = await fetch(
    `${BACKEND_URL}/search?q=${encodeURIComponent(q)}&game=${encodeURIComponent(game)}&limit=20`
  );
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json();
}

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addScan, addToCollection, lists, activeScanListId } = useScanContext();
  const activeList = lists.find((l) => l.id === activeScanListId);

  const [query, setQuery] = useState("");
  const [game, setGame] = useState("pokemon");
  const [results, setResults] = useState<CardScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardScanResult | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string, g: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchCards(q.trim(), g);
      setResults(data);
      setSearched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text, game), 400);
  };

  const handleGameChange = (g: string) => {
    setGame(g);
    if (query.trim()) runSearch(query, g);
  };

  const handleCardPress = (card: CardScanResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCard(card);
    setModalVisible(true);
  };

  const handleAddToList = () => {
    if (!selectedCard) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addScan(selectedCard);
    setModalVisible(false);
  };

  const handleAddToCollection = () => {
    if (!selectedCard) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addToCollection(selectedCard);
    setModalVisible(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Search</Text>

        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Card name, set, or number..."
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={handleQueryChange}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              runSearch(query, game);
            }}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => { setQuery(""); setResults([]); setSearched(false); }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        <View style={styles.pills}>
          {GAMES.map((g) => (
            <Pressable
              key={g.value}
              style={[
                styles.pill,
                {
                  backgroundColor: game === g.value ? colors.accent + "22" : colors.surface,
                  borderColor: game === g.value ? colors.accent : colors.border,
                },
              ]}
              onPress={() => handleGameChange(g.value)}
            >
              <Text
                style={[
                  styles.pillText,
                  {
                    color: game === g.value ? colors.accent : colors.mutedForeground,
                    fontFamily: game === g.value ? "Poppins_600SemiBold" : "Poppins_400Regular",
                  },
                ]}
              >
                {g.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Searching...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.warning} />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>{error}</Text>
        </View>
      ) : !searched ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Search for any card to add it{"\n"}to a list or your collection
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="file-tray-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            No cards found for "{query}"
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.cardId}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => (
            <CardListItem card={item} onPress={() => handleCardPress(item)} />
          )}
        />
      )}

      <CardDetailModal
        card={selectedCard}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        extraInfo={
          selectedCard ? (
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={handleAddToList}
              >
                <Ionicons name="bookmark-outline" size={16} color={colors.foreground} />
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>
                  Add to {activeList?.name ?? "My Scans"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: colors.accent }]}
                onPress={handleAddToCollection}
              >
                <Ionicons name="albums" size={16} color={colors.background} />
                <Text style={[styles.modalBtnText, { color: colors.background }]}>
                  Add to Collection
                </Text>
              </Pressable>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  title: { fontSize: 26, fontFamily: "Poppins_700Bold" },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Poppins_400Regular", padding: 0 },
  pills: { flexDirection: "row", gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 13 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  hint: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  modalActions: { width: "100%", gap: 10, marginTop: 4 },
  modalBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  modalBtnText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});
