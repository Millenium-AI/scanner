import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const POKEWALLET_BASE = "https://api.pokewallet.io";

// ─── OCR ────────────────────────────────────────────────────────────────────

async function ocrCard(
  imageBase64: string,
  mimeType: string
): Promise<{ name: string | null; number: string | null; game: string; confidence: number }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a trading card game (TCG) card reader. Your ONLY job is to read text printed on the card and identify the game it belongs to.

Supported games:
- "Pokemon" — Pokémon TCG cards (look for HP, evolution stage, energy types)
- "One Piece" — One Piece Card Game cards (look for DON!! cost, Power, Life, card number format OP##-### or EB##-### or ST##-###, colors like Red/Blue/Green/Yellow/Purple/Black)
- "Magic: The Gathering" — MTG cards
- "Yu-Gi-Oh!" — Yu-Gi-Oh! cards
- "Sports" — sports cards (basketball, baseball, football, etc.)

Look at the card image and find:
1. The card NAME
2. The COLLECTOR NUMBER
   - Pokémon: bottom of card, e.g. "222/198" or "148/165"
   - One Piece: e.g. "OP01-001", "EB01-003", "ST01-001"
3. The GAME this card belongs to

Respond with ONLY valid JSON, nothing else:
{"name":"Roronoa Zoro","number":"OP01-001","game":"One Piece","confidence":0.95}

Strict rules:
- Only output the JSON object, no explanation, no markdown
- "name" = exact name text at the top of the card
- "number" = the collector number (format varies by game)
- "game" = one of the supported game strings exactly
- If you genuinely cannot read a field, use null
- "confidence" = 0.0 to 1.0 based on how clearly you can read the text
- NEVER invent or guess values you cannot see`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });

  const data = (await response.json()) as any;
  console.log("OpenRouter HTTP status:", response.status);
  console.log("OpenRouter response:", JSON.stringify(data, null, 2));

  if (!data.choices?.[0]) {
    throw new Error(
      `Vision API returned no choices. Status: ${response.status}. Body: ${JSON.stringify(data)}`
    );
  }

  const raw = data.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not parse OCR response: ${raw}`);

  const parsed = JSON.parse(jsonMatch[0]);
  // Normalise game field — default to Pokemon for backward compat
  return {
    name: parsed.name ?? null,
    number: parsed.number ?? null,
    game: parsed.game ?? "Pokemon",
    confidence: parsed.confidence ?? 0.8,
  };
}

// ─── One Piece lookup ────────────────────────────────────────────────────────

async function lookupOnePieceCard(name: string, number: string | null, apiKey: string): Promise<any> {
  // Try by card number first (most precise), then by name
  const queries = number ? [number, name] : [name];

  for (const q of queries) {
    const res = await fetch(
      `${POKEWALLET_BASE}/op/search?q=${encodeURIComponent(q)}&limit=5`,
      {
        headers: {
          "X-API-Key": apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!res.ok) continue;

    const data = (await res.json()) as any;
    if (!data.data?.length) continue;

    const best = data.data[0];
    const tcg = best.tcgplayer;
    const cm = best.cardmarket;

    const marketValue: number | undefined = tcg?.prices?.market_price ?? cm?.prices?.avg ?? undefined;
    const lowValue: number | undefined = tcg?.prices?.low_price ?? cm?.prices?.low ?? undefined;
    const highValue: number | undefined = tcg?.prices?.high_price ?? undefined;

    return {
      cardId: best.id ?? `op-${best.card_number}`,
      name: best.name,
      set: best.card_number?.split("-")[0] ?? "",  // e.g. "OP01" from "OP01-001"
      number: best.card_number ?? null,
      rarity: best.rarity ?? null,
      game: "One Piece",
      imageUrl: null,  // OP images not exposed via /images yet
      tcg_url: tcg?.url ?? null,
      cardmarket_url: cm?.product_url ?? null,
      marketValue,
      lowValue,
      highValue,
      confidence: 1.0,
    };
  }

  return null;
}

// ─── Pokémon lookup ──────────────────────────────────────────────────────────

async function lookupPokemonCard(name: string, number: string | null, apiKey: string): Promise<any> {
  const query = number ? `${name} ${number}` : name;

  const res = await fetch(
    `${POKEWALLET_BASE}/search?q=${encodeURIComponent(query)}&limit=5`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PokéWallet search failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as any;
  if (!data.results?.length) return null;

  const best = data.results[0];
  const info = best.card_info;
  const tcg = best.tcgplayer;

  const pick = (prices: any[], field: string) =>
    prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.[field] ??
    prices?.[0]?.[field] ??
    undefined;

  return {
    cardId: best.id ?? `${info.name}-${info.card_number}`,
    name: info.name,
    set: info.set_name ?? "",
    number: info.card_number ?? null,
    rarity: info.rarity ?? null,
    game: "Pokemon",
    imageUrl: info.image_url ?? null,
    tcg_url: tcg?.url ?? null,
    marketValue: pick(tcg?.prices, "market_price"),
    lowValue: pick(tcg?.prices, "low_price"),
    highValue: pick(tcg?.prices, "high_price"),
    confidence: 1.0,
  };
}

// ─── Generic dispatcher ──────────────────────────────────────────────────────

async function lookupCard(name: string, number: string | null, game: string): Promise<any> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (!apiKey) throw new Error("POKEWALLET_API_KEY is not set");

  const normalised = game.toLowerCase();
  if (normalised === "one piece") {
    return lookupOnePieceCard(name, number, apiKey);
  }
  return lookupPokemonCard(name, number, apiKey);
}

// ─── Price refresh ───────────────────────────────────────────────────────────

async function lookupPriceById(
  cardId: string
): Promise<{ cardId: string; marketValue?: number; lowValue?: number; highValue?: number } | null> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (!apiKey) return null;

  try {
    // One Piece cards use op_ prefix
    const isOnePiece = cardId.startsWith("op_");
    const url = isOnePiece
      ? `${POKEWALLET_BASE}/op/cards/${encodeURIComponent(cardId)}`
      : `${POKEWALLET_BASE}/cards/${encodeURIComponent(cardId)}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
      },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as any;

    if (isOnePiece) {
      const tcg = data.tcgplayer;
      const cm = data.cardmarket;
      return {
        cardId,
        marketValue: tcg?.prices?.market_price ?? cm?.prices?.avg ?? undefined,
        lowValue: tcg?.prices?.low_price ?? cm?.prices?.low ?? undefined,
        highValue: tcg?.prices?.high_price ?? undefined,
      };
    }

    const tcg = data.tcgplayer;
    const pick = (prices: any[], field: string) =>
      prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.[field] ??
      prices?.[0]?.[field] ??
      undefined;

    return {
      cardId,
      marketValue: pick(tcg?.prices, "market_price"),
      lowValue: pick(tcg?.prices, "low_price"),
      highValue: pick(tcg?.prices, "high_price"),
    };
  } catch {
    return null;
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

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

    const card = await lookupCard(ocr.name, ocr.number, ocr.game);

    if (!card) {
      res.json({
        cardId: `ocr-${Date.now()}`,
        name: ocr.name,
        number: ocr.number,
        set: "",
        game: ocr.game,
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
    const results = await Promise.all(cardIds.map((id) => lookupPriceById(id)));
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
