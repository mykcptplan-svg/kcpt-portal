-- Optional body measurements (Kelly template) alongside required weight/waist/hips/chest.
alter table public.weight_measurements
  add column arm numeric,
  add column thigh numeric,
  add column calve numeric;
