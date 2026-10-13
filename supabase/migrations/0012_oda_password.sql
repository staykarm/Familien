-- Valgfritt «Husk passordet» for Oda: passordet lagres AES-256-GCM-kryptert, slik at appen kan
-- logge inn på nytt av seg selv når Oda avslutter økten. Tom (null) = ikke husket.
alter table public.oda_connection add column if not exists password_encrypted text;
