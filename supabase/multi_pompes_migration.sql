-- =====================================================================
-- OGSS RÉSEAU — Migration Multi-Pompes & Bons d'Encaissement (Vague 2+)
-- Permet la gestion de plusieurs pompes (Caisses C1, C2... Cn) et de
-- multiples bons d'encaissement clients par session de caisse pompiste.
-- Compatible avec schema.sql et vague1b_vague2_migration.sql.
-- =====================================================================

-- 1. Vérification / Création de la table descentes_pompistes
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

-- Index pour recherche rapide par station, date et pompiste
create index if not exists idx_descentes_station_date on descentes_pompistes(station_id, date desc);
create index if not exists idx_descentes_pompiste on descentes_pompistes(pompiste_id, date desc);

-- 2. Index GIN sur le payload JSON pour interroger rapidement les pompes et les bons
create index if not exists idx_descentes_payload_gin on descentes_pompistes using gin (payload);

-- 3. Vue d'extraction pour reporting et audit des caisses individuelles par pompe
create or replace view v_descentes_caisses_detail as
select
  d.id as descente_id,
  d.station_id,
  d.date,
  d.pompiste_id,
  d.statut,
  d.created_at,
  coalesce(d.payload->>'pompiste_nom', '') as pompiste_nom,
  p.value->>'caisse_id' as caisse_id,
  p.value->>'pistolet_code' as pistolet_code,
  p.value->>'produit' as produit,
  (p.value->>'index_debut')::numeric as index_debut,
  (p.value->>'index_fin')::numeric as index_fin,
  (p.value->>'volume_vendu')::numeric as volume_vendu,
  (p.value->>'prix_unitaire')::numeric as prix_unitaire,
  (p.value->>'montant')::numeric as montant
from descentes_pompistes d,
lateral jsonb_array_elements(
  case
    when jsonb_typeof(d.payload->'pompes') = 'array' then d.payload->'pompes'
    else jsonb_build_array(jsonb_build_object(
      'caisse_id', 'C1',
      'pistolet_code', coalesce(d.payload->>'pistolet_code', ''),
      'produit', coalesce(d.payload->>'produit', 'GASOIL'),
      'index_debut', coalesce(d.payload->>'index_debut', '0'),
      'index_fin', coalesce(d.payload->>'index_fin', '0'),
      'volume_vendu', coalesce(d.payload->>'volume_vendu', '0'),
      'prix_unitaire', coalesce(d.payload->>'prix_unitaire', '0'),
      'montant', coalesce(d.payload->>'montant_theorique', '0')
    ))
  end
) as p;

-- 4. Vue d'extraction des bons d'encaissement par descente
create or replace view v_descentes_bons_detail as
select
  d.id as descente_id,
  d.station_id,
  d.date,
  d.pompiste_id,
  d.statut,
  b.value->>'id' as bon_id,
  b.value->>'client_code' as client_code,
  b.value->>'client_nom' as client_nom,
  b.value->>'numero_bon' as numero_bon,
  b.value->>'date' as date_bon,
  (b.value->>'montant')::numeric as montant,
  b.value->>'observation' as observation
from descentes_pompistes d,
lateral jsonb_array_elements(
  case
    when jsonb_typeof(d.payload->'bons') = 'array' then d.payload->'bons'
    else '[]'::jsonb
  end
) as b;

-- 5. Sécurité RLS
alter table descentes_pompistes enable row level security;
drop policy if exists descentes_read on descentes_pompistes;
create policy descentes_read on descentes_pompistes for select to authenticated
using (est_reseau() or station_id = ma_station());

drop policy if exists descentes_write on descentes_pompistes;
create policy descentes_write on descentes_pompistes for all to authenticated
using (est_reseau() or station_id = ma_station())
with check (est_reseau() or station_id = ma_station());
