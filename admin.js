import { Composer, InlineKeyboard } from "grammy";
import { isAdminId } from "./config.js";
import * as db from "./db.js";

export const admin = new Composer();
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const H = { parse_mode: "HTML" };
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString("uz-UZ") : "∞");

const panel = () =>
  new InlineKeyboard()
    .text("📊 Statistika", "adm:stats").text("🏆 Top userlar", "adm:top").row()
    .text("🎟 Promo-kodlar", "adm:promos").text("📣 Xabar yuborish", "adm:bc").row()
    .text("❓ Buyruqlar", "adm:help");

const edit = (ctx, text, kb) =>
  ctx.editMessageText(text, { ...H, reply_markup: kb }).catch(() => ctx.reply(text, { ...H, reply_markup: kb }));
const back = new InlineKeyboard().text("⬅️ Panel", "adm:home");

admin.command("myid", (ctx) => ctx.reply(`🆔 Sizning ID: <code>${ctx.from.id}</code>`, H));

// Faqat adminlar
admin.use(async (ctx, next) => {
  const isAdminCmd = ctx.message?.text?.match(/^\/(admin|promo|promocredit|give|ban|unban|user|refund)\b/);
  const isAdminCb = ctx.callbackQuery?.data?.startsWith("adm:");
  const isBcStep = ["broadcast"].includes(ctx.session?.step);
  if (!isAdminCmd && !isAdminCb && !isBcStep) return next();
  if (!isAdminId(ctx.from?.id)) {
    if (ctx.callbackQuery) return ctx.answerCallbackQuery("⛔ Ruxsat yo'q");
    if (isAdminCmd) return ctx.reply("⛔ Bu buyruq faqat adminlar uchun.");
    return next();
  }
  return next();
});

admin.command("admin", (ctx) => ctx.reply("🛠 <b>Admin panel</b>", { ...H, reply_markup: panel() }));
admin.callbackQuery("adm:home", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = null;
  return edit(ctx, "🛠 <b>Admin panel</b>", panel());
});

admin.callbackQuery("adm:stats", async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = db.stats();
  return edit(ctx,
    `📊 <b>Statistika</b>\n\n` +
    `👥 Foydalanuvchilar: <b>${s.users}</b> (bugun +${s.newToday})\n` +
    `🚫 Bloklangan: ${s.banned}\n\n` +
    `📄 Taqdimotlar: <b>${s.gens}</b> (bugun ${s.gensToday})\n` +
    `⚠️ Xatolar: ${s.failed}\n\n` +
    `💰 Daromad: <b>${s.stars}⭐</b> (bugun ${s.starsToday}⭐)\n` +
    `🧾 To'lovlar: ${s.payments} · To'lovchilar: ${s.payers}`,
    new InlineKeyboard().text("🔄 Yangilash", "adm:stats").text("⬅️ Panel", "adm:home"));
});

admin.callbackQuery("adm:top", async (ctx) => {
  await ctx.answerCallbackQuery();
  const rows = db.topUsers(10).map((u, i) =>
    `${i + 1}. ${esc(u.name)}${u.username ? ` @${esc(u.username)}` : ""} · <code>${u.id}</code> · 📄${u.gens} · ${u.stars}⭐`);
  return edit(ctx, `🏆 <b>Eng faol foydalanuvchilar</b>\n\n${rows.join("\n") || "Hali yo'q"}`, back);
});

// ---- Promo-kodlar
function promosView() {
  const list = db.listPromos();
  const kb = new InlineKeyboard();
  let text = "🎟 <b>Promo-kodlar</b>\n\n";
  if (!list.length) text += "Hali yo'q.\n";
  for (const p of list) {
    text += `${p.active ? "🟢" : "🔴"} <code>${esc(p.code)}</code> · ${p.credits > 0 ? `+${p.credits} kredit` : `-${p.percent}%`} · ${p.used}/${p.max_uses || "∞"} · ${fmtDate(p.expires)}\n`;
    kb.text(p.active ? "⏸" : "▶️", `adm:ptog:${p.code}`).text(`🗑 ${p.code}`, `adm:pdel:${p.code}`).row();
  }
  text += "\n➕ Chegirma kodi:\n<code>/promo KOD FOIZ [LIMIT] [KUN]</code>\n🎁 Kredit kodi:\n<code>/promocredit KOD KREDIT [LIMIT] [KUN]</code>\nMasalan: <code>/promocredit BONUS3 3 100 7</code>";
  kb.text("⬅️ Panel", "adm:home");
  return { text, kb };
}
admin.callbackQuery("adm:promos", async (ctx) => {
  await ctx.answerCallbackQuery();
  const { text, kb } = promosView();
  return edit(ctx, text, kb);
});
admin.callbackQuery(/^adm:ptog:(.+)$/, async (ctx) => {
  db.togglePromo(ctx.match[1]);
  await ctx.answerCallbackQuery("✅");
  const { text, kb } = promosView();
  return edit(ctx, text, kb);
});
admin.callbackQuery(/^adm:pdel:(.+)$/, async (ctx) => {
  db.deletePromo(ctx.match[1]);
  await ctx.answerCallbackQuery("🗑 O'chirildi");
  const { text, kb } = promosView();
  return edit(ctx, text, kb);
});

admin.command("promocredit", (ctx) => {
  const [code, credits, max = "0", days = "0"] = ctx.match.trim().split(/\s+/);
  const cr = Number(credits);
  if (!code || !(cr >= 1))
    return ctx.reply("Format: /promocredit KOD KREDIT [LIMIT] [KUN]\nMasalan: /promocredit BONUS3 3 100 7");
  db.createPromo(code.toUpperCase(), 0, Number(max) || 0, Number(days) || 0, cr);
  return ctx.reply(`✅ Kredit kodi yaratildi: ${code.toUpperCase()} (+${cr} kredit, limit ${Number(max) || "∞"}, ${Number(days) ? days + " kun" : "muddatsiz"})`);
});

