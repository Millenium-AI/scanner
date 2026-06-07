import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const POKEWALLET_BASE = "https://api.pokewallet.io";
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

// --- TCGdex cache ---

type TCGdexSetBrief = {
  id: string;
  name: string;
  cardCount?: { total?: number };
};

type TCGdexCardBrief = {
  id: string;
  localId?: string | number;
  name: string;
  set?: { id: string; name: string };
};

let tcgdexCards: TCGdexCardBrief[] | null = null;
let tcgdexSets: TCGdexSetBrief[] | null = null;
let tcgdexCacheTs: number | null = null;

const TCGDEX_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

async function ensureTCGDexCacheLoaded() {
  const now = Date.now();
  if (tcgdexCards && tcgdexSets && tcgdexCacheTs && now - tcgdexCacheTs < TCGDEX_CACHE_TTL_MS) {
    return;
  }

  const [cardsRes, setsRes] = await Promise.all([
    fetch(`${TCGDEX_BASE}/cards`),
    fetch(`${TCGDEX_BASE}/sets`),
  ]);

  if (!cardsRes.ok) throw new Error(`TCGdex /cards failed (${cardsRes.status})`);
  if (!setsRes.ok) throw new Error(`TCGdex /sets failed (${setsRes.status})`);

  tcgdexCards = (await cardsRes.json()) as TCGdexCardBrief[];
  tcgdexSets = (await setsRes.json()) as TCGdexSetBrief[];
  tcgdexCacheTs = now;

  console.log(`[tcgdex] cache loaded: ${tcgdexCards.length} cards, ${tcgdexSets.length} sets`);
}

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

// --- In-memory search cache (1 hour TTL, max 500 entries) ---
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

