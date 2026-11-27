-- =====================================================================
-- OGSS RÉSEAU — Migration Supabase : Comptes Clients Pro, Programmes de Bons,
-- Consommations Transporteurs & Facturation OHADA
-- =====================================================================
-- Ce script est idempotent et peut être exécuté directement dans le
-- SQL Editor de votre tableau de bord Supabase.
-- =====================================================================

-- 1. Extension du type enum role_utilisateur
-- ---------------------------------------------------------------------
alter type role_utilisateur add value if not exists 'client_pro';

-- 2. Extension de la table clients_professionnels (Champs B2B & Accès Espace)
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

-- Colonnes complémentaires pour le profil B2B étendu
alter table clients_professionnels add column if not exists auth_user_id uuid references auth.users(id);
alter table clients_professionnels add column if not exists ninea text;
alter table clients_professionnels add column if not exists rccm text;
alter table clients_professionnels add column if not exists nom_commercial text;
alter table clients_professionnels add column if not exists representant_legal text;
alter table clients_professionnels add column if not exists responsable_compte text;
alter table clients_professionnels add column if not exists tel_responsable_compte text;
alter table clients_professionnels add column if not exists email_responsable_compte text;
alter table clients_professionnels add column if not exists responsable_financier text;
alter table clients_professionnels add column if not exists tel_responsable_financier text;
alter table clients_professionnels add column if not exists email_responsable_financier text;
alter table clients_professionnels add column if not exists statut_acces text default 'actif'; -- actif, suspendu, inactif

-- 3. Table des Programmes de Bons de Carburant
-- ---------------------------------------------------------------------
create table if not exists programmes_bons (
  id                      uuid primary key default gen_random_uuid(),
  station_id              uuid not null references stations(id),
  client_id               uuid references clients_professionnels(id) on delete set null,
  client_code             text not null,
  numero_programme        text not null,
  objet                   text,
  date_debut              date,
  date_fin                date,
  type_carburant          text default 'Tous',
  volume_total_demande    numeric(12,2) not null default 0,
  volume_total_accorde    numeric(12,2) not null default 0,
  mode_gestion            text not null default 'global', -- 'global' ou 'plafonds_individuels'
  statut                  text not null default 'brouillon',
  -- 'brouillon', 'en_attente', 'info_demandee', 'a_corriger', 'valide', 'actif', 'suspendu', 'epuise', 'expire', 'refuse', 'cloture'
  transporteurs           jsonb not null default '[]'::jsonb,
  conditions_particulieres text,
  validation_details      jsonb,
  documents_justificatifs jsonb not null default '[]'::jsonb,
  payload                 jsonb,
  created_at              timestamptz not null default now(),
  maj_le                  timestamptz not null default now(),
  unique (station_id, numero_programme)
);

-- Index pour recherches rapides
create index if not exists idx_programmes_bons_station on programmes_bons(station_id);
create index if not exists idx_programmes_bons_client on programmes_bons(client_code);
create index if not exists idx_programmes_bons_statut on programmes_bons(statut);

-- 4. Table des Consommations de Carburant imputées aux Programmes
-- ---------------------------------------------------------------------
create table if not exists consommations_programmes (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid not null references stations(id),
  programme_id    uuid references programmes_bons(id) on delete cascade,
  client_code     text not null,
  transporteur_id text,
  chauffeur       text,
  telephone       text,
  immatriculation text,
  type_vehicule   text,
  carburant       text not null,
  volume          numeric(10,2) not null check (volume > 0),
  prix_unitaire   numeric(10,2) not null default 0,
  montant_total   numeric(12,2) not null default 0,
  bon_id          text,
  bon_numero      text,
  pompiste        text,
  cuve_code       text,
  pompe_code      text,
  date            timestamptz not null default now(),
  observations    text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_consommations_prog_programme on consommations_programmes(programme_id);
create index if not exists idx_consommations_prog_client on consommations_programmes(client_code);
create index if not exists idx_consommations_prog_immat on consommations_programmes(immatriculation);

-- 5. Table des Bons de Carburant (gestion unifiée)
-- ---------------------------------------------------------------------
create table if not exists bons_carburant (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid not null references stations(id),
  client_code     text not null,
  numero_bon      text not null,
  date            date not null default current_date,
  chauffeur       text,
  immatriculation text,
  carburant       text,
  litres          numeric(10,2) not null default 0,
  prix_unitaire   numeric(10,2) not null default 0,
  montant_total   numeric(12,2) not null default 0,
  pompiste        text,
  programme_id    uuid references programmes_bons(id) on delete set null,
  statut_paiement text not null default 'non_facture', -- 'non_facture', 'facture', 'regle', 'annule'
  facture_id      uuid,
  facture_numero  text,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (station_id, numero_bon)
);

create index if not exists idx_bons_carburant_station on bons_carburant(station_id);
create index if not exists idx_bons_carburant_client on bons_carburant(client_code);
create index if not exists idx_bons_carburant_statut on bons_carburant(statut_paiement);

-- 6. Table des Factures Officielles OHADA
-- ---------------------------------------------------------------------
create table if not exists factures (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid not null references stations(id),
  client_code     text not null,
  numero_facture  text not null,
  date_emission   date not null default current_date,
  date_echeance   date,
  objet           text,
  lignes_bons     jsonb not null default '[]'::jsonb,
  total_ht        numeric(14,2) not null default 0,
  taux_tva        numeric(5,2) not null default 0,
  montant_tva     numeric(14,2) not null default 0,
  total_ttc       numeric(14,2) not null default 0,
  statut          text not null default 'emise', -- 'brouillon', 'emise', 'payee', 'annulee'
  conditions_reglement text,
  qr_code_verification text,
  created_at      timestamptz not null default now(),
  maj_le          timestamptz not null default now(),
  unique (station_id, numero_facture)
);

create index if not exists idx_factures_station on factures(station_id);
create index if not exists idx_factures_client on factures(client_code);
create index if not exists idx_factures_statut on factures(statut);

-- 7. Activation de la Sécurité Row Level Security (RLS)
-- ---------------------------------------------------------------------
alter table programmes_bons enable row level security;
alter table consommations_programmes enable row level security;
alter table bons_carburant enable row level security;
alter table factures enable row level security;

-- 8. Fonctions d'aide RLS (vérifie et garantit l'alignement avec profils)
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

