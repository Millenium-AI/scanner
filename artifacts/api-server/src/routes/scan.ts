import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const POKEWALLET_BASE = "https://api.pokewallet.io";

async function ocrCard(imageBase64: string, mimeType: string): Promise<{ name: string | null; number: string | null; confidence: number }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a Pokémon TCG card reader. Your ONLY job is to read text printed on the card.\n\nLook at the card image and find:\n1. The card NAME (top of card, e.g. "Charizard ex", "Flygon ex", "Pikachu")\n2. The COLLECTOR NUMBER (bottom of card, e.g. "222/198", "4/102", "148/165")\n\nRespond with ONLY valid JSON, nothing else:\n{"name":"Charizard ex","number":"222/198","confidence":0.95}\n\nStrict rules:\n- Only output the JSON object, no explanation, no markdown\n- "name" = exact name text at the top of the card\n- "number" = the X/Y number at the bottom (e.g. "222/198")\n- If you genuinely cannot read a field, use null\n- "confidence" = 0.0 to 1.0 based on how clearly you can read the text\n- NEVER invent or guess values you cannot see`
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
  console.log("OpenRouter HTTP status:", response.status);
  console.log("OpenRouter response:", JSON.stringify(data, null, 2));

  if (!data.choices?.[0]) {
    throw new Error(`Vision API returned no choices. Status: ${response.status}. Body: ${JSON.stringify(data)}`);
  }

  const raw = data.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not parse OCR response: ${raw}`);

  return JSON.parse(jsonMatch[0]);
}

async function lookupCard(name: string, number: string | null): Promise<any> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (!apiKey) throw new Error("POKEWALLET_API_KEY is not set");

  const query = number ? `${name} ${number}` : name;

  const res = await fetch(
    `${POKEWALLET_BASE}/search?q=${encodeURIComponent(query)}&limit=5`,
    {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      }
    }
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

  return {
    cardId: best.id ?? `${info.name}-${info.card_number}`,
    name: info.name,
    set: info.set_name ?? "",
    number: info.card_number ?? null,
    rarity: info.rarity ?? null,
    game: "Pokemon",
    imageUrl: info.image_url ?? null,
    tcg_url: tcg?.url ?? null,
    marketValue,
    lowValue,
    highValue,
    confidence: 1.0,
  };
}

async function lookupPriceById(cardId: string): Promise<{ cardId: string; marketValue?: number; lowValue?: number; highValue?: number } | null> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `${POKEWALLET_BASE}/cards/${encodeURIComponent(cardId)}`,
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        }
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const tcg = data.tcgplayer;
    return {
      cardId,
      marketValue: tcg?.prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.market_price ?? tcg?.prices?.[0]?.market_price ?? undefined,
      lowValue: tcg?.prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.low_price ?? tcg?.prices?.[0]?.low_price ?? undefined,
      highValue: tcg?.prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.high_price ?? tcg?.prices?.[0]?.high_price ?? undefined,
    };
  } catch {
    return null;
  }
}

router.post("/identify-card", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image provided" });
    return;
  }

  try {
    const imageBase64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype;

    const ocr = await ocrCard(imageBase64, mimeType);
    console.log("OCR result:", ocr);

    if (ocr.confidence < 0.6 || !ocr.name) {
      res.status(422).json({ error: "Could not read card clearly", confidence: ocr.confidence, ocr });
      return;
    }

    const card = await lookupCard(ocr.name, ocr.number);

    if (!card) {
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

// POST /refresh-prices
// Body: { cardIds: string[] }
// Returns: array of { cardId, marketValue?, lowValue?, highValue? }
router.post("/refresh-prices", async (req, res) => {
  const { cardIds } = req.body as { cardIds?: string[] };
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    res.status(400).json({ error: "cardIds must be a non-empty array" });
    return;
  }

  try {
    const results = await Promise.all(
      cardIds.map((id) => lookupPriceById(id))
    );
    // Filter out nulls (lookup failures keep old price on client)
    res.json(results.filter(Boolean));
  } catch (err: unknown) {
    console.error("refresh-prices error:", err);
    res.status(500).json({
      error: "Failed to refresh prices",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
