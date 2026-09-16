-- =====================================================================
--  OGSS RÉSEAU — Schéma Supabase (PostgreSQL 15)
--  Réseau de stations-service Star Energy / OGSS Sénégal
--  Monnaie : FCFA (entiers) — Dates : DATE (affichage DD/MM/YYYY côté app)
--  Version : 1.0 — 14/09/2026
-- =====================================================================
-- Conventions
--   * Tous les montants FCFA sont des BIGINT (pas de centimes en FCFA)
--   * Les volumes sont NUMERIC(12,2) (litres) — index pistolets en NUMERIC(14,2)
--   * Chaque table opérationnelle porte station_id -> filtrage RLS par station
--   * Aucune valeur calculée n'est saisie : les totaux sont des vues ou des
--     colonnes GENERATED, exactement comme les formules du journal Excel
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. RÉFÉRENTIEL RÉSEAU (Module 6)
-- ---------------------------------------------------------------------
create table stations (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,            -- 'HANN', 'NDIAKHIRATE'
  nom           text not null,                   -- 'Star Energy Hann Mariste'
  localisation  text,
  nb_pistolets  int  not null default 8,
  actif         boolean not null default true,
  cree_le       timestamptz not null default now()
);

create type role_utilisateur as enum ('gerant','superviseur','directeur','comptable');

create table profils (                            -- 1 ligne par auth.users
  id           uuid primary key references auth.users(id) on delete cascade,
  nom_complet  text not null,
  telephone    text,
  role         role_utilisateur not null default 'gerant',
  station_id   uuid references stations(id),     -- null pour superviseur/directeur (accès réseau)
  actif        boolean not null default true
);

create type produit_carburant as enum ('GASOIL','SUPER');

-- Historique des prix officiels (changement 15/08/2026 : GO 680->755, SUPER 920->990)
create table prix_carburant (
  id            bigserial primary key,
  produit       produit_carburant not null,
  prix_vente    int not null,                     -- FCFA / L
  prix_achat    numeric(8,2),                     -- ex. 665.5 / 905.5 (marge ~14,5 F/L)
  date_effet    date not null,
  unique (produit, date_effet)
);

create table pistolets (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references stations(id),
  code        text not null,                      -- 'gasoil1' … 'super4'
  produit     produit_carburant not null,
  ordre       smallint not null,
  actif       boolean not null default true,
  unique (station_id, code)
);

create table cuves (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references stations(id),
  produit     produit_carburant not null,
  capacite_l  int,
  unique (station_id, produit)
);

create type famille_produit as enum ('LUBRIFIANT','GAZ','ACCESSOIRE');

create table produits (                            -- lubrifiants, gaz, divers
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,             -- 'LUB-5W40-5L', 'GAZ-9KG'
  designation   text not null,                    -- '5W40 5L', 'LOBBOU GAZ 9KG'
  famille       famille_produit not null,
  unite         text not null default 'unité',    -- 'bidon','L','bouteille'
  prix_vente    int not null,                     -- FCFA
  cout_achat    int,                              -- pour marge gaz (4175/1269/2800/6022)
  seuil_alerte  int not null default 5,
  actif         boolean not null default true,
  ordre         smallint
);

create table categories_depense (
  id      serial primary key,
  code    text not null unique,                   -- 'TRANSPORT','BON_CLIENT','MAINTENANCE'…
  libelle text not null,
  nature  text not null check (nature in ('FIXE','VARIABLE','AVANCE_CLIENT')),
  compte_syscohada text                           -- ex. '6241' Transport, '4111' Clients
);

-- ---------------------------------------------------------------------
-- 2. RAPPORT JOURNALIER GÉRANT (Module 1)
-- ---------------------------------------------------------------------
create type statut_rapport as enum ('BROUILLON','SOUMIS','VALIDE','REJETE');

