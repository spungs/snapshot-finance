-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PRO', 'MAX');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "subscriptionStatus" TEXT DEFAULT 'active';
