-- ---------------------------------------------------------------------
-- Migration : parametres_networks + rj_delete + params policies
-- Ré-exécutable (IF NOT EXISTS / drop policy implicite avant recréation)
-- ---------------------------------------------------------------------

create table if not exists parametres_networks (
  id          text primary key default 'reseau',
  nom_reseau  text not null default 'OGSS Réseau',
  devise      text not null default 'FCFA',
  adresse     text,
  contact     text,
  maj_le      timestamptz not null default now()
);

alter table parametres_networks enable row level security;

drop policy if exists params_select on parametres_networks;
create policy params_select on parametres_networks for select to authenticated using (true);

drop policy if exists params_write on parametres_networks;
create policy params_write on parametres_networks for all to authenticated
  using (mon_role()='directeur') with check (mon_role()='directeur');

drop policy if exists rj_delete on rapports_journaliers;
create policy rj_delete on rapports_journaliers for delete to authenticated using (
  (mon_role()='gerant' and station_id = ma_station() and statut in ('BROUILLON','REJETE'))
  or mon_role() in ('superviseur','directeur'));