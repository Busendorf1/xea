import { describe, it, expect } from "vitest";
import { isDefaultProviderAvatar, hasManualAvatar } from "../utils/avatar";

describe("Avatar Utilities", () => {
  it("correctly identifies falsy or placeholder avatars as default", () => {
    expect(isDefaultProviderAvatar("")).toBe(true);
    expect(isDefaultProviderAvatar(null)).toBe(true);
    expect(isDefaultProviderAvatar(undefined)).toBe(true);
    expect(isDefaultProviderAvatar("   ")).toBe(true);
    expect(isDefaultProviderAvatar("PLACEHOLDER")).toBe(true);
    expect(isDefaultProviderAvatar("placeholder")).toBe(true);
    expect(isDefaultProviderAvatar("null")).toBe(true);
    expect(isDefaultProviderAvatar("undefined")).toBe(true);
    expect(isDefaultProviderAvatar("none")).toBe(true);
    expect(isDefaultProviderAvatar("false")).toBe(true);
  });

  it("correctly identifies Auth0 and Gravatar default/initial avatars as default", () => {
    // Auth0 Gravatar URL with default fallback
    const auth0Gravatar =
      "https://s.gravatar.com/avatar/2d75f28a2a89369327521dd97ef050eb?s=480&r=pg&d=https%3A%2F%2Fcdn.auth0.com%2Favatars%2Fno.png";
    expect(isDefaultProviderAvatar(auth0Gravatar)).toBe(true);
    expect(hasManualAvatar(auth0Gravatar)).toBe(false);

    // Direct Auth0 CDN initial avatar
    const auth0Cdn = "https://cdn.auth0.com/avatars/no.png";
    expect(isDefaultProviderAvatar(auth0Cdn)).toBe(true);
    expect(hasManualAvatar(auth0Cdn)).toBe(false);

    // Standard Gravatar
    const gravatar = "https://www.gravatar.com/avatar/00000000000000000000000000000000";
    expect(isDefaultProviderAvatar(gravatar)).toBe(true);

    // Common automated initial services
    expect(isDefaultProviderAvatar("https://ui-avatars.com/api/?name=Nonso+Michael")).toBe(true);
    expect(isDefaultProviderAvatar("https://api.dicebear.com/7.x/initials/svg?seed=NM")).toBe(true);
    expect(isDefaultProviderAvatar("https://avatar.vercel.sh/user")).toBe(true);
  });

  it("correctly identifies genuine user-uploaded logos and photos as manual", () => {
    // Supabase storage bucket 'dp'
    const supabaseDp =
      "https://udgaognmnfsiwvvqvxdq.supabase.co/storage/v1/object/public/dp/user_1789513269_logo.png";
    expect(isDefaultProviderAvatar(supabaseDp)).toBe(false);
    expect(hasManualAvatar(supabaseDp)).toBe(true);

    // Custom sponsor logo from company website
    const customSponsor = "https://images.unsplash.com/photo-1534528741775-53994a69daeb";
    expect(isDefaultProviderAvatar(customSponsor)).toBe(false);
    expect(hasManualAvatar(customSponsor)).toBe(true);
  });
});
