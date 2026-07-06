import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import whoamiTool from "./tools/whoami";
import searchPostsTool from "./tools/search-posts";

// Import-safe: never read runtime env or throw at module load.
// VITE_SUPABASE_PROJECT_ID is inlined by Vite at build time; the fallback
// keeps the issuer well-formed during the manifest-extract eval.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "crownme-mcp",
  title: "CrownMe",
  version: "0.1.0",
  instructions:
    "Tools for CrownMe, the social crown-competition platform. Use `echo` to verify connectivity, `whoami` to fetch the signed-in user's profile, and `search_posts` to find posts by caption text.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, whoamiTool, searchPostsTool],
});
