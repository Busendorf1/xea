import { z } from "zod";

const envSchema = z.object({
  AUTH0_SECRET: z.string().min(1, "AUTH0_SECRET is required"),
  AUTH0_BASE_URL: z.string().optional(),
  AUTH0_ISSUER_BASE_URL: z.string().optional(),
  AUTH0_CLIENT_ID: z.string().optional(),
  AUTH0_CLIENT_SECRET: z.string().optional(),

  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "NEXT_PUBLIC_SUPABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const getEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.warn("⚠️ Environment Variable Warning:", result.error.format());
    return {
      AUTH0_SECRET: process.env.AUTH0_SECRET || "",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      REDIS_HOST: process.env.REDIS_HOST || "127.0.0.1",
      REDIS_PORT: parseInt(process.env.REDIS_PORT || "6379", 10),
      REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
      REDIS_TLS: process.env.REDIS_TLS || undefined,
      NODE_ENV: (process.env.NODE_ENV as "development" | "test" | "production") || "development",
    };
  }
  return result.data;
};

export const env = getEnv();
