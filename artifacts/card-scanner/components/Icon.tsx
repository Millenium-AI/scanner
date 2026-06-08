/**
 * Drop-in replacement for <Ionicons> using lucide-react-native.
 * SVG-based — zero font files, zero Netlify path issues, works on web and native.
 *
 * Usage: <Icon name="camera-outline" size={24} color="#fff" />
 */
import {
  Album,
  AlertCircle,
  Bookmark,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  CirclePlus,
  CircleX,
  ExternalLink,
  FileX,
  Image,
  List,
  Minus,
  Plus,
  ScanSearch,
  Search,
  Settings2,
  SlidersHorizontal,
  Store,
  Tag,
  Trash2,
  X,
  Zap,
  ZapOff,
} from "lucide-react-native";
import React from "react";

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const MAP: Record<string, LucideIcon> = {
  // Tab bar
  "list-outline":         List,
  "scan-outline":         ScanSearch,
  "search-outline":       Search,
  "albums-outline":       Album,

  // Camera / scan screen
  "camera-outline":       Camera,
  "options-outline":      SlidersHorizontal,
  "chevron-down":         ChevronDown,
  "checkmark":            Check,
  "close":                X,
  "image-outline":        Image,
  "scan":                 ScanSearch,
  "flash":                Zap,
  "flash-off":            ZapOff,

  // Card result sheet
  "close-circle-outline": CircleX,
  "pricetag-outline":     Tag,
  "open-outline":         ExternalLink,
  "storefront-outline":   Store,
  "bookmark-outline":     Bookmark,
  "add-circle-outline":   CirclePlus,
  "albums":               Album,

  // Collection / scans
  "search":               Search,
  "close-circle":         CircleX,
  "remove":               Minus,
  "add":                  Plus,
  "trash-outline":        Trash2,

  // Search screen
  "alert-circle-outline": AlertCircle,
  "file-tray-outline":    FileX,

  // Misc
  "settings-outline":     Settings2,
  "book-outline":         BookOpen,
};

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: object;
}

export function Icon({ name, size = 24, color = "#fff", style }: IconProps) {
  const Component = MAP[name];
  if (!Component) {
    if (__DEV__) console.warn(`[Icon] unknown name: "${name}"`);
    return null;
  }
  return <Component size={size} color={color} strokeWidth={2} />;
}
