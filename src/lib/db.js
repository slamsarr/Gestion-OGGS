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

// VAGUE 2+ — Rapports de dépotage cuves & Programme de fidélisation clients
db.version(6).stores({
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

  descentes: "id, station_id, date, pompiste_id, statut, created_at",
  prestations_lavage: "id, station_id, date, agent, type_vehicule, created_at",
  tarifs_lavage: "id, station_id, code",
  ventes_boutique: "id, station_id, date, vendeur, created_at",
  produits_boutique: "id, station_id, code, categorie, actif",
  cuves_stock: "id, station_id, code_cuve, produit",
  jauges_cuves: "id, station_id, date, cuve_id, produit, created_at",
  pompes_station: "id, station_id, code_pompe",

  // Nouveaux modules Dépotage & Fidélisation
  rapports_depotage: "id, station_id, date_depotage, produit, numero_bl, created_at",
  membres_fidelite: "id, station_id, numero_carte, telephone, nom_complet, statut, created_at",
  transactions_fidelite: "++id, membre_id, station_id, date_op, type, created_at",
  recompenses_fidelite: "id, code, categorie, points_requis, actif",
});

// VAGUE 2++ — Suivi détaillé et règlement des bons de carburant par le gérant
db.version(7).stores({
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

  descentes: "id, station_id, date, pompiste_id, statut, created_at",
  prestations_lavage: "id, station_id, date, agent, type_vehicule, created_at",
  tarifs_lavage: "id, station_id, code",
  ventes_boutique: "id, station_id, date, vendeur, created_at",
  produits_boutique: "id, station_id, code, categorie, actif",
  cuves_stock: "id, station_id, code_cuve, produit",
  jauges_cuves: "id, station_id, date, cuve_id, produit, created_at",
  pompes_station: "id, station_id, code_pompe",

  rapports_depotage: "id, station_id, date_depotage, produit, numero_bl, created_at",
  membres_fidelite: "id, station_id, numero_carte, telephone, nom_complet, statut, created_at",
  transactions_fidelite: "++id, membre_id, station_id, date_op, type, created_at",
  recompenses_fidelite: "id, code, categorie, points_requis, actif",

  // Gestion des bons de carburant & règlements partiels/totaux
  bons_carburant: "id, station_id, client_code, numero_bon, date, statut_paiement, created_at",
});

// VAGUE 3 — Facturation Officielle certifiée OHADA / DGID Sénégal avec QR code
db.version(8).stores({
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

  descentes: "id, station_id, date, pompiste_id, statut, created_at",
  prestations_lavage: "id, station_id, date, agent, type_vehicule, created_at",
  tarifs_lavage: "id, station_id, code",
  ventes_boutique: "id, station_id, date, vendeur, created_at",
  produits_boutique: "id, station_id, code, categorie, actif",
  cuves_stock: "id, station_id, code_cuve, produit",
  jauges_cuves: "id, station_id, date, cuve_id, produit, created_at",
  pompes_station: "id, station_id, code_pompe",

  rapports_depotage: "id, station_id, date_depotage, produit, numero_bl, created_at",
  membres_fidelite: "id, station_id, numero_carte, telephone, nom_complet, statut, created_at",
  transactions_fidelite: "++id, membre_id, station_id, date_op, type, created_at",
  recompenses_fidelite: "id, code, categorie, points_requis, actif",
  bons_carburant: "id, station_id, client_code, numero_bon, date, statut_paiement, created_at",

  // Factures officielles certifiées OHADA
  factures: "id, station_id, client_code, numero_facture, date_emission, statut, created_at",
});