create table rapports_journaliers (
  id               uuid primary key default gen_random_uuid(),
  station_id       uuid not null references stations(id),
  date_rapport     date not null,
  gerant_id        uuid not null references profils(id),
  statut           statut_rapport not null default 'BROUILLON',
  -- saisies du bloc clôture (jamais calculées)
  ca_lavage        bigint not null default 0,
  tickets          bigint not null default 0,     -- règlements en bons/tickets carburant
  depenses         bigint not null default 0,     -- = somme lignes_depense (contrôlé par trigger)
  remboursement    bigint not null default 0,     -- ligne REMBOURSEMENT du journal (H21)
  depots           bigint not null default 0,     -- ligne DEPOTS (H18)
  -- totaux figés à la soumission (copie des valeurs de la vue, pour l'audit)
  ca_carburant     bigint,
  ca_lubrifiant    bigint,
  ca_gaz           bigint,
  ca_total         bigint,
  a_verser         bigint,
  total_versements bigint,
  ecart_caisse     bigint,
  -- workflow
  soumis_le        timestamptz,
  valide_par       uuid references profils(id),
  valide_le        timestamptz,
  motif_rejet      text,
  commentaire      text,
  -- offline-first : identifiant client + horodatage local pour la synchro
  client_uuid      uuid,
  maj_le           timestamptz not null default now(),
  unique (station_id, date_rapport)
);

create table rapport_pistolets (
  rapport_id    uuid not null references rapports_journaliers(id) on delete cascade,
  pistolet_id   uuid not null references pistolets(id),
  index_depart  numeric(14,2) not null,
  index_fin     numeric(14,2) not null,
  prix_unitaire int not null,                     -- figé au prix du jour
  volume        numeric(12,2) generated always as (index_fin - index_depart) stored,
  valeur        bigint generated always as (round((index_fin - index_depart) * prix_unitaire)) stored,
  primary key (rapport_id, pistolet_id),
  check (index_fin >= index_depart)
);

create table rapport_lubrifiants (
  rapport_id    uuid not null references rapports_journaliers(id) on delete cascade,
  produit_id    uuid not null references produits(id),
  stock_debut   numeric(12,2) not null default 0,
  reception     numeric(12,2) not null default 0,
  qte_vendue    numeric(12,2) not null default 0,
  prix_unitaire int not null,
  stock_fin     numeric(12,2) generated always as (stock_debut + reception - qte_vendue) stored,
  valeur_vente  bigint generated always as (round(qte_vendue * prix_unitaire)) stored,
  valeur_stock  bigint generated always as (round((stock_debut + reception - qte_vendue) * prix_unitaire)) stored,
  primary key (rapport_id, produit_id)
);

create table rapport_gaz (
  rapport_id     uuid not null references rapports_journaliers(id) on delete cascade,
  produit_id     uuid not null references produits(id),
  stock_present  int not null default 0,
  livraison      int not null default 0,
  qte_vendue     int not null default 0,
  prix_unitaire  int not null,
  cout_unitaire  int not null default 0,
  stock_restant  int generated always as (stock_present + livraison - qte_vendue) stored,
  valeur_vente   bigint generated always as (qte_vendue * prix_unitaire) stored,
  marge          bigint generated always as (qte_vendue * (prix_unitaire - cout_unitaire)) stored,
  primary key (rapport_id, produit_id)
);

create table rapport_versements (                 -- VERSEMENT 1 … 5
  id          bigserial primary key,
  rapport_id  uuid not null references rapports_journaliers(id) on delete cascade,
  numero      smallint not null check (numero between 1 and 5),
  montant     bigint not null default 0,
  reference   text,                                -- n° bordereau banque
  unique (rapport_id, numero)
);

create table rapport_coupures (                   -- DÉTAIL VERSEMENT BANQUE
  rapport_id  uuid not null references rapports_journaliers(id) on delete cascade,
  coupure     int not null check (coupure in (10000,5000,2000,1000,500,250,200,100,50)),
  nombre      int not null default 0,
  montant     bigint generated always as (coupure * nombre) stored,
  primary key (rapport_id, coupure)
);

create table lignes_depense (
  id            bigserial primary key,
  rapport_id    uuid not null references rapports_journaliers(id) on delete cascade,
  categorie_id  int not null references categories_depense(id),
  libelle       text not null,                    -- 'BON POUR MAMOUR BEYE', 'TRANSPORT GERANT'
  montant       bigint not null check (montant >= 0),
  piece_url     text,                             -- photo du justificatif (Storage)
  valide        boolean not null default false
);

-- Modes de règlement hors espèces (onglet POMPISTES : tickets, Cartes STAR, PETROSEN, OM/Wave)
create type mode_reglement as enum ('TICKET','CARTE_STAR','PLATEFORME_PETROSEN','ORANGE_MONEY','WAVE','TPE','CREDIT_CLIENT');

create table rapport_reglements (
  id          bigserial primary key,
  rapport_id  uuid not null references rapports_journaliers(id) on delete cascade,
  mode        mode_reglement not null,
  montant     bigint not null default 0,
  client_id   uuid,                                -- si CREDIT_CLIENT
  detail      jsonb                                -- ex. tickets par valeur {"6800":31,"68000":1}
);

-- ---------------------------------------------------------------------
-- 3. QUARTS POMPISTES (onglet POMPISTES du fichier source)
-- ---------------------------------------------------------------------
create table pompistes (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references stations(id),
  nom         text not null,
  actif       boolean not null default true
);

create table quarts_pompistes (
  id            uuid primary key default gen_random_uuid(),
  rapport_id    uuid not null references rapports_journaliers(id) on delete cascade,
  pompiste_id   uuid not null references pompistes(id),
  pistolets     uuid[] not null,                  -- pistolets servis (ex. gasoil1 + super1)
  valeur_ventes bigint not null default 0,
  prelevement   bigint not null default 0,        -- espèces remises en cours de quart
  tickets       bigint not null default 0,
  cartes_star   bigint not null default 0,
  petrosen      bigint not null default 0,
  mobile_money  bigint not null default 0,
  a_verser      bigint generated always as (valeur_ventes - prelevement - tickets - cartes_star - petrosen - mobile_money) stored,
  verse         bigint not null default 0,
  ecart         bigint generated always as (verse - (valeur_ventes - prelevement - tickets - cartes_star - petrosen - mobile_money)) stored
);

-- ---------------------------------------------------------------------
-- 4. STOCKS & LIVRAISONS (Module 3 + onglet GO&SUP)
-- ---------------------------------------------------------------------
create table livraisons_carburant (
  id            uuid primary key default gen_random_uuid(),
  station_id    uuid not null references stations(id),
  date_livraison date not null,
  numero_bl     text not null,                    -- 2601098…
  produit       produit_carburant not null,
  volume_l      int not null,
  depot         text,                             -- 'SENSTOCK', 'DOT'
  camion        text,                             -- 'AA406AY'
  chauffeur     text,
  receptionne_par text,
  prix_achat    numeric(8,2),
  valeur        bigint,
  manquant_l    numeric(8,2) default 0,           -- 'MQD 15 LITRES'
  unique (station_id, numero_bl, produit)
);

create table jauges_cuves (                       -- CONTRÔLE JAUGE J / J+1
  id           bigserial primary key,
  station_id   uuid not null references stations(id),
  date_jauge   date not null,
  produit      produit_carburant not null,
  jauge_j      numeric(12,2) not null,
  livraison_l  numeric(12,2) not null default 0,
  vente_j      numeric(12,2) not null default 0,  -- = cumul volumes du rapport
  jauge_j1     numeric(12,2),
  solde_theorique numeric(12,2) generated always as (jauge_j + livraison_l - vente_j) stored,
  ecart_l      numeric(12,2) generated always as (jauge_j1 - (jauge_j + livraison_l - vente_j)) stored,
  unique (station_id, date_jauge, produit)
);

create type type_mouvement as enum ('RECEPTION','VENTE','RETOUR','INVENTAIRE','TRANSFERT');

create table mouvements_stock (                   -- historique produit (lub/gaz)
  id            bigserial primary key,
  station_id    uuid not null references stations(id),
  produit_id    uuid not null references produits(id),
  date_mvt      date not null,
  type          type_mouvement not null,
  quantite      numeric(12,2) not null,           -- + entrée / - sortie
  cout_unitaire numeric(12,2),                    -- pour CUMP
  reference     text,                             -- n° BL, rapport_id, inventaire
  rapport_id    uuid references rapports_journaliers(id)
);

-- ---------------------------------------------------------------------
-- 5. CLIENTS À CRÉDIT / COMPTES CARBURANT (onglets ITS, DMJ, M.BEYE, O.NDIAYE)
-- ---------------------------------------------------------------------
create table clients_credit (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid references stations(id),       -- null = client réseau
  code        text not null unique,               -- 'ITS','JOUKADAR','M.BEYE'
  nom         text not null,
  plafond     bigint default 0,
  actif       boolean not null default true
);

create table operations_credit (
  id           bigserial primary key,
  client_id    uuid not null references clients_credit(id),
  station_id   uuid not null references stations(id),
  date_op      date not null,
  matricule    text,                              -- véhicule
  volume_l     numeric(10,2) default 0,
  valeur_cons  bigint not null default 0,         -- consommation (débit)
  depot        bigint not null default 0,         -- versement client (crédit)
  rapport_id   uuid references rapports_journaliers(id)
);

-- ---------------------------------------------------------------------
-- 6. VUES DE CALCUL (reproduisent les formules du journal Excel)
-- ---------------------------------------------------------------------
create or replace view v_rapport_totaux as
select r.id as rapport_id, r.station_id, r.date_rapport, r.statut,
  coalesce((select sum(volume) from rapport_pistolets p join pistolets pi on pi.id=p.pistolet_id
            where p.rapport_id=r.id and pi.produit='GASOIL'),0)  as vol_gasoil,
  coalesce((select sum(volume) from rapport_pistolets p join pistolets pi on pi.id=p.pistolet_id
            where p.rapport_id=r.id and pi.produit='SUPER'),0)   as vol_super,
  coalesce((select sum(valeur) from rapport_pistolets p where p.rapport_id=r.id),0) as ca_carburant,
  coalesce((select sum(valeur_vente) from rapport_lubrifiants l where l.rapport_id=r.id),0) as ca_lubrifiant,
  coalesce((select sum(valeur_vente) from rapport_gaz g where g.rapport_id=r.id),0) as ca_gaz,
  coalesce((select sum(marge) from rapport_gaz g where g.rapport_id=r.id),0) as marge_gaz,
  r.ca_lavage, r.tickets, r.depenses, r.depots, r.remboursement,
  coalesce((select sum(montant) from rapport_versements v where v.rapport_id=r.id),0) as total_versements,
  coalesce((select sum(montant) from rapport_coupures c where c.rapport_id=r.id),0) as total_coupures,
  coalesce((select sum(valeur_stock) from rapport_lubrifiants l where l.rapport_id=r.id),0) as valeur_stock_lub
from rapports_journaliers r;

-- C.A. TOTAL  = carburant + lubrifiants + gaz + lavage + dépôts + remboursement   (D27 du journal)
-- À VERSER    = C.A. TOTAL − TICKETS − DÉPENSES                                  (J29)
-- BIS         = Σ versements                                                     (B34)
-- ÉCART CAISSE= (BIS + DÉPENSES + TICKETS) − C.A. TOTAL                          (L28)
-- NET BIS     = BIS − Σ coupures  (= part lub + lavage versée hors billets carburant) (B35)
create or replace view v_rapport_cloture as
select t.*,
  (ca_carburant + ca_lubrifiant + ca_gaz + ca_lavage + depots + remboursement)                       as ca_total,
  (ca_carburant + ca_lubrifiant + ca_gaz + ca_lavage + depots + remboursement) - tickets - depenses  as a_verser,
  total_versements + depenses + tickets
    - (ca_carburant + ca_lubrifiant + ca_gaz + ca_lavage + depots + remboursement)                  as ecart_caisse,
  total_versements - total_coupures                                                                  as net_bis
from v_rapport_totaux t;

-- Synthèse réseau (Module 2)
create or replace view v_synthese_reseau as
select s.code as station, s.nom, c.date_rapport, c.statut,
  c.vol_gasoil, c.vol_super, c.ca_carburant, c.ca_lubrifiant, c.ca_gaz, c.ca_lavage,
  c.ca_total, c.tickets, c.depenses, c.total_versements, c.ecart_caisse,
  case when c.ca_carburant>0 then round(100.0*c.ca_lubrifiant/c.ca_carburant,2) end as ratio_lub_carb_pct,
  case when c.ca_total>0     then round(100.0*c.tickets/c.ca_total,2)           end as ratio_tickets_pct,
  round(c.ca_carburant::numeric / nullif(s.nb_pistolets,0))                          as ca_par_pistolet
from v_rapport_cloture c join stations s on s.id=c.station_id;

-- Alerte : stations sans rapport pour une date
create or replace function stations_sans_rapport(d date)
returns table(station_code text, station_nom text) language sql stable as $$
  select s.code, s.nom from stations s
  where s.actif and not exists (select 1 from rapports_journaliers r where r.station_id=s.id and r.date_rapport=d)
$$;

-- Continuité des index (Module 5) : index_depart du jour doit = index_fin de la veille
create or replace view v_anomalies_index as
select r.station_id, r.date_rapport, pi.code as pistolet, p.index_depart, prev.index_fin as index_fin_veille,
  p.index_depart - prev.index_fin as rupture
from rapport_pistolets p
join rapports_journaliers r on r.id=p.rapport_id
join pistolets pi on pi.id=p.pistolet_id
join lateral (
  select p2.index_fin from rapport_pistolets p2 join rapports_journaliers r2 on r2.id=p2.rapport_id
  where p2.pistolet_id=p.pistolet_id and r2.date_rapport < r.date_rapport
  order by r2.date_rapport desc limit 1) prev on true
where p.index_depart <> prev.index_fin;

-- ---------------------------------------------------------------------
-- 7. TRIGGERS MÉTIER
-- ---------------------------------------------------------------------
-- a) Un rapport VALIDE n'est plus modifiable (sauf directeur via fonction dédiée)
create or replace function bloque_rapport_valide() returns trigger language plpgsql as $$
begin
  if (select statut from rapports_journaliers where id = coalesce(new.rapport_id, old.rapport_id)) = 'VALIDE' then
    raise exception 'Rapport validé : modification interdite';
  end if;
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['rapport_pistolets','rapport_lubrifiants','rapport_gaz','rapport_versements','rapport_coupures','lignes_depense','rapport_reglements']
  loop execute format('create trigger trg_bloque_%s before insert or update or delete on %s for each row execute function bloque_rapport_valide()', t, t);
  end loop; end $$;