-- 9. Politiques de Sécurité RLS
-- ---------------------------------------------------------------------

-- Politiques pour l'équipe station (Directeur, Admin, Superviseur, Comptable, Gérant)
drop policy if exists rls_programmes_bons_staff on programmes_bons;
create policy rls_programmes_bons_staff on programmes_bons
  for all to authenticated
  using (
    est_reseau()
    or mon_role() = 'gerant'
    or station_id = ma_station()
    or station_id in (select station_id from profils where id = auth.uid())
  )
  with check (
    est_reseau()
    or mon_role() = 'gerant'
    or station_id = ma_station()
    or station_id in (select station_id from profils where id = auth.uid())
  );

drop policy if exists rls_consommations_staff on consommations_programmes;
create policy rls_consommations_staff on consommations_programmes
  for all to authenticated
  using (
    est_reseau()
    or mon_role() in ('gerant', 'pompiste')
    or station_id = ma_station()
    or station_id in (select station_id from profils where id = auth.uid())
  )
  with check (
    est_reseau()
    or mon_role() in ('gerant', 'pompiste')
    or station_id = ma_station()
    or station_id in (select station_id from profils where id = auth.uid())
  );

drop policy if exists rls_bons_carburant_staff on bons_carburant;
create policy rls_bons_carburant_staff on bons_carburant
  for all to authenticated
  using (
    est_reseau()
    or mon_role() in ('gerant', 'pompiste')
    or station_id = ma_station()
    or station_id in (select station_id from profils where id = auth.uid())
  )
  with check (
    est_reseau()
    or mon_role() in ('gerant', 'pompiste')
    or station_id = ma_station()
    or station_id in (select station_id from profils where id = auth.uid())
  );

drop policy if exists rls_factures_staff on factures;
create policy rls_factures_staff on factures
  for all to authenticated
  using (
    est_reseau()
    or mon_role() in ('gerant', 'comptable')
    or station_id = ma_station()
    or station_id in (select station_id from profils where id = auth.uid())
  )
  with check (
    est_reseau()
    or mon_role() in ('gerant', 'comptable')
    or station_id = ma_station()
    or station_id in (select station_id from profils where id = auth.uid())
  );

-- Politiques pour les Clients Professionnels (Accès limité à leurs propres données)
drop policy if exists rls_programmes_bons_client_pro on programmes_bons;
create policy rls_programmes_bons_client_pro on programmes_bons
  for select to authenticated
  using (
    client_id in (select id from clients_professionnels where auth_user_id = auth.uid())
    or client_code in (
      select code from clients_professionnels where auth_user_id = auth.uid()
    )
  );

drop policy if exists rls_programmes_bons_client_insert on programmes_bons;
create policy rls_programmes_bons_client_insert on programmes_bons
  for insert to authenticated
  with check (
    client_code in (
      select code from clients_professionnels where auth_user_id = auth.uid()
    )
  );

drop policy if exists rls_consommations_client_pro on consommations_programmes;
create policy rls_consommations_client_pro on consommations_programmes
  for select to authenticated
  using (
    client_code in (
      select code from clients_professionnels where auth_user_id = auth.uid()
    )
  );

drop policy if exists rls_bons_carburant_client_pro on bons_carburant;
create policy rls_bons_carburant_client_pro on bons_carburant
  for select to authenticated
  using (
    client_code in (
      select code from clients_professionnels where auth_user_id = auth.uid()
    )
  );

drop policy if exists rls_factures_client_pro on factures;
create policy rls_factures_client_pro on factures
  for select to authenticated
  using (
    client_code in (
      select code from clients_professionnels where auth_user_id = auth.uid()
    )
  );

-- 10. Déclencheur Supabase Auth pour attribuer fidèlement le rôle choisi (pompiste, laveur, client_pro, etc.)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r role_utilisateur;
  req_role text;
  st_id uuid;
begin
  req_role := new.raw_user_meta_data->>'role';
  if req_role is not null and req_role != '' then
    begin
      r := req_role::role_utilisateur;
    exception when others then
      r := 'pompiste';
    end;
  elsif exists (select 1 from profils where role in ('admin','directeur')) then
    r := 'gerant';
  else
    r := 'admin';
  end if;

  if new.raw_user_meta_data->>'station_id' is not null then
    begin
      st_id := (new.raw_user_meta_data->>'station_id')::uuid;
    exception when others then
      st_id := (select id from stations where code = 'HANN' limit 1);
    end;
  elsif r in ('admin','directeur') then
    st_id := null;
  else
    st_id := (select id from stations where code = 'HANN' limit 1);
  end if;

  insert into profils (id, nom_complet, telephone, role, station_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nom_complet', split_part(coalesce(new.email, 'utilisateur'), '@', 1)),
    coalesce(new.phone, new.raw_user_meta_data->>'telephone'),
    r,
    st_id
  )
  on conflict (id) do update set
    nom_complet = excluded.nom_complet,
    telephone = coalesce(excluded.telephone, profils.telephone),
    role = excluded.role,
    station_id = coalesce(excluded.station_id, profils.station_id);

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

