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
      model: "google/gemini-flash-1.5",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a Pokémon TCG card reader. Your ONLY job is to read text printed on the card.

Look at the card image and find:
1. The card NAME (top of card, e.g. "Charizard ex", "Flygon ex", "Pikachu")
2. The COLLECTOR NUMBER (bottom of card, e.g. "222/198", "4/102", "148/165")

Respond with ONLY valid JSON, nothing else:
{"name":"Charizard ex","number":"222/198","confidence":0.95}

Strict rules:
- Only output the JSON object, no explanation, no markdown
- "name" = exact name text at the top of the card
- "number" = the X/Y number at the bottom (e.g. "222/198")
- If you genuinely cannot read a field, use null
- "confidence" = 0.0 to 1.0 based on how clearly you can read the text
- NEVER invent or guess values you cannot see`
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
  // Strip markdown code fences if model wraps in ```json
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

export default router;