-- b) À la validation : fige les totaux + génère les mouvements de stock lub/gaz + jauge vente_j
create or replace function on_rapport_valide() returns trigger language plpgsql as $$
declare c record;
begin
  if new.statut='VALIDE' and old.statut<>'VALIDE' then
    select * into c from v_rapport_cloture where rapport_id=new.id;
    new.ca_carburant:=c.ca_carburant; new.ca_lubrifiant:=c.ca_lubrifiant; new.ca_gaz:=c.ca_gaz;
    new.ca_total:=c.ca_total; new.a_verser:=c.a_verser; new.total_versements:=c.total_versements;
    new.ecart_caisse:=c.ecart_caisse; new.valide_le:=now();
    insert into mouvements_stock(station_id,produit_id,date_mvt,type,quantite,reference,rapport_id)
      select new.station_id, produit_id, new.date_rapport, 'VENTE', -qte_vendue, 'RAPPORT', new.id
      from rapport_lubrifiants where rapport_id=new.id and qte_vendue<>0;
    insert into mouvements_stock(station_id,produit_id,date_mvt,type,quantite,reference,rapport_id)
      select new.station_id, produit_id, new.date_rapport, 'RECEPTION', reception, 'RAPPORT', new.id
      from rapport_lubrifiants where rapport_id=new.id and reception<>0;
    insert into mouvements_stock(station_id,produit_id,date_mvt,type,quantite,reference,rapport_id)
      select new.station_id, produit_id, new.date_rapport, 'VENTE', -qte_vendue, 'RAPPORT', new.id
      from rapport_gaz where rapport_id=new.id and qte_vendue<>0;
  end if;
  new.maj_le:=now();
  return new;
