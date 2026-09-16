-- OGSS RÉSEAU — Schéma de production (PostgreSQL 15 / Supabase)
-- À coller dans SQL Editor : New query → Run
-- Version 1.1 — durcissement RLS, immutabilité, triggers, index

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
do $$ begin
  create type role_utilisateur as enum ('admin','gerant','superviseur','directeur','comptable');
exception when duplicate_object then null; end $$;
do $$ begin
  create type produit_carburant as enum ('GASOIL','SUPER');
exception when duplicate_object then null; end $$;
do $$ begin
  create type famille_produit as enum ('LUBRIFIANT','GAZ','ACCESSOIRE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type statut_rapport as enum ('BROUILLON','SOUMIS','VALIDE','REJETE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type mode_reglement as enum ('TICKET','CARTE_STAR','PLATEFORME_PETROSEN','ORANGE_MONEY','WAVE','TPE','CREDIT_CLIENT');
exception when duplicate_object then null; end $$;
do $$ begin
  create type type_mouvement as enum ('RECEPTION','VENTE','RETOUR','INVENTAIRE','TRANSFERT');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Référentiel
-- ---------------------------------------------------------------------
create table if not exists stations (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  nom           text not null,
  localisation  text,
  nb_pistolets  int  not null default 8,
  actif         boolean not null default true,
  cree_le       timestamptz not null default now()
);

create table if not exists profils (
  id           uuid primary key references auth.users(id) on delete cascade,
  nom_complet  text not null,
  telephone    text,
  role         role_utilisateur not null default 'gerant',
  station_id   uuid references stations(id),
  actif        boolean not null default true
);

create table if not exists prix_carburant (
  id            bigserial primary key,
  produit       produit_carburant not null,
  prix_vente    int not null,
  prix_achat    numeric(8,2),
  date_effet    date not null,
  unique (produit, date_effet)
);

create table if not exists pistolets (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references stations(id),
  code        text not null,
  produit     produit_carburant not null,
  ordre       smallint not null,
  actif       boolean not null default true,
  unique (station_id, code)
);

create table if not exists cuves (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references stations(id),
  produit     produit_carburant not null,
  capacite_l  int,
  unique (station_id, produit)
);

create table if not exists produits (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  designation   text not null,
  famille       famille_produit not null,
  unite         text not null default 'unité',
  prix_vente    int not null,
  cout_achat    int,
  seuil_alerte  int not null default 5,
  actif         boolean not null default true,
  ordre         smallint
);

create table if not exists categories_depense (
  id      serial primary key,
  code    text not null unique,
  libelle text not null,
  nature  text not null check (nature in ('FIXE','VARIABLE','AVANCE_CLIENT')),
  compte_syscohada text
);

create table if not exists rapports_journaliers (
  id               uuid primary key default gen_random_uuid(),
  station_id       uuid not null references stations(id),
  date_rapport     date not null,
  gerant_id        uuid not null references profils(id),
  statut           statut_rapport not null default 'BROUILLON',
  ca_lavage        bigint not null default 0,
  tickets          bigint not null default 0,
  depenses         bigint not null default 0,
  remboursement    bigint not null default 0,
  depots           bigint not null default 0,
  ca_carburant     bigint,
  ca_lubrifiant    bigint,
  ca_gaz           bigint,
  ca_total         bigint,
  a_verser         bigint,
  total_versements bigint,
  ecart_caisse     bigint,
  soumis_le        timestamptz,
  valide_par       uuid references profils(id),
  valide_le        timestamptz,
  motif_rejet      text,
  commentaire      text,
  payload          jsonb,
  client_uuid      uuid,
  maj_le           timestamptz not null default now(),
  unique (station_id, date_rapport),
  unique (client_uuid)
);

create table if not exists rapport_pistolets (
  rapport_id    uuid not null references rapports_journaliers(id) on delete cascade,
  pistolet_id   uuid not null references pistolets(id),
  index_depart  numeric(14,2) not null,
  index_fin     numeric(14,2) not null,
  prix_unitaire int not null,
  volume        numeric(12,2) generated always as (index_fin - index_depart) stored,
  valeur        bigint generated always as (round((index_fin - index_depart) * prix_unitaire)) stored,
  primary key (rapport_id, pistolet_id),
  check (index_fin >= index_depart)
);

create table if not exists rapport_lubrifiants (
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

create table if not exists rapport_gaz (
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

create table if not exists rapport_versements (
  id          bigserial primary key,
  rapport_id  uuid not null references rapports_journaliers(id) on delete cascade,
  numero      smallint not null check (numero between 1 and 5),
  montant     bigint not null default 0,
  reference   text,
  unique (rapport_id, numero)
);

create table if not exists rapport_coupures (
  rapport_id  uuid not null references rapports_journaliers(id) on delete cascade,
  coupure     int not null check (coupure in (10000,5000,2000,1000,500,250,200,100,50)),
  nombre      int not null default 0,
  montant     bigint generated always as (coupure * nombre) stored,
  primary key (rapport_id, coupure)
);

create table if not exists lignes_depense (
  id            bigserial primary key,
  rapport_id    uuid not null references rapports_journaliers(id) on delete cascade,
  categorie_id  int not null references categories_depense(id),
  libelle       text not null,
  montant       bigint not null check (montant >= 0),
  piece_url     text,
  valide        boolean not null default false
);

create table if not exists rapport_reglements (
  id          bigserial primary key,
  rapport_id  uuid not null references rapports_journaliers(id) on delete cascade,
  mode        mode_reglement not null,
  montant     bigint not null default 0,
  client_id   uuid,
  detail      jsonb
);

create table if not exists pompistes (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references stations(id),
  nom         text not null,
  actif       boolean not null default true
);

create table if not exists quarts_pompistes (
  id            uuid primary key default gen_random_uuid(),
  rapport_id    uuid not null references rapports_journaliers(id) on delete cascade,
  pompiste_id   uuid not null references pompistes(id),
  pistolets     uuid[] not null,
  valeur_ventes bigint not null default 0,
  prelevement   bigint not null default 0,
  tickets       bigint not null default 0,
  cartes_star   bigint not null default 0,
  petrosen      bigint not null default 0,
  mobile_money  bigint not null default 0,
  a_verser      bigint generated always as (valeur_ventes - prelevement - tickets - cartes_star - petrosen - mobile_money) stored,
  verse         bigint not null default 0,
  ecart         bigint generated always as (verse - (valeur_ventes - prelevement - tickets - cartes_star - petrosen - mobile_money)) stored
);

create table if not exists livraisons_carburant (
  id            uuid primary key default gen_random_uuid(),
  station_id    uuid not null references stations(id),
  date_livraison date not null,
  numero_bl     text not null,
  produit       produit_carburant not null,
  volume_l      int not null,
  depot         text,
  camion        text,
  chauffeur     text,
  receptionne_par text,
  prix_achat    numeric(8,2),
  valeur        bigint,
  manquant_l    numeric(8,2) default 0,
  unique (station_id, numero_bl, produit)
);

create table if not exists jauges_cuves (
  id           bigserial primary key,
  station_id   uuid not null references stations(id),
  date_jauge   date not null,
  produit      produit_carburant not null,
  jauge_j      numeric(12,2) not null,
  livraison_l  numeric(12,2) not null default 0,
  vente_j      numeric(12,2) not null default 0,
  jauge_j1     numeric(12,2),
  solde_theorique numeric(12,2) generated always as (jauge_j + livraison_l - vente_j) stored,
  unique (station_id, date_jauge, produit)
);

create table if not exists mouvements_stock (
  id            bigserial primary key,
  station_id    uuid not null references stations(id),
  produit_id    uuid not null references produits(id),
  date_mvt      date not null,
  type          type_mouvement not null,
  quantite      numeric(12,2) not null,
  cout_unitaire numeric(12,2),
  reference     text,
  rapport_id    uuid references rapports_journaliers(id)
);

create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profils(id) on delete cascade,
  type          text not null,
  titre         text not null,
  message       text not null,
  date_ref      date,
  lu            boolean not null default false,
  cree_le       timestamptz not null default now()
);

create table if not exists clients_credit (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid references stations(id),
  code        text not null unique,
  nom         text not null,
  plafond     bigint default 0,
  actif       boolean not null default true
);

-- Recreate rapport_reglements FK if table was created before clients_credit
alter table rapport_reglements drop constraint if exists rapport_reglements_client_id_fkey;
alter table rapport_reglements add constraint rapport_reglements_client_id_fkey
  foreign key (client_id) references clients_credit(id);

create table if not exists operations_credit (
  id           bigserial primary key,
  client_id    uuid not null references clients_credit(id),
  station_id   uuid not null references stations(id),
  date_op      date not null,
  matricule    text,
  volume_l     numeric(10,2) default 0,
  valeur_cons  bigint not null default 0,
  depot        bigint not null default 0,
  rapport_id   uuid references rapports_journaliers(id)
);

create table if not exists parametres_networks (
  id          text primary key default 'reseau',
  nom_reseau  text not null default 'OGSS Réseau',
  devise      text not null default 'FCFA',
  adresse     text,
  contact     text,
  maj_le      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Vues (security_invoker : respectent RLS de l'appelant)
-- ---------------------------------------------------------------------
create or replace view v_rapport_totaux
with (security_invoker = true) as
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

create or replace view v_rapport_cloture
with (security_invoker = true) as
select t.*,
  (ca_carburant + ca_lubrifiant + ca_gaz + ca_lavage + depots + remboursement) as ca_total,
  (ca_carburant + ca_lubrifiant + ca_gaz + ca_lavage + depots + remboursement) - tickets - depenses as a_verser,
  total_versements + depenses + tickets
    - (ca_carburant + ca_lubrifiant + ca_gaz + ca_lavage + depots + remboursement) as ecart_caisse,
  total_versements - total_coupures as net_bis
from v_rapport_totaux t;

create or replace view v_synthese_reseau
with (security_invoker = true) as
select s.code as station, s.nom, c.date_rapport, c.statut,
  c.vol_gasoil, c.vol_super, c.ca_carburant, c.ca_lubrifiant, c.ca_gaz, c.ca_lavage,
  c.ca_total, c.tickets, c.depenses, c.total_versements, c.ecart_caisse,
  case when c.ca_carburant>0 then round(100.0*c.ca_lubrifiant/c.ca_carburant,2) end as ratio_lub_carb_pct,
  case when c.ca_total>0 then round(100.0*c.tickets/c.ca_total,2) end as ratio_tickets_pct,
  round(c.ca_carburant::numeric / nullif(s.nb_pistolets,0)) as ca_par_pistolet
from v_rapport_cloture c join stations s on s.id=c.station_id;

create or replace view v_anomalies_index
with (security_invoker = true) as
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

create or replace function stations_sans_rapport(d date)
returns table(station_code text, station_nom text) language sql stable security invoker as $$
  select s.code, s.nom from stations s
  where s.actif and not exists (select 1 from rapports_journaliers r where r.station_id=s.id and r.date_rapport=d)
$$;

create or replace function prix_du_jour(p produit_carburant, d date) returns int language sql stable security invoker as $$
  select prix_vente from prix_carburant where produit=p and date_effet<=d order by date_effet desc limit 1
$$;

-- Alerte J-1 : notifications superviseur/directeur. Appelable par cron ou Edge Function.
create or replace function public.verifier_rapports_manquants(p_date date default ((timezone('utc', now()))::date - 1))
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  manquantes text[];
  brouillons text[];
  noms_m text;
  noms_b text;
  msg text := '';
  n_admins int := 0;
begin
  select coalesce(array_agg(s.code order by s.code), '{}'),
         coalesce(string_agg(coalesce(s.nom, s.code), ', ' order by s.code), '')
  into manquantes, noms_m
  from stations s
  where s.actif
    and not exists (
      select 1 from rapports_journaliers r
      where r.station_id = s.id and r.date_rapport = p_date
    );

  select coalesce(array_agg(s.code order by s.code), '{}'),
         coalesce(string_agg(coalesce(s.nom, s.code), ', ' order by s.code), '')
  into brouillons, noms_b
  from stations s
  join rapports_journaliers r on r.station_id = s.id and r.date_rapport = p_date
  where s.actif and r.statut = 'BROUILLON';

  if cardinality(manquantes) = 0 and cardinality(brouillons) = 0 then
    return jsonb_build_object('message', 'Tous les rapports J-1 sont soumis', 'date', p_date, 'notifies', 0);
  end if;

  if cardinality(manquantes) > 0 then
    msg := 'Rapport MANQUANT pour ' || p_date || ' : ' || noms_m;
  end if;
  if cardinality(brouillons) > 0 then
    if msg <> '' then msg := msg || E'\n'; end if;
    msg := msg || 'Rapport en BROUILLON (non soumis) : ' || noms_b;
  end if;

  insert into notifications (user_id, type, titre, message, date_ref, lu)
  select p.id, 'RAPPORT_MANQUANT',
         'Rapport(s) manquant(s) du ' || p_date,
         msg, p_date, false
  from profils p
  where p.role in ('superviseur', 'directeur') and p.actif;

  get diagnostics n_admins = row_count;

  return jsonb_build_object(
    'date', p_date,
    'manquantes', to_jsonb(manquantes),
    'brouillons', to_jsonb(brouillons),
    'notifies', n_admins,
    'message', msg
  );
end;
$$;

revoke all on function public.verifier_rapports_manquants(date) from public;
grant execute on function public.verifier_rapports_manquants(date) to service_role;
grant execute on function public.verifier_rapports_manquants(date) to postgres;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'alerte-rapport-manquant';
    exception when others then
      null;
    end;
    perform cron.schedule('alerte-rapport-manquant', '0 10 * * *', 'select public.verifier_rapports_manquants()');
  end if;
exception when others then
  raise notice 'Planification pg_cron ignoree: %', SQLERRM;
end $$;

-- ---------------------------------------------------------------------
-- Triggers métier
-- ---------------------------------------------------------------------
create or replace function sync_depenses_entete() returns trigger language plpgsql as $$
declare rid uuid;
begin
  rid := coalesce(new.rapport_id, old.rapport_id);
  update rapports_journaliers
    set depenses = coalesce((select sum(montant) from lignes_depense where rapport_id=rid),0)
    where id = rid and statut <> 'VALIDE';
  return coalesce(new, old);
end $$;

drop trigger if exists trg_sync_depenses on lignes_depense;
create trigger trg_sync_depenses after insert or update or delete on lignes_depense
  for each row execute function sync_depenses_entete();

create or replace function bloque_rapport_valide() returns trigger language plpgsql as $$
declare st statut_rapport;
declare rid uuid;
begin
  rid := coalesce(new.rapport_id, old.rapport_id);
  select statut into st from rapports_journaliers where id = rid;
  if st = 'VALIDE' then
    raise exception 'Rapport validé : modification interdite';
  end if;
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['rapport_pistolets','rapport_lubrifiants','rapport_gaz','rapport_versements','rapport_coupures','lignes_depense','rapport_reglements','quarts_pompistes']
  loop
    execute format('drop trigger if exists trg_bloque_%s on %s', t, t);
    execute format('create trigger trg_bloque_%s before insert or update or delete on %s for each row execute function bloque_rapport_valide()', t, t);
  end loop;
end $$;

create or replace function bloque_entete_valide() returns trigger language plpgsql as $$
begin
  if old.statut = 'VALIDE' then
    if new.statut = 'REJETE' then
      delete from mouvements_stock where rapport_id = old.id and reference = 'RAPPORT';
      return new;
    end if;
    raise exception 'Rapport validé : modification interdite (rejet superviseur requis)';
  end if;
  return new;
end $$;

drop trigger if exists trg_bloque_entete on rapports_journaliers;
create trigger trg_bloque_entete before update on rapports_journaliers
  for each row execute function bloque_entete_valide();

create or replace function on_rapport_valide() returns trigger language plpgsql as $$
declare c record;
begin
  if new.statut='VALIDE' and old.statut is distinct from 'VALIDE' then
    select * into c from v_rapport_cloture where rapport_id=new.id;
    new.ca_carburant:=c.ca_carburant; new.ca_lubrifiant:=c.ca_lubrifiant; new.ca_gaz:=c.ca_gaz;
    new.ca_total:=c.ca_total; new.a_verser:=c.a_verser; new.total_versements:=c.total_versements;
    new.ecart_caisse:=c.ecart_caisse; new.valide_le:=coalesce(new.valide_le, now());
    delete from mouvements_stock where rapport_id=new.id and reference='RAPPORT';
    insert into mouvements_stock(station_id,produit_id,date_mvt,type,quantite,reference,rapport_id)
      select new.station_id, produit_id, new.date_rapport, 'VENTE', -qte_vendue, 'RAPPORT', new.id
      from rapport_lubrifiants where rapport_id=new.id and qte_vendue<>0;
    insert into mouvements_stock(station_id,produit_id,date_mvt,type,quantite,reference,rapport_id)
      select new.station_id, produit_id, new.date_rapport, 'RECEPTION', reception, 'RAPPORT', new.id
      from rapport_lubrifiants where rapport_id=new.id and reception<>0;
    insert into mouvements_stock(station_id,produit_id,date_mvt,type,quantite,reference,rapport_id)
      select new.station_id, produit_id, new.date_rapport, 'VENTE', -qte_vendue, 'RAPPORT', new.id
      from rapport_gaz where rapport_id=new.id and qte_vendue<>0;
    insert into mouvements_stock(station_id,produit_id,date_mvt,type,quantite,reference,rapport_id)
      select new.station_id, produit_id, new.date_rapport, 'RECEPTION', livraison, 'RAPPORT', new.id
      from rapport_gaz where rapport_id=new.id and livraison<>0;
  end if;
  new.maj_le:=now();
  return new;
end $$;

drop trigger if exists trg_rapport_valide on rapports_journaliers;
create trigger trg_rapport_valide before update on rapports_journaliers
  for each row execute function on_rapport_valide();

-- Nouvel inscrit = gérant par défaut. Promotion admin/directeur : manuelle (out-of-band SQL).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profils (id, nom_complet, telephone, role, station_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nom_complet', split_part(coalesce(new.email, 'utilisateur'), '@', 1)),
    coalesce(new.phone, new.raw_user_meta_data->>'telephone'),
    'gerant',
    (select id from stations where code = 'HANN' limit 1)
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
create or replace function mon_role() returns role_utilisateur
language sql stable security definer set search_path = public as
  $$ select role from profils where id = auth.uid() $$;

create or replace function ma_station() returns uuid
language sql stable security definer set search_path = public as
  $$ select station_id from profils where id = auth.uid() $$;

create or replace function est_reseau() returns boolean
language sql stable security definer set search_path = public as
  $$ select mon_role() in ('admin','superviseur','directeur','comptable') $$;

alter table stations enable row level security;
alter table profils enable row level security;
alter table prix_carburant enable row level security;
alter table pistolets enable row level security;
alter table cuves enable row level security;
alter table produits enable row level security;
alter table categories_depense enable row level security;
alter table rapports_journaliers enable row level security;
alter table rapport_pistolets enable row level security;
alter table rapport_lubrifiants enable row level security;
alter table rapport_gaz enable row level security;
alter table rapport_versements enable row level security;
alter table rapport_coupures enable row level security;
alter table lignes_depense enable row level security;
alter table rapport_reglements enable row level security;
alter table pompistes enable row level security;
alter table quarts_pompistes enable row level security;
alter table livraisons_carburant enable row level security;
alter table jauges_cuves enable row level security;
alter table mouvements_stock enable row level security;
alter table clients_credit enable row level security;
alter table operations_credit enable row level security;
alter table notifications enable row level security;
alter table parametres_networks enable row level security;

-- Drop old policies if re-run
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname='public'
  loop execute format('drop policy if exists %I on %I', p.policyname, p.tablename);
  end loop;
end $$;

create policy stations_read on stations for select to authenticated using (true);
create policy stations_admin on stations for insert to authenticated with check (mon_role() in ('directeur','admin'));
create policy stations_admin_u on stations for update to authenticated using (mon_role() in ('directeur','admin'));
create policy stations_admin_d on stations for delete to authenticated using (mon_role() in ('directeur','admin'));

create policy profils_select on profils for select to authenticated using (
  id = auth.uid() or est_reseau());
create policy profils_update_self on profils for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and role = mon_role() and station_id is not distinct from ma_station());
create policy profils_admin on profils for update to authenticated using (mon_role() in ('directeur','admin'));

create policy prix_read on prix_carburant for select to authenticated using (true);
create policy prix_admin on prix_carburant for all to authenticated using (mon_role() in ('directeur','admin')) with check (mon_role() in ('directeur','admin'));

create policy produits_read on produits for select to authenticated using (true);
create policy produits_admin on produits for all to authenticated using (mon_role() in ('directeur','admin','superviseur')) with check (mon_role() in ('directeur','admin','superviseur'));

create policy cat_read on categories_depense for select to authenticated using (true);
create policy cat_admin on categories_depense for all to authenticated using (mon_role() in ('directeur','admin')) with check (mon_role() in ('directeur','admin'));

create policy pistolets_select on pistolets for select to authenticated using (est_reseau() or station_id = ma_station());
create policy pistolets_admin on pistolets for all to authenticated using (mon_role() in ('directeur','admin')) with check (mon_role() in ('directeur','admin'));
create policy cuves_select on cuves for select to authenticated using (est_reseau() or station_id = ma_station());
create policy cuves_admin on cuves for all to authenticated using (mon_role() in ('directeur','admin')) with check (mon_role() in ('directeur','admin'));
create policy pompistes_select on pompistes for select to authenticated using (est_reseau() or station_id = ma_station());
create policy pompistes_write on pompistes for all to authenticated using (est_reseau() or station_id = ma_station()) with check (est_reseau() or station_id = ma_station());

create policy rj_select on rapports_journaliers for select to authenticated using (est_reseau() or station_id = ma_station());
create policy rj_insert on rapports_journaliers for insert to authenticated with check (
  (mon_role()='gerant' and station_id = ma_station() and gerant_id = auth.uid())
  or est_reseau());
create policy rj_update on rapports_journaliers for update to authenticated using (
  (mon_role()='gerant' and station_id = ma_station() and statut in ('BROUILLON','REJETE'))
  or mon_role() in ('admin','superviseur','directeur'));
create policy rj_delete on rapports_journaliers for delete to authenticated using (
  (mon_role()='gerant' and station_id = ma_station() and statut in ('BROUILLON','REJETE'))
  or mon_role() in ('admin','superviseur','directeur'));

create policy params_select on parametres_networks for select to authenticated using (true);
create policy params_write on parametres_networks for all to authenticated
  using (mon_role() in ('directeur','admin')) with check (mon_role() in ('directeur','admin'));

create policy child_all on rapport_pistolets for all to authenticated using (
  exists (select 1 from rapports_journaliers r where r.id = rapport_id and (est_reseau() or r.station_id = ma_station())))
  with check (exists (select 1 from rapports_journaliers r where r.id = rapport_id and (est_reseau() or r.station_id = ma_station())));

-- Replicate child policies (Postgres cannot share one policy across tables)
do $$ declare t text; begin
  foreach t in array array['rapport_lubrifiants','rapport_gaz','rapport_versements','rapport_coupures','lignes_depense','rapport_reglements','quarts_pompistes']
  loop
    execute format($p$create policy %1$s_all on %1$s for all to authenticated using (
      exists (select 1 from rapports_journaliers r where r.id = rapport_id and (est_reseau() or r.station_id = ma_station())))
      with check (exists (select 1 from rapports_journaliers r where r.id = rapport_id and (est_reseau() or r.station_id = ma_station())))$p$, t);
  end loop;
end $$;

create policy station_scoped_sel on livraisons_carburant for select to authenticated using (est_reseau() or station_id = ma_station());
create policy station_scoped_w on livraisons_carburant for all to authenticated using (est_reseau() or station_id = ma_station()) with check (est_reseau() or station_id = ma_station());
create policy jauges_sel on jauges_cuves for select to authenticated using (est_reseau() or station_id = ma_station());
create policy jauges_w on jauges_cuves for all to authenticated using (est_reseau() or station_id = ma_station()) with check (est_reseau() or station_id = ma_station());
create policy mvt_sel on mouvements_stock for select to authenticated using (est_reseau() or station_id = ma_station());
create policy mvt_w on mouvements_stock for all to authenticated using (est_reseau() or station_id = ma_station()) with check (est_reseau() or station_id = ma_station());
create policy credit_sel on clients_credit for select to authenticated using (true);
create policy credit_w on clients_credit for all to authenticated using (mon_role() in ('directeur','admin','superviseur','comptable')) with check (mon_role() in ('directeur','admin','superviseur','comptable'));
create policy ops_sel on operations_credit for select to authenticated using (est_reseau() or station_id = ma_station());
create policy ops_w on operations_credit for all to authenticated using (est_reseau() or station_id = ma_station()) with check (est_reseau() or station_id = ma_station());

create policy notif_select on notifications for select to authenticated
  using (user_id = auth.uid() or est_reseau());
create policy notif_update_own on notifications for update to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------
create index if not exists idx_notifications_user_lu on notifications(user_id, lu);
create index if not exists idx_rj_station_date on rapports_journaliers(station_id, date_rapport);
create index if not exists idx_rj_statut on rapports_journaliers(statut);
create index if not exists idx_rj_maj on rapports_journaliers(maj_le);
create index if not exists idx_mvt_station_prod on mouvements_stock(station_id, produit_id, date_mvt);
create index if not exists idx_ops_client on operations_credit(client_id, date_op);
create index if not exists idx_liv_station on livraisons_carburant(station_id, date_livraison);

-- ---------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------
insert into stations(code,nom,localisation,nb_pistolets) values
  ('HANN','Star Energy Hann Mariste','Hann, Dakar',8),
  ('NDIAKHIRATE','Star Energy Ndiakhirate','Ndiakhirate, Rufisque',8)
on conflict (code) do nothing;

insert into prix_carburant(produit,prix_vente,prix_achat,date_effet) values
  ('GASOIL',680,665.5,'2026-01-01'),('SUPER',920,905.5,'2026-01-01'),
  ('GASOIL',755,740.5,'2026-08-15'),('SUPER',990,975.5,'2026-08-15')
on conflict (produit, date_effet) do nothing;

insert into pistolets(station_id,code,produit,ordre)
select s.id, x.code, x.produit::produit_carburant, x.ordre from stations s cross join (values
  ('gasoil1','GASOIL',1),('gasoil2','GASOIL',2),('gasoil3','GASOIL',3),('gasoil4','GASOIL',4),
  ('super1','SUPER',5),('super2','SUPER',6),('super3','SUPER',7),('super4','SUPER',8)) x(code,produit,ordre)
on conflict (station_id, code) do nothing;

insert into cuves(station_id, produit, capacite_l)
select s.id, x.produit::produit_carburant, x.cap from stations s cross join (values
  ('GASOIL', 30000), ('SUPER', 20000)) x(produit, cap)
on conflict (station_id, produit) do nothing;

insert into produits(code,designation,famille,unite,prix_vente,cout_achat,ordre) values
 ('LUB-5W40-5L','5W40 5L','LUBRIFIANT','bidon',29000,null,1),
 ('LUB-5W30-5L','5W30 5L','LUBRIFIANT','bidon',33000,null,2),
 ('LUB-10W40-5L','10W40 5L','LUBRIFIANT','bidon',18000,null,3),
 ('LUB-VRAC','VRAC','LUBRIFIANT','L',2200,null,4),
 ('LUB-15W40-5L','15W40 5L','LUBRIFIANT','bidon',15000,null,5),
 ('LUB-20W50-5L','20w50 5L','LUBRIFIANT','bidon',13500,null,6),
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
 ('GAZ-12KG','GAZ 12 KGS','GAZ','bouteille',6250,6022,33)
on conflict (code) do nothing;

insert into categories_depense(code,libelle,nature,compte_syscohada) values
 ('TRANSPORT','Transport','VARIABLE','6241'),
 ('ENTRETIEN','Entretien','VARIABLE','6242'),
 ('FOURNITURES','Fournitures','VARIABLE','6047'),
 ('REPAS','Repas','VARIABLE','6281'),
 ('RECHARGE_GAZ','Recharge gaz','VARIABLE','6011'),
 ('BON_CLIENT','Bon client (crédit)','AVANCE_CLIENT','4111'),
 ('SALAIRE_AVANCE','Avance salaire','FIXE','4211'),
 ('AUTRE','Autre','VARIABLE','6588')
on conflict (code) do nothing;

insert into clients_credit(code,nom) values
 ('ITS','ITS (transport)'),('JOUKADAR','Joukadar / DMJ'),('MBEYE','Mamour Beye'),
 ('ONDIAYE','O. Ndiaye — Sté de transport'),('ICONS','Icons SA / FADSR'),('RETBA','Retba / Team Dir CTT / Provale')
on conflict (code) do nothing;

-- Storage justificatifs — accès limité : le réseau voit tout, sinon on restreint au chemin de sa propre station
insert into storage.buckets (id, name, public) values ('justificatifs', 'justificatifs', false)
on conflict (id) do nothing;

drop policy if exists justif_read on storage.objects;
drop policy if exists justif_write on storage.objects;
drop policy if exists justif_upd on storage.objects;
create policy justif_read on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and (est_reseau() or split_part(name, '/', 1) = station_code_usr()));
create policy justif_write on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and (est_reseau() or split_part(name, '/', 1) = station_code_usr()));
create policy justif_upd on storage.objects for update to authenticated
  using (bucket_id = 'justificatifs' and (est_reseau() or split_part(name, '/', 1) = station_code_usr()));