function mapPokemonResultFromPokeWallet(card: any): any {
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

// --- TCGdex (Pokemon) mapper ---

function mapPokemonResultFromTCGdex(card: any): any {
  const cardId: string = card.id;
  const pricing = card.pricing ?? {};
  const tcg = pricing.tcgplayer ?? {};
  const cm = pricing.cardmarket ?? {};

  const tcgNormal = tcg.normal ?? tcg.holofoil ?? tcg["reverse-holofoil"] ?? {};
  const marketValue: number | undefined =
    typeof tcgNormal.marketPrice === "number"
      ? tcgNormal.marketPrice
      : typeof cm.avg === "number"
        ? cm.avg
        : undefined;

  // Images come directly from TCGdex CDN: card.image + /high/webp
  const imageBare: string | undefined = card.image;
  const imageUrl = imageBare ? `${imageBare}/high/webp` : undefined;

  return {
    cardId,
    name: card.name,
    set: card.set?.name ?? "",
    number: card.localId ?? null,
    rarity: card.rarity ?? null,
    game: "Pokemon",
    imageUrl,
    tcg_url: null,
    marketValue,
    foilType: null,
    confidence: 1.0,
  };
}

// --- OCR ---

async function ocrCard(
  imageBase64: string,
  mimeType: string
): Promise<{ name: string | null; number: string | null; setName: string | null; game: string; confidence: number }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a TCG card reader. Examine the card image carefully.

Extract the following fields:

1. NAME — the card's name printed at the top.

2. COLLECTOR NUMBER — read this precisely:
   - Pokemon: printed in small text at the BOTTOM-LEFT of the card, below the artwork. Format is always "NNN/TTT" (e.g. "215/197", "001/165"). Read BOTH the left number and the right number separated by "/". Do NOT guess — if you cannot clearly see both digits, return null.
   - One Piece: printed at the BOTTOM-RIGHT, format like "OP01-001".

3. SET NAME — the expansion/set name:
   - Pokemon: usually printed at the bottom of the card near the collector number, e.g. "Obsidian Flames", "Paldean Fates", "Temporal Forces". If not visible as text, return null.
   - One Piece: e.g. "Romance Dawn", "Paramount War".

4. GAME — must be EXACTLY "Pokemon" or "One Piece".
   - Pokemon cards have HP, type symbols, evolution stage.
   - One Piece cards have a life/cost number in the top-left circle.

Respond ONLY with strict JSON (no markdown, no extra text):
{"name":"Charizard ex","number":"215/197","setName":"Obsidian Flames","game":"Pokemon","confidence":0.95}

Rules:
- JSON only, no markdown fences.
- "number" must include BOTH sides of the slash for Pokemon (e.g. "215/197"), not just one side.
- Use null for any field you cannot confidently read.
- confidence: float 0–1 reflecting overall certainty across all fields.`,
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
    setName: parsed.setName ?? null,
    game: parsed.game ?? "Pokemon",
    confidence: parsed.confidence ?? 0.8,
  };
}

// --- Rectangle detection ---
// Uses strict card aspect-ratio bounds (portrait 1.28–1.60) plus a minimum
// entropy floor to distinguish a focused card from an empty camera frame.
function detectRectangleInBuffer(buffer: Buffer): boolean {
  let width = 0;
  let height = 0;

  // Parse JPEG dimensions from SOF marker
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
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

  // Cannot parse dimensions — optimistically allow
  if (width === 0 || height === 0) {
    console.log("[detect-rectangle] could not parse dimensions, allowing");
    return true;
  }

  // Strict portrait ratio for a TCG card: 1.28–1.60 (63×88mm = 1.397)
  // Phone camera frames are typically 4:3 (1.33) or 16:9 (1.78).
  // A card filling most of the frame will be portrait within 1.28–1.60.
  // We also accept landscape-rotated cards: ratio 0.625–0.78 (inverse).
  const ratio = height / width;
  const portraitCard = ratio >= 1.28 && ratio <= 1.60;
  const landscapeCard = ratio >= 0.625 && ratio <= 0.78;

  if (!portraitCard && !landscapeCard) {
    console.log(`[detect-rectangle] ratio ${ratio.toFixed(3)} out of card range — skip`);
    return false;
  }

  // Entropy floor: a focused card image compresses poorly (more detail).
  // bytes-per-pixel > 0.15 at quality 0.85 is a reasonable lower bound.
  const bpp = buffer.length / (width * height);
  if (bpp < 0.04) {
    console.log(`[detect-rectangle] bpp ${bpp.toFixed(4)} too low (blank/blurry frame) — skip`);
    return false;
  }

  console.log(`[detect-rectangle] PASS ratio=${ratio.toFixed(3)} bpp=${bpp.toFixed(4)}`);
  return true;
}

// --- Helper: parse Pokemon collector number (e.g. 215/197) ---

function parsePokemonCollectorNumber(raw: string | null): { local?: number; total?: number } {
  if (!raw) return {};
  const m = raw.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return {};
  const local = Number(m[1]);
  const total = Number(m[2]);
  if (Number.isNaN(local) || Number.isNaN(total)) return {};
  return { local, total };
}

function normalizeSetName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// --- Scan lookups ---

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

async function lookupPokemonCardViaTCGdex(name: string, number: string | null, setName: string | null): Promise<any> {
  await ensureTCGDexCacheLoaded();
  if (!tcgdexCards || !tcgdexSets) throw new Error("TCGdex cache not loaded");

  const normalizedName = name.toLowerCase();
  const { local, total } = parsePokemonCollectorNumber(number);

  // 1. Name match (exact then substring)
  let candidates = tcgdexCards.filter(
    (c) => typeof c.name === "string" && c.name.toLowerCase() === normalizedName
  );
  if (candidates.length === 0) {
    candidates = tcgdexCards.filter(
      (c) => typeof c.name === "string" && c.name.toLowerCase().includes(normalizedName)
    );
  }

  if (candidates.length === 0) {
    console.log("[tcgdex] no candidates for name:", normalizedName, "number:", number, "setName:", setName);
    return null;
  }

  // 2. Narrow by local + total (both sides of collector number)
  if (local && total) {
    let matchingSets = tcgdexSets.filter((s) => s.cardCount && s.cardCount.total === total);

    // Additionally filter by set name when OCR provided it
    if (setName) {
      const target = normalizeSetName(setName);
      const bySetName = matchingSets.filter((s) => {
        const norm = normalizeSetName(s.name);
        return norm === target || norm.includes(target) || target.includes(norm);
      });
      if (bySetName.length > 0) {
        matchingSets = bySetName;
      } else {
        console.log("[tcgdex] setName filter yielded 0 results, ignoring setName:", setName);
      }
    }

    const matchingSetIds = new Set(matchingSets.map((s) => s.id));

    const narrowed = candidates.filter((c) => {
      const setId = c.set?.id;
      const localId = c.localId;
      if (!setId || !matchingSetIds.has(setId)) return false;
      if (localId === undefined || localId === null) return false;
      return String(localId) === String(local);
    });

    if (narrowed.length >= 1) {
      if (narrowed.length > 1) {
        console.log("[tcgdex] multiple after set+local filter, picking first",
          { name: normalizedName, number, setName, ids: narrowed.map((c) => c.id) });
      }
      candidates = narrowed;
    } else {
      console.log("[tcgdex] no match after set+local filter, falling back to name-only",
        { name: normalizedName, number, setName });
    }
  } else if (setName && candidates.length > 1) {
    // No collector number but have set name — narrow by set
    const target = normalizeSetName(setName);
    const bySetName = candidates.filter((c) => {
      const norm = normalizeSetName(c.set?.name);
      return norm === target || norm.includes(target) || target.includes(norm);
    });
    if (bySetName.length > 0) candidates = bySetName;
  }

  const cardResume = candidates[0];
  if (!cardResume) return null;

  console.log("[tcgdex] resolved card:", cardResume.id, "set:", cardResume.set?.name);

  const fullRes = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(cardResume.id)}`);
  if (!fullRes.ok) throw new Error(`TCGdex card fetch failed (${fullRes.status})`);
  const fullCard = await fullRes.json();
  return mapPokemonResultFromTCGdex(fullCard);
}

