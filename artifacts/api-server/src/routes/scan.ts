import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const POKEWALLET_BASE = "https://api.pokewallet.io";
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

// --- Helpers ---

function pokeHeaders(apiKey: string) {
  return { "X-API-Key": apiKey, Authorization: `Bearer ${apiKey}` };
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

// --- PokeWallet result mappers (One Piece only) ---

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
    imageUrl: cardId,           // stored as opaque id; proxied via /card-image if needed
    tcg_url: tcg?.url ?? null,
    cardmarket_url: cm?.product_url ?? null,
    marketValue: tcg?.prices?.market_price ?? cm?.prices?.avg ?? undefined,
    confidence: 1.0,
  };
}

// --- TCGdex (Pokemon) mapper ---
// Full card object from GET /v2/en/cards/{id}
// pricing.tcgplayer keys: normal, holofoil, reverse-holofoil, 1st-edition, unlimited
// pricing.cardmarket keys: avg, low, trend, avg-holo …
// image is a bare CDN URL; append /high/webp for full-size image.

function mapPokemonResultFromTCGdex(card: any): any {
  const cardId: string = card.id;
  const pricing = card.pricing ?? {};
  const tcg = pricing.tcgplayer ?? {};
  const cm  = pricing.cardmarket ?? {};

  // Prefer normal market price, then holofoil, then cardmarket avg
  const tcgVariant =
    tcg.normal ??
    tcg.holofoil ??
    tcg["reverse-holofoil"] ??
    tcg.unlimited ??
    {};

  const foilType: string | null =
    tcg.holofoil     ? "Holofoil"         :
    tcg["reverse-holofoil"] ? "Reverse Holofoil" :
    tcg.normal        ? "Normal"           :
    null;

  const marketValue: number | undefined =
    typeof tcgVariant.marketPrice === "number"
      ? tcgVariant.marketPrice
      : typeof cm.avg === "number"
        ? cm.avg
        : undefined;

  const imageBare: string | undefined = card.image;
  const imageUrl = imageBare ? `${imageBare}/high/webp` : undefined;

  return {
    cardId,
    name: card.name,
    set: card.set?.name ?? "",
    number: String(card.localId ?? ""),
    rarity: card.rarity ?? null,
    game: "Pokemon",
    imageUrl,
    tcg_url: null,
    marketValue,
    foilType,
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
function detectRectangleInBuffer(buffer: Buffer): boolean {
  let width = 0;
  let height = 0;

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
        width  = buffer.readUInt16BE(i + 7);
        break;
      }
      i += 2 + len;
    }
  }

  if (width === 0 || height === 0) {
    console.log("[detect-rectangle] could not parse dimensions, allowing");
    return true;
  }

  const ratio = height / width;
  const portraitCard  = ratio >= 1.28 && ratio <= 1.60;
  const landscapeCard = ratio >= 0.625 && ratio <= 0.78;

  if (!portraitCard && !landscapeCard) {
    console.log(`[detect-rectangle] ratio ${ratio.toFixed(3)} out of card range — skip`);
    return false;
  }

  const bpp = buffer.length / (width * height);
  if (bpp < 0.04) {
    console.log(`[detect-rectangle] bpp ${bpp.toFixed(4)} too low — skip`);
    return false;
  }

  console.log(`[detect-rectangle] PASS ratio=${ratio.toFixed(3)} bpp=${bpp.toFixed(4)}`);
  return true;
}

// --- Helper: parse Pokemon collector number ---

function parsePokemonCollectorNumber(raw: string | null): { local: string | null } {
  if (!raw) return { local: null };
  const m = raw.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return { local: null };
  return { local: m[1] };   // left side only — this is localId in TCGdex
}

function normalizeSetName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

/**
 * TCGdex Pokemon lookup — 2 API calls maximum, no bulk cache.
 *
 * Flow:
 *  1a. If OCR gave us a localId (left side of NNN/TTT):
 *      GET /en/cards?name=eq:{name}&localId={local}
 *      → exact name + exact localId filter server-side
 *
 *  1b. If no localId (OCR missed the number):
 *      GET /en/cards?name={name}
 *      → laxist name search, then narrow by setName client-side
 *
 *  2.  GET /en/cards/{id}  — full card with pricing
 */
