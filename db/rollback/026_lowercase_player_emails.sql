-- Rollback 026: NO-OP (intentional).
--
-- 026 lowercased player emails in place. The original mixed-case values are not
-- stored anywhere, so the change is irreversible. This file exists only to keep
-- the rollback set complete; it performs no schema or data change.

SELECT 'rollback 026 is a no-op: lowercasing player emails is irreversible';
