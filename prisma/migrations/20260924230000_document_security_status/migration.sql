-- Honest document status.
--
-- The old column `scanStatus` was set to 'clean' on every upload, but no antivirus / malware
-- scanner exists: uploads only pass size, allow-listed type and magic-byte signature checks.
-- Renaming it to `securityStatus` and re-mapping the values so the data never claims a scan
-- happened when it did not.
--
--   validated      passed size + type + magic-byte checks. NOT malware scanned.   (default)
--   scanned_clean  a real scanner inspected the file and found nothing (unused until one exists)
--   quarantined    a scanner flagged the file
ALTER TABLE "Document" RENAME COLUMN "scanStatus" TO "securityStatus";
ALTER TABLE "Document" ALTER COLUMN "securityStatus" SET DEFAULT 'validated';

UPDATE "Document" SET "securityStatus" = 'validated' WHERE "securityStatus" IN ('clean', 'pending', 'error');
UPDATE "Document" SET "securityStatus" = 'quarantined' WHERE "securityStatus" = 'flagged';
