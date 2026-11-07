import { Composer, InlineKeyboard } from "grammy";
import { PACKAGES } from "./config.js";
import { getUser, addCredits, logPayment, checkPromo, consumePromo } from "./db.js";

export const shop = new Composer();

// Foydalanuvchi uchun faol promo-kod (xotirada)
const activePromo = new Map();
const discounted = (stars, percent) => Math.max(1, Math.round((stars * (100 - (percent ?? 0))) / 100));

export function buyMenu(userId) {
  const user = getUser(userId);
  const code = activePromo.get(userId);
  const promo = code ? checkPromo(code, userId) : null;
  const percent = promo?.ok ? promo.promo.percent : 0;
  if (code && !promo?.ok) activePromo.delete(userId);

  const kb = new InlineKeyboard();
  let text = `💳 <b>Kredit sotib olish</b>\n\n💰 Balansingiz: <b>${user.credits}</b> ta taqdimot\n\n`;
  for (const p of PACKAGES) {
    const price = discounted(p.stars, percent);
    const priceTxt = percent ? `<s>${p.stars}</s> ${price}⭐` : `${price}⭐`;
    text += `${p.label}: <b>${p.credits}</b> ta taqdimot — ${priceTxt}\n`;
    kb.text(`${p.label} · ${p.credits} ta · ${price}⭐`, `buy:${p.id}`).row();
  }
  if (percent) text += `\n🎟 Promo-kod <b>${code}</b> faol: <b>-${percent}%</b>`;
  kb.text(percent ? "🎟 Boshqa promo-kod" : "🎟 Promo-kod kiritish", "promo").row();
  kb.text("⬅️ Orqaga", "start");
  return { text, kb };
}

async function showBuy(ctx) {
  const { text, kb } = buyMenu(ctx.from.id);
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => {});
    return ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb }).catch(() =>
      ctx.reply(text, { parse_mode: "HTML", reply_markup: kb }));
  }
  return ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}

shop.command("buy", showBuy);
shop.callbackQuery("buy", showBuy);

shop.command("balance", (ctx) =>
  ctx.reply(`💰 Balansingiz: <b>${getUser(ctx.from.id).credits}</b> ta taqdimot`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("💳 Sotib olish", "buy"),
  }));

shop.callbackQuery("promo", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  ctx.session.step = "promo";
  await ctx.reply("🎟 Promo-kodni yozing (bekor qilish: /cancel):");
});

shop.command("cancel", (ctx) => {
  ctx.session = { step: null };
  return ctx.reply("❌ Bekor qilindi.");
});

// Promo-kod matni
shop.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "promo" || ctx.message.text.startsWith("/")) return next();
  ctx.session.step = null;
  const code = ctx.message.text.trim().toUpperCase();
  const r = checkPromo(code, ctx.from.id);
  if (!r.ok) {
    await ctx.reply(`❌ ${r.reason}`);
  } else if (r.promo.credits > 0) {
    // Kredit beruvchi promo-kod: darhol balansga qo'shiladi
    addCredits(ctx.from.id, r.promo.credits);
    consumePromo(code, ctx.from.id);
    return ctx.reply(
      `🎁 Promo-kod faollashtirildi!\n➕ <b>${r.promo.credits}</b> ta taqdimot krediti qo'shildi.\n💰 Balans: <b>${getUser(ctx.from.id).credits}</b>`,
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🚀 Yangi taqdimot", "new") });
  } else {
    activePromo.set(ctx.from.id, code);
    await ctx.reply(`✅ Promo-kod qabul qilindi: <b>-${r.promo.percent}%</b> chegirma!`, { parse_mode: "HTML" });
  }
  const { text, kb } = buyMenu(ctx.from.id);
  return ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
});

// Hisob-faktura (Telegram Stars)
shop.callbackQuery(/^buy:(\w+)$/, async (ctx) => {
  const pkg = PACKAGES.find((p) => p.id === ctx.match[1]);
  if (!pkg) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery().catch(() => {});
  const code = activePromo.get(ctx.from.id);
  const chk = code ? checkPromo(code, ctx.from.id) : null;
  const percent = chk?.ok ? chk.promo.percent : 0;
  const price = discounted(pkg.stars, percent);
  await ctx.replyWithInvoice(
    `${pkg.label} — ${pkg.credits} ta taqdimot`,
    `${pkg.credits} ta AI taqdimot yaratish krediti${percent ? ` (promo -${percent}%)` : ""}`,
    `${pkg.id}|${chk?.ok ? code : ""}`,
    "XTR",
    [{ label: `${pkg.credits} ta kredit`, amount: price }]
  );
});

shop.on("pre_checkout_query", (ctx) => ctx.answerPreCheckoutQuery(true));

shop.on("message:successful_payment", async (ctx) => {
  const pay = ctx.message.successful_payment;
  const [pkgId, code] = pay.invoice_payload.split("|");
  const pkg = PACKAGES.find((p) => p.id === pkgId);
  if (!pkg) return;
  addCredits(ctx.from.id, pkg.credits);
  logPayment(ctx.from.id, pay.total_amount, pkg.credits, code || null, pay.telegram_payment_charge_id);
  if (code) { consumePromo(code, ctx.from.id); activePromo.delete(ctx.from.id); }
  await ctx.reply(
    `🎉 To'lov qabul qilindi!\n➕ <b>${pkg.credits}</b> ta taqdimot qo'shildi.\n💰 Balans: <b>${getUser(ctx.from.id).credits}</b>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🚀 Yangi taqdimot", "new") }
  );
});

shop.command("paysupport", (ctx) =>
  ctx.reply("💬 To'lov bo'yicha muammo bo'lsa, adminga yozing va to'lov vaqtini ko'rsating. Xato to'lovlar qaytariladi."));
