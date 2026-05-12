-- Drop existing OAuth tokens from accounts (defense in depth: we don't use them)
UPDATE "accounts"
SET "refresh_token" = NULL,
    "access_token"  = NULL,
    "id_token"      = NULL;

-- Add consent timestamp to users
ALTER TABLE "users"
ADD COLUMN "agreedAt" TIMESTAMP(3);
