-- =====================================================================
-- SCRIPT PUR SQL POUR CRÉER LES 9 COMPTES POMPISTES DANS SUPABASE
-- Mot de passe initial pour tous les comptes : Pompiste2026!
-- =====================================================================

-- 1. Extension de cryptage des mots de passe
create extension if not exists pgcrypto with schema extensions;

-- 2. Création des stations de base (si non existantes)
insert into public.stations (code, nom, localisation, nb_pistolets, actif) values
  ('HANN', 'Star Energy Hann Mariste', 'Hann Mariste, Dakar', 8, true),
  ('NDIAKHIRATE', 'Star Energy Ndiakhirate', 'Ndiakhirate, Rufisque', 8, true)
on conflict (code) do nothing;

-- 3. Création des 9 comptes dans auth.users
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  t.id,
  'authenticated',
  'authenticated',
  t.email,
  extensions.crypt('Pompiste2026!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('nom_complet', t.nom, 'role', 'pompiste'),
  now(),
  now()
from (values
  ('11111111-1111-1111-1111-111111111101'::uuid, 'pompiste1.hann@starenergy.sn', 'Amadou Diallo'),
  ('11111111-1111-1111-1111-111111111102'::uuid, 'pompiste2.hann@starenergy.sn', 'Moussa Diop'),
  ('11111111-1111-1111-1111-111111111103'::uuid, 'pompiste3.hann@starenergy.sn', 'Cheikh Ndiaye'),
  ('11111111-1111-1111-1111-111111111104'::uuid, 'pompiste4.hann@starenergy.sn', 'Ibrahima Fall'),
  ('11111111-1111-1111-1111-111111111105'::uuid, 'pompiste5.hann@starenergy.sn', 'Modou Sarr'),
  ('11111111-1111-1111-1111-111111111106'::uuid, 'pompiste1.ndk@starenergy.sn',  'Babacar Ba'),
  ('11111111-1111-1111-1111-111111111107'::uuid, 'pompiste2.ndk@starenergy.sn',  'Ousmane Sow'),
  ('11111111-1111-1111-1111-111111111108'::uuid, 'pompiste3.ndk@starenergy.sn',  'Alioune Badara Seck'),
  ('11111111-1111-1111-1111-111111111109'::uuid, 'pompiste4.ndk@starenergy.sn',  'Mamadou Lamine Gueye')
) as t(id, email, nom)
where not exists (select 1 from auth.users u where u.email = t.email);

-- 4. Création des identités auth.identities pour permettre la connexion email/mot de passe
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select
  u.id,
  u.id,
  format('{"sub":"%s","email":"%s"}', u.id::text, u.email)::jsonb,
  'email',
  u.id::text,
  now(),
  now(),
  now()
from auth.users u
where u.email in (
  'pompiste1.hann@starenergy.sn', 'pompiste2.hann@starenergy.sn', 'pompiste3.hann@starenergy.sn',
  'pompiste4.hann@starenergy.sn', 'pompiste5.hann@starenergy.sn', 'pompiste1.ndk@starenergy.sn',
  'pompiste2.ndk@starenergy.sn',  'pompiste3.ndk@starenergy.sn',  'pompiste4.ndk@starenergy.sn'
)
on conflict do nothing;

-- 5. Profils dans public.profils (rôle pompiste + station correspondante)
insert into public.profils (id, nom_complet, telephone, role, station_id, actif)
select
  u.id,
  t.nom,
  t.tel,
  'pompiste'::role_utilisateur,
  s.id,
  true
from (values
  ('pompiste1.hann@starenergy.sn', 'Amadou Diallo', '771000001', 'HANN'),
  ('pompiste2.hann@starenergy.sn', 'Moussa Diop', '771000002', 'HANN'),
  ('pompiste3.hann@starenergy.sn', 'Cheikh Ndiaye', '771000003', 'HANN'),
  ('pompiste4.hann@starenergy.sn', 'Ibrahima Fall', '771000004', 'HANN'),
  ('pompiste5.hann@starenergy.sn', 'Modou Sarr', '771000005', 'HANN'),
  ('pompiste1.ndk@starenergy.sn',  'Babacar Ba', '772000001', 'NDIAKHIRATE'),
  ('pompiste2.ndk@starenergy.sn',  'Ousmane Sow', '772000002', 'NDIAKHIRATE'),
  ('pompiste3.ndk@starenergy.sn',  'Alioune Badara Seck', '772000003', 'NDIAKHIRATE'),
  ('pompiste4.ndk@starenergy.sn',  'Mamadou Lamine Gueye', '772000004', 'NDIAKHIRATE')
) as t(email, nom, tel, station_code)
join auth.users u on u.email = t.email
left join public.stations s on s.code = t.station_code
on conflict (id) do update set
  nom_complet = excluded.nom_complet,
  telephone = excluded.telephone,
  role = excluded.role,
  station_id = excluded.station_id,
  actif = true;

-- 6. Enregistrement dans la table opérationnelle public.pompistes
insert into public.pompistes (station_id, nom, actif)
select s.id, t.nom, true
from (values
  ('Amadou Diallo', 'HANN'),
  ('Moussa Diop', 'HANN'),
  ('Cheikh Ndiaye', 'HANN'),
  ('Ibrahima Fall', 'HANN'),
  ('Modou Sarr', 'HANN'),
  ('Babacar Ba', 'NDIAKHIRATE'),
  ('Ousmane Sow', 'NDIAKHIRATE'),
  ('Alioune Badara Seck', 'NDIAKHIRATE'),
  ('Mamadou Lamine Gueye', 'NDIAKHIRATE')
) as t(nom, station_code)
join public.stations s on s.code = t.station_code
where not exists (
  select 1 from public.pompistes p where p.nom = t.nom and p.station_id = s.id
);

-- 7. Affichage du résultat final
select 
  p.nom_complet,
  u.email,
  p.role,
  s.nom as station,
  p.telephone,
  'Pompiste2026!' as mot_de_passe
from public.profils p
join auth.users u on u.id = p.id
left join public.stations s on s.id = p.station_id
where p.role = 'pompiste'
order by s.nom, p.nom_complet;
