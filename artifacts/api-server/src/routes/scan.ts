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

function buildProxyImageUrl(cardId: string): string {
  const base =
    process.env.BACKEND_PUBLIC_URL ??
    process.env.EXPO_PUBLIC_BACKEND_URL ??
    "http://localhost:8000";
  return `${base}/card-image/${encodeURIComponent(cardId)}`;
}

function buildMarketplaceUrls(
  name: string,
  setName: string | null,
  number: string | null
) {
  const tcgTerms = [name, setName, number].filter(Boolean).join(" ");
  const ebayTerms = [name, setName, number, "pokemon card"].filter(Boolean).join(" ");
  return {
    tcg_url: `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(tcgTerms)}&view=grid`,
    ebay_url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(ebayTerms)}&_sacat=2536&LH_Sold=1`,
  };
}

// --- In-memory caches ---

const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// Search result cache (query-level, 500 entries)
const searchCache = new Map<string, { data: any[]; ts: number }>();

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

// One Piece set-level cache — keyed by set code e.g. "OP06"
// One fetch covers ALL cards in the set; subsequent scans of any card in that set cost 0 API calls
const opSetCache = new Map<string, { cards: any[]; ts: number }>();

async function getOpSetCards(setCode: string, apiKey: string): Promise<any[]> {
  const hit = opSetCache.get(setCode);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    console.log(`[op-set-cache] HIT ${setCode} (${hit.cards.length} cards)`);
    return hit.cards;
  }
  console.log(`[op-set-cache] MISS ${setCode} — fetching from PokéWallet`);
  const res = await fetch(
    `${POKEWALLET_BASE}/op/sets/${encodeURIComponent(setCode)}?limit=300`,
    { headers: pokeHeaders(apiKey) }
  );
  if (!res.ok) {
    console.warn(`[op-set-cache] set fetch failed for ${setCode}: ${res.status}`);
    return [];
  }
  const data = (await res.json()) as any;
  const cards: any[] = data.data ?? data.cards ?? [];
  console.log(`[op-set-cache] cached ${cards.length} cards for ${setCode}`);
  opSetCache.set(setCode, { cards, ts: Date.now() });
  if (opSetCache.size > 50) {
    const oldest = opSetCache.keys().next().value;
    if (oldest) opSetCache.delete(oldest);
  }
  return cards;
}

// Card-level cache for TCGdex individual fetches
const cardCache = new Map<string, { data: any; ts: number }>();

async function fetchTCGdexCard(id: string): Promise<any | null> {
  const hit = cardCache.get(id);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  try {
    const r = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const data = await r.json();
    cardCache.set(id, { data, ts: Date.now() });
    if (cardCache.size > 1000) {
      const oldest = cardCache.keys().next().value;
      if (oldest) cardCache.delete(oldest);
    }
    return data;
  } catch {
    return null;
  }
}

// --- Result mappers ---

function mapPokemonResultFromPokeWallet(card: any): any {
  const info = card.card_info;
  const tcg = card.tcgplayer;
  const cardId: string = card.id;

  const pick = (prices: any[], field: string) =>
    prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.[field] ??
    prices?.[0]?.[field] ?? undefined;

  const name: string = info.name;
  const setName: string = info.set_name ?? "";
  const number: string | null = info.card_number ?? null;
  const { tcg_url, ebay_url } = buildMarketplaceUrls(name, setName, number);

  return {
    cardId,
    name,
    set: setName,
    number,
    rarity: info.rarity ?? null,
    game: "Pokemon",
    imageUrl: buildProxyImageUrl(cardId),
    tcg_url: tcg?.url ?? tcg_url,
    ebay_url,
    marketValue: pick(tcg?.prices, "market_price"),
    confidence: 1.0,
  };
}

function mapOnePieceResult(card: any): any {
  const tcg = card.tcgplayer;
  const cm = card.cardmarket;
  const cardId: string = card.id;
  const name: string = card.name;
  const setName: string = card.card_number?.split("-")[0] ?? "";
  const number: string | null = card.card_number ?? null;
  const { ebay_url } = buildMarketplaceUrls(name, setName, number);

  return {
    cardId,
    name,
    set: setName,
    number,
    rarity: card.rarity ?? null,
    subType: card.sub_type_name ?? null,
    game: "One Piece",
    imageUrl: buildProxyImageUrl(cardId),
    tcg_url: tcg?.url ?? null,
    cardmarket_url: cm?.product_url ?? null,
    ebay_url,
    marketValue: tcg?.prices?.market_price ?? cm?.prices?.avg ?? undefined,
    confidence: 1.0,
  };
}

function mapPokemonResultFromTCGdex(card: any, ocrSetName: string | null): any {
  const cardId: string = card.id;
  const pricing = card.pricing ?? {};
  const tcg = pricing.tcgplayer ?? {};
  const cm = pricing.cardmarket ?? {};

  const tcgVariant = tcg.normal ?? tcg.holofoil ?? tcg["reverse-holofoil"] ?? {};
  const marketValue: number | undefined =
    typeof tcgVariant.marketPrice === "number"
      ? tcgVariant.marketPrice
      : typeof cm.avg === "number"
        ? cm.avg
        : undefined;

  const imageBare: string | undefined = card.image;
  const imageUrl = imageBare ? `${imageBare}/high.webp` : undefined;

  const name: string = card.name;
  const setName: string = card.set?.name ?? ocrSetName ?? "";
  const number: string | null = card.localId ? String(card.localId) : null;
  const { tcg_url, ebay_url } = buildMarketplaceUrls(name, setName, number);

  return {
    cardId,
    name,
    set: setName,
    number,
    rarity: card.rarity ?? null,
    game: "Pokemon",
    imageUrl,
    tcg_url,
    ebay_url,
    marketValue,
    cardmarket_trend: typeof cm.trend === "number" ? cm.trend : undefined,
    cardmarket_avg7: typeof cm.avg7 === "number" ? cm.avg7 : undefined,
    confidence: 1.0,
  };
}

// --- OCR ---

interface OcrResult {
  name: string | null;
  number: string | null;
  setName: string | null;
  game: string;
  language: "Japanese" | "English";
  finish: "Foil" | "Normal";
  confidence: number;
}

async function ocrCard(imageBase64: string, mimeType: string): Promise<OcrResult> {
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

5. LANGUAGE — must be EXACTLY "Japanese" or "English".
   - "Japanese" if the card contains Japanese characters (hiragana, katakana, or kanji) in the card name or body text.
   - "English" otherwise.

6. FINISH — must be EXACTLY "Foil" or "Normal".
   - "Foil" if the card surface shows holographic shimmer, rainbow foil, or metallic shine.
   - "Normal" if the card has a flat matte or gloss finish with no shimmer.

Respond ONLY with strict JSON (no markdown, no extra text):
{"name":"Charizard ex","number":"215/197","setName":"Obsidian Flames","game":"Pokemon","language":"English","finish":"Normal","confidence":0.95}

Rules:
- JSON only, no markdown fences.
- "number" must include BOTH sides of the slash for Pokemon (e.g. "215/197"), not just one side.
- Use null for any field you cannot confidently read (except language, finish, game — always return a value for these).
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
    language: parsed.language === "Japanese" ? "Japanese" : "English",
    finish: parsed.finish === "Foil" ? "Foil" : "Normal",
    confidence: parsed.confidence ?? 0.8,
  };
}

// --- Parse collector number ---

function parsePokemonCollectorNumber(raw: string | null): { local?: number; total?: number } {
  if (!raw) return {};
  const m = raw.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return {};
  const local = Number(m[1]);
  const total = Number(m[2]);
  if (Number.isNaN(local) || Number.isNaN(total)) return {};
  return { local, total };
}

function normalizeStr(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// --- Pokemon lookup via TCGdex ---

async function lookupPokemonVariantsViaTCGdex(
  name: string,
  number: string | null,
  setName: string | null
): Promise<any[]> {
  const { local } = parsePokemonCollectorNumber(number);

  let candidates: any[] = [];

  if (local) {
    const url = `${TCGDEX_BASE}/cards?name=eq:${encodeURIComponent(name)}&localId=${local}`;
    console.log("[tcgdex] search:", url);
    const res = await fetch(url);
    if (res.ok) {
      candidates = await res.json();
      console.log(`[tcgdex] name+localId results: ${candidates.length}`);
    }
  }

  if (candidates.length === 0) {
    const url = `${TCGDEX_BASE}/cards?name=eq:${encodeURIComponent(name)}`;
    console.log("[tcgdex] fallback name-only:", url);
    const res = await fetch(url);
    if (res.ok) {
      candidates = await res.json();
      console.log(`[tcgdex] name-only results: ${candidates.length}`);
    }
  }

  if (candidates.length === 0) {
    const url = `${TCGDEX_BASE}/cards?name=like:${encodeURIComponent(name)}`;
    console.log("[tcgdex] fallback like:", url);
    const res = await fetch(url);
    if (res.ok) {
      candidates = await res.json();
      console.log(`[tcgdex] like results: ${candidates.length}`);
    }
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    console.log("[tcgdex] no candidates for:", name, number, setName);
    return [];
  }

  let pool = candidates;
  if (setName && candidates.length > 1) {
    const target = normalizeStr(setName);
    const bySet = candidates.filter((c: any) => {
      const norm = normalizeStr(c.set?.name);
      return norm === target || norm.includes(target) || target.includes(norm);
    });
    if (bySet.length > 0) pool = bySet;
  }

  const fetched = await Promise.all(
    pool.slice(0, 3).map(async (c: any) => {
      try {
        const data = await fetchTCGdexCard(c.id);
        if (!data) return null;
        return mapPokemonResultFromTCGdex(data, setName);
      } catch {
        return null;
      }
    })
  );

  return fetched.filter(Boolean);
}

// --- One Piece lookup — set-level cache + in-memory filtering ---

async function lookupOnePieceVariants(
  name: string,
  number: string | null,
  apiKey: string,
  language: "Japanese" | "English",
  finish: "Foil" | "Normal"
): Promise<any[]> {
  const setCode = number?.match(/^([A-Z]{2}\d{2})-/)?.[1] ?? null;

  let rawCards: any[] = [];

  if (setCode) {
    const allSetCards = await getOpSetCards(setCode, apiKey);
    rawCards = allSetCards.filter((c: any) =>
      c.card_number?.toUpperCase() === number?.toUpperCase()
    );
    console.log(`[op] ${number} in set ${setCode}: ${rawCards.length} variants before filtering`);
  }

  if (rawCards.length === 0) {
    const q = number ?? name;
    const res = await fetch(
      `${POKEWALLET_BASE}/op/search?q=${encodeURIComponent(q)}&limit=20`,
      { headers: pokeHeaders(apiKey) }
    );
    if (res.ok) {
      const data = (await res.json()) as any;
      rawCards = (data.data ?? []).filter((c: any) =>
        c.id &&
        c.name &&
        c.card_number &&
        /^[A-Z]{2}\d{2}-\d{3}/.test(c.card_number) &&
        (c.tcgplayer?.prices || c.cardmarket?.prices)
      );
    }
  }

  if (rawCards.length === 0) return [];

  const isJapanese = (c: any): boolean => {
    const n = (c.name ?? "") + (c.clean_name ?? "");
    return /[\u3040-\u30ff\u4e00-\u9fff]/.test(n) || n.includes("(JP)") || n.includes("Japanese");
  };

  let filtered = rawCards;
  const jpCards = filtered.filter(isJapanese);
  const enCards = filtered.filter(c => !isJapanese(c));

  if (language === "Japanese" && jpCards.length > 0) {
    filtered = jpCards;
    console.log(`[op] language=Japanese → ${filtered.length} variants`);
  } else if (language === "English" && enCards.length > 0) {
    filtered = enCards;
    console.log(`[op] language=English → ${filtered.length} variants`);
  }

  const foilCards = filtered.filter(c => c.sub_type_name === "Foil");
  const normalCards = filtered.filter(c => c.sub_type_name === "Normal");

  if (finish === "Foil" && foilCards.length > 0) {
    filtered = foilCards;
    console.log(`[op] finish=Foil → ${filtered.length} variants`);
  } else if (finish === "Normal" && normalCards.length > 0) {
    filtered = normalCards;
    console.log(`[op] finish=Normal → ${filtered.length} variants`);
  }

  filtered.sort((a, b) => {
    const aVal = a.tcgplayer?.prices?.market_price ?? a.cardmarket?.prices?.avg ?? 0;
    const bVal = b.tcgplayer?.prices?.market_price ?? b.cardmarket?.prices?.avg ?? 0;
    return bVal - aVal;
  });

  console.log(`[op] final variant count for ${number}: ${filtered.length}`);
  return filtered.map(mapOnePieceResult);
}

// --- Unified lookup ---

async function lookupCardVariants(
  name: string,
  number: string | null,
  game: string,
  setName: string | null,
  language: "Japanese" | "English",
  finish: "Foil" | "Normal"
): Promise<any[]> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (game.toLowerCase() === "one piece") {
    if (!apiKey) throw new Error("POKEWALLET_API_KEY not set for One Piece");
    return lookupOnePieceVariants(name, number, apiKey, language, finish);
  }
  return lookupPokemonVariantsViaTCGdex(name, number, setName);
}

// --- Price refresh ---

async function lookupPriceById(cardId: string): Promise<{ cardId: string; marketValue?: number } | null> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  try {
    if (!cardId.startsWith("op_") && !cardId.startsWith("op-")) {
      const data = await fetchTCGdexCard(cardId);
      if (data) {
        const tcg = data.pricing?.tcgplayer ?? {};
        const cm = data.pricing?.cardmarket ?? {};
        const tcgVariant = tcg.normal ?? tcg.holofoil ?? tcg["reverse-holofoil"] ?? {};
        const marketValue =
          typeof tcgVariant.marketPrice === "number" ? tcgVariant.marketPrice :
          typeof cm.avg === "number" ? cm.avg : undefined;
        return { cardId, marketValue };
      }
    }
    if (!apiKey) return null;
    const isOP = cardId.startsWith("op_") || cardId.startsWith("op-");
    const url = isOP
      ? `${POKEWALLET_BASE}/op/cards/${encodeURIComponent(cardId)}`
      : `${POKEWALLET_BASE}/cards/${encodeURIComponent(cardId)}`;
    const res = await fetch(url, { headers: pokeHeaders(apiKey) });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const pick = (prices: any[], field: string) =>
      prices?.find((p: any) => p.sub_type_name === "Normal" || p.sub_type_name === "Holofoil")?.[field] ??
      prices?.[0]?.[field] ?? undefined;
    return {
      cardId, marketValue: isOP
        ? (data.tcgplayer?.prices?.market_price ?? data.cardmarket?.prices?.avg)
        : pick(data.tcgplayer?.prices, "market_price")
    };
  } catch { return null; }
}

// --- Routes ---

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
      const upstream = await fetch(`${POKEWALLET_BASE}/op/search?q=${encodeURIComponent(q)}&limit=${limit}`, { headers: pokeHeaders(apiKey) });
      if (!upstream.ok) { res.status(upstream.status).json({ error: "Search failed" }); return; }
      const data = (await upstream.json()) as any;
      const results = (data.data ?? []).map(mapOnePieceResult);
      setCache(cacheKey, results);
      res.json(results);
    } else {
      const upstream = await fetch(`${POKEWALLET_BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`, { headers: { ...pokeHeaders(apiKey), "Content-Type": "application/json" } });
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

router.post("/identify-card", upload.single("image"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No image provided" }); return; }
  try {
    const ocr = await ocrCard(req.file.buffer.toString("base64"), req.file.mimetype);
    console.log("[identify-card] OCR:", ocr);
    if (!ocr.name) { res.status(422).json({ error: "Could not read card name", confidence: ocr.confidence }); return; }
    if (ocr.confidence < 0.75) { res.status(422).json({ error: "Could not read card clearly", confidence: ocr.confidence }); return; }
    if (ocr.name.trim().length < 2) { res.status(422).json({ error: "Card name too short", confidence: ocr.confidence }); return; }

    const variants = await lookupCardVariants(
      ocr.name, ocr.number, ocr.game, ocr.setName, ocr.language, ocr.finish
    );

    if (variants.length === 0) {
      const { tcg_url, ebay_url } = buildMarketplaceUrls(ocr.name, ocr.setName, ocr.number);
      res.json({
        variants: [{
          cardId: `ocr-${Date.now()}`,
          name: ocr.name,
          number: ocr.number,
          set: ocr.setName ?? "",
          game: ocr.game,
          tcg_url,
          ebay_url,
          confidence: ocr.confidence * 0.7,
        }],
      });
      return;
    }

    res.json({ variants });
  } catch (err: unknown) {
    console.error("[identify-card] error:", err);
    res.status(500).json({ error: "Failed to identify card", message: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/refresh-prices", async (req, res) => {
  const { cardIds } = req.body as { cardIds?: string[] };
  if (!Array.isArray(cardIds) || cardIds.length === 0) { res.status(400).json({ error: "cardIds required" }); return; }
  try {
    const results = await Promise.all(cardIds.map(lookupPriceById));
    res.json(results.filter(Boolean));
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to refresh prices", message: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
