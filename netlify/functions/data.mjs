import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("finanzas-pareja:" + text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const empty = () => ({
  names: { ella: "Ella", el: "Él" },
  ella: [],
  el: [],
  updatedAt: Date.now()
});

export default async (req) => {
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") || "").trim().toLowerCase();
  if (code.length < 4) return json({ error: "El código debe tener al menos 4 caracteres" }, 400);

  const store = getStore({ name: "finanzas-pareja", consistency: "strong" });
  const key = "pareja-" + (await sha(code));
  const data = (await store.get(key, { type: "json" })) || empty();

  if (req.method === "GET") return json(data);
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const { op, person, tx, id, names } = body || {};
  const valid = p => p === "ella" || p === "el";

  if (op === "add" && valid(person) && tx && typeof tx.amount === "number") {
    const clean = {
      id: String(tx.id || crypto.randomUUID()).slice(0, 60),
      type: tx.type === "ingreso" ? "ingreso" : "gasto",
      amount: Math.abs(tx.amount),
      category: String(tx.category || "Otros").slice(0, 40),
      note: String(tx.note || "").slice(0, 140),
      date: String(tx.date || "").slice(0, 10),
      createdAt: Date.now()
    };
    data[person] = data[person].filter(t => t.id !== clean.id);
    data[person].push(clean);
  } else if (op === "delete" && valid(person) && id) {
    data[person] = data[person].filter(t => t.id !== id);
  } else if (op === "names" && names) {
    data.names = {
      ella: String(names.ella || "Ella").slice(0, 30),
      el: String(names.el || "Él").slice(0, 30)
    };
  } else {
    return json({ error: "Operación inválida" }, 400);
  }

  data.updatedAt = Date.now();
  await store.setJSON(key, data);
  return json(data);
};

export const config = { path: "/api/data" };
