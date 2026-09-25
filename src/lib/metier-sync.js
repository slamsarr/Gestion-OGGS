/** Tables cloud Vague 1b (finance / CRM / maintenance) */
export const TABLES_CLOUD_METIER = {
  clients_pro: "clients_professionnels",
  vehicules: "vehicules",
  fournisseurs: "fournisseurs",
  achats: "achats_carburant",
  depenses: "depenses",
  equipements: "equipements",
  maintenances: "maintenances",
  incidents: "incidents",
  sessions_caisse: "sessions_caisse",
  rapports_depotage: "rapports_depotage",
  membres_fidelite: "membres_fidelite",
  transactions_fidelite: "transactions_fidelite",
  recompenses_fidelite: "recompenses_fidelite",
};

/** Tables cloud Vague 2 (opérations terrain) */
export const TABLES_OPS_CLOUD = {
  descentes: "descentes_pompistes",
  prestations_lavage: "prestations_lavage",
  ventes_boutique: "ventes_boutique",
  jauges_cuves: "jauges_cuves_ops",
  produits_boutique: "produits_boutique",
};

export const TABLES_META_METIER = {
  clients_pro: { champCle: "code", station: "station_id" },
  vehicules: { champCle: "immatriculation", station: "station_id" },
  fournisseurs: { champCle: "code", station: "station_id" },
  achats: { champCle: "id", station: "station_id" },
  depenses: { champCle: "id", station: "station_id" },
  equipements: { champCle: "id", station: "station_id" },
  maintenances: { champCle: "id", station: "station_id" },
  incidents: { champCle: "id", station: "station_id" },
  sessions_caisse: { champCle: "id", station: "station_id" },
  descentes: { champCle: "id", station: "station_id" },
  prestations_lavage: { champCle: "id", station: "station_id" },
  ventes_boutique: { champCle: "id", station: "station_id" },
  jauges_cuves: { champCle: "id", station: "station_id" },
  produits_boutique: { champCle: "code", station: "station_id" },
  rapports_depotage: { champCle: "id", station: "station_id" },
  membres_fidelite: { champCle: "id", station: "station_id" },
  transactions_fidelite: { champCle: "id", station: "station_id" },
  recompenses_fidelite: { champCle: "id", station: null },
};

/** Nom Dexie local (peut différer de la clé API) */
export function dexieTable(table) {
  if (table === "sessions_caisse") return "sessions_urssaf";
  return table;
}

/** Résout le nom de table Supabase pour une clé métier */
export function cloudTable(table, tablesMetier = {}) {
  return TABLES_CLOUD_METIER[table] || TABLES_OPS_CLOUD[table] || tablesMetier[table]?.cloud || null;
}

/** Opérations gérées explicitement dans flushQueue (hors CRUD métier générique) */
export const RESERVED_QUEUE_OPS = new Set([
  "upsert_rapport",
  "upsert_quarts",
  "upsert_operation_credit",
]);

/** Parse une opération de file d'attente générique (upsert_depenses, delete_clients_pro, …) */
export function parseQueueMetierOp(op) {
  if (RESERVED_QUEUE_OPS.has(op)) return null;
  const m = op.match(/^(upsert|insert|update|delete)_(.+)$/);
  if (!m) return null;
  return { action: m[1], table: m[2] };
}
