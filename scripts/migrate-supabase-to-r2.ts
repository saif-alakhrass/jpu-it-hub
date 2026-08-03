/**
 * Migration Script: Move legacy files from Supabase Storage to Cloudflare R2
 *
 * This script:
 * 1. Queries all files with storage_provider = 'supabase' (or NULL)
 * 2. Downloads each file from Supabase Storage via signed URL
 * 3. Uploads it to the R2 bucket via the Cloudflare Worker's presigned URL
 * 4. Computes the SHA-256 hash
 * 5. Updates the database record: storage_provider = 'r2', object_key = new key, file_hash = hash
 * 6. Does NOT delete the original Supabase Storage objects (safety measure)
 *
 * Prerequisites:
 * - The Cloudflare Worker must be deployed and accessible
 * - You need a Supabase service role key (server-side, never in frontend)
 * - You need the Worker URL
 * - Run this script in a Node.js environment (not the browser)
 *
 * Usage:
 *   SUPABASE_URL=https://your-project.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
 *   R2_WORKER_URL=https://your-worker.workers.dev \
 *   WORKER_AUTH_TOKEN=your-supabase-jwt \
 *   node --experimental-strip-types scripts/migrate-supabase-to-r2.ts
 *
 * Safety:
 * - The script processes files one at a time to avoid overwhelming R2.
 * - It does NOT delete Supabase Storage objects — you can do that manually
 *   after verifying all files work from R2.
 * - If any file fails, the script logs the error and continues to the next.
 * - You can re-run the script — it skips files already on R2.
 * - A dry-run mode is available: DRY_RUN=true prints what would be done without doing it.
 */

// This script is designed to run in Node.js, not the browser.
// It uses fetch (available in Node 18+) and the crypto module.

interface FileRecord {
  id: string;
  subject_id: string;
  uploader_id: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
  storage_provider: string | null;
  object_key: string | null;
}

async function main(): Promise<void> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const R2_WORKER_URL = process.env.R2_WORKER_URL;
  const WORKER_AUTH_TOKEN = process.env.WORKER_AUTH_TOKEN;
  const DRY_RUN = process.env.DRY_RUN === 'true';

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !R2_WORKER_URL || !WORKER_AUTH_TOKEN) {
    console.error('Missing required environment variables. See script header for usage.');
    process.exit(1);
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Starting migration from Supabase Storage to R2...`);

  // 1. Fetch all legacy files
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/files?storage_provider=eq.supabase&select=id,subject_id,uploader_id,storage_path,file_type,file_size,storage_provider,object_key&order=created_at.asc&limit=1000`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
    },
  );

  if (!res.ok) {
    console.error('Failed to fetch files:', res.status, await res.text());
    process.exit(1);
  }

  const files = (await res.json()) as FileRecord[];
  console.log(`Found ${files.length} files to migrate.`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const file of files) {
    try {
      if (file.object_key && file.storage_provider === 'r2') {
        console.log(`Skipping ${file.id} — already on R2`);
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would migrate: ${file.id} (${file.storage_path})`);
        skipped++;
        continue;
      }

      // 2. Get signed URL from Supabase Storage
      const signedRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/sign/files/${file.storage_path}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expiresIn: 3600 }),
        },
      );

      if (!signedRes.ok) {
        console.error(`Failed to get signed URL for ${file.id}:`, signedRes.status);
        failed++;
        continue;
      }

      const signedData = await signedRes.json() as { signedURL: string };
      const downloadUrl = `${SUPABASE_URL}/storage/v1${signedData.signedURL}`;

      // 3. Download the file
      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) {
        console.error(`Failed to download ${file.id}:`, fileRes.status);
        failed++;
        continue;
      }

      const blob = await fileRes.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // 4. Compute SHA-256 hash
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const fileHash = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

      // 5. Request presigned upload URL from Worker
      const presignRes = await fetch(`${R2_WORKER_URL}/upload-presign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WORKER_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_name: file.storage_path.split('/').pop() || 'file',
          file_size: blob.size,
          file_type: file.file_type || 'pdf',
          subject_id: file.subject_id,
          tab: 'summaries', // Will be updated by the DB record
        }),
      });

      if (!presignRes.ok) {
        console.error(`Failed to get presign for ${file.id}:`, presignRes.status);
        failed++;
        continue;
      }

      const presign = await presignRes.json() as { upload_url: string; object_key: string; file_id: string; mime_type: string };

      // 6. Upload to R2
      const uploadRes = await fetch(presign.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': presign.mime_type },
        body: blob,
      });

      if (!uploadRes.ok) {
        console.error(`Failed to upload to R2 for ${file.id}:`, uploadRes.status);
        failed++;
        continue;
      }

      // 7. Update DB record
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/files?id=eq.${file.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storage_provider: 'r2',
            object_key: presign.object_key,
            file_hash: fileHash,
            mime_type: presign.mime_type,
          }),
        },
      );

      if (!updateRes.ok) {
        console.error(`Failed to update DB for ${file.id}:`, updateRes.status);
        // Try to clean up the R2 object
        // (In production, you'd call the Worker's delete endpoint)
        failed++;
        continue;
      }

      console.log(`Migrated ${file.id} → ${presign.object_key}`);
      success++;
    } catch (err) {
      console.error(`Error migrating ${file.id}:`, err);
      failed++;
    }
  }

  console.log(`\nMigration complete: ${success} succeeded, ${failed} failed, ${skipped} skipped.`);
  console.log('Supabase Storage objects were NOT deleted. Verify R2 access before removing them.');
}

main().catch(console.error);
