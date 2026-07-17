export interface PublicRuntimeConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseProjectId: string | null;
  errorReportingEndpoint: string | null;
  errors: string[];
  isValid: boolean;
}

type PublicEnv = Record<string, string | boolean | undefined>;

const readString = (env: PublicEnv, key: string): string => {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
};

const projectRefFromUrl = (value: string): string | null => {
  try {
    const hostname = new URL(value).hostname;
    return hostname.endsWith(".supabase.co") ? hostname.split(".")[0] : null;
  } catch {
    return null;
  }
};

/**
 * Validate public, browser-safe configuration before any SDK is constructed.
 * This prevents a missing Lovable/Vite variable from taking down the entire SPA.
 */
export function validatePublicRuntimeConfig(env: PublicEnv): PublicRuntimeConfig {
  const supabaseUrl = readString(env, "VITE_SUPABASE_URL");
  const supabasePublishableKey = readString(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
  const supabaseProjectId = readString(env, "VITE_SUPABASE_PROJECT_ID") || null;
  const rawReportingEndpoint = readString(env, "VITE_ERROR_REPORTING_ENDPOINT");
  const errors: string[] = [];

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(supabaseUrl);
    const local = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
    if (parsedUrl.protocol !== "https:" && !local) errors.push("VITE_SUPABASE_URL must use HTTPS");
  } catch {
    errors.push("VITE_SUPABASE_URL is missing or invalid");
  }

  if (supabasePublishableKey.length < 10) {
    errors.push("VITE_SUPABASE_PUBLISHABLE_KEY is missing or invalid");
  }

  if (!supabaseProjectId) {
    errors.push("VITE_SUPABASE_PROJECT_ID is missing");
  }

  const urlProjectRef = parsedUrl ? projectRefFromUrl(parsedUrl.href) : null;
  if (supabaseProjectId && urlProjectRef && supabaseProjectId !== urlProjectRef) {
    errors.push("VITE_SUPABASE_PROJECT_ID does not match VITE_SUPABASE_URL");
  }

  let errorReportingEndpoint: string | null = null;
  if (rawReportingEndpoint) {
    try {
      const parsed = new URL(rawReportingEndpoint);
      if (parsed.protocol !== "https:") throw new Error("not https");
      errorReportingEndpoint = parsed.href;
    } catch {
      errors.push("VITE_ERROR_REPORTING_ENDPOINT must be a valid HTTPS URL");
    }
  }

  return {
    supabaseUrl,
    supabasePublishableKey,
    supabaseProjectId,
    errorReportingEndpoint,
    errors,
    isValid: errors.length === 0,
  };
}

export const runtimeConfig = validatePublicRuntimeConfig(import.meta.env);