// VAGUE 4 — Centre de Lavage Automobile Professionnel
// Packs configurables, workflow par statut, baies, services, promos, bons B2B
db.version(9).stores({
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

  descentes: "id, station_id, date, pompiste_id, statut, created_at",
  // prestations_lavage étendue : ajout index statut, pack_id, baie_id, client_id (backward-compatible)
  prestations_lavage: "id, station_id, date, agent, type_vehicule, statut, pack_id, baie_id, client_id, created_at",
  tarifs_lavage: "id, station_id, code",
  ventes_boutique: "id, station_id, date, vendeur, created_at",
  produits_boutique: "id, station_id, code, categorie, actif",
  cuves_stock: "id, station_id, code_cuve, produit",
  jauges_cuves: "id, station_id, date, cuve_id, produit, created_at",
  pompes_station: "id, station_id, code_pompe",

  rapports_depotage: "id, station_id, date_depotage, produit, numero_bl, created_at",
  membres_fidelite: "id, station_id, numero_carte, telephone, nom_complet, statut, created_at",
  transactions_fidelite: "++id, membre_id, station_id, date_op, type, created_at",
  recompenses_fidelite: "id, code, categorie, points_requis, actif",
  bons_carburant: "id, station_id, client_code, numero_bon, date, statut_paiement, created_at",

  factures: "id, station_id, client_code, numero_facture, date_emission, statut, created_at",

  // ── Lavage Pro — nouveaux référentiels ────────────────────────────────────
  wash_packs: "id, station_id, code, nom, actif",
  wash_services: "id, station_id, code, nom, categorie, actif",
  wash_vehicle_pricing: "id, pack_id, type_vehicule, station_id",
  wash_bays: "id, station_id, code_baie, nom_baie, actif",
  wash_addons: "++id, commande_id, service_id, station_id, created_at",
  wash_promotions: "id, station_id, code_promo, actif, date_debut, date_fin",
  wash_bons: "id, station_id, client_code, numero_bon, statut, created_at",
});

// VAGUE 5+ — Quart et pistolet assignment pour pompistes
db.version(11).stores({
  meta: "key",
  users: "id, email",
  rapports: "id, station, date, statut, maj_le, client_uuid, [station+date]",
  mouvements: "++id, station_id, produit_id, date_mvt, rapport_id",
  livraisons: "id, station_id, date_livraison",
  jauges: "++id, station_id, date_jauge, produit",
  operations_credit: "++id, client_code, station_id, date_op",
  pompistes: "id, station_id, nom, user_id, quarts, pistolets, date_affectation",
  quarts: "++id, date, rapport_id, pompiste_id",
  queue: "++id, created_at",
  quart_configs: "id, station_id, nom, type, heure_debut, heure_fin, actif, created_at",

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

  descentes: "id, station_id, date, pompiste_id, statut, created_at",
  prestations_lavage: "id, station_id, date, agent, type_vehicule, statut, pack_id, baie_id, client_id, created_at",
  tarifs_lavage: "id, station_id, code",
  ventes_boutique: "id, station_id, date, vendeur, created_at",
  produits_boutique: "id, station_id, code, categorie, actif",
  cuves_stock: "id, station_id, code_cuve, produit",
  jauges_cuves: "id, station_id, date, cuve_id, produit, created_at",
  pompes_station: "id, station_id, code_pompe",

  rapports_depotage: "id, station_id, date_depotage, produit, numero_bl, created_at",
  membres_fidelite: "id, station_id, numero_carte, telephone, nom_complet, statut, created_at",
  transactions_fidelite: "++id, membre_id, station_id, date_op, type, created_at",
  recompenses_fidelite: "id, code, categorie, points_requis, actif",
  bons_carburant: "id, station_id, client_code, numero_bon, date, statut_paiement, created_at",

  factures: "id, station_id, client_code, numero_facture, date_emission, statut, created_at",

  wash_packs: "id, station_id, code, nom, actif",
  wash_services: "id, station_id, code, nom, categorie, actif",
  wash_vehicle_pricing: "id, pack_id, type_vehicule, station_id",
  wash_bays: "id, station_id, code_baie, nom_baie, actif",
  wash_addons: "++id, commande_id, service_id, station_id, created_at",
  wash_promotions: "id, station_id, code_promo, actif, date_debut, date_fin",
  wash_bons: "id, station_id, client_code, numero_bon, statut, created_at",

  // Entretien & Baie de Service
  entretien_services: "id, station_id, code, nom, categorie, actif",
  entretien_baies: "id, station_id, code_baie, nom_baie, actif",
  entretien_pricing: "id, service_id, type_vehicule, station_id",
  entretien_addons: "++id, commande_id, service_id, station_id, created_at",
});

