import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import { useColors } from "@/hooks/useColors";

export type ScanGame = "Pokemon" | "One Piece" | null;
export type ScanLanguage = "English" | "Japanese" | null;
export type ScanFinish = "Normal" | "Foil" | "Reverse Foil" | null;

export interface ScanFilters {
  game: ScanGame;
  set: string | null;
  language: ScanLanguage;
  finish: ScanFinish;
}

export const EMPTY_FILTERS: ScanFilters = {
  game: null,
  set: null,
  language: null,
  finish: null,
};

export function activeFilterCount(f: ScanFilters): number {
  return [f.game, f.set, f.language, f.finish].filter(Boolean).length;
}

// ─── Hardcoded set lists ───────────────────────────────────────────────────

const ONE_PIECE_SETS: { code: string; name: string }[] = [
  { code: "OP01", name: "OP01 · Romance Dawn" },
  { code: "OP02", name: "OP02 · Paramount War" },
  { code: "OP03", name: "OP03 · Pillars of Strength" },
  { code: "OP04", name: "OP04 · Kingdoms of Intrigue" },
  { code: "OP05", name: "OP05 · Awakening of the New Era" },
  { code: "OP06", name: "OP06 · Wings of the Captain" },
  { code: "OP07", name: "OP07 · 500 Years in the Future" },
  { code: "OP08", name: "OP08 · Two Legends" },
  { code: "OP09", name: "OP09 · The Four Emperors" },
  { code: "OP10", name: "OP10 · Royal Blood" },
  { code: "OP11", name: "OP11 · Egghead" },
  { code: "OP12", name: "OP12 · The Bonds of Brothers" },
  { code: "OP13", name: "OP13 · Carrying on His Will" },
  { code: "OP14", name: "OP14 · Seven Warlords of the Sea" },
  { code: "ST01", name: "ST01 · Starter Deck" },
  { code: "ST02", name: "ST02 · Starter Deck" },
  { code: "ST03", name: "ST03 · Starter Deck" },
  { code: "ST04", name: "ST04 · Starter Deck" },
  { code: "ST05", name: "ST05 · Starter Deck" },
  { code: "ST06", name: "ST06 · Starter Deck" },
  { code: "ST07", name: "ST07 · Starter Deck" },
  { code: "ST08", name: "ST08 · Starter Deck" },
  { code: "ST09", name: "ST09 · Starter Deck" },
  { code: "ST10", name: "ST10 · Starter Deck" },
  { code: "ST11", name: "ST11 · Starter Deck" },
  { code: "ST12", name: "ST12 · Starter Deck" },
  { code: "ST13", name: "ST13 · Starter Deck" },
  { code: "ST14", name: "ST14 · Starter Deck" },
  { code: "ST15", name: "ST15 · Starter Deck" },
  { code: "ST16", name: "ST16 · Starter Deck" },
  { code: "ST17", name: "ST17 · Starter Deck" },
  { code: "ST18", name: "ST18 · Starter Deck" },
  { code: "ST19", name: "ST19 · Starter Deck" },
  { code: "ST20", name: "ST20 · Starter Deck" },
  { code: "ST21", name: "ST21 · Starter Deck" },
];

const POKEMON_SETS: { code: string; name: string }[] = [
  { code: "sv1", name: "Scarlet & Violet" },
  { code: "sv2", name: "Paldea Evolved" },
  { code: "sv3", name: "Obsidian Flames" },
  { code: "sv3pt5", name: "151" },
  { code: "sv4", name: "Paradox Rift" },
  { code: "sv4pt5", name: "Paldean Fates" },
  { code: "sv5", name: "Temporal Forces" },
  { code: "sv6", name: "Twilight Masquerade" },
  { code: "sv6pt5", name: "Shrouded Fable" },
  { code: "sv7", name: "Stellar Crown" },
  { code: "sv8", name: "Surging Sparks" },
  { code: "sv8pt5", name: "Prismatic Evolutions" },
  { code: "sv9", name: "Journey Together" },
  { code: "sv9pt5", name: "Destined Rivals" },
  { code: "sv10", name: "Triumphant Light" },
  { code: "swsh1", name: "Sword & Shield Base" },
  { code: "swsh2", name: "Rebel Clash" },
  { code: "swsh3", name: "Darkness Ablaze" },
  { code: "swsh4", name: "Vivid Voltage" },
  { code: "swsh5", name: "Battle Styles" },
  { code: "swsh6", name: "Chilling Reign" },
  { code: "swsh7", name: "Evolving Skies" },
  { code: "swsh8", name: "Fusion Strike" },
  { code: "swsh9", name: "Brilliant Stars" },
  { code: "swsh10", name: "Astral Radiance" },
  { code: "swsh11", name: "Lost Origin" },
  { code: "swsh12", name: "Silver Tempest" },
  { code: "swsh12pt5", name: "Crown Zenith" },
];

const OP_FINISH_OPTIONS: ScanFinish[] = ["Normal", "Foil"];
const POKEMON_FINISH_OPTIONS: ScanFinish[] = ["Normal", "Foil", "Reverse Foil"];