end $$;
create trigger trg_rapport_valide before update on rapports_journaliers
  for each row execute function on_rapport_valide();

-- c) Le prix du jour : fonction utilisée par l'app pour pré-remplir prix_unitaire
create or replace function prix_du_jour(p produit_carburant, d date) returns int language sql stable as $$
  select prix_vente from prix_carburant where produit=p and date_effet<=d order by date_effet desc limit 1
$$;

-- ---------------------------------------------------------------------
-- 8. SÉCURITÉ RLS (Gérant = sa station, Superviseur/Directeur = réseau)
-- ---------------------------------------------------------------------
create or replace function mon_role() returns role_utilisateur language sql stable as
  $$ select role from profils where id=auth.uid() $$;
create or replace function ma_station() returns uuid language sql stable as
  $$ select station_id from profils where id=auth.uid() $$;

alter table rapports_journaliers enable row level security;
create policy rj_select on rapports_journaliers for select using (
  mon_role() in ('superviseur','directeur','comptable') or station_id=ma_station());
create policy rj_insert on rapports_journaliers for insert with check (
  mon_role()='gerant' and station_id=ma_station());
create policy rj_update on rapports_journaliers for update using (
  (mon_role()='gerant' and station_id=ma_station() and statut in ('BROUILLON','REJETE'))
  or mon_role() in ('superviseur','directeur'));
