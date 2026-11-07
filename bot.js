import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Bot, InlineKeyboard, InputFile, session } from "grammy";
import { generateOutline } from "./ai.js";
import { buildPresentation, THEMES } from "./builder.js";
import { upsertUser, getUser, useCredit, addCredits, logGen } from "./db.js";
import { isAdminId } from "./config.js";
import { shop, buyMenu } from "./shop.js";
import { admin } from "./admin.js";

const bot = new Bot(process.env.BOT_TOKEN);
bot.use(session({ initial: () => ({ step: null }) }));

// Foydalanuvchini bazaga yozish va bloklanganlarni to'xtatish
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  const u = upsertUser(ctx.from);
  if (u.banned && !isAdminId(ctx.from.id)) {
    if (ctx.callbackQuery) return ctx.answerCallbackQuery("🚫").catch(() => {});
    return ctx.reply("🚫 Siz bloklangansiz.");
  }
  return next();
});

bot.use(shop);
bot.use(admin);

const LANGS = { uz: "O'zbek tilida", ru: "Rus tilida", en: "Ingliz tilida" };
const LANG_LABELS = { uz: "🇺🇿 O'zbekcha", ru: "🇷🇺 Русский", en: "🇬🇧 English" };

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

function startView(ctx) {
  const u = getUser(ctx.from.id);
  const kb = new InlineKeyboard()
    .text("🚀 Yangi taqdimot", "new").row()
    .text(`💰 Balans: ${u.credits}`, "buy").text("💳 Sotib olish", "buy");
  if (isAdminId(ctx.from.id)) kb.row().text("🛠 Admin panel", "adm:home");
  return {
    text:
      `👋 Salom, <b>${esc(ctx.from.first_name)}</b>!\n\n` +
      `Men AI yordamida <b>PowerPoint taqdimot (.pptx)</b> tayyorlab beraman ✨\n\n` +
      `💰 Balansingiz: <b>${u.credits}</b> ta taqdimot`,
    kb,
  };
}

bot.command("start", (ctx) => {
  ctx.session = { step: null };
  const { text, kb } = startView(ctx);
  return ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
});
bot.callbackQuery("start", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  ctx.session = { step: null };
  const { text, kb } = startView(ctx);
  return ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => {});
});

const askTopic = async (ctx) => {
  if (getUser(ctx.from.id).credits <= 0) {
    const { text, kb } = buyMenu(ctx.from.id);
    return ctx.reply(`😔 Bepul limitingiz tugadi.\n\n${text}`, { parse_mode: "HTML", reply_markup: kb });
  }
  ctx.session = { step: "topic" };
  return ctx.reply("📝 Taqdimot <b>mavzusini</b> yozing:\n<i>Masalan: Sun'iy intellekt kelajagi</i>", {
    parse_mode: "HTML",
  });
};

bot.command("new", askTopic);
bot.callbackQuery("new", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  return askTopic(ctx);
});

bot.on("message:text", async (ctx) => {
  if (ctx.session.step !== "topic") return;
  ctx.session.topic = ctx.message.text.trim().slice(0, 200);
  ctx.session.step = "slides";
  const kb = new InlineKeyboard();
  [5, 7, 10, 12, 15].forEach((n) => kb.text(String(n), `n:${n}`));
  await ctx.reply("📄 Nechta slayd kerak?", { reply_markup: kb });
});

bot.callbackQuery(/^n:(\d+)$/, async (ctx) => {
  if (ctx.session.step !== "slides") return ctx.answerCallbackQuery().catch(() => {});
  ctx.session.slides = Number(ctx.match[1]);
  ctx.session.step = "lang";
  const kb = new InlineKeyboard();
  Object.entries(LANG_LABELS).forEach(([k, v]) => kb.text(v, `l:${k}`));
  await ctx.editMessageText("🌐 Taqdimot tilini tanlang:", { reply_markup: kb });
});

bot.callbackQuery(/^l:(\w+)$/, async (ctx) => {
  if (ctx.session.step !== "lang") return ctx.answerCallbackQuery().catch(() => {});
  ctx.session.lang = ctx.match[1];
  ctx.session.step = "theme";
  const kb = new InlineKeyboard();
  Object.entries(THEMES).forEach(([k, v], i) => {
    kb.text(v.name, `t:${k}`);
    if (i % 2 === 1) kb.row();
  });
  await ctx.editMessageText("🎨 Dizayn uslubini tanlang:", { reply_markup: kb });
});

