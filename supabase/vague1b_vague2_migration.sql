-- OGSS RÉSEAU — Migration Vague 1b + Vague 2
-- À exécuter dans Supabase SQL Editor après schema.sql et admin_role_migration.sql
-- Ajoute les tables métier étendues + opérations terrain + rôles opérationnels

-- ---------------------------------------------------------------------
-- Extension enum rôles opérationnels
-- ---------------------------------------------------------------------
alter type role_utilisateur add value if not exists 'pompiste';
alter type role_utilisateur add value if not exists 'lavage';
alter type role_utilisateur add value if not exists 'boutique';
alter type role_utilisateur add value if not exists 'stock';
alter type role_utilisateur add value if not exists 'maintenance';
alter type role_utilisateur add value if not exists 'commercial';
alter type role_utilisateur add value if not exists 'client_pro';

-- ---------------------------------------------------------------------
-- Vague 1b — Finance, CRM, maintenance
-- ---------------------------------------------------------------------
create table if not exists clients_professionnels (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid references stations(id),
  code            text not null,
  nom_entreprise  text not null,
  contact         text,
  telephone       text,
  email           text,
  plafond_credit  bigint default 0,
  actif           boolean not null default true,
  payload         jsonb,
  created_at      timestamptz not null default now(),
  maj_le          timestamptz not null default now(),
  unique (station_id, code)
);

create table if not exists vehicules (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid references stations(id),
  client_code     text,
  immatriculation text not null,
  marque          text,
  modele          text,
  carburant       text,
  payload         jsonb,
  created_at      timestamptz not null default now(),
  maj_le          timestamptz not null default now()
);

create table if not exists fournisseurs (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid references stations(id),
  code            text not null,
  nom_fournisseur text not null,
  telephone       text,
  email           text,
  payload         jsonb,
  created_at      timestamptz not null default now(),
  maj_le          timestamptz not null default now(),
  unique (station_id, code)
);

create table if not exists achats_carburant (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid not null references stations(id),
  fournisseur_id  uuid references fournisseurs(id),
  date_achat      date,
  designation     text,
  quantite_achat  numeric(12,2),
  montant_total   bigint default 0,
  statut_achat    text,
  payload         jsonb,
  created_at      timestamptz not null default now(),
  maj_le          timestamptz not null default now()
);

create table if not exists depenses (
  id                  uuid primary key default gen_random_uuid(),
  station_id          uuid not null references stations(id),
  date_depense        date,
  categorie_depense   text,
  designation_depense text,
  montant             bigint not null default 0,
  montant_depense     bigint,
  mode_paiement       text,
  statut              text,
  payload             jsonb,
  created_at          timestamptz not null default now(),
  maj_le              timestamptz not null default now()
);

create table if not exists equipements (
  id                    uuid primary key default gen_random_uuid(),
  station_id            uuid not null references stations(id),
  type_equipement       text,
  designation_equipement text,
  date_installation     date,
  etat_equipement       text,
  payload               jsonb,
  created_at            timestamptz not null default now(),
  maj_le                timestamptz not null default now()
);

create table if not exists maintenances (
  id                uuid primary key default gen_random_uuid(),
  station_id        uuid not null references stations(id),
  equipement_id     uuid references equipements(id),
  type_maintenance  text,
  date_maintenance  date,
  cout_maintenance  bigint default 0,
  statut_maintenance text,
  payload           jsonb,
  created_at        timestamptz not null default now(),
  maj_le            timestamptz not null default now()
);

create table if not exists incidents (
  id                  uuid primary key default gen_random_uuid(),
  station_id          uuid not null references stations(id),
  equipement_id       uuid references equipements(id),
  motif_incident      text,
  incident_date       date,
  description_incident text,
  priorite_incident   text,
  payload             jsonb,
  created_at          timestamptz not null default now(),
  maj_le              timestamptz not null default now()
);

create table if not exists sessions_caisse (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid not null references stations(id),
  date_session    date,
  pompiste_id     uuid,
  caisse_ouverte  bigint default 0,
  caisse_cloturee bigint default 0,
  statut_session  text,
  payload         jsonb,
  created_at      timestamptz not null default now(),
  maj_le          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Vague 2 — Opérations terrain (payload JSON flexible)
-- ---------------------------------------------------------------------
create table if not exists descentes_pompistes (
  id           uuid primary key default gen_random_uuid(),
  station_id   uuid not null references stations(id),
  date         date not null,
  pompiste_id  uuid,
  statut       text not null default 'EN_COURS',
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  maj_le       timestamptz not null default now()
);

create table if not exists prestations_lavage (
  id           uuid primary key default gen_random_uuid(),
  station_id   uuid not null references stations(id),
  date         date not null,
  agent        text,
  type_vehicule text,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  maj_le       timestamptz not null default now()
);

create table if not exists ventes_boutique (
  id           uuid primary key default gen_random_uuid(),
  station_id   uuid not null references stations(id),
  date         date not null,
  vendeur      text,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  maj_le       timestamptz not null default now()
);

create table if not exists produits_boutique (
  id           uuid primary key default gen_random_uuid(),
  station_id   uuid not null references stations(id),
  code         text not null,
  categorie    text,
  actif        boolean not null default true,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  maj_le       timestamptz not null default now(),
  unique (station_id, code)
);

create table if not exists jauges_cuves_ops (
  id           uuid primary key default gen_random_uuid(),
  station_id   uuid not null references stations(id),
  date         date not null,
  cuve_id      uuid,
  produit      text,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  maj_le       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS — lecture réseau, écriture selon station ou rôle opérationnel
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array[
    'clients_professionnels','vehicules','fournisseurs','achats_carburant',
    'depenses','equipements','maintenances','incidents','sessions_caisse',
    'descentes_pompistes','prestations_lavage','ventes_boutique',
    'produits_boutique','jauges_cuves_ops'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format(
      'create policy %I_read on %I for select to authenticated using (est_reseau() or station_id = ma_station())',
      t, t
    );
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format(
      'create policy %I_write on %I for all to authenticated using (est_reseau() or station_id = ma_station()) with check (est_reseau() or station_id = ma_station())',
      t, t
    );
  end loop;
end $$;

create index if not exists idx_depenses_station_date on depenses(station_id, date_depense desc);
create index if not exists idx_descentes_station_date on descentes_pompistes(station_id, date desc);
create index if not exists idx_ventes_boutique_station_date on ventes_boutique(station_id, date desc);
