import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const POKEWALLET_BASE = "https://api.pokewallet.io";

// Step 1: Use vision AI only for OCR — extract name + set number from the card
async function ocrCard(imageBase64: string, mimeType: string): Promise<{ name: string; number: string; confidence: number }> {
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

// Step 2: Look up the card on PokéWallet using name + number
async function lookupCard(name: string, number: string | null): Promise<any> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (!apiKey) throw new Error("POKEWALLET_API_KEY is not set");

  // Build query: name + number gives best precision
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

  // Return best match (first result)
  const best = data.results[0];
  const info = best.card_info;
  const tcg = best.tcgplayer;
  const cm = best.cardmarket;

  // Pick the most relevant price
  const tcgPrice = tcg?.prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.market_price
    ?? tcg?.prices?.[0]?.market_price
    ?? null;

  const cmPrice = cm?.prices?.find((p: any) => p.variant_type === "normal" || p.variant_type === "holo")?.trend
    ?? cm?.prices?.[0]?.trend
    ?? null;

  return {
    id: best.id,
    name: info.name,
    set: info.set_name ?? null,
    set_code: info.set_code ?? null,
    number: info.card_number ?? null,
    rarity: info.rarity ?? null,
    game: info.card_type ? "Pokemon" : "One Piece",
    hp: info.hp ?? null,
    stage: info.stage ?? null,
    tcg_url: tcg?.url ?? null,
    cm_url: cm?.product_url ?? null,
    price_usd: tcgPrice,
    price_eur: cmPrice,
    confidence: 1.0, // database match = high confidence
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

    // Step 1: OCR the card
    const ocr = await ocrCard(imageBase64, mimeType);
    console.log("OCR result:", ocr);

    // If confidence too low, return early so app retries
    if (ocr.confidence < 0.6 || !ocr.name) {
      res.status(422).json({
        error: "Could not read card clearly",
        confidence: ocr.confidence,
        ocr,
      });
      return;
    }

    // Step 2: Look up on PokéWallet
    const card = await lookupCard(ocr.name, ocr.number);

    if (!card) {
      // Fall back to raw OCR result if no database match
      res.json({
        name: ocr.name,
        number: ocr.number,
        set: null,
        game: "Pokemon",
        confidence: ocr.confidence * 0.7, // lower confidence — no DB match
        price_usd: null,
        price_eur: null,
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
