/**
 * Helper utility to safely parse potential JSON strings or array values.
 * Ensures resilient, fail-safe array parsing across components and API routes.
 */
export function safeParseArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
      return [value];
    } catch {
      // If comma-separated or plain string fallback
      return value.includes(",") ? value.split(",").map((s) => s.trim()) : [value];
    }
  }
  return [];
}
