// Wikimedia Commons'dan kalitsiz rasm qidirish (bepul)
const API = "https://commons.wikimedia.org/w/api.php";
const HEADERS = { "User-Agent": "TaqdimotBot/1.0 (telegram presentation bot)" };

async function fetchJson(url, ms = 10000) {
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(ms) });
  return r.json();
}

export async function findImage(query) {
  try {
    const u = new URL(API);
    Object.entries({
      action: "query", format: "json", generator: "search", gsrnamespace: "6",
      gsrsearch: `${query} filetype:bitmap`, gsrlimit: "8",
      prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "1000",
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    const j = await fetchJson(u);
    const pages = Object.values(j.query?.pages ?? {}).sort((a, b) => a.index - b.index);
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png)$/.test(ii.mime)) continue;
      if (ii.width < 600 || ii.height < 400) continue;
      const res = await fetch(ii.thumburl ?? ii.url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      return `${ii.mime};base64,${buf.toString("base64")}`;
    }
  } catch (e) {
    console.error("Rasm topilmadi:", query, e.message);
  }
  return null;
}