// VAGUE 5 — Entretien & Baie de Service Automobile, Vidange & Pièces/Lubrifiants
db.version(10).stores({
  meta: "key",
  users: "id, email",
  rapports: "id, station, date, statut, maj_le, client_uuid, [station+date]",
  mouvements: "++id, station_id, produit_id, date_mvt, rapport_id",
  livraisons: "id, station_id, date_livraison",
  jauges: "++id, station_id, date_jauge, produit",
  operations_credit: "++id, client_code, station_id, date_op",
  pompistes: "id, station_id, nom, user_id, quarts, pistolets",
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

  descentes: "id, station_id, date, pompiste_id, statut, created_at",
  prestations_lavage: "id, station_id, date, agent, type_vehicule, statut, pack_id, baie_id, client_id, created_at",
  tarifs_lavage: "id, station_id, code",
  ventes_boutique: "id, station_id, date, vendeur, created_at",
  produits_boutique: "id, station_id, code, categorie, actif",
  cuves_stock: "id, station_id, code_cuve, produit",
  jauges_cuves: "id, station_id, date, cuve_id, produit, created_at",
  pompes_station: "id, station_id, code_pompe",

  rapports_depotage: "id, station_id, date_depotage, produit, numero_bl, created_at",
  membres_fidelite: "id, station_id, numero_carte, telephone, nom_complet, statut, created_at",
  transactions_fidelite: "++id, membre_id, station_id, date_op, type, created_at",
  recompenses_fidelite: "id, code, categorie, points_requis, actif",
  bons_carburant: "id, station_id, client_code, numero_bon, date, statut_paiement, created_at",

  factures: "id, station_id, client_code, numero_facture, date_emission, statut, created_at",

  wash_packs: "id, station_id, code, nom, actif",
  wash_services: "id, station_id, code, nom, categorie, actif",
  wash_vehicle_pricing: "id, pack_id, type_vehicule, station_id",
  wash_bays: "id, station_id, code_baie, nom_baie, actif",
  wash_addons: "++id, commande_id, service_id, station_id, created_at",
  wash_promotions: "id, station_id, code_promo, actif, date_debut, date_fin",
  wash_bons: "id, station_id, client_code, numero_bon, statut, created_at",

  // ── Module Entretien Automobile & Baie de Service ──
  prestations_entretien: "id, station_id, date, immatriculation, statut, technicien, mode_paiement, created_at",
  services_entretien: "id, station_id, code, nom, categorie, actif",
  baies_entretien: "id, station_id, code_baie, nom_baie, actif",
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
  const seed = referentielFromSeed();
  if (!row?.value) return seed;

  // Garantir la rétrocompatibilité : fusionner les référentiels ajoutés dans les nouvelles versions
  let needsUpdate = false;
  const merged = { ...seed, ...row.value };
  const keysToCheck = [
    "wash_packs",
    "wash_services",
    "wash_vehicle_pricing",
    "wash_bays",
    "wash_types_vehicule",
    "wash_pack_inclusions",
    "recompenses_fidelite",
    "services_entretien",
    "baies_entretien",
  ];

  for (const k of keysToCheck) {
    if (!merged[k] || (Array.isArray(merged[k]) && merged[k].length === 0 && seed[k]?.length > 0)) {
      merged[k] = seed[k];
      needsUpdate = true;
    }
  }

  if (needsUpdate) {
    await db.meta.put({ key: "ref", value: merged }).catch(() => {});
  }
  return merged;
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