admin.command("promo", (ctx) => {
  const [code, percent, max = "0", days = "0"] = ctx.match.trim().split(/\s+/);
  const pc = Number(percent);
  if (!code || !(pc >= 1 && pc <= 100))
    return ctx.reply("Format: /promo KOD FOIZ [LIMIT] [KUN]\nMasalan: /promo YANGI30 30 100 7");
  db.createPromo(code.toUpperCase(), pc, Number(max) || 0, Number(days) || 0);
  return ctx.reply(`✅ Promo-kod yaratildi: ${code.toUpperCase()} (-${pc}%, limit ${Number(max) || "∞"}, ${Number(days) ? days + " kun" : "muddatsiz"})`);
});

// ---- Foydalanuvchilar bilan ishlash
admin.command("give", (ctx) => {
  const [id, n] = ctx.match.trim().split(/\s+/).map(Number);
  if (!id || !n || !db.getUser(id)) return ctx.reply("Format: /give USER_ID SON (foydalanuvchi bazada bo'lishi kerak)");
  db.addCredits(id, n);
  ctx.api.sendMessage(id, `🎁 Sizga <b>${n}</b> ta taqdimot krediti berildi!`, H).catch(() => {});
  return ctx.reply(`✅ ${id} balansi: ${db.getUser(id).credits}`);
});
admin.command("ban", (ctx) => ctx.reply(db.setBanned(Number(ctx.match), true) ? "🚫 Bloklandi" : "Topilmadi. Format: /ban USER_ID"));
admin.command("unban", (ctx) => ctx.reply(db.setBanned(Number(ctx.match), false) ? "✅ Blokdan chiqarildi" : "Topilmadi. Format: /unban USER_ID"));
admin.command("user", (ctx) => {
  const u = db.getUser(Number(ctx.match));
  if (!u) return ctx.reply("Topilmadi. Format: /user USER_ID");
  return ctx.reply(
    `👤 <b>${esc(u.name)}</b> ${u.username ? "@" + esc(u.username) : ""}\n🆔 <code>${u.id}</code>\n💰 Kredit: ${u.credits}\n` +
    `🚫 Blok: ${u.banned ? "ha" : "yo'q"}\n📅 Qo'shilgan: ${fmtDate(u.created)}`, H);
});
admin.command("refund", async (ctx) => {
  const pay = db.getPayment(Number(ctx.match));
  if (!pay || pay.refunded || !pay.charge_id) return ctx.reply("To'lov topilmadi yoki allaqachon qaytarilgan. Format: /refund TOLOV_ID");
  try {
    await ctx.api.refundStarPayment(pay.user_id, pay.charge_id);
    db.markRefunded(pay.id);
    db.addCredits(pay.user_id, -pay.credits);
    ctx.api.sendMessage(pay.user_id, `↩️ ${pay.stars}⭐ to'lovingiz qaytarildi.`).catch(() => {});
    return ctx.reply(`✅ Qaytarildi: ${pay.stars}⭐ (user ${pay.user_id})`);
  } catch (e) {
    return ctx.reply(`❌ Xato: ${e.description ?? e.message}`);
  }
});

admin.callbackQuery("adm:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  return edit(ctx,
    "❓ <b>Admin buyruqlari</b>\n\n" +
    "/promo KOD FOIZ [LIMIT] [KUN] — chegirma kodi\n/promocredit KOD KREDIT [LIMIT] [KUN] — kredit kodi\n" +
    "/give ID SON — kredit berish\n" +
    "/user ID — foydalanuvchi ma'lumoti\n" +
    "/ban ID, /unban ID — bloklash\n" +
    "/refund TOLOV_ID — Stars qaytarish", back);
});

// ---- Ommaviy xabar (broadcast)
admin.callbackQuery("adm:bc", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "broadcast";
  return edit(ctx,
    "📣 Yubormoqchi bo'lgan xabarni yuboring (matn, rasm yoki video — hammasi bo'ladi).\nBekor qilish: /cancel",
    back);
});
admin.on("message", async (ctx, next) => {
  if (ctx.session.step !== "broadcast" || ctx.message.text?.startsWith("/")) return next();
  ctx.session.step = null;
  ctx.session.bc = ctx.message.message_id;
  await ctx.reply(`👆 Shu xabar <b>${db.allUserIds().length}</b> ta foydalanuvchiga yuboriladi. Tasdiqlaysizmi?`, {
    ...H,
    reply_markup: new InlineKeyboard().text("✅ Yuborish", "adm:bcgo").text("❌ Bekor", "adm:home"),
  });
});
admin.callbackQuery("adm:bcgo", async (ctx) => {
  const mid = ctx.session.bc;
  if (!mid) return ctx.answerCallbackQuery("Xabar topilmadi");
  ctx.session.bc = null;
  await ctx.answerCallbackQuery("Yuborilmoqda...");
  const ids = db.allUserIds();
  await ctx.editMessageText(`⏳ Yuborilmoqda: 0/${ids.length}`);
  let ok = 0, fail = 0;
  for (const id of ids) {
    try { await ctx.api.copyMessage(id, ctx.chat.id, mid); ok++; } catch { fail++; }
    await new Promise((r) => setTimeout(r, 50)); // Telegram limiti ~30 xabar/s
  }
  await ctx.editMessageText(`✅ Tugadi!\n📬 Yetkazildi: ${ok}\n⚠️ Yetmadi: ${fail}`, { reply_markup: back });
});
