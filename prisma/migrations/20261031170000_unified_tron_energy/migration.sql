-- Prepared only: unify rental preparation for deposit sweeps and operating payouts.
ALTER TABLE "EnergyRentalIntent" ALTER COLUMN "withdrawalId" DROP NOT NULL;
ALTER TABLE "EnergyRentalIntent" ADD COLUMN "sweepAddressId" UUID REFERENCES "UserDepositAddress"(id) ON DELETE RESTRICT;
ALTER TABLE "EnergyRentalIntent" ADD COLUMN "recipientAddress" TEXT;
ALTER TABLE "EnergyRentalIntent" ADD COLUMN "amountBaseUnits" NUMERIC(78,0) CHECK ("amountBaseUnits">0);
ALTER TABLE "EnergyRentalIntent" ADD CONSTRAINT energy_exact_operation CHECK (("withdrawalId" IS NOT NULL)<>("sweepAddressId" IS NOT NULL));
-- The existing sender-pending unique index spans BOTH kinds and all rental requests.