bot.callbackQuery(/^t:(\w+)$/, async (ctx) => {
  if (ctx.session.step !== "theme") return ctx.answerCallbackQuery().catch(() => {});
  const { topic, slides, lang } = ctx.session;
  const theme = ctx.match[1];
  ctx.session = { step: null };

  // Kredit yechish (xato bo'lsa qaytariladi)
  if (!useCredit(ctx.from.id)) {
    await ctx.answerCallbackQuery().catch(() => {});
    const { text, kb } = buyMenu(ctx.from.id);
    return ctx.editMessageText(`😔 Kredit yetarli emas.\n\n${text}`, { parse_mode: "HTML", reply_markup: kb });
  }
  await ctx.editMessageText("⏳ Taqdimot tayyorlanmoqda... (20-60 soniya)");
  try {
    const outline = await generateOutline(topic, slides, LANGS[lang]);
    const safe = topic.replace(/[^\p{L}\p{N}\- ]/gu, "").slice(0, 40).trim() || "taqdimot";
    const file = path.join(os.tmpdir(), `${safe}-${Date.now()}.pptx`);
    await buildPresentation(outline, theme, file, ctx.from.first_name);
    logGen(ctx.from.id, topic, true);
    await ctx.replyWithDocument(new InputFile(file, `${safe}.pptx`), {
      caption:
        `✅ <b>${esc(outline.title)}</b>\n📄 ${outline.slides?.length ?? 0} ta slayd\n` +
        `💰 Qolgan balans: ${getUser(ctx.from.id).credits}`,
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("🔄 Yana yaratish", "new").text("💳 Sotib olish", "buy"),
    });
    fs.unlink(file, () => {});
    await ctx.deleteMessage().catch(() => {});
  } catch (e) {
    console.error(e);
    addCredits(ctx.from.id, 1); // kreditni qaytarish
    logGen(ctx.from.id, topic, false);
    await ctx.editMessageText("❌ Xatolik yuz berdi. Kreditingiz qaytarildi, qayta urinib ko'ring.", {
      reply_markup: new InlineKeyboard().text("🔄 Qayta", "new"),
    });
  }
});

bot.catch((err) => console.error(err.message ?? err));

// Bot profili: tavsif (yangi foydalanuvchi /start bosishdan oldin ko'radi) va qisqa tavsif
const PROFILE = {
  uz: {
    name: "SLAYD — AI Taqdimot",
    description:
      "🎓 AI yordamida 1 daqiqada professional taqdimot (PowerPoint)!\n\n" +
      "✨ Mavzuni yozing — bot tayyor slaydlarni rasmlar bilan yaratib beradi\n" +
      "🎨 5 xil zamonaviy dizayn\n" +
      "🌐 O'zbek, Rus va Ingliz tillarida\n" +
      "🎁 Yangi foydalanuvchilarga 2 ta BEPUL taqdimot\n\n" +
      "Boshlash uchun START tugmasini bosing 👇",
    short: "🎓 AI yordamida 1 daqiqada tayyor taqdimot (.pptx). Hozir 2 ta bepul sinab ko'ring!",
  },
};
async function setupProfile() {
  // Hammasi o'zbek tilida (til tanlanmagan foydalanuvchilar ham shuni ko'radi)
  await bot.api.setMyName(PROFILE.uz.name).catch((e) => console.error("setMyName", e.description));
  await bot.api.setMyDescription(PROFILE.uz.description).catch((e) => console.error("setMyDescription", e.description));
  await bot.api.setMyShortDescription(PROFILE.uz.short).catch((e) => console.error("setMyShortDescription", e.description));
  // Avval o'rnatilgan ruscha/inglizcha tarjimalarni tozalash
  for (const language_code of ["ru", "en"]) {
    await bot.api.setMyName("", { language_code }).catch(() => {});
    await bot.api.setMyDescription("", { language_code }).catch(() => {});
    await bot.api.setMyShortDescription("", { language_code }).catch(() => {});
  }
}
await setupProfile();

await bot.api.setMyCommands([
  { command: "new", description: "🚀 Yangi taqdimot" },
  { command: "balance", description: "💰 Balans" },
  { command: "buy", description: "💳 Kredit sotib olish" },
  { command: "paysupport", description: "💬 To'lov yordami" },
  { command: "myid", description: "🆔 Mening ID raqamim" },
]);
bot.start({ drop_pending_updates: true });
console.log("Bot ishga tushdi");