// ─── Chip ──────────────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: any;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[
        chipStyles.chip,
        {
          backgroundColor: selected ? colors.accent : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
        },
      ]}
    >
      <Text
        style={[
          chipStyles.chipText,
          { color: selected ? colors.background : colors.foreground },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Main sheet ────────────────────────────────────────────────────────────

interface ScanFilterSheetProps {
  visible: boolean;
  filters: ScanFilters;
  onChange: (f: ScanFilters) => void;
  onClose: () => void;
}

export function ScanFilterSheet({
  visible,
  filters,
  onChange,
  onClose,
}: ScanFilterSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const sets =
    filters.game === "One Piece"
      ? ONE_PIECE_SETS
      : filters.game === "Pokemon"
      ? POKEMON_SETS
      : [];

  const finishOptions: ScanFinish[] =
    filters.game === "One Piece"
      ? OP_FINISH_OPTIONS
      : POKEMON_FINISH_OPTIONS;

  const setGame = (g: ScanGame) => {
    // Reset set + finish when game changes
    onChange({ ...filters, game: g === filters.game ? null : g, set: null, finish: null });
  };

  const setSet = (code: string) =>
    onChange({ ...filters, set: code === filters.set ? null : code });

  const setLanguage = (l: ScanLanguage) =>
    onChange({ ...filters, language: l === filters.language ? null : l });

  const setFinish = (f: ScanFinish) =>
    onChange({ ...filters, finish: f === filters.finish ? null : f });

  const clearAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onChange(EMPTY_FILTERS);
  };

  const hasAny = activeFilterCount(filters) > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <View
        style={[
          sheetStyles.sheet,
          { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 },
        ]}
      >
        {/* Handle */}
        <View style={sheetStyles.handleWrap}>
          <View style={[sheetStyles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Title row */}
        <View style={sheetStyles.titleRow}>
          <Text style={[sheetStyles.title, { color: colors.foreground }]}>Scan Filters</Text>
          <View style={sheetStyles.titleActions}>
            {hasAny && (
              <Pressable onPress={clearAll} style={sheetStyles.clearBtn}>
                <Text style={[sheetStyles.clearText, { color: colors.accent }]}>Clear All</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
        <Text style={[sheetStyles.subtitle, { color: colors.mutedForeground }]}>
          Set filters override OCR — unset fields are auto-detected
        </Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={sheetStyles.scroll}
        >
          {/* Game */}
          <Section label="Game" colors={colors}>
            <View style={sheetStyles.chipRow}>
              {(["Pokemon", "One Piece"] as ScanGame[]).map((g) => (
                <Chip
                  key={g!}
                  label={g!}
                  selected={filters.game === g}
                  onPress={() => setGame(g)}
                  colors={colors}
                />
              ))}
            </View>
          </Section>

          {/* Set — only shown when a game is selected */}
          {filters.game && (
            <Section label="Set" colors={colors}>
              <View style={sheetStyles.chipRow}>
                {sets.map((s) => (
                  <Chip
                    key={s.code}
                    label={s.name}
                    selected={filters.set === s.code}
                    onPress={() => setSet(s.code)}
                    colors={colors}
                  />
                ))}
              </View>
            </Section>
          )}

          {/* Language */}
          <Section label="Language" colors={colors}>
            <View style={sheetStyles.chipRow}>
              {(["English", "Japanese"] as ScanLanguage[]).map((l) => (
                <Chip
                  key={l!}
                  label={l!}
                  selected={filters.language === l}
                  onPress={() => setLanguage(l)}
                  colors={colors}
                />
              ))}
            </View>
          </Section>

          {/* Finish */}
          <Section label="Finish" colors={colors}>
            <View style={sheetStyles.chipRow}>
              {finishOptions.map((f) => (
                <Chip
                  key={f!}
                  label={f!}
                  selected={filters.finish === f}
                  onPress={() => setFinish(f)}
                  colors={colors}
                />
              ))}
              {/* Show all options when no game selected */}
              {!filters.game &&
                (["Normal", "Foil", "Reverse Foil"] as ScanFinish[]).filter(
                  (x) => !finishOptions.includes(x)
                ).length > 0 &&
                (["Reverse Foil"] as ScanFinish[]).map((f) => (
                  <Chip
                    key={f!}
                    label={f!}
                    selected={filters.finish === f}
                    onPress={() => setFinish(f)}
                    colors={colors}
                  />
                ))}
            </View>
          </Section>
        </ScrollView>

        {/* Done */}
        <Pressable
          style={[sheetStyles.doneBtn, { backgroundColor: colors.accent }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onClose();
          }}
        >
          <Text style={[sheetStyles.doneBtnText, { color: colors.background }]}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Section({
  label,
  colors,
  children,
}: {
  label: string;
  colors: any;
  children: React.ReactNode;
}) {
  return (
    <View style={sheetStyles.section}>
      <Text style={[sheetStyles.sectionLabel, { color: colors.mutedForeground }]}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    maxHeight: "85%",
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
  titleActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  clearBtn: { paddingVertical: 4 },
  clearText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
  subtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginBottom: 16,
  },
  scroll: { gap: 4, paddingBottom: 16 },
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 1,
    marginBottom: 10,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  doneBtn: {
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 4,
  },
  doneBtnText: { fontSize: 16, fontFamily: "Poppins_600SemiBold" },
});

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
});
