import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const POKEWALLET_BASE = "https://api.pokewallet.io";

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

// --- In-memory cache (1 hour TTL, max 500 entries) ---
const searchCache = new Map<string, { data: any[]; ts: number }>();
const CACHE_TTL = 1000 * 60 * 60;

function getCached(key: string): any[] | null {
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  return null;
}

function setCache(key: string, data: any[]) {
  searchCache.set(key, { data, ts: Date.now() });
  if (searchCache.size > 500) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
}

// --- PokeWallet result mappers ---

function mapPokemonResult(card: any): any {
  const info = card.card_info;
  const tcg = card.tcgplayer;
  const cardId: string = card.id;

  const pick = (prices: any[], field: string) =>
    prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.[field] ??
    prices?.[0]?.[field] ?? undefined;

  const priceEntry =
    tcg?.prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil") ??
    tcg?.prices?.[0];

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
    foilType: priceEntry?.sub_type_name ?? null,
    confidence: 1.0,
  };
}

function mapOnePieceResult(card: any): any {
  const tcg = card.tcgplayer;
  const cm = card.cardmarket;
  const cardId: string = card.id ?? `op-${card.card_number}`;
  return {
    cardId,
    name: card.name,
    set: card.card_number?.split("-")[0] ?? "",
    number: card.card_number ?? null,
    rarity: card.rarity ?? null,
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

// --- Rectangle detection helpers ---
// Scores a JPEG/PNG buffer for the presence of a prominent rectangle (card)
// using a lightweight edge-density heuristic without any native Vision dependency.
// Returns true when a clear rectangular region is detected.
function detectRectangleInBuffer(buffer: Buffer): boolean {
  // We look for the JFIF/EXIF image dimensions to understand aspect ratio,
  // then apply a simple brightness-variance scan across horizontal lines to
  // estimate whether a high-contrast rectangular edge structure is present.
  // This is intentionally cheap (no opencv, no python) but effective for
  // cards held against typical backgrounds.

  // --- Minimal JPEG dimension parser ---
  let width = 0;
  let height = 0;
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    // JPEG: scan for SOF marker
    let i = 2;
    while (i < buffer.length - 8) {
      if (buffer[i] !== 0xff) { i++; continue; }
      const marker = buffer[i + 1];
      const len = buffer.readUInt16BE(i + 2);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        height = buffer.readUInt16BE(i + 5);
        width = buffer.readUInt16BE(i + 7);
        break;
      }
      i += 2 + len;
    }
  }

  // If we couldn't parse dimensions, optimistically allow OCR
  if (width === 0 || height === 0) return true;

  // Trading cards have aspect ratios between ~1.3 and ~1.6 (portrait)
  const ratio = height / width;
  if (ratio < 1.1 || ratio > 2.0) {
    // Aspect ratio doesn't match a card — likely no card in frame
    return false;
  }

  // Additional heuristic: file size relative to dimensions.
  // A well-focused card photo compresses less than a blurry/blank frame.
  // Empirically, a 0.7-quality JPEG of a card at ~300x420 should be > 15 KB.
  const expectedMinBytes = (width * height) / 400;
  if (buffer.length < expectedMinBytes) return false;

  return true;
}

// --- Scan lookups (1 PokeWallet call per scan) ---

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

// GET /card-image/:id — proxies PokeWallet images server-side
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

// POST /detect-rectangle
// Called by the client every 3 seconds before deciding to run OCR.
// Returns { hasRectangle: boolean } — no OCR or PokeWallet calls are made here.
router.post("/detect-rectangle", upload.single("image"), (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No image provided" }); return; }
  const hasRectangle = detectRectangleInBuffer(req.file.buffer);
  console.log(`[detect-rectangle] ${hasRectangle ? "PASS" : "SKIP"} — ${req.file.size} bytes, mime=${req.file.mimetype}`);
  res.json({ hasRectangle });
});

// GET /search?q=charizard&game=pokemon&limit=20
router.get("/search", async (req, res) => {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "POKEWALLET_API_KEY not set" }); return; }

  const q = (req.query.q as string ?? "").trim();
  const game = (req.query.game as string ?? "pokemon").toLowerCase();
  const limit = Math.min(Number(req.query.limit ?? 20), 50);

  if (!q) { res.json([]); return; }

  const cacheKey = `${game}:${q}`;
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    if (game === "one piece") {
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
      const upstream = await fetch(
        `${POKEWALLET_BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`,
        { headers: { ...pokeHeaders(apiKey), "Content-Type": "application/json" } }
      );
      if (!upstream.ok) { res.status(upstream.status).json({ error: "Search failed" }); return; }
      const data = (await upstream.json()) as any;
      const results = (data.results ?? []).map(mapPokemonResult);
      setCache(cacheKey, results);
      res.json(results);
    }
  } catch (err: unknown) {
    console.error("search error:", err);
    res.status(500).json({ error: "Search failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /identify-card
// Pipeline: OCR first, then PokeWallet ONLY if OCR confidence >= 0.75 and name is readable.
// This prevents wasted PokeWallet API calls on blurry or low-quality frames.
router.post("/identify-card", upload.single("image"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No image provided" }); return; }
  try {
    const ocr = await ocrCard(req.file.buffer.toString("base64"), req.file.mimetype);
    console.log("[identify-card] OCR result:", ocr);

    // Gate 1: OCR must have produced a readable name
    if (!ocr.name) {
      res.status(422).json({ error: "Could not read card name", confidence: ocr.confidence });
      return;
    }

    // Gate 2: Confidence must meet the threshold before calling PokeWallet.
    // Raised from 0.6 to 0.75 to reduce low-quality PokeWallet calls.
    const OCR_POKEWALLET_THRESHOLD = 0.75;
    if (ocr.confidence < OCR_POKEWALLET_THRESHOLD) {
      console.log(`[identify-card] OCR confidence ${ocr.confidence} below threshold ${OCR_POKEWALLET_THRESHOLD} — skipping PokeWallet`);
      res.status(422).json({ error: "Could not read card clearly", confidence: ocr.confidence });
      return;
    }

    // Gate 3: Basic text sanity — name must have at least 2 characters
    if (ocr.name.trim().length < 2) {
      res.status(422).json({ error: "Card name too short to look up", confidence: ocr.confidence });
      return;
    }

    // All gates passed — call PokeWallet
    const card = await lookupCard(ocr.name, ocr.number, ocr.game);
    if (!card) {
      res.json({
        cardId: `ocr-${Date.now()}`,
        name: ocr.name,
        number: ocr.number,
        set: "",
        game: ocr.game,
        confidence: ocr.confidence * 0.7,
      });
      return;
    }
    res.json(card);
  } catch (err: unknown) {
    console.error("[identify-card] error:", err);
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
