-- =====================================================================
-- OGSS RÉSEAU — Migration Programme de Fidélisation Clients
-- Gère les membres adhérents, les cartes de fidélité, les soldes de
-- points, les paliers de statut et l'historique des gains / dépenses.
-- =====================================================================

create type statut_fidelite as enum ('BRONZE', 'SILVER', 'GOLD', 'PLATINE');

-- Table des membres adhérents
create table if not exists membres_fidelite (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid references stations(id),
  numero_carte    text not null unique,       -- 'FID-1001'
  nom_complet     text not null,
  telephone       text not null unique,
  email           text,
  immatriculation text,
  points_solde    int not null default 0,
  points_cumules  int not null default 0,     -- total acquis depuis adhésion
  statut          statut_fidelite not null default 'BRONZE',
  volume_total_l  numeric(12,2) not null default 0,
  depense_totale  bigint not null default 0,
  actif           boolean not null default true,
  date_adhesion   date not null default current_date,
  payload         jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  maj_le          timestamptz not null default now()
);

-- Catalogue des récompenses fidélité
create table if not exists recompenses_fidelite (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,       -- 'BON-CARB-5000'
  titre           text not null,              -- 'Bon carburant 5 000 FCFA'
  description     text,
  points_requis   int not null check (points_requis > 0),
  valeur_fcfa     bigint not null default 0,
  categorie       text not null default 'CARBURANT', -- 'CARBURANT', 'LAVAGE', 'BOUTIQUE'
  actif           boolean not null default true,
  ordre           int not null default 1
);

-- Historique des transactions de points
create type type_transaction_fidelite as enum ('GAIN', 'UTILISATION', 'AJUSTEMENT', 'BONUS');

create table if not exists transactions_fidelite (
  id                uuid primary key default gen_random_uuid(),
  membre_id         uuid not null references membres_fidelite(id) on delete cascade,
  station_id        uuid references stations(id),
  date_op           timestamptz not null default now(),
  type              type_transaction_fidelite not null,
  points            int not null,               -- positif pour gain, négatif ou absolu pour utilisation
  solde_apres       int not null,
  motif             text not null,              -- 'Plein 50L Gasoil', 'Échange Bon Lavage'
  montant_achat     bigint default 0,
  volume_l          numeric(10,2) default 0,
  recompense_id     uuid references recompenses_fidelite(id),
  operateur         text,                       -- Nom du pompiste ou gérant
  created_at        timestamptz not null default now()
);

create index if not exists idx_fidelite_membre_date on transactions_fidelite(membre_id, date_op desc);
create index if not exists idx_fidelite_carte on membres_fidelite(numero_carte);
create index if not exists idx_fidelite_tel on membres_fidelite(telephone);

-- RLS
alter table membres_fidelite enable row level security;
create policy fidelite_membres_all on membres_fidelite for all to authenticated using (true);

alter table recompenses_fidelite enable row level security;
create policy fidelite_recompenses_read on recompenses_fidelite for select to authenticated using (true);

alter table transactions_fidelite enable row level security;
create policy fidelite_transactions_all on transactions_fidelite for all to authenticated using (true);
