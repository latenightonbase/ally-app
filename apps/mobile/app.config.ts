import type { ExpoConfig } from "expo/config";
import appJson from "./app.json";

export default (): ExpoConfig => {
  const base = appJson.expo as ExpoConfig;
  const inviteHost = process.env.EXPO_PUBLIC_INVITE_HOST?.trim();

  const universalLinkIntentFilter =
    inviteHost && inviteHost.length > 0
      ? {
          action: "VIEW" as const,
          autoVerify: true,
          data: [
            {
              scheme: "https" as const,
              host: inviteHost,
              pathPrefix: "/invite",
            },
          ],
          category: ["BROWSABLE" as const, "DEFAULT" as const],
        }
      : null;

  const existingIntentFilters = Array.isArray(base.android?.intentFilters)
    ? base.android.intentFilters
    : [];

  return {
    ...base,
    ios: {
      ...base.ios,
      ...(inviteHost ? { associatedDomains: [`applinks:${inviteHost}`] } : {}),
    },
    android: {
      ...base.android,
      package: base.android?.package ?? "com.anonymous.allyapp",
      ...(universalLinkIntentFilter
        ? { intentFilters: [...existingIntentFilters, universalLinkIntentFilter] }
        : {}),
    },
  };
};
