-- Razorpay billing: replace the Stripe customer field with Razorpay fields.

-- Drop the old Stripe customer column (and its unique index).
DROP INDEX IF EXISTS "Agency_stripeCustomerId_key";
ALTER TABLE "Agency" DROP COLUMN IF EXISTS "stripeCustomerId";

-- Add Razorpay billing columns.
ALTER TABLE "Agency" ADD COLUMN "razorpayCustomerId" TEXT;
ALTER TABLE "Agency" ADD COLUMN "razorpaySubscriptionId" TEXT;
ALTER TABLE "Agency" ADD COLUMN "subscriptionExpiresAt" TIMESTAMP(3);

-- Unique constraints (one Razorpay customer / subscription per agency).
CREATE UNIQUE INDEX "Agency_razorpayCustomerId_key" ON "Agency"("razorpayCustomerId");
CREATE UNIQUE INDEX "Agency_razorpaySubscriptionId_key" ON "Agency"("razorpaySubscriptionId");
