import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { FREE_CREDITS } from "./config.js";

const db = new DatabaseSync(fileURLToPath(new URL("./data.db", import.meta.url)));
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT, username TEXT,
  credits INTEGER NOT NULL DEFAULT 0, banned INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS gens(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, topic TEXT, ok INTEGER, ts INTEGER);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, stars INTEGER, credits INTEGER,
  promo TEXT, charge_id TEXT, refunded INTEGER NOT NULL DEFAULT 0, ts INTEGER);
CREATE TABLE IF NOT EXISTS promos(
  code TEXT PRIMARY KEY, percent INTEGER NOT NULL, max_uses INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0, expires INTEGER, active INTEGER NOT NULL DEFAULT 1, created INTEGER);
CREATE TABLE IF NOT EXISTS promo_uses(code TEXT, user_id INTEGER, ts INTEGER, PRIMARY KEY(code, user_id));
`);

try { db.exec("ALTER TABLE promos ADD COLUMN credits INTEGER NOT NULL DEFAULT 0"); } catch {}

const now = () => Date.now();
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

// ---- Foydalanuvchilar
export function upsertUser(from) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ");
  const r = run("UPDATE users SET name=?, username=? WHERE id=?", name, from.username ?? null, from.id);
  if (!r.changes)
    run("INSERT INTO users(id,name,username,credits,created) VALUES(?,?,?,?,?)",
      from.id, name, from.username ?? null, FREE_CREDITS, now());
  return getUser(from.id);
}
export const getUser = (id) => one("SELECT * FROM users WHERE id=?", id);
export const addCredits = (id, n) => run("UPDATE users SET credits=MAX(credits+?,0) WHERE id=?", n, id);
export const useCredit = (id) => run("UPDATE users SET credits=credits-1 WHERE id=? AND credits>0", id).changes > 0;
export const setBanned = (id, v) => run("UPDATE users SET banned=? WHERE id=?", v ? 1 : 0, id).changes > 0;
export const allUserIds = () => all("SELECT id FROM users WHERE banned=0").map((r) => r.id);
export const topUsers = (n = 10) =>
  all(`SELECT u.id,u.name,u.username,
        (SELECT COUNT(*) FROM gens g WHERE g.user_id=u.id AND g.ok=1) AS gens,
        (SELECT COALESCE(SUM(stars),0) FROM payments p WHERE p.user_id=u.id AND p.refunded=0) AS stars
       FROM users u ORDER BY gens DESC LIMIT ?`, n);

// ---- Generatsiya va to'lovlar
export const logGen = (uid, topic, ok) => run("INSERT INTO gens(user_id,topic,ok,ts) VALUES(?,?,?,?)", uid, topic, ok ? 1 : 0, now());
export function logPayment(uid, stars, credits, promo, chargeId) {
  return Number(run("INSERT INTO payments(user_id,stars,credits,promo,charge_id,ts) VALUES(?,?,?,?,?,?)",
    uid, stars, credits, promo ?? null, chargeId ?? null, now()).lastInsertRowid);
}
export const getPayment = (id) => one("SELECT * FROM payments WHERE id=?", id);
export const markRefunded = (id) => run("UPDATE payments SET refunded=1 WHERE id=?", id);

// ---- Promo-kodlar
export function createPromo(code, percent, maxUses = 0, days = 0, credits = 0) {
  const expires = days > 0 ? now() + days * 86400000 : null;
  run(`INSERT INTO promos(code,percent,credits,max_uses,expires,created) VALUES(?,?,?,?,?,?)
       ON CONFLICT(code) DO UPDATE SET percent=excluded.percent,credits=excluded.credits,
       max_uses=excluded.max_uses,expires=excluded.expires,active=1,used=0`,
    code, percent, credits, maxUses, expires, now());
}
export const getPromo = (code) => one("SELECT * FROM promos WHERE code=?", code);
export const listPromos = () => all("SELECT * FROM promos ORDER BY created DESC LIMIT 20");
export const deletePromo = (code) => run("DELETE FROM promos WHERE code=?", code).changes > 0;
export const togglePromo = (code) => run("UPDATE promos SET active=1-active WHERE code=?", code);

export function checkPromo(code, userId) {
  const p = getPromo(code);
  if (!p || !p.active) return { ok: false, reason: "Bunday promo-kod topilmadi yoki o'chirilgan." };
  if (p.expires && p.expires < now()) return { ok: false, reason: "Promo-kod muddati tugagan." };
  if (p.max_uses && p.used >= p.max_uses) return { ok: false, reason: "Promo-kod limiti tugagan." };
  if (one("SELECT 1 FROM promo_uses WHERE code=? AND user_id=?", code, userId))
    return { ok: false, reason: "Siz bu promo-koddan allaqachon foydalangansiz." };
  return { ok: true, promo: p };
}
export function consumePromo(code, userId) {
  const r = run("INSERT OR IGNORE INTO promo_uses(code,user_id,ts) VALUES(?,?,?)", code, userId, now());
  if (r.changes) run("UPDATE promos SET used=used+1 WHERE code=?", code);
}

// ---- Statistika
export function stats() {
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const d = day.getTime();
  return {
    users: one("SELECT COUNT(*) c FROM users").c,
    newToday: one("SELECT COUNT(*) c FROM users WHERE created>=?", d).c,
    gens: one("SELECT COUNT(*) c FROM gens WHERE ok=1").c,
    gensToday: one("SELECT COUNT(*) c FROM gens WHERE ok=1 AND ts>=?", d).c,
    failed: one("SELECT COUNT(*) c FROM gens WHERE ok=0").c,
    payments: one("SELECT COUNT(*) c FROM payments WHERE refunded=0").c,
    stars: one("SELECT COALESCE(SUM(stars),0) s FROM payments WHERE refunded=0").s,
    starsToday: one("SELECT COALESCE(SUM(stars),0) s FROM payments WHERE refunded=0 AND ts>=?", d).s,
    payers: one("SELECT COUNT(DISTINCT user_id) c FROM payments WHERE refunded=0").c,
    banned: one("SELECT COUNT(*) c FROM users WHERE banned=1").c,
  };
}
