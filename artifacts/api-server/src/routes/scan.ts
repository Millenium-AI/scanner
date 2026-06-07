import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const POKEWALLET_BASE = "https://api.pokewallet.io";

async function ocrCard(imageBase64: string, mimeType: string): Promise<{ name: string; number: string | null; confidence: number }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.2-11b-vision-instruct",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `You are reading text off a Pokémon or One Piece trading card.
Look carefully at the card and extract ONLY what you can clearly read.
Respond with ONLY this JSON — no other text:
{"name":"exact card name as printed","number":"set number like 4/102 or 025/198","confidence":0.95}

Rules:
- "name" must be the exact name printed on the card (e.g. "Charizard ex", "Charizard VMAX")
- "number" must be the collector number (bottom of card, e.g. "4/102", "148/165")
- "confidence" is how sure you are that you read both values correctly (0.0 to 1.0)
- If you cannot clearly read a value, use null for that field and lower the confidence
- Do NOT guess or infer — only report what you can see`
          },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${imageBase64}` }
          }
        ]
      }]
    })
  });

  const data = await response.json() as any;
  if (!data.choices?.[0]) throw new Error("Vision API returned no choices");

  const raw = data.choices[0].message.content.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not parse OCR response: ${raw}`);

  return JSON.parse(jsonMatch[0]);
}

async function lookupCard(name: string, number: string | null): Promise<any> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (!apiKey) throw new Error("POKEWALLET_API_KEY is not set");

  const query = number ? `${name} ${number}` : name;

  const res = await fetch(
    `${POKEWALLET_BASE}/search?q=${encodeURIComponent(query)}&limit=5`,
    { headers: { "X-API-Key": apiKey } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PokéWallet search failed (${res.status}): ${err}`);
  }

  const data = await res.json() as any;
  if (!data.results?.length) return null;

  const best = data.results[0];
  const info = best.card_info;
  const tcg = best.tcgplayer;

  // Pick best USD price from TCGPlayer
  const marketValue: number | undefined =
    tcg?.prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.market_price
    ?? tcg?.prices?.[0]?.market_price
    ?? undefined;

  const lowValue: number | undefined =
    tcg?.prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.low_price
    ?? tcg?.prices?.[0]?.low_price
    ?? undefined;

  const highValue: number | undefined =
    tcg?.prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.high_price
    ?? tcg?.prices?.[0]?.high_price
    ?? undefined;

  // Return shape matching CardScanResult
  return {
    cardId: best.id ?? `${info.name}-${info.card_number}`,
    name: info.name,
    set: info.set_name ?? "",
    number: info.card_number ?? null,
    rarity: info.rarity ?? null,
    game: "Pokemon",
    hp: info.hp ?? null,
    stage: info.stage ?? null,
    imageUrl: info.image_url ?? null,
    tcg_url: tcg?.url ?? null,
    marketValue,
    lowValue,
    highValue,
    confidence: 1.0,
  };
}

router.post("/identify-card", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image provided" });
    return;
  }

  try {
    const imageBase64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype;

    // Step 1: OCR
    const ocr = await ocrCard(imageBase64, mimeType);
    console.log("OCR result:", ocr);

    if (ocr.confidence < 0.6 || !ocr.name) {
      res.status(422).json({ error: "Could not read card clearly", confidence: ocr.confidence, ocr });
      return;
    }

    // Step 2: PokéWallet lookup
    const card = await lookupCard(ocr.name, ocr.number);

    if (!card) {
      // Graceful fallback — return OCR data without price
      res.json({
        cardId: `ocr-${Date.now()}`,
        name: ocr.name,
        number: ocr.number,
        set: "",
        game: "Pokemon",
        confidence: ocr.confidence * 0.7,
        marketValue: undefined,
        lowValue: undefined,
        highValue: undefined,
      });
      return;
    }

    res.json(card);
  } catch (err: unknown) {
    console.error("identify-card error:", err);
    res.status(500).json({
      error: "Failed to identify card",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
