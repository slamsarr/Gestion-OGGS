# OGSS RÉSEAU — Outil de gestion multi-sites Star Energy / OGSS Sénégal

Version 1.0 — 14/09/2026 — Analyse du fichier `JOURNAL_STAR_ENERGY_HANN_13_09_2026.xlsx`

Livrables joints : `01_schema_supabase.sql` (architecture de données) · `02_RapportGerant.jsx` (module prioritaire, code complet) · ce document (recommandation, maquettes, déploiement).

---

## 0. Ce que révèle vraiment le fichier source

Le brief décrit un onglet unique JOURNAL. Le fichier en contient **11**, et plusieurs portent une logique métier que l'outil doit reprendre sous peine de faire régresser la station.

| Onglet | Contenu réel | Impact sur l'outil |
|---|---|---|
| **JOURNAL** | 130 blocs journaliers de 44 lignes (05/05 → 10/09/2026). Formules : `volume = fin − départ`, `valeur = 680×vol` (prix codé en dur dans chaque cellule), `stock fin = début − vendu + réception`, `CA TOTAL = carburant + Σ(lub+gaz+lavage) + dépôts + remboursement`, `À VERSER = CA − tickets − dépenses`, `écart = (BIS + dépenses + tickets) − CA`, `NET BIS = BIS − Σ coupures` | Le moteur de calcul de `02_RapportGerant.jsx` reproduit ces formules à l'identique (commentaires `D27`, `J29`, `L28`, `B35`). |
| **POMPISTES** | Quart par pompiste (binôme gasoil N + super N), modes de règlement : **prélèvement, tickets, Cartes STAR, plateforme PETROSEN, Orange Money / Wave**, à verser, écart par pompiste. Contrôle **jauge cuve** J / livraison / vente / jauge J+1 / écart (ex. −105 L GO le 05/05). Tickets détaillés par valeur faciale (6 800 = 10 L…). | Tables `quarts_pompistes`, `rapport_reglements`, `jauges_cuves`. Le mobile money représente jusqu'à 1,7 M FCFA/jour : il doit apparaître en règlement hors espèces, pas noyé dans les dépenses. |
| **GO&SUP** | Livraisons carburant : n° BL (2601098…), litres, dépôt (SENSTOCK / DOT), camion/chauffeur, valeur, manquants (« MQD 15 LITRES »). Prix d'achat 665,5 / 905,5 → marge ≈ 14,5 F/L. Réceptions lubrifiants. | Table `livraisons_carburant` avec champ `manquant_l`. Marge brute carburant calculable. |
| **Feuil4** | Situation mensuelle lubrifiants CEPSA (ventes, réceptions, retours, litrage, CA, stock, valorisation) + tableau réseau « MOIS / STATION / VOLUMES / CA LUB / CA LAVAGE » | Confirme le besoin d'une vue mensuelle réseau (Module 2) ; la station est **HANN**, pas Ndiakhirate. |
| **ITS, DMJ, M.BEYE, O.NDIAYE, Feuil7** | Comptes carburant clients à crédit : date, matricule, litres, valeur, dépôt, solde. Soldes débiteurs fréquents (ITS : −8,3 M FCFA au 15/08). | Tables `clients_credit` + `operations_credit`. Les « BON POUR … » en dépenses sont en réalité des créances clients (compte 411), pas des charges. |

Autres constats chiffrés (130 jours, station Hann) :
- CA cumulé **1 132 M FCFA**, moyenne **8,7 M FCFA/jour** ; 664 639 L gasoil, 634 099 L super.
- **Changement de prix le 15/08/2026** : gasoil 680 → **755**, super 920 → **990** FCFA/L. Le fichier a été corrigé cellule par cellule ; l'outil gère un historique `prix_carburant` avec date d'effet.
- Aucun écart de caisse > 5 000 F sur la période : les écarts sont de l'ordre de −30 à +300 F (arrondis). Le seuil d'alerte proposé (5 000 F) est donc discriminant.
- Références lubrifiants variables dans le temps (21 → 24 lignes) : le référentiel doit être **paramétrable** sans casser l'historique.

---

## 1. Recommandation technologique

**Retenu : PWA React (Vite) + Supabase (Postgres, Auth, RLS, Storage) + IndexedDB (Dexie) pour le mode hors-ligne + SheetJS pour l'export Excel.**

