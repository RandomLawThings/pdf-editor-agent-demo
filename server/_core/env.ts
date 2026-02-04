export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "dev-secret-key-change-in-production",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Standalone mode: set to "true" to bypass Manus auth and use local storage
  standaloneMode: process.env.STANDALONE_MODE === "true" || (
    !process.env.OAUTH_SERVER_URL &&
    !process.env.BUILT_IN_FORGE_API_URL &&
    process.env.NODE_ENV !== "production"
  ),
  // Anthropic API key for standalone mode
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
};
