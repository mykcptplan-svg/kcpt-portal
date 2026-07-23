-- Denormalize email onto profiles so coach/admin member lists
-- need no service_role to read auth.users.

alter table public.profiles
  add column email text;

comment on column public.profiles.email is
  'Denormalized from auth.users at registration so coach/admin lists need no service_role.';