| Critère terrain | Excel + VBA | Google Sheets / AppSheet | **React PWA + Supabase** |
|---|---|---|---|
| Saisie smartphone gérant | Non (VBA inopérant sur mobile) | Oui, mais lent sur 3G, formulaires rigides | Oui, installable, plein écran, saisie clavier numérique |
| Connexion instable (Hann, Ndiakhirate) | Fichier local, consolidation manuelle | Nécessite le réseau | **Offline-first** : saisie locale, synchro différée |
| Multi-sites 2 → 10 stations | Un fichier par station, consolidation fragile | Correct jusqu'à ~5 sites | Une base, filtrage par station via RLS |
| Workflow Brouillon → Soumis → Validé | À coder, non sécurisé | Partiel | Natif (statut + policies) |
| Compatibilité avec l'existant | Totale | Export CSV | **Export Excel identique au journal** (SheetJS) |
| Coût mensuel (3 stations) | 0 | 0–20 $ / utilisateur | Supabase gratuit puis ~25 $/mois ; hébergement front gratuit |
| Compétences FINSMART déjà mobilisées | Oui | Non | Oui (stack déjà utilisée pour OGSS V1 et SyscoFinance) |

Pourquoi pas Excel : le réseau grandit, les gérants saisissent depuis le terrain, et la direction veut un tableau réseau temps réel. Excel reste le **format de sortie** (export journalier, comptabilité) — pas le système d'enregistrement.

Composants :
- Front : React 18 + Vite, Tailwind, `vite-plugin-pwa` (service worker, installation sur l'écran d'accueil).
- Offline : Dexie (IndexedDB). Chaque rapport porte un `client_uuid` ; une file de synchronisation rejoue les écritures à la reconnexion ; conflit résolu par `maj_le` (dernier écrit gagne, sauf sur un rapport VALIDE qui est immuable).
- Back : Supabase — Postgres (schéma joint), Auth (téléphone + OTP SMS ou email), RLS par rôle et station, Storage pour les photos de justificatifs, Edge Function pour l'alerte « station non reportée » (cron 10h00).
- Export : SheetJS côté client (journal), génération serveur `xlsx`/`openpyxl` pour les exports mensuels et SYSCOHADA.

---

## 2. Architecture de données

Schéma complet et exécutable : `01_schema_supabase.sql` (26 tables, 5 vues, triggers, RLS, données de référence extraites du fichier).

```
stations ──< pistolets            produits (lub/gaz) ──< mouvements_stock
   │      ──< cuves ──< jauges_cuves                    ──< rapport_lubrifiants
   │      ──< pompistes ──< quarts_pompistes             ──< rapport_gaz
   │      ──< livraisons_carburant
   │      ──< clients_credit ──< operations_credit
   └──< rapports_journaliers (statut) ──< rapport_pistolets
                                       ──< rapport_versements / rapport_coupures
                                       ──< lignes_depense ──> categories_depense (compte SYSCOHADA)
                                       ──< rapport_reglements (ticket, carte STAR, Petrosen, OM/Wave, crédit)
prix_carburant (historique daté)       profils (rôle, station) ──> auth.users
```

Principes :
1. **Rien de calculé n'est stocké en saisie** — volumes, valeurs, stock fin, à verser, écart sont des colonnes `GENERATED` ou des vues (`v_rapport_cloture`). Les totaux sont figés dans `rapports_journaliers` seulement à la validation (audit).
2. **Le prix est figé par ligne** (`prix_unitaire`) : un changement de prix officiel ne réécrit jamais l'historique.
3. **Un rapport VALIDE est immuable** (trigger) ; toute correction passe par un rejet du superviseur puis re-soumission.
4. **La validation génère les mouvements de stock** lub/gaz (trigger) — le stock centralisé (Module 3) se déduit de `mouvements_stock`, jamais d'une saisie parallèle.

---

## 3. Module 1 — Rapport gérant (livré)

`02_RapportGerant.jsx` : composant React autonome, mobile-first, 5 onglets (Carburant, Lubrifiants, Gaz, Clôture, Récap).

