import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  domain: process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL || "dev-43c1fflhle3lv7jj.us.auth0.com",
  clientId: process.env.AUTH0_CLIENT_ID || "IwUlOm9fSvTIoXSkP4Bde6a2fBY4tErm",
  clientSecret: process.env.AUTH0_CLIENT_SECRET || "BhrjJEt523QxdiWWsOI73y5hJyVQkqlGoIp08xPUJBxlkoJ5q0ELp75RsmxfOF3S",
  secret: process.env.AUTH0_SECRET || "BhrjJEt523QxdiWWsOI73y5hJyVQkqlGoIp08xPUJBxlkoJ5q0ELp75RsmxfOF3S",
  appBaseUrl: process.env.APP_BASE_URL || process.env.AUTH0_BASE_URL || "http://localhost:3000",
});

