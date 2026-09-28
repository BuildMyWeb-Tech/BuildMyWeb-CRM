-- ============================================================
-- Migration 101: Auto-finalize broadcast status
--
-- Adds a trigger on broadcast_recipients that automatically
-- transitions broadcasts.status from 'sending' → 'sent' or
-- 'failed' once every recipient has left the 'pending' state.
--
-- This covers the case where:
--   a) The browser tab closed before the send hook's Step 5 ran
--   b) The QR worker finishes all jobs but doesn't flip the parent row
--   c) A server-side resume finishes without a browser watching
--
-- The trigger fires AFTER each broadcast_recipients UPDATE so it
-- sees the new status. It re-checks the pending count in one
-- indexed query and acts only when the count hits zero.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_finalize_broadcast()
RETURNS TRIGGER AS $$
DECLARE
  v_pending_count INTEGER;
  v_sent_count    INTEGER;
BEGIN
  -- Only care about broadcasts that are still in 'sending'.
  -- Skip anything else to avoid reversing a deliberate pause/cancel.
  IF (SELECT status FROM broadcasts WHERE id = NEW.broadcast_id) <> 'sending' THEN
    RETURN NEW;
  END IF;

  -- Count remaining pending recipients for this broadcast.
  SELECT COUNT(*)
    INTO v_pending_count
    FROM broadcast_recipients
   WHERE broadcast_id = NEW.broadcast_id
     AND status = 'pending';

  -- Still work left — don't touch the broadcast row.
  IF v_pending_count > 0 THEN
    RETURN NEW;
  END IF;

  -- All recipients are in a terminal state.
  -- sent_count > 0 means at least one message got through → 'sent'.
  -- Everything else (all failed / all cancelled / zero recipients) → 'failed'.
  SELECT sent_count
    INTO v_sent_count
    FROM broadcasts
   WHERE id = NEW.broadcast_id;

  UPDATE broadcasts
     SET status = CASE WHEN v_sent_count > 0 THEN 'sent' ELSE 'failed' END,
         updated_at = now()
   WHERE id = NEW.broadcast_id
     AND status = 'sending'; -- guard: don't overwrite paused/cancelled

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old trigger if it exists (idempotent).
DROP TRIGGER IF EXISTS trg_auto_finalize_broadcast ON broadcast_recipients;

CREATE TRIGGER trg_auto_finalize_broadcast
  AFTER UPDATE OF status ON broadcast_recipients
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status <> 'pending')
  EXECUTE FUNCTION public.auto_finalize_broadcast();
