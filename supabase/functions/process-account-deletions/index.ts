import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeCronRequest, cronResponseHeaders } from "../_shared/cron-auth.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

type DeletionJob = { job_id: string; target_user_id: string };
type StorageObject = { bucket_id: string; object_name: string };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: cronResponseHeaders,
});

async function removeStorage(job: DeletionJob): Promise<number> {
  let removed = 0;
  for (let page = 0; page < 200; page++) {
    const { data, error } = await admin.rpc("list_account_storage_objects", {
      _job_id: job.job_id,
      _target_user_id: job.target_user_id,
      _limit: 1000,
    });
    if (error) throw error;
    const objects = (data ?? []) as StorageObject[];
    if (objects.length === 0) return removed;

    const byBucket = new Map<string, string[]>();
    for (const object of objects) {
      const paths = byBucket.get(object.bucket_id) ?? [];
      paths.push(object.object_name);
      byBucket.set(object.bucket_id, paths);
    }
    for (const [bucket, paths] of byBucket) {
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) throw removeError;
      removed += paths.length;
    }
  }
  throw new Error("storage deletion exceeded the safety batch limit");
}

async function processJob(job: DeletionJob) {
  try {
    const removedObjects = await removeStorage(job);
    const { error: prepareError } = await admin.rpc("prepare_account_for_permanent_deletion", {
      _job_id: job.job_id,
      _target_user_id: job.target_user_id,
    });
    if (prepareError) throw prepareError;

    // Supabase soft deletion is irreversible while preserving a hashed user id,
    // which lets legally retained ledgers keep a non-public tombstone reference.
    const { error: authError } = await admin.auth.admin.deleteUser(job.target_user_id, true);
    if (authError) throw authError;

    const { error: completeError } = await admin.rpc("complete_account_deletion_job", {
      _job_id: job.job_id,
      _target_user_id: job.target_user_id,
    });
    if (completeError) throw completeError;
    return { ok: true as const, removedObjects };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.rpc("fail_account_deletion_job", {
      _job_id: job.job_id,
      _target_user_id: job.target_user_id,
      _error: message,
    });
    console.error("[process-account-deletions] job failed", job.job_id, message);
    return { ok: false as const, error: message };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method not allowed" });
  const authorization = authorizeCronRequest(req);
  if (!authorization.ok) return json(authorization.status, { ok: false, error: authorization.error });

  const { data, error } = await admin.rpc("claim_due_account_deletions", { _limit: 10 });
  if (error) return json(500, { ok: false, error: error.message });

  const jobs = (data ?? []) as DeletionJob[];
  const results = [];
  for (const job of jobs) results.push({ job_id: job.job_id, ...(await processJob(job)) });

  return json(results.some((result) => !result.ok) ? 500 : 200, {
    ok: results.every((result) => result.ok),
    claimed: jobs.length,
    completed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  });
});
