import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface CardScanResult {
  cardId: string;
  game: string;
  name: string;
  set: string;
  number?: string;
  rarity?: string;
  condition?: string;
  confidence: number;
  marketValue?: number;
  lowValue?: number;
  highValue?: number;
  imageUrl?: string;
}

export interface ScanItem {
  id: string;
  scannedAt: string;
  listId: string;
  card: CardScanResult;
}

export interface ScanList {
  id: string;
  name: string;
  createdAt: string;
  color: string;
}

export interface CollectionCard {
  id: string;
  addedAt: string;
  card: CardScanResult;
  quantity: number;
  notes?: string;
}

interface ScanContextType {
  scans: ScanItem[];
  lists: ScanList[];
  collection: CollectionCard[];
  activeScanListId: string;
  setActiveScanListId: (id: string) => void;
  addScan: (card: CardScanResult, listId?: string) => void;
  removeScan: (id: string) => void;
  createList: (name: string, color: string) => ScanList;
  deleteList: (id: string) => void;
  addToCollection: (card: CardScanResult) => void;
  removeFromCollection: (id: string) => void;
  updateCollectionQuantity: (id: string, quantity: number) => void;
  totalCollectionValue: number;
  refreshCollectionPrices: () => Promise<void>;
}

const SCANS_KEY = "@card_scanner_scans";
const LISTS_KEY = "@card_scanner_lists";
const COLLECTION_KEY = "@card_scanner_collection";

const DEFAULT_LIST: ScanList = {
  id: "default",
  name: "My Scans",
  createdAt: new Date().toISOString(),
  color: "#00C4CC",
};

const LIST_COLORS = ["#00C4CC", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

const ScanContext = createContext<ScanContextType | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [lists, setLists] = useState<ScanList[]>([DEFAULT_LIST]);
  const [collection, setCollection] = useState<CollectionCard[]>([]);
  const [activeScanListId, setActiveScanListId] = useState<string>("default");

  useEffect(() => {
    const loadData = async () => {
      try {
        const [scansData, listsData, collectionData] = await Promise.all([
          AsyncStorage.getItem(SCANS_KEY),
          AsyncStorage.getItem(LISTS_KEY),
          AsyncStorage.getItem(COLLECTION_KEY),
        ]);
        if (scansData) setScans(JSON.parse(scansData));
        if (listsData) {
          const parsed = JSON.parse(listsData);
          if (parsed.length > 0) setLists(parsed);
        }
        if (collectionData) setCollection(JSON.parse(collectionData));
      } catch {}
    };
    loadData();
  }, []);

  const persistScans = useCallback(async (data: ScanItem[]) => {
    await AsyncStorage.setItem(SCANS_KEY, JSON.stringify(data));
  }, []);

  const persistLists = useCallback(async (data: ScanList[]) => {
    await AsyncStorage.setItem(LISTS_KEY, JSON.stringify(data));
  }, []);

  const persistCollection = useCallback(async (data: CollectionCard[]) => {
    await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(data));
  }, []);

  const addScan = useCallback((card: CardScanResult, listId?: string) => {
    const newScan: ScanItem = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      scannedAt: new Date().toISOString(),
      listId: listId ?? activeScanListId,
      card,
    };
    setScans((prev) => {
      const updated = [newScan, ...prev];
      persistScans(updated);
      return updated;
    });
  }, [activeScanListId, persistScans]);

  const removeScan = useCallback((id: string) => {
    setScans((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      persistScans(updated);
      return updated;
    });
  }, [persistScans]);

  const createList = useCallback((name: string, color: string): ScanList => {
    const newList: ScanList = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      name,
      createdAt: new Date().toISOString(),
      color,
    };
    setLists((prev) => {
      const updated = [...prev, newList];
      persistLists(updated);
      return updated;
    });
    return newList;
  }, [persistLists]);

  const deleteList = useCallback((id: string) => {
    if (id === "default") return;
    setLists((prev) => {
      const updated = prev.filter((l) => l.id !== id);
      persistLists(updated);
      return updated;
    });
    setScans((prev) => {
      const updated = prev.filter((s) => s.listId !== id);
      persistScans(updated);
      return updated;
    });
  }, [persistLists, persistScans]);

  const addToCollection = useCallback((card: CardScanResult) => {
    setCollection((prev) => {
      const existing = prev.find((c) => c.card.cardId === card.cardId);
      let updated: CollectionCard[];
      if (existing) {
        updated = prev.map((c) =>
          c.card.cardId === card.cardId ? { ...c, quantity: c.quantity + 1 } : c
        );
      } else {
        const newCard: CollectionCard = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          addedAt: new Date().toISOString(),
          card,
          quantity: 1,
        };
        updated = [newCard, ...prev];
      }
      persistCollection(updated);
      return updated;
    });
  }, [persistCollection]);

  const removeFromCollection = useCallback((id: string) => {
    setCollection((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      persistCollection(updated);
      return updated;
    });
  }, [persistCollection]);

  const updateCollectionQuantity = useCallback((id: string, quantity: number) => {
    setCollection((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, quantity } : c));
      persistCollection(updated);
      return updated;
    });
  }, [persistCollection]);

  const refreshCollectionPrices = useCallback(async () => {
    const snapshot = await AsyncStorage.getItem(COLLECTION_KEY);
    if (!snapshot) return;
    const current: CollectionCard[] = JSON.parse(snapshot);
    if (!current.length) return;

    const cardIds = current.map((c) => c.card.cardId);
    const res = await fetch(`${API_BASE}/refresh-prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardIds }),
    });

    if (!res.ok) throw new Error(`refresh-prices failed: ${res.status}`);

    const updated: { cardId: string; marketValue?: number; lowValue?: number; highValue?: number }[] = await res.json();

    setCollection((prev) => {
      const map = new Map(updated.map((u) => [u.cardId, u]));
      const refreshed = prev.map((c) => {
        const fresh = map.get(c.card.cardId);
        if (!fresh) return c;
        return {
          ...c,
          card: {
            ...c.card,
            marketValue: fresh.marketValue ?? c.card.marketValue,
            lowValue: fresh.lowValue ?? c.card.lowValue,
            highValue: fresh.highValue ?? c.card.highValue,
          },
        };
      });
      persistCollection(refreshed);
      return refreshed;
    });
  }, [persistCollection]);

  const totalCollectionValue = collection.reduce((sum, c) => {
    return sum + (c.card.marketValue ?? 0) * c.quantity;
  }, 0);

  return (
    <ScanContext.Provider
      value={{
        scans,
        lists,
        collection,
        activeScanListId,
        setActiveScanListId,
        addScan,
        removeScan,
        createList,
        deleteList,
        addToCollection,
        removeFromCollection,
        updateCollectionQuantity,
        totalCollectionValue,
        refreshCollectionPrices,
      }}
    >
      {children}
    </ScanContext.Provider>
  );
}

export function useScanContext() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScanContext must be used within ScanProvider");
  return ctx;
}

export { LIST_COLORS };
