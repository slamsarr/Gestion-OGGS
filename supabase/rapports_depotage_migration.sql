-- =====================================================================
-- OGSS RÉSEAU — Migration Rapports de Dépotage de Carburant
-- Gère la traçabilité des livraisons en camion-citerne, les contrôles
-- de sécurité, les jauges avant/après et les constats d'écarts/manquants.
-- =====================================================================

create table if not exists rapports_depotage (
  id                  uuid primary key default gen_random_uuid(),
  station_id          uuid not null references stations(id),
  date_depotage       date not null,
  heure_debut         time,
  heure_fin           time,
  produit             produit_carburant not null,
  cuve_id             uuid references cuves(id),
  numero_bl           text not null,
  numero_scelles      text,
  fournisseur         text,
  depot_source        text,
  transporteur        text,
  camion_immat        text,
  chauffeur_nom       text,
  chauffeur_tel       text,
  receptionnaire_nom  text,
  
  -- Contrôles sécurité & qualité
  terre_connectee     boolean default true,
  extincteurs_places  boolean default true,
  scelles_conformes   boolean default true,
  test_eau_negatif    boolean default true,
  densite_relevee     numeric(6,3),
  temperature_c       numeric(5,1),

  -- Jaugeages et volumes
  volume_bl_l         numeric(12,2) not null,
  hauteur_avant_cm    numeric(8,1),
  volume_avant_l      numeric(12,2) not null,
  hauteur_apres_cm    numeric(8,1),
  volume_apres_l      numeric(12,2) not null,
  
  -- Résultats calculés
  volume_depote_reel_l numeric(12,2) generated always as (volume_apres_l - volume_avant_l) stored,
  ecart_depotage_l    numeric(12,2) generated always as ((volume_apres_l - volume_avant_l) - volume_bl_l) stored,
  
  observations        text,
  statut_conformite   text not null default 'CONFORME', -- 'CONFORME', 'TOLERANCE', 'LITIGE_MANQUANT'
  payload             jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  maj_le              timestamptz not null default now()
);

create index if not exists idx_depotage_station_date on rapports_depotage(station_id, date_depotage desc);
create index if not exists idx_depotage_numero_bl on rapports_depotage(numero_bl);

-- RLS
alter table rapports_depotage enable row level security;
drop policy if exists depotage_read on rapports_depotage;
create policy depotage_read on rapports_depotage for select to authenticated
using (est_reseau() or station_id = ma_station());

drop policy if exists depotage_write on rapports_depotage;
create policy depotage_write on rapports_depotage for all to authenticated
using (est_reseau() or station_id = ma_station())
with check (est_reseau() or station_id = ma_station());
