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
