import { supabase } from "@/integrations/supabase/client";

export type FollowState = "none" | "requested" | "following";

function normalizeFollowState(value: unknown): FollowState {
  return value === "following" || value === "requested" ? value : "none";
}

export async function getFollowState(targetId: string): Promise<FollowState> {
  const { data, error } = await supabase.rpc("get_follow_state", {
    _target_id: targetId,
  });
  if (error) throw error;
  return normalizeFollowState(data);
}

export async function changeFollowState(
  targetId: string,
  follow: boolean,
): Promise<FollowState> {
  const { data, error } = await supabase.rpc("set_follow_state", {
    _target_id: targetId,
    _follow: follow,
  });
  if (error) throw error;
  return normalizeFollowState(data);
}

export async function respondToFollowRequest(
  requestId: string,
  accept: boolean,
): Promise<"accepted" | "rejected"> {
  const { data, error } = await supabase.rpc("respond_follow_request", {
    _request_id: requestId,
    _accept: accept,
  });
  if (error) throw error;
  return data === "accepted" ? "accepted" : "rejected";
}
