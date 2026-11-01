-- Prepared, not applied remotely. Existing address assignments must never be rewritten.
ALTER TABLE "DepositAddressVault" DROP CONSTRAINT "DepositAddressVault_network_check";
ALTER TABLE "DepositAddressVault" ADD CONSTRAINT "DepositAddressVault_network_check" CHECK (network IN ('TRC20','BEP20'));
ALTER TABLE "UserDepositAddress" DROP CONSTRAINT "UserDepositAddress_network_check";
ALTER TABLE "UserDepositAddress" ADD CONSTRAINT "UserDepositAddress_network_check" CHECK (network IN ('TRC20','BEP20'));
-- Bind assignment network to the referenced vault even if private callers misuse SQL.
ALTER TABLE "DepositAddressVault" ADD CONSTRAINT deposit_vault_network UNIQUE(id,network);
ALTER TABLE "UserDepositAddress" ADD CONSTRAINT deposit_assignment_network FOREIGN KEY ("vaultId",network) REFERENCES "DepositAddressVault"(id,network) ON DELETE RESTRICT;
