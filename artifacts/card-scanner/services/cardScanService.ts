import { Platform } from "react-native";
import { CardScanResult } from "@/context/ScanContext";
import { ScanFilters } from "@/components/ScanFilterSheet";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export type IdentifyResult =
  | { type: "single"; card: CardScanResult }
  | { type: "variants"; cards: CardScanResult[] };

/**
 * Convert a data: URI (produced by the web camera's canvas.toDataURL) into a
 * real Blob so it can be uploaded as multipart form-data on the web.
 */
function dataUriToBlob(dataUri: string): Blob {
  const [header, base64] = dataUri.split(",");
  const mimeMatch = /data:([^;]+);base64/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Build the multipart form-data body for the identify request.
 *
 * Web: the camera/upload hands us either a `data:` URI or a `blob:`/`http(s):`
 * object URL. We fetch/convert it into a real Blob and append that, because the
 * React Native `{ uri, name, type }` shim does NOT work in a browser.
 *
 * Native: keep the React Native form-data convention.
 */
async function buildFormData(
  imageUri: string,
  filters?: ScanFilters
): Promise<FormData> {
  const formData = new FormData();

  if (Platform.OS === "web") {
    let blob: Blob;
    if (imageUri.startsWith("data:")) {
      blob = dataUriToBlob(imageUri);
    } else {
      // blob: or http(s): object URL (e.g. from the file picker)
      const resp = await fetch(imageUri);
      blob = await resp.blob();
    }
    const ext = (blob.type.split("/")[1] || "jpg").split(";")[0];
    formData.append("image", blob, `scan.${ext}`);
  } else {
    const filename = imageUri.split("/").pop() ?? "scan.jpg";
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : "image/jpeg";
    formData.append("image", {
      uri: imageUri,
      name: filename,
      type,
    } as unknown as Blob);
  }

  // Append active filter overrides so the server can skip / override OCR fields
  if (filters) {
    if (filters.game) formData.append("game", filters.game);
    if (filters.set) formData.append("set", filters.set);
    if (filters.language) formData.append("language", filters.language);
    if (filters.finish) formData.append("finish", filters.finish);
  }

  return formData;
}

export async function identifyCard(
  imageUri: string,
  filters?: ScanFilters
): Promise<IdentifyResult> {
  const formData = await buildFormData(imageUri, filters);

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
