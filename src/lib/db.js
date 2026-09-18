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

// VAGUE 1b — §33 : clients professionnels, véhicules, fournisseurs, achats,
// dépenses, équipements/maintenance, incidents, sessions de caisse, audit, notifications.
db.version(4).stores({
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

  clients_pro: "++id, code, nom_entreprise, station_id, telephone, email, created_at",
  vehicules: "++id, client_id, station_id, immatriculation, marque, modele, type_vehicule, carburant, created_at",
  fournisseurs: "++id, nom_fournisseur, station_id, telephone, email, created_at",
  achats: "++id, fournisseur_id, station_id, date_achat, statut, montant_total, created_at",
  depenses: "++id, station_id, categorie_depense, montant, date_depense, statut, created_at",
  equipements: "++id, station_id, type_equipement, nom_equipement, date_installation, etat_equipement, created_at",
  maintenances: "++id, equipement_id, station_id, date_maintenance, cout_maintenance, prestataire, statut_maintenance, created_at",
  incidents: "++id, equipement_id, station_id, description_incident, priorite, statut_resolution, created_at",
  sessions_urssaf: "++id, station_id, date_session, pompiste_id, caisse_ouverte, caisse_cloturee, statut_session, created_at",
  audit_logs: "++id, user_id, user_role, action, module, objet_id, ancienne_valeur, nouvelle_valeur, station_id, created_at",
  notifications: "++id, station_id, type_notif, message, lu, created_at",
});

// VAGUE 2 — §2 & §37 : Référentiel fonctionnel opérationnel complet
// Descentes pompistes, Lavage auto, POS Vente Boutique & Stocks, Rapprochement Cuves, Pannes
db.version(5).stores({
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

  clients_pro: "++id, code, nom_entreprise, station_id, telephone, email, created_at",
  vehicules: "++id, client_id, station_id, immatriculation, marque, modele, type_vehicule, carburant, created_at",
  fournisseurs: "++id, nom_fournisseur, station_id, telephone, email, created_at",
  achats: "++id, fournisseur_id, station_id, date_achat, statut, montant_total, created_at",
  depenses: "++id, station_id, categorie_depense, montant, date_depense, statut, created_at",
  equipements: "++id, station_id, type_equipement, nom_equipement, date_installation, etat_equipement, created_at",
  maintenances: "++id, equipement_id, station_id, date_maintenance, cout_maintenance, prestataire, statut_maintenance, created_at",
  incidents: "++id, equipement_id, station_id, description_incident, priorite, statut_resolution, created_at",
  sessions_urssaf: "++id, station_id, date_session, pompiste_id, caisse_ouverte, caisse_cloturee, statut_session, created_at",
  audit_logs: "++id, user_id, user_role, action, module, objet_id, ancienne_valeur, nouvelle_valeur, station_id, created_at",
  notifications: "++id, station_id, type_notif, message, lu, created_at",

  // Opérations Référentiel Fonctionnel
  descentes: "id, station_id, date, pompiste_id, statut, created_at",
  prestations_lavage: "id, station_id, date, agent, type_vehicule, created_at",
  tarifs_lavage: "id, station_id, code",
  ventes_boutique: "id, station_id, date, vendeur, created_at",
  produits_boutique: "id, station_id, code, categorie, actif",
  cuves_stock: "id, station_id, code_cuve, produit",
  jauges_cuves: "id, station_id, date, cuve_id, produit, created_at",
  pompes_station: "id, station_id, code_pompe",
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
  return Boolean(url && key && !String(url).includes("VOTRE-PROJET") && String(key).startsWith("ey"));
}

/** Mode démo : désactivé en production cloud sauf si VITE_DEMO_MODE=true */
export function isDemoModeEnabled() {
  const flag = import.meta.env.VITE_DEMO_MODE;
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return !isCloudConfigured();
}