async function lookupPokemonCardViaTCGdex(
  name: string,
  number: string | null,
  setName: string | null
): Promise<any> {
  const { local } = parsePokemonCollectorNumber(number);

  let cardId: string | null = null;

  // --- Step 1a: exact name + localId search ---
  if (local) {
    const url = `${TCGDEX_BASE}/cards?name=eq:${encodeURIComponent(name)}&localId=${encodeURIComponent(local)}`;
    console.log("[tcgdex] step1a search:", url);
    const res = await fetch(url);

    if (res.ok) {
      const cards = (await res.json()) as Array<{ id: string; localId: string | number; name: string; set?: { id: string; name: string } }>;
      console.log("[tcgdex] step1a results:", cards.length);

      if (cards.length === 1) {
        cardId = cards[0].id;
      } else if (cards.length > 1) {
        // Multiple cards with same name + localId across different sets.
        // Narrow by setName if OCR provided it.
        let best = cards[0];
        if (setName) {
          const target = normalizeSetName(setName);
          const bySet = cards.find((c) => {
            const norm = normalizeSetName(c.set?.name);
            return norm === target || norm.includes(target) || target.includes(norm);
          });
          if (bySet) best = bySet;
        }
        console.log("[tcgdex] step1a picked:", best.id, "set:", best.set?.name);
        cardId = best.id;
      }
    }
  }

  // --- Step 1b: laxist name search fallback ---
  if (!cardId) {
    const url = `${TCGDEX_BASE}/cards?name=${encodeURIComponent(name)}`;
    console.log("[tcgdex] step1b search:", url);
    const res = await fetch(url);

    if (!res.ok) {
      console.warn("[tcgdex] step1b failed:", res.status);
      return null;
    }

    const cards = (await res.json()) as Array<{ id: string; localId: string | number; name: string; set?: { id: string; name: string } }>;
    console.log("[tcgdex] step1b results:", cards.length);

    if (cards.length === 0) return null;

    // Narrow by localId if we have it (in case eq: search above returned 0)
    let candidates = cards;
    if (local) {
      const byLocal = candidates.filter((c) => String(c.localId) === local);
      if (byLocal.length > 0) candidates = byLocal;
    }

    // Narrow by set name
    if (setName && candidates.length > 1) {
      const target = normalizeSetName(setName);
      const bySet = candidates.filter((c) => {
        const norm = normalizeSetName(c.set?.name);
        return norm === target || norm.includes(target) || target.includes(norm);
      });
      if (bySet.length > 0) candidates = bySet;
    }

    cardId = candidates[0].id;
    console.log("[tcgdex] step1b picked:", cardId);
  }

  if (!cardId) return null;

  // --- Step 2: fetch full card with pricing ---
  const fullUrl = `${TCGDEX_BASE}/cards/${encodeURIComponent(cardId)}`;
  console.log("[tcgdex] step2 fetch:", fullUrl);
  const fullRes = await fetch(fullUrl);
  if (!fullRes.ok) {
    console.warn("[tcgdex] step2 failed:", fullRes.status);
    return null;
  }

  const fullCard = await fullRes.json();
  console.log("[tcgdex] step2 got card:", fullCard.id, "pricing:", !!fullCard.pricing);
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

// --- Price refresh (TCGdex for Pokemon, PokeWallet for One Piece) ---

async function lookupPriceById(cardId: string): Promise<{ cardId: string; marketValue?: number } | null> {
  try {
    const isOnePiece = cardId.startsWith("op_") || cardId.startsWith("op-");
    if (isOnePiece) {
      const apiKey = process.env.POKEWALLET_API_KEY;
      if (!apiKey) return null;
      const res = await fetch(`${POKEWALLET_BASE}/op/cards/${encodeURIComponent(cardId)}`, { headers: pokeHeaders(apiKey) });
      if (!res.ok) return null;
      const data = (await res.json()) as any;
      return { cardId, marketValue: data.tcgplayer?.prices?.market_price ?? data.cardmarket?.prices?.avg };
    }

    // Pokemon — re-fetch full card from TCGdex for latest pricing
    const res = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(cardId)}`);
    if (!res.ok) return null;
    const card = await res.json();
    const mapped = mapPokemonResultFromTCGdex(card);
    return { cardId, marketValue: mapped.marketValue };
  } catch {
    return null;
  }
}

// --- Routes ---

// GET /card-image/:id — proxies PokeWallet images for One Piece cards
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
router.post("/detect-rectangle", upload.single("image"), (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No image provided" }); return; }
  const hasRectangle = detectRectangleInBuffer(req.file.buffer);
  res.json({ hasRectangle });
});

// GET /search
router.get("/search", async (req, res) => {
  const apiKey = process.env.POKEWALLET_API_KEY;
  const q = (req.query.q as string ?? "").trim();
  const game = (req.query.game as string ?? "pokemon").toLowerCase();
  const limit = Math.min(Number(req.query.limit ?? 20), 50);

  if (!q) { res.json([]); return; }

  const cacheKey = `${game}:${q}`;
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    if (game === "one piece") {
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
      // Pokemon — search TCGdex directly
      const upstream = await fetch(
        `${TCGDEX_BASE}/cards?name=${encodeURIComponent(q)}&pagination:itemsPerPage=${limit}`
      );
      if (!upstream.ok) { res.status(upstream.status).json({ error: "Search failed" }); return; }
      const cards = (await upstream.json()) as Array<{ id: string; localId: string | number; name: string; image?: string; set?: { id: string; name: string } }>;
      const results = cards.map((c) => ({
        cardId: c.id,
        name: c.name,
        set: c.set?.name ?? "",
        number: String(c.localId ?? ""),
        game: "Pokemon",
        imageUrl: c.image ? `${c.image}/high/webp` : undefined,
      }));
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