async function lookupCard(name: string, number: string | null, game: string, setName: string | null): Promise<any> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  const normalized = game.toLowerCase();

  if (normalized === "one piece") {
    if (!apiKey) throw new Error("POKEWALLET_API_KEY is not set for One Piece lookups");
    return lookupOnePieceCard(name, number, apiKey);
  }

  return lookupPokemonCardViaTCGdex(name, number, setName);
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

// GET /card-image/:id — proxies PokeWallet images (One Piece + legacy Pokemon)
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
// Called by the client every 3 seconds. Returns { hasRectangle: boolean }.
router.post("/detect-rectangle", upload.single("image"), (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No image provided" }); return; }
  const hasRectangle = detectRectangleInBuffer(req.file.buffer);
  res.json({ hasRectangle });
});

// GET /search
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
      const results = (data.results ?? []).map(mapPokemonResultFromPokeWallet);
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
    console.log("[identify-card] OCR result:", ocr);

    if (!ocr.name) {
      res.status(422).json({ error: "Could not read card name", confidence: ocr.confidence });
      return;
    }

    const OCR_EXTERNAL_THRESHOLD = 0.75;
    if (ocr.confidence < OCR_EXTERNAL_THRESHOLD) {
      console.log(`[identify-card] confidence ${ocr.confidence} below threshold — skipping lookups`);
      res.status(422).json({ error: "Could not read card clearly", confidence: ocr.confidence });
      return;
    }

    if (ocr.name.trim().length < 2) {
      res.status(422).json({ error: "Card name too short", confidence: ocr.confidence });
      return;
    }

    const card = await lookupCard(ocr.name, ocr.number, ocr.game, ocr.setName);
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
