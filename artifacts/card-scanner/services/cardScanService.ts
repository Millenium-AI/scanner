import { CardScanResult } from "@/context/ScanContext";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export type IdentifyResult =
  | { type: "single"; card: CardScanResult }
  | { type: "variants"; cards: CardScanResult[] };

export async function identifyCard(imageUri: string): Promise<IdentifyResult> {
  const formData = new FormData();

  const filename = imageUri.split("/").pop() ?? "scan.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : "image/jpeg";

  formData.append("image", {
    uri: imageUri,
    name: filename,
    type,
  } as unknown as Blob);

  const response = await fetch(`${BACKEND_URL}/identify-card`, {
    method: "POST",
    body: formData,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`Backend error ${response.status}: ${text}`);
  }

  const data = await response.json();

  // Backend returns { variants: [...] } when multiple cards share the same name + number
  if (Array.isArray(data.variants) && data.variants.length > 1) {
    return { type: "variants", cards: data.variants };
  }

  return { type: "single", card: data.variants?.[0] ?? data };
}
