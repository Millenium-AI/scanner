import { CardScanResult } from "@/context/ScanContext";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function identifyCard(imageUri: string): Promise<CardScanResult> {
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
  return data as CardScanResult;
}
