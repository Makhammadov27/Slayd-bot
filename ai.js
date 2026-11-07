import { GoogleGenAI } from "@google/genai";

// Asosiy model va zaxira model (birinchisi ishlamasa ikkinchisi ishlatiladi)
const MODELS = ["gemini-4-argon", "gemini-3.8-flash", "gemini-3.5-flash"];

export async function generateOutline(topic, slides, lang) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `Siz professional taqdimot dizayneri va mavzu bo'yicha mutaxassissiz.
Mavzu: "${topic}". Shu mavzuda aynan ${slides} ta slaydli zamonaviy, boy mazmunli taqdimot tuzing.
Til: ${lang}. Faqat JSON qaytaring:
{"title": "...", "subtitle": "...", "slides": [{"title": "...", "bullets": ["..."], "highlight": "...", "image_query": "..."}]}
Qoidalar:
- aynan ${slides} ta slayd (sarlavha slaydi alohida, hisobga kirmaydi);
- birinchi slayd kirish, oxirgisi xulosa;
- har slaydda 4-5 punkt, har biri 15-25 so'zli to'liq, ma'lumotli jumla: aniq fakt, raqam, sana, nom yoki misol bilan;
- "highlight": slaydning asosiy xulosasi yoki qiziqarli statistika, 1 ta jumla (maks. 20 so'z);
- "image_query": slaydga mos rasm uchun 2-3 so'zli INGLIZCHA qidiruv (masalan "solar panels", "Tashkent skyline"); aniq narsa/joy bo'lsin, mavhum so'z emas;
- slayd sarlavhalari qisqa va jozibali (maks. 6 so'z);
- takrorlanish va quruq gaplar bo'lmasin.`;
  let lastErr;
  for (const model of MODELS) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", httpOptions: { timeout: 60000 } },
      });
      console.log("Model:", model);
      return JSON.parse(r.text);
    } catch (e) {
      console.error(`${model} xato:`, e.message?.slice(0, 150));
      lastErr = e;
    }
  }
  throw lastErr;
}


