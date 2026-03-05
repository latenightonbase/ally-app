import { Elysia } from "elysia";
import type { Tier } from "@ally/shared";

type TierGateOptions = {
  requiredTiers: Tier[];
  featureName: string;
};

export function requireTier({ requiredTiers, featureName }: TierGateOptions) {
  return new Elysia({ name: `tier-${featureName}` }).derive(
    { as: "scoped" },
    ({ user, set }: any) => {
      if (!user || !requiredTiers.includes(user.tier)) {
        set.status = 403;
        throw new Error(
          `${featureName} requires ${requiredTiers.join(" or ")} tier`,
        );
      }
    },
  );
}