-- (répliquer le même schéma de policies sur les tables filles via rapport_id -> station_id)
do $$ declare t text; begin
  foreach t in array array['rapport_pistolets','rapport_lubrifiants','rapport_gaz','rapport_versements','rapport_coupures','lignes_depense','rapport_reglements','quarts_pompistes']
  loop
    execute format('alter table %s enable row level security', t);
    execute format($p$create policy %1$s_all on %1$s for all using (
      exists (select 1 from rapports_journaliers r where r.id=%1$s.rapport_id and
        (mon_role() in ('superviseur','directeur','comptable') or r.station_id=ma_station())))$p$, t);
  end loop; end $$;
alter table stations enable row level security;
create policy stations_read on stations for select using (true);
create policy stations_admin on stations for all using (mon_role()='directeur');
alter table produits enable row level security;
create policy produits_read on produits for select using (true);
create policy produits_admin on produits for all using (mon_role() in ('directeur','superviseur'));
alter table prix_carburant enable row level security;
create policy prix_read on prix_carburant for select using (true);
create policy prix_admin on prix_carburant for all using (mon_role()='directeur');

-- ---------------------------------------------------------------------
-- 9. DONNÉES DE RÉFÉRENCE (extraites du fichier JOURNAL_STAR_ENERGY_HANN)
-- ---------------------------------------------------------------------
insert into stations(code,nom,localisation,nb_pistolets) values
  ('HANN','Star Energy Hann Mariste','Hann, Dakar',8),
  ('NDIAKHIRATE','Star Energy Ndiakhirate','Ndiakhirate, Rufisque',8);

