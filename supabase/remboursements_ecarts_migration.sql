-- OGSS RÉSEAU — Migration : Table remboursements_ecarts
-- À exécuter dans Supabase SQL Editor (Dashboard > SQL Editor)
-- Ajoute la table pour stocker les remboursements d'écarts opérateurs

-- ---------------------------------------------------------------------
-- Table remboursements_ecarts (remboursements des manquants opérateurs)
-- ---------------------------------------------------------------------
create table if not exists remboursements_ecarts (
  id               uuid primary key default gen_random_uuid(),
  station_id       uuid not null references stations(id),
  date             date not null,
  operateur_id     text,
  operateur_nom    text not null,
  role_operateur   text default 'pompiste',
  activite         text default 'CARBURANT',
  montant          bigint not null default 0,
  mode_paiement    text default 'ESPECES',
  motif            text,
  reference        text,
  payload          jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  maj_le           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS — sécurité : lecture réseau, écriture selon station
-- ---------------------------------------------------------------------
alter table remboursements_ecarts enable row level security;

drop policy if exists remboursements_ecarts_read on remboursements_ecarts;
create policy remboursements_ecarts_read on remboursements_ecarts
  for select to authenticated
  using (est_reseau() or station_id = ma_station());

drop policy if exists remboursements_ecarts_write on remboursements_ecarts;
create policy remboursements_ecarts_write on remboursements_ecarts
  for all to authenticated
  using (est_reseau() or station_id = ma_station())
  with check (est_reseau() or station_id = ma_station());

-- Index pour performance des requêtes par station et date
create index if not exists idx_remboursements_ecarts_station_date
  on remboursements_ecarts(station_id, date desc);

create index if not exists idx_remboursements_ecarts_operateur
  on remboursements_ecarts(station_id, operateur_id);
