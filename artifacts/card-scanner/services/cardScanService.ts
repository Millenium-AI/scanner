import { CardScanResult } from "@/context/ScanContext";
import { ScanFilters } from "@/components/ScanFilterSheet";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export type IdentifyResult =
  | { type: "single"; card: CardScanResult }
  | { type: "variants"; cards: CardScanResult[] };

export async function identifyCard(
  imageUri: string,
  filters?: ScanFilters
): Promise<IdentifyResult> {
  const formData = new FormData();

  const filename = imageUri.split("/").pop() ?? "scan.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : "image/jpeg";

  formData.append("image", {
    uri: imageUri,
    name: filename,
    type,
  } as unknown as Blob);

  // Append active filter overrides so the server can skip / override OCR fields
  if (filters) {
    if (filters.game)     formData.append("game",     filters.game);
    if (filters.set)      formData.append("set",      filters.set);
    if (filters.language) formData.append("language", filters.language);
    if (filters.finish)   formData.append("finish",   filters.finish);
  }

  const response = await fetch(`${BACKEND_URL}/identify-card`, {
    method: "POST",
    body: formData,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`Backend error ${response.status}: ${text}`);
  }

  const data = await response.json();

  if (Array.isArray(data.variants) && data.variants.length > 1) {
    return { type: "variants", cards: data.variants };
  }

  return { type: "single", card: data.variants?.[0] ?? data };
}
