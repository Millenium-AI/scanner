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
  const cardId: string = card.id ?? `op-${card.card_number}`;
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
  console.log("[tcgdex] image bare:", imageBare, "-> imageUrl:", imageUrl);

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

// --- Pokemon lookup via TCGdex — returns ALL matching variants ---

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

  // If setName narrows it to a single card, skip multi-variant logic
  let pool = candidates;
  if (setName && candidates.length > 1) {
    const target = normalizeStr(setName);
    const bySet = candidates.filter((c: any) => {
      const norm = normalizeStr(c.set?.name);
      return norm === target || norm.includes(target) || target.includes(norm);
    });
    if (bySet.length > 0) pool = bySet;
  }

  // Fetch full card data for all candidates in parallel (cap at 10 to avoid hammering)
  const fetched = await Promise.all(
    pool.slice(0, 10).map(async (c: any) => {
      try {
        const r = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(c.id)}`);
        if (!r.ok) return null;
        return mapPokemonResultFromTCGdex(await r.json(), setName);
      } catch {
        return null;
      }
    })
  );

  return fetched.filter(Boolean);
}

// --- One Piece lookup — returns ALL matching variants ---

async function lookupOnePieceVariants(name: string, number: string | null, apiKey: string): Promise<any[]> {
  const queries = number ? [number, name] : [name];
  for (const q of queries) {
    const res = await fetch(
      `${POKEWALLET_BASE}/op/search?q=${encodeURIComponent(q)}&limit=10`,
      { headers: pokeHeaders(apiKey) }
    );
    if (!res.ok) continue;
    const data = (await res.json()) as any;
    if (!data.data?.length) continue;
    // Group by card_number — same number = same print, multiple entries = variants
    const results: any[] = data.data.map(mapOnePieceResult);
    return results;
  }
  return [];
}

// --- Unified lookup — always returns an array ---

async function lookupCardVariants(
  name: string,
  number: string | null,
  game: string,
  setName: string | null
): Promise<any[]> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  if (game.toLowerCase() === "one piece") {
    if (!apiKey) throw new Error("POKEWALLET_API_KEY not set for One Piece");
    return lookupOnePieceVariants(name, number, apiKey);
  }
  return lookupPokemonVariantsViaTCGdex(name, number, setName);
}

// --- Price refresh ---

async function lookupPriceById(cardId: string): Promise<{ cardId: string; marketValue?: number } | null> {
  const apiKey = process.env.POKEWALLET_API_KEY;
  try {
    if (!cardId.startsWith("op_") && !cardId.startsWith("op-")) {
      const res = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(cardId)}`);
      if (res.ok) {
        const data = await res.json() as any;
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
    return { cardId, marketValue: isOP
      ? (data.tcgplayer?.prices?.market_price ?? data.cardmarket?.prices?.avg)
      : pick(data.tcgplayer?.prices, "market_price") };
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

    const variants = await lookupCardVariants(ocr.name, ocr.number, ocr.game, ocr.setName);

    // No match at all — return OCR-only stub
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

    // Always return { variants: [...] } — client decides whether to show picker
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
