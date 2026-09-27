-- Migration 099: Replace DEFERRABLE unique constraint on
-- whatsapp_message_outbox.idempotency_key with a plain unique index.
--
-- Migration 075 added UNIQUE (idempotency_key) DEFERRABLE INITIALLY IMMEDIATE.
-- PostgreSQL's ON CONFLICT arbiter inference does not support DEFERRABLE
-- constraints, so the QR broadcast RPCs (migrations 091, 092, 094) that use
-- ON CONFLICT (idempotency_key) fail at runtime with:
--   "ON CONFLICT does not support deferrable unique constraints/exclusion
--    constraints as arbiters"
--
-- Fix: drop the DEFERRABLE named constraint and replace it with a plain
-- non-deferrable unique index, which ON CONFLICT can use as an arbiter.

ALTER TABLE whatsapp_message_outbox
  DROP CONSTRAINT IF EXISTS whatsapp_message_outbox_idempotency_key_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_message_outbox_idempotency_key
  ON whatsapp_message_outbox (idempotency_key);
