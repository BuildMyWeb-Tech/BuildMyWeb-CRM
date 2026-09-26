-- Migration 089: Remove duplicate unique constraint on whatsapp_message_outbox.idempotency_key
--
-- Migration 073 created an inline UNIQUE (idempotency_key) constraint in the
-- CREATE TABLE statement, which PostgreSQL stored as an auto-named constraint
-- (whatsapp_message_outbox_idempotency_key_key).
-- Migration 075 then added a second named UNIQUE constraint
-- (whatsapp_message_outbox_idempotency_key_unique DEFERRABLE INITIALLY IMMEDIATE)
-- on the same column.  Both constraints produce separate B-tree indexes, so
-- every outbox INSERT maintains two identical unique indexes — double write
-- overhead with no functional benefit.
--
-- This migration drops the older auto-named constraint (from migration 073),
-- keeping the newer named + deferrable constraint from migration 075.
-- No data is deleted; only the redundant index is removed.
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS.

ALTER TABLE whatsapp_message_outbox
  DROP CONSTRAINT IF EXISTS whatsapp_message_outbox_idempotency_key_key;
