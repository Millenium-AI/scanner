import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const POKEWALLET_BASE = "https://api.pokewallet.io";

// --- Helpers ---
// API key lives in process.env only. Never returned to client, never in imageUrl.

function pokeHeaders(apiKey: string) {
  return { "X-API-Key": apiKey, Authorization: `Bearer ${apiKey}` };
}

// All card images require Pokewallet auth. We proxy through our backend
// so the key never reaches the Expo app bundle.
function buildImageUrl(cardId: string): string {
  const base =
    process.env.BACKEND_PUBLIC_URL ??
    process.env.EXPO_PUBLIC_BACKEND_URL ??
    "http://localhost:8000";
  return `${base}/card-image/${encodeURIComponent(cardId)}`;
}

// --- Result mappers ---

function mapPokemonResult(best: any): any {
  const info = best.card_info;
  const tcg = best.tcgplayer;
  const cardId: string = best.id;
  const pick = (prices: any[], field: string) =>
    prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.[field] ??
    prices?.[0]?.[field] ??
    undefined;
  return {
    cardId,
    name: info.name,
    set: info.set_name ?? "",
    number: info.card_number ?? null,
    rarity: info.rarity ?? null,
    game: "Pokemon",
    imageUrl: buildImageUrl(cardId),
    tcg_url: tcg?.url ?? null,
    marketValue: pick(tcg?.prices, "market_price"),
    confidence: 1.0,
  };
}

function mapOnePieceResult(best: any): any {
  const tcg = best.tcgplayer;
  const cm = best.cardmarket;
  const cardId: string = best.id ?? `op-${best.card_number}`;
  return {
    cardId,
    name: best.name,
    set: best.card_number?.split("-")[0] ?? "",
    number: best.card_number ?? null,
    rarity: best.rarity ?? null,
    game: "One Piece",
    imageUrl: buildImageUrl(cardId),
    tcg_url: tcg?.url ?? null,
    cardmarket_url: cm?.product_url ?? null,
    marketValue: tcg?.prices?.market_price ?? cm?.prices?.avg ?? undefined,
    confidence: 1.0,
  };
}

// --- OCR ---

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
              text: `You are a TCG card reader. Find:
1. Card NAME (top of card)
2. COLLECTOR NUMBER (Pokemon: e.g. "222/198"; One Piece: e.g. "OP01-001")
3. GAME: "Pokemon", "One Piece", "Magic: The Gathering", "Yu-Gi-Oh!", or "Sports"

Respond ONLY with valid JSON, no markdown:
{"name":"Charizard ex","number":"215/197","game":"Pokemon","confidence":0.95}

Rules: JSON only, use null if unreadable, NEVER guess.`,
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
  if (!data.choices?.[0]) throw new Error(`Vision API error: ${response.status}`);
  const raw = data.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not parse OCR response: ${raw}`);
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    name: parsed.name ?? null,
    number: parsed.number ?? null,
    game: parsed.game ?? "Pokemon",
    confidence: parsed.confidence ?? 0.8,
  };
}

// --- Card lookups (server-side only - API key never leaves backend) ---

async function lookupOnePieceCard(name: string, number: string | null, apiKey: string): Promise<any> {
  const queries = number ? [number, name] : [name];
  for (const q of queries) {
    const res = await fetch(
      `${POKEWALLET_BASE}/op/search?q=${encodeURIComponent(q)}&limit=5`,
      { headers: pokeHeaders(apiKey) }
    );
    if (!res.ok) continue;
    const data = (await res.json()) as any;
    if (!data.data?.length) continue;
    return mapOnePieceResult(data.data[0]);
  }
  return null;
}

async function lookupPokemonCard(name: string, number: string | null, apiKey: string): Promise<any> {
  const query = number ? `${name} ${number}` : name;
  const res = await fetch(
    `${POKEWALLET_BASE}/search?q=${encodeURIComponent(query)}&limit=5`,
    { headers: { ...pokeHeaders(apiKey), "Content-Type": "application/json" } }
  );
  if (!res.ok) throw new Error(`PokeWallet search failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as any;
  if (!data.results?.length) return null;
  return mapPokemonResult(data.results[0]);
}

async function lookupCard(name: string, number: string | null, game: string): Promise<any> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (!apiKey) throw new Error("POKEWALLET_API_KEY is not set");
  if (game.toLowerCase() === "one piece") return lookupOnePieceCard(name, number, apiKey);
  return lookupPokemonCard(name, number, apiKey);
}

