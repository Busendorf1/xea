import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  domain: process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL || "placeholder.auth0.com",
  clientId: process.env.AUTH0_CLIENT_ID || "placeholder-client-id",
  clientSecret: process.env.AUTH0_CLIENT_SECRET || "placeholder-client-secret",
  secret: process.env.AUTH0_SECRET || "placeholder-secret-must-be-32-characters-long",
  appBaseUrl: process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL || "http://localhost:3000",
});