insert into prix_carburant(produit,prix_vente,prix_achat,date_effet) values
  ('GASOIL',680,665.5,'2026-01-01'),('SUPER',920,905.5,'2026-01-01'),
  ('GASOIL',755,740.5,'2026-08-15'),('SUPER',990,975.5,'2026-08-15');

insert into pistolets(station_id,code,produit,ordre)
select s.id, x.code, x.produit::produit_carburant, x.ordre from stations s cross join (values
  ('gasoil1','GASOIL',1),('gasoil2','GASOIL',2),('gasoil3','GASOIL',3),('gasoil4','GASOIL',4),
  ('super1','SUPER',5),('super2','SUPER',6),('super3','SUPER',7),('super4','SUPER',8)) x(code,produit,ordre);

insert into produits(code,designation,famille,unite,prix_vente,cout_achat,ordre) values
 ('LUB-5W40-5L','5W40 5L','LUBRIFIANT','bidon',29000,null,1),
 ('LUB-5W30-5L','5W30 5L','LUBRIFIANT','bidon',33000,null,2),
 ('LUB-10W40-5L','10W40 5L','LUBRIFIANT','bidon',18000,null,3),
 ('LUB-VRAC','VRAC (SAE50 fût)','LUBRIFIANT','L',2200,null,4),
 ('LUB-15W40-5L','15W40 5L','LUBRIFIANT','bidon',15000,null,5),
 ('LUB-20W50-5L','20W50 5L','LUBRIFIANT','bidon',13500,null,6),
 ('LUB-SAE50-5L','SAE50 5L','LUBRIFIANT','bidon',13000,null,7),
 ('LUB-SAE50-1L','SAE50 1L','LUBRIFIANT','bidon',2800,null,8),
 ('LUB-SOLEX','SOLEX','LUBRIFIANT','unité',800,null,9),
 ('LUB-WINS','WIN''S','LUBRIFIANT','unité',2500,null,10),
 ('LUB-ATF70','ATF 70','LUBRIFIANT','bidon',3200,null,11),
 ('LUB-4T','4 TEMPS','LUBRIFIANT','bidon',3000,null,12),
 ('LUB-CEPSA-GLACIOL-5L','CEPSA GLACIOL 5L','LUBRIFIANT','bidon',5000,null,13),
 ('LUB-STAR-GLACIOL-1L','STAR GLACIOL 1L','LUBRIFIANT','bidon',1000,null,14),
 ('LUB-LAVE-GLACE','CEPSA LAVE GLACE','LUBRIFIANT','bidon',1500,null,15),
 ('LUB-80W90','80W90 (HUILE BOITE)','LUBRIFIANT','L',2500,null,16),
 ('LUB-GRAISSE','GRAISSE','LUBRIFIANT','unité',3500,null,17),
 ('LUB-ATF2000S-1L','CEPSA ATF 2000S 1L','LUBRIFIANT','bidon',3500,null,18),
 ('LUB-15W40-1L','15W40 1L','LUBRIFIANT','bidon',3000,null,19),
 ('LUB-20W50-1L','20W50 1L','LUBRIFIANT','bidon',2700,null,20),
 ('LUB-5W30-1L','5W30 1L','LUBRIFIANT','bidon',6600,null,21),
 ('ACC-ACIDE','ACIDE','ACCESSOIRE','unité',400,null,22),
 ('ACC-EAU-DIST','EAU DISTILLEE','ACCESSOIRE','unité',200,null,23),
 ('GAZ-9KG','LOBBOU GAZ 9KG','GAZ','bouteille',4290,4175,30),
 ('GAZ-3KG','GAZ 3 KGS','GAZ','bouteille',1305,1269,31),
 ('GAZ-6KG','GAZ 6 KGS','GAZ','bouteille',2885,2800,32),
 ('GAZ-12KG','GAZ 12 KGS','GAZ','bouteille',6250,6022,33);

insert into categories_depense(code,libelle,nature,compte_syscohada) values
 ('TRANSPORT','Transport gérant / courses','VARIABLE','6241'),
 ('ENTRETIEN','Entretien & petites réparations','VARIABLE','6242'),
 ('FOURNITURES','Fournitures (omo, baies, eau…)','VARIABLE','6047'),
 ('REPAS','Dîner / restauration équipe','VARIABLE','6281'),
 ('RECHARGE_GAZ','Facture recharge Pumagaz/Lobbougaz','VARIABLE','6011'),
 ('BON_CLIENT','Bon pour client à crédit (ITS, Joukadar, M.Beye…)','AVANCE_CLIENT','4111'),
 ('SALAIRE_AVANCE','Avance sur salaire','FIXE','4211'),
 ('AUTRE','Autre dépense','VARIABLE','6588');

insert into clients_credit(code,nom) values
 ('ITS','ITS (transport)'),('JOUKADAR','Joukadar / DMJ'),('MBEYE','Mamour Beye'),
 ('ONDIAYE','O. Ndiaye — Sté de transport'),('ICONS','Icons SA / FADSR'),('RETBA','Retba / Team Dir CTT / Provale');
