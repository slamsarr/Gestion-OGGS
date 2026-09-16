import Dexie from "dexie";
import { DEMO_USERS, referentielFromSeed } from "./seed";

export const db = new Dexie("ogss_reseau");
db.version(2).stores({
  meta: "key",
  users: "id, email",
  rapports: "id, station, date, statut, maj_le, client_uuid, [station+date]",
  mouvements: "++id, station_id, produit_id, date_mvt, rapport_id",
  livraisons: "id, station_id, date_livraison",
  jauges: "++id, station_id, date_jauge, produit",
  operations_credit: "++id, client_code, station_id, date_op",
  pompistes: "id, station_id, nom",
  quarts: "++id, date, rapport_id, pompiste_id",
  queue: "++id, created_at",
});

db.version(3).stores({
  meta: "key",
  users: "id, email",
  rapports: "id, station, date, statut, maj_le, client_uuid, [station+date]",
  mouvements: "++id, station_id, produit_id, date_mvt, rapport_id",
  livraisons: "id, station_id, date_livraison",
  jauges: "++id, station_id, date_jauge, produit",
  operations_credit: "++id, client_code, station_id, date_op",
  pompistes: "id, station_id, nom",
  quarts: "++id, date, rapport_id, pompiste_id",
  queue: "++id, created_at",
});

export async function ensureLocalSeed() {
  const seeded = await db.meta.get("seeded");
  const users = DEMO_USERS.map(({ password: _p, ...u }) => u);
  await db.users.bulkPut(users);
  if (seeded) return;
  await db.meta.put({ key: "seeded", at: Date.now() });
  await db.meta.put({ key: "ref", value: referentielFromSeed() });
}

export async function getLocalRef() {
  await ensureLocalSeed();
  const row = await db.meta.get("ref");
  return row?.value || referentielFromSeed();
}

export async function setLocalRef(ref) {
  await db.meta.put({ key: "ref", value: ref });
}

export function isCloudConfigured() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key && !String(url).includes("VOTRE-PROJET"));
}
