-- Cotisation payment currencies stored in lowercase (possible through a direct API call before 2026-10-09) were
-- counted 1:1 with the reference currency. New payments are now saved uppercase; this fixes any existing ones.
-- Idempotent: only touches rows that aren't uppercase yet.
UPDATE cotisation_payments
SET currency = upper(trim(currency))
WHERE currency <> upper(trim(currency));
