import supabaseAdmin from "./dbAdmin";

/**
 * Extracts storage object paths from a comma-separated or single URL string
 * matching a specific Supabase storage bucket name.
 */
export function extractStoragePaths(
  mediaUrls: string | string[] | null | undefined,
  bucketName: string
): string[] {
  if (!mediaUrls) return [];
  const urls = Array.isArray(mediaUrls) ? mediaUrls : String(mediaUrls).split(",");
  const paths: string[] = [];

  urls.forEach((url) => {
    if (typeof url !== "string") return;
    const trimmed = url.trim();
    const marker = `/${bucketName}/`;
    if (trimmed.includes(marker)) {
      const pathWithQuery = trimmed.split(marker).slice(1).join(marker);
      const cleanPath = pathWithQuery.split("?")[0];
      if (cleanPath) paths.push(decodeURIComponent(cleanPath));
    }
  });

  return Array.from(new Set(paths));
}

/**
 * Safely removes media files from a Supabase storage bucket.
 */
export async function purgeStorageMedia(
  mediaUrls: string | string[] | null | undefined,
  bucketName: string
): Promise<void> {
  try {
    const paths = extractStoragePaths(mediaUrls, bucketName);
    if (paths.length === 0) return;

    const { error } = await supabaseAdmin.storage.from(bucketName).remove(paths);
    if (error) {
      console.warn(`⚠️ Failed to remove files from ${bucketName}:`, error.message);
    } else {
      console.log(`🗑️ Successfully purged ${paths.length} file(s) from ${bucketName} bucket:`, paths);
    }
  } catch (err: any) {
    console.warn(`⚠️ Error purging storage media from ${bucketName}:`, err?.message || err);
  }
}
