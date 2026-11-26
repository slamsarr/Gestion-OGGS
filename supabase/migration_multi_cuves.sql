-- ==============================================================================
-- MIGRATION SUPABASE : SUPPORT MULTI-CUVES CARBURANT (GASOIL & SUPER)
-- ==============================================================================
-- Permet à chaque station d'avoir plusieurs cuves physiques pour le même carburant
-- (ex: Cuve 1 Gasoil 30 000L, Cuve 2 Gasoil 20 000L, Cuve 1 Super 20 000L, Cuve 2 Super 10 000L)

-- 1. Supprimer la contrainte unique restrictive (station_id, produit)
alter table if exists cuves drop constraint if exists cuves_station_id_produit_key;

-- 2. Ajouter les champs nom, code et actif s'ils sont absents
alter table if exists cuves add column if not exists nom text;
alter table if exists cuves add column if not exists code text;
alter table if exists cuves add column if not exists actif boolean default true;

-- 3. Attribuer un nom par défaut aux cuves déjà existantes
update cuves 
set nom = case 
  when nom is not null and trim(nom) <> '' then nom
  else 'Cuve 1 ' || initcap(produit::text)
end
where nom is null or trim(nom) = '';

-- 4. Vérifier que la table opérationnelle jauges_cuves_ops dispose des colonnes cuve_id et cuve_nom
alter table if exists jauges_cuves_ops add column if not exists cuve_id uuid;
alter table if exists jauges_cuves_ops add column if not exists cuve_nom text;
alter table if exists jauges_cuves_ops add column if not exists eau_fond_cm numeric default 0;
