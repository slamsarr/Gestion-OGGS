-- OGSS RÉSEAU — Migration sécurité : fermeture du bootstrap admin
-- Ancien comportement : premier inscrit = admin (risque de prise de contrôle).
-- Nouveau : tout nouvel inscrit = gérant. Promotion admin/directeur = manuelle (SQL out-of-band).

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