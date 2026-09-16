-- OGSS RÉSEAU — Migration : ajout du rôle admin
-- À appliquer dans SQL Editor (ou via Management API run_sql)
-- 1) État actuel
-- 2) Ajout 'admin' à l'enum, extension du pouvoir aux policies admin

-- Ajouter 'admin' à l'enum rôle_utilisateur (doit être exécuté hors transaction)
alter type role_utilisateur add value if not exists 'admin';

-- mon_role() retype déjà OK (enum étendu)
-- est_reseau() : admin = réseau
create or replace function est_reseau() returns boolean
language sql stable security definer set search_path = public as
  $$ select mon_role() in ('admin','superviseur','directeur','comptable') $$;

-- Policies : étendre le pouvoir directeur à admin
drop policy if exists stations_admin on stations;
create policy stations_admin on stations for insert to authenticated with check (mon_role() in ('directeur','admin'));
drop policy if exists stations_admin_u on stations;
create policy stations_admin_u on stations for update to authenticated using (mon_role() in ('directeur','admin'));
drop policy if exists stations_admin_d on stations;
create policy stations_admin_d on stations for delete to authenticated using (mon_role() in ('directeur','admin'));

drop policy if exists profils_admin on profils;
create policy profils_admin on profils for update to authenticated using (mon_role() in ('directeur','admin'));

drop policy if exists prix_admin on prix_carburant;
create policy prix_admin on prix_carburant for all to authenticated using (mon_role() in ('directeur','admin')) with check (mon_role() in ('directeur','admin'));

drop policy if exists produits_admin on produits;
create policy produits_admin on produits for all to authenticated using (mon_role() in ('directeur','admin','superviseur')) with check (mon_role() in ('directeur','admin','superviseur'));

drop policy if exists cat_admin on categories_depense;
create policy cat_admin on categories_depense for all to authenticated using (mon_role() in ('directeur','admin')) with check (mon_role() in ('directeur','admin'));

drop policy if exists pistolets_admin on pistolets;
create policy pistolets_admin on pistolets for all to authenticated using (mon_role() in ('directeur','admin')) with check (mon_role() in ('directeur','admin'));

drop policy if exists cuves_admin on cuves;
create policy cuves_admin on cuves for all to authenticated using (mon_role() in ('directeur','admin')) with check (mon_role() in ('directeur','admin'));

drop policy if exists rj_update on rapports_journaliers;
create policy rj_update on rapports_journaliers for update to authenticated using (
  (mon_role()='gerant' and station_id = ma_station() and statut in ('BROUILLON','REJETE'))
  or mon_role() in ('admin','superviseur','directeur'));

drop policy if exists rj_delete on rapports_journaliers;
create policy rj_delete on rapports_journaliers for delete to authenticated using (
  (mon_role()='gerant' and station_id = ma_station() and statut in ('BROUILLON','REJETE'))
  or mon_role() in ('admin','superviseur','directeur'));

drop policy if exists params_write on parametres_networks;
create policy params_write on parametres_networks for all to authenticated
  using (mon_role() in ('directeur','admin')) with check (mon_role() in ('directeur','admin'));

drop policy if exists credit_w on clients_credit;
create policy credit_w on clients_credit for all to authenticated using (mon_role() in ('directeur','admin','superviseur','comptable')) with check (mon_role() in ('directeur','admin','superviseur','comptable'));

-- Bootstrap : premier inscrit = admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r role_utilisateur;
begin
  if exists (select 1 from profils where role in ('admin','directeur')) then
    r := 'gerant';
  else
    r := 'admin';
  end if;
  insert into profils (id, nom_complet, telephone, role, station_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nom_complet', split_part(coalesce(new.email, 'utilisateur'), '@', 1)),
    coalesce(new.phone, new.raw_user_meta_data->>'telephone'),
    r,
    case when r in ('admin','directeur') then null else (select id from stations where code = 'HANN' limit 1) end
  );
  return new;
end $$;