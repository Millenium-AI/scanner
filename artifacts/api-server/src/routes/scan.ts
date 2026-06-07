import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const POKEWALLET_BASE = "https://api.pokewallet.io";
const PTCG_BASE = "https://api.pokemontcg.io/v2";

// --- Helpers ---

function pokeHeaders(apiKey: string) {
  return { "X-API-Key": apiKey, Authorization: `Bearer ${apiKey}` };
}

function buildImageUrl(cardId: string): string {
  const base =
    process.env.BACKEND_PUBLIC_URL ??
    process.env.EXPO_PUBLIC_BACKEND_URL ??
    "http://localhost:8000";
  return `${base}/card-image/${encodeURIComponent(cardId)}`;
}

// In-memory cache to avoid burning API quota on repeated searches
const searchCache = new Map<string, { data: any[]; ts: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function getCached(key: string): any[] | null {
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  return null;
}

function setCache(key: string, data: any[]) {
  searchCache.set(key, { data, ts: Date.now() });
  // Prevent unbounded growth
  if (searchCache.size > 500) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
}

// --- Pokemon TCG API mapper ---
// Uses pokemontcg.io: 20,000 req/day free, images are public CDN (no proxy needed)

function mapPTCGResult(card: any): any {
  const tcg = card.tcgplayer;
  const prices = tcg?.prices ?? {};

  // Pick best available price variant
  const priceVariants = ["holofoil", "reverseHolofoil", "normal", "1stEditionHolofoil"];
  let marketValue: number | undefined;
  let priceType: string | undefined;

  for (const v of priceVariants) {
    if (prices[v]?.market) {
      marketValue = prices[v].market;
      priceType = v;
      break;
    }
  }

  // Map foil type to display label
  const foilLabels: Record<string, string> = {
    holofoil: "Holofoil",
    reverseHolofoil: "Reverse Holofoil",
    normal: "Normal",
    "1stEditionHolofoil": "1st Edition Holofoil",
    "1stEditionNormal": "1st Edition Normal",
  };
  const foilLabel = priceType ? (foilLabels[priceType] ?? priceType) : undefined;

  return {
    cardId: card.id,
    name: card.name,
    set: card.set?.name ?? "",
    setId: card.set?.id ?? "",
    number: card.number ?? null,
    rarity: card.rarity ?? null,
    game: "Pokemon",
    // PTCG image URLs are public CDN - no auth proxy needed, saves PokeWallet quota
    imageUrl: card.images?.small ?? card.images?.large ?? null,
    imageUrlLarge: card.images?.large ?? null,
    tcg_url: tcg?.url ?? null,
    marketValue,
    foilType: foilLabel,
    language: "English",
    confidence: 1.0,
  };
}

// --- PokeWallet result mappers (used for One Piece + scan lookups) ---

function mapPokemonResult(best: any): any {
  const info = best.card_info;
  const tcg = best.tcgplayer;
  const cardId: string = best.id;
  const pick = (prices: any[], field: string) =>
    prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.[field] ??
    prices?.[0]?.[field] ?? undefined;
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
      messages: [{
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
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      }],
    }),
  });

  const data = (await response.json()) as any;
  if (!data.choices?.[0]) throw new Error(`Vision API error: ${response.status}`);
  const raw = data.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not parse OCR: ${raw}`);
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    name: parsed.name ?? null,
    number: parsed.number ?? null,
    game: parsed.game ?? "Pokemon",
    confidence: parsed.confidence ?? 0.8,
  };
}

// --- Scan lookups (PokeWallet - 1 call per scan, acceptable) ---

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
  if (!res.ok) throw new Error(`PokeWallet search failed (${res.status})`);
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

async function lookupPriceById(cardId: string): Promise<{ cardId: string; marketValue?: number } | null> {
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

// GET /card-image/:id  — proxies PokeWallet images (One Piece + scan results)
// Pokemon search results use PTCG public CDN directly, no proxy needed
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
    res.set("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.error("card-image proxy error:", err);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

// GET /search?q=charizard&game=pokemon&lang=en&limit=20
// Pokemon -> Pokemon TCG API (20k/day free, public image CDN, cached 1hr)
// One Piece -> PokeWallet (only option)
router.get("/search", async (req, res) => {
  const q = (req.query.q as string ?? "").trim();
  const game = (req.query.game as string ?? "pokemon").toLowerCase();
  const lang = (req.query.lang as string ?? "en").toLowerCase(); // en | ja | all
  const limit = Math.min(Number(req.query.limit ?? 20), 50);

  if (!q) { res.json([]); return; }

  const cacheKey = `${game}:${lang}:${q}`;
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    if (game === "one piece") {
      const apiKey = process.env.POKEWALLET_API_KEY;
      if (!apiKey) { res.status(500).json({ error: "POKEWALLET_API_KEY not set" }); return; }
      const upstream = await fetch(
        `${POKEWALLET_BASE}/op/search?q=${encodeURIComponent(q)}&limit=${limit}`,
        { headers: pokeHeaders(apiKey) }
      );
      if (!upstream.ok) { res.status(upstream.status).json({ error: "Search failed" }); return; }
      const data = (await upstream.json()) as any;
      const results = (data.data ?? []).map(mapOnePieceResult);
      setCache(cacheKey, results);
      res.json(results);
    } else {
      // Pokemon TCG API - no API key required for basic use, 20k/day
      const ptcgKey = process.env.PTCG_API_KEY ?? ""; // optional but raises rate limit
      const headers: Record<string, string> = {};
      if (ptcgKey) headers["X-Api-Key"] = ptcgKey;

      // Build query: support name + optional lang filter
      let ptcgQ = `name:"${q}"`;
      if (lang === "ja") ptcgQ += " set.series:Japanese";

      const upstream = await fetch(
        `${PTCG_BASE}/cards?q=${encodeURIComponent(ptcgQ)}&orderBy=-set.releaseDate&pageSize=${limit}&select=id,name,number,rarity,set,images,tcgplayer`,
        { headers }
      );
      if (!upstream.ok) { res.status(upstream.status).json({ error: "Search failed" }); return; }
      const data = (await upstream.json()) as any;
      const results = (data.data ?? []).map(mapPTCGResult);
      setCache(cacheKey, results);
      res.json(results);
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
    const ocr = await ocrCard(req.file.buffer.toString("base64"), req.file.mimetype);
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
    res.status(500).json({ error: "Failed to refresh prices", message: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
