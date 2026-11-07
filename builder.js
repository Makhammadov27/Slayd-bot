import { findImage } from "./images.js";
import PptxGenJS from "pptxgenjs";

export const THEMES = {
  dark: { name: "🌙 Qorong'u", bg: "0F172A", card: "1E293B", accent: "38BDF8", text: "F1F5F9", muted: "94A3B8" },
  light: { name: "☀️ Yorug'", bg: "FFFFFF", card: "F1F5F9", accent: "2563EB", text: "0F172A", muted: "64748B" },
  purple: { name: "💜 Binafsha", bg: "1E1B4B", card: "312E81", accent: "A78BFA", text: "EEF2FF", muted: "A5B4FC" },
  green: { name: "🌿 Yashil", bg: "052E16", card: "14532D", accent: "4ADE80", text: "F0FDF4", muted: "86EFAC" },
  sunset: { name: "🔥 Sunset", bg: "431407", card: "7C2D12", accent: "FB923C", text: "FFF7ED", muted: "FDBA74" },
};

export async function buildPresentation(data, themeKey, path, author = "") {
  const t = THEMES[themeKey] ?? THEMES.dark;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  const font = "Segoe UI";

  // Title slide
  let s = pptx.addSlide();
  s.background = { color: t.bg };
  s.addShape("rect", { x: 0, y: 0, w: 0.5, h: 7.5, fill: { color: t.accent } });
  s.addText(data.title ?? "Taqdimot", {
    x: 1.2, y: 1.6, w: 11, h: 2.7, fontFace: font, fontSize: 48, bold: true,
    color: t.text, valign: "bottom", fit: "shrink",
  });
  s.addShape("rect", { x: 1.2, y: 4.4, w: 2, h: 0.08, fill: { color: t.accent } });
  if (data.subtitle)
    s.addText(data.subtitle, { x: 1.2, y: 4.65, w: 11, h: 1, fontFace: font, fontSize: 22, color: t.muted, valign: "top" });
  if (author)
    s.addText(author, { x: 1.2, y: 6.4, w: 8, h: 0.5, fontFace: font, fontSize: 16, bold: true, color: t.accent });

  const slides = data.slides ?? [];
  const images = await Promise.all(slides.map((sd) => (sd.image_query ? findImage(sd.image_query) : null)));
  slides.forEach((sd, i) => {
    const sl = pptx.addSlide();
    const img = images[i];
    sl.background = { color: t.bg };
    sl.addShape("rect", { x: 0, y: 0, w: 13.333, h: 1.4, fill: { color: t.card } });
    sl.addShape("rect", { x: 0, y: 0, w: 0.25, h: 1.4, fill: { color: t.accent } });
    sl.addText(sd.title ?? "", {
      x: 0.8, y: 0.15, w: 11.7, h: 1.1, fontFace: font, fontSize: 32, bold: true,
      color: t.text, valign: "middle", fit: "shrink",
    });

    const textW = img ? 7.1 : 11.7;
    const bullets = (sd.bullets ?? []).slice(0, 5);
    const hasHL = !!sd.highlight;
    const listH = hasHL ? 3.9 : 5.0;
    const step = listH / Math.max(bullets.length, 4);
    const size = bullets.length > 4 ? 15 : 16;
    bullets.forEach((b, j) => {
      const y = 1.7 + step * j;
      sl.addShape("ellipse", { x: 0.8, y: y + 0.1, w: 0.2, h: 0.2, fill: { color: t.accent } });
      sl.addText(b, { x: 1.2, y, w: textW - 0.4, h: step, fontFace: font, fontSize: size, color: t.text, valign: "top", fit: "shrink" });
    });

    if (hasHL) {
      sl.addShape("roundRect", { x: 0.8, y: 5.75, w: textW, h: 1.0, rectRadius: 0.12, fill: { color: t.card }, line: { color: t.accent, width: 1.5 } });
      sl.addText(`💡 ${sd.highlight}`, { x: 1.0, y: 5.75, w: textW - 0.4, h: 1.0, fontFace: font, fontSize: 15, bold: true, color: t.accent, valign: "middle", fit: "shrink" });
    }

    if (img) {
      sl.addShape("roundRect", { x: 8.2, y: 1.7, w: 4.5, h: 5.05, rectRadius: 0.15, fill: { color: t.card } });
      sl.addImage({ data: img, x: 8.2, y: 1.7, w: 4.5, h: 5.05, sizing: { type: "cover", w: 4.5, h: 5.05 }, rounding: false });
    }

    sl.addText(`${i + 1}/${slides.length}`, {
      x: 11.8, y: 6.95, w: 1.2, h: 0.4, fontFace: font, fontSize: 12, color: t.muted, align: "right",
    });
  });
  await pptx.writeFile({ fileName: path });
  return path;
}

