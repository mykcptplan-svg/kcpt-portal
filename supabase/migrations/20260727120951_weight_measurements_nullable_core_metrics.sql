-- Allow partial measurement entries (Kelly): weight/waist/hips/chest optional like arm/thigh/calve.

ALTER TABLE public.weight_measurements
  ALTER COLUMN weight DROP NOT NULL,
  ALTER COLUMN waist DROP NOT NULL,
  ALTER COLUMN hips DROP NOT NULL,
  ALTER COLUMN chest DROP NOT NULL;
