// Sozlamalar: narxlar, bepul limit, adminlar
export const FREE_CREDITS = 1; // yangi foydalanuvchiga beriladigan bepul taqdimotlar

// Telegram Stars (⭐) da narxlar. Xohlagancha o'zgartiring.
export const PACKAGES = [
  { id: "p5", credits: 5, stars: 25, label: "🥉 Start" },
  { id: "p15", credits: 12, stars: 50, label: "🥈 Pro" },
  { id: "p50", credits: 50, stars: 150, label: "🥇 Max" },
];

export const ADMIN_IDS = (process.env.ADMIN_IDS ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter(Boolean);

export const isAdminId = (id) => ADMIN_IDS.includes(Number(id));