// --- Price refresh ---

async function lookupPriceById(
  cardId: string
): Promise<{ cardId: string; marketValue?: number } | null> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (!apiKey) return null;
  try {
    const isOnePiece = cardId.startsWith("op_");
    const url = isOnePiece
      ? `${POKEWALLET_BASE}/op/cards/${encodeURIComponent(cardId)}`
      : `${POKEWALLET_BASE}/cards/${encodeURIComponent(cardId)}`;
    const res = await fetch(url, { headers: pokeHeaders(apiKey) });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (isOnePiece) {
      return { cardId, marketValue: data.tcgplayer?.prices?.market_price ?? data.cardmarket?.prices?.avg };
    }
    const pick = (prices: any[], field: string) =>
      prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.[field] ??
      prices?.[0]?.[field] ?? undefined;
    return { cardId, marketValue: pick(data.tcgplayer?.prices, "market_price") };
  } catch { return null; }
}

// --- Routes ---

// GET /card-image/:id
// Proxies PokeWallet /images/:id with server-side auth. Key never sent to client.
router.get("/card-image/:id", async (req, res) => {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "API key not configured" }); return; }
  const { id } = req.params;
  const size = (req.query.size as string) ?? "high";
  try {
    const upstream = await fetch(
      `${POKEWALLET_BASE}/images/${encodeURIComponent(id)}?size=${size}`,
      { headers: pokeHeaders(apiKey) }
    );
    if (!upstream.ok) { res.status(upstream.status).json({ error: "Image not available" }); return; }
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.error("card-image proxy error:", err);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

// GET /search?q=charizard&game=pokemon&limit=20
// All PokeWallet auth is server-side. Frontend only calls BACKEND_URL with no credentials.
router.get("/search", async (req, res) => {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "POKEWALLET_API_KEY not set" }); return; }

  const q = (req.query.q as string ?? "").trim();
  const game = (req.query.game as string ?? "pokemon").toLowerCase();
  const limit = Math.min(Number(req.query.limit ?? 20), 50);

  if (!q) { res.json([]); return; }

  try {
    if (game === "one piece") {
      const upstream = await fetch(
        `${POKEWALLET_BASE}/op/search?q=${encodeURIComponent(q)}&limit=${limit}`,
        { headers: pokeHeaders(apiKey) }
      );
      if (!upstream.ok) { res.status(upstream.status).json({ error: "Search failed" }); return; }
      const data = (await upstream.json()) as any;
      res.json((data.data ?? []).map(mapOnePieceResult));
    } else {
      const upstream = await fetch(
        `${POKEWALLET_BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`,
        { headers: { ...pokeHeaders(apiKey), "Content-Type": "application/json" } }
      );
      if (!upstream.ok) { res.status(upstream.status).json({ error: "Search failed" }); return; }
      const data = (await upstream.json()) as any;
      res.json((data.results ?? []).map(mapPokemonResult));
    }
  } catch (err: unknown) {
    console.error("search error:", err);
    res.status(500).json({ error: "Search failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /identify-card
router.post("/identify-card", upload.single("image"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No image provided" }); return; }
  try {
    const imageBase64 = req.file.buffer.toString("base64");
    const ocr = await ocrCard(imageBase64, req.file.mimetype);
    console.log("OCR result:", ocr);
    if (ocr.confidence < 0.6 || !ocr.name) {
      res.status(422).json({ error: "Could not read card clearly", confidence: ocr.confidence }); return;
    }
    const card = await lookupCard(ocr.name, ocr.number, ocr.game);
    if (!card) {
      res.json({ cardId: `ocr-${Date.now()}`, name: ocr.name, number: ocr.number, set: "", game: ocr.game, confidence: ocr.confidence * 0.7 });
      return;
    }
    res.json(card);
  } catch (err: unknown) {
    console.error("identify-card error:", err);
    res.status(500).json({ error: "Failed to identify card", message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /refresh-prices
router.post("/refresh-prices", async (req, res) => {
  const { cardIds } = req.body as { cardIds?: string[] };
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    res.status(400).json({ error: "cardIds must be a non-empty array" }); return;
  }
  try {
    const results = await Promise.all(cardIds.map(lookupPriceById));
    res.json(results.filter(Boolean));
  } catch (err: unknown) {
    console.error("refresh-prices error:", err);
    res.status(500).json({ error: "Failed to refresh prices", message: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
