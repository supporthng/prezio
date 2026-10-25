insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a', 'ana@a.com'),
 ('00000000-0000-0000-0000-00000000000b', 'beto@b.com'),
 ('00000000-0000-0000-0000-00000000000c', 'carla@a.com'),
 ('00000000-0000-0000-0000-00000000000d', 'dani@a.com'),
 ('00000000-0000-0000-0000-00000000000e', 'eva@x.com'),
 ('00000000-0000-0000-0000-000000000010', 'pat@prezio.com');

-- La plataforma (quien da de alta los negocios).
insert into public.plataforma_admins (user_id) values ('00000000-0000-0000-0000-000000000010') on conflict do nothing;