- Index départ pré-rempli depuis l'index fin de la veille ; volume et valeur calculés au prix du jour (`prixDuJour(produit, date)`).
- Détection : index fin < départ, saut > 20 000 L, stock négatif, coupures > versements, écart > seuil.
- Dépenses catégorisées (mapping SYSCOHADA dans `categories_depense`), 5 versements, grille des 9 coupures, NET BIS.
- Bordereau de clôture (récap) reprenant ligne à ligne la logique du journal ; blocage de la soumission tant que des contrôles échouent.
- Workflow Brouillon → Soumis → Validé / Rejeté (motif), vue Gérant / Superviseur.
- Export Excel : le bloc est écrit **aux mêmes coordonnées que le journal source** (A1…Q42) + onglet DÉPENSES.
- Persistance locale du brouillon (`window.storage` dans l'aperçu ; Dexie dans la PWA).

Branchement production (à remplacer dans le fichier) :
```js
// chargement référentiel
const { data: produits } = await supabase.from('produits').select('*').eq('actif', true).order('ordre');
// enregistrement (upsert idempotent par client_uuid)
await supabase.from('rapports_journaliers').upsert({ ...entete, client_uuid }, { onConflict: 'station_id,date_rapport' });
await supabase.from('rapport_pistolets').upsert(lignesPistolets);
// soumission / validation
await supabase.from('rapports_journaliers').update({ statut: 'SOUMIS', soumis_le: new Date() }).eq('id', id);
```

---

## 4. Maquettes des autres modules

### Module 2 — Tableau de bord réseau (Directeur / Superviseur)
Source : vue `v_synthese_reseau` + `stations_sans_rapport(date)`.

```
┌ OGSS Réseau — Lundi 14/09/2026 ─────────────────────────────────────────┐
│ CA réseau J : 21,4 M F   Semaine : 148 M   Mois : 289 M   Cumul 2026 : … │
│ ⚠ 1 station non reportée (Ndiakhirate)   ⚠ 0 écart > 5 000 F            │
├──────────────┬─────────┬─────────┬──────────┬────────┬─────────┬────────┤
│ Station      │ GO (L)  │ SUP (L) │ CA carb. │ CA lub │ Lavage  │ Écart  │
│ Hann         │ 7 922   │ 6 509   │ 12,4 M   │ 69 500 │ 27 000  │ +5     │
│ Ndiakhirate  │ —       │ —       │ non reporté                          │
├──────────────┴─────────┴─────────┴──────────┴────────┴─────────┴────────┤
│ [Graphe] Volumes GO vs SUP par station, 30 j   [Graphe] Ratio lub/carb │
│ KPI : CA/pistolet · lub/carburant % · tickets/CA % · marge gaz          │
│ Stocks lub : 3 références sous seuil à Hann (VRAC 0, SAE50 5L 0, …)     │
└──────────────────────────────────────────────────────────────────────────┘
```
Alertes (Edge Function quotidienne 10h) : rapport manquant J-1, écart |caisse| > seuil, stock < seuil, rupture de continuité d'index (`v_anomalies_index`), jauge cuve écart > 0,5 % du volume vendu.

### Module 3 — Stocks lubrifiants & gaz
- Grille station × référence : stock théorique (Σ `mouvements_stock`), dernier inventaire, écart, valorisation (prix fixe par défaut ; CUMP activable : `cout_unitaire` sur les réceptions).
- Journal des mouvements par produit (réception BL, vente rapport, retour, inventaire, transfert inter-stations).
- Seuils par produit et par station ; proposition de réapprovisionnement = max(seuil × 2, moyenne 30 j × délai).

### Module 4 — Suivi financier & réconciliation
- Journal de caisse par station : CA théorique / tickets / dépenses / versements / écart, cumul par gérant.
- Règlements hors espèces (tickets, cartes STAR, Petrosen, OM/Wave, crédit) rapprochés des relevés opérateurs.
- Comptes clients à crédit (ITS, Joukadar…) : consommations, dépôts, solde, plafond, relance.
- Dépenses : validation superviseur, nature fixe/variable, justificatif photo.
- **Export SYSCOHADA** (journal ventes / caisse / banque), par rapport validé :

| Opération | Débit | Crédit |
|---|---|---|
| Ventes carburant HT + TVA | 411/571 | 7011 Ventes marchandises + 4431 TVA |
| Ventes lubrifiants, gaz, lavage | 571 Caisse | 7011 / 7061 Services |
| Tickets & bons | 4111 Clients (ou 4712) | — |
| Dépenses de caisse | 6xxx (selon `categories_depense`) | 571 Caisse |
| Bons pour clients à crédit | 4111 Client | 571 Caisse |
| Versement banque | 521 Banque | 571 Caisse |
| Écart de caisse | 658 / 758 | 571 |

Format de sortie : CSV/XLSX colonnes `Date · Journal · Compte · Libellé · Débit · Crédit · Pièce · Station` importable dans Sage / OMEGA GESTION PRO.

### Module 5 — Pistolets & relevés compteurs
- Historique des index par pistolet, contrôle de continuité (`v_anomalies_index`), cumul volumes semaine / mois / année, CA par pistolet.
- Rapprochement ventes pompes ↔ jauges cuves ↔ livraisons (onglet POMPISTES) : écart en litres et en valeur, tendance par cuve (détection de fuite ou de sous-livraison).
- Maintenance : date de dernier étalonnage, remplacement de compteur (remise à zéro gérée par un mouvement `INVENTAIRE` sur l'index).

### Module 6 — Paramétrage réseau
- Stations (code, nom, localisation, gérant attitré, pistolets, cuves).
- Référentiel produits (code, désignation, famille, unité, prix de vente, coût, seuil) avec date d'effet des prix.
- Prix carburants officiels : saisie de la nouvelle grille avec date d'effet ; le prix reste figé sur les rapports antérieurs.
- Utilisateurs & rôles : Gérant (saisie sa station), Superviseur (validation réseau), Directeur (lecture complète + paramétrage), Comptable (exports).
- Seuils d'alerte (écart caisse, saut d'index, stock).

---

## 5. Plan de déploiement — contexte Sénégal

| Phase | Durée | Contenu |
|---|---|---|
| **0. Reprise de l'existant** | 1 sem. | Script d'import des 130 blocs du journal Hann (index, stocks, versements) → historique 2026 disponible dès le premier jour ; import des BL GO&SUP et des comptes clients. |
| **1. Pilote Hann** | 3 sem. | Module 1 en double saisie (Excel + app) pendant 10 jours ; comparaison automatique ; corrections. Rôles : 1 gérant, 1 superviseur. |
| **2. Extension Ndiakhirate** | 2 sem. | Paramétrage station, formation, bascule. Tableau réseau (Module 2) activé. |
| **3. Stocks & finances** | 4 sem. | Modules 3 et 4, export SYSCOHADA vérifié par le comptable sur un mois complet. |
| **4. Pistolets, jauges, crédit clients** | 3 sem. | Module 5 + comptes clients ; abandon des onglets annexes. |
| **5. Généralisation** | continu | Ajout d'une station = 1 h de paramétrage + 2 h de formation. |

Contraintes terrain prises en compte :
- **Connectivité** : saisie 100 % hors-ligne, synchro en arrière-plan dès qu'un signal existe (fin de journée souvent en 2G/3G). Pastille d'état « synchronisé / en attente » visible dans l'en-tête. Poids initial de l'app < 2 Mo, données du jour < 50 Ko.
- **Smartphones** : Android d'entrée de gamme, clavier numérique forcé (`inputMode="decimal"`), zones tactiles ≥ 44 px, un onglet par bloc du journal pour garder les repères actuels.
- **Formation gérants** : 2 h sur site avec le journal papier à côté ; fiche mémo A5 plastifiée (« 5 écrans, 1 bordereau ») ; WhatsApp de support ; 10 jours de double saisie avant d'arrêter Excel.
- **Adoption direction** : export Excel identique au journal → aucune rupture pour ceux qui consultent encore le fichier.
- **Sécurité** : authentification par téléphone (OTP), RLS stricte, rapport validé immuable, journal d'audit (`maj_le`, `valide_par`).
- **Coût** : Supabase Free → Pro (~25 $/mois) à partir de 3–4 stations ; hébergement front Vercel/Netlify gratuit ; SMS OTP ~10 F/envoi.

---

## 6. Points à trancher avec l'exploitant

1. Confirmer la nature comptable des « BON POUR … » (créance client 411 vs charge) — le fichier les traite en dépenses, ce qui minore le CA encaissable.
2. Les tickets (bons carburant) : sont-ils refacturés à un client identifié (ITS, Petrosen) ? Si oui, ils rejoignent `rapport_reglements` avec `client_id`.
3. Valorisation stock lubrifiants : prix de vente (pratique actuelle) ou coût d'achat / CUMP (norme SYSCOHADA) ? Le schéma supporte les deux.
4. Seuil d'écart de caisse acceptable par gérant (proposé : 5 000 F, réalité observée < 300 F).
5. Fréquence des jauges cuves (quotidienne dans POMPISTES) : à intégrer au rapport gérant ou à laisser au superviseur ?
