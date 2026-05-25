// Maps raw validator/rate-limit messages to short, friendly reason codes
// shown to the user when their comment can't be posted.

export interface BlockReason {
  code: "EMPTY" | "TOO_LONG" | "SPAM_REPEAT" | "TOO_MANY_LINKS" | "PROFANITY" | "RATE_TOO_FAST" | "RATE_LIMIT" | "UNKNOWN";
  title: string;
  hint: string;
}

export function classifyBlock(message: string): BlockReason {
  const m = message.toLowerCase();
  if (m.includes("empty")) {
    return { code: "EMPTY", title: "Comment is empty", hint: "Type something before sending." };
  }
  if (m.includes("500 characters")) {
    return { code: "TOO_LONG", title: "Too long", hint: "Keep replies under 500 characters." };
  }
  if (m.includes("repeated characters")) {
    return { code: "SPAM_REPEAT", title: "Looks like spam", hint: "Avoid long runs of the same character." };
  }
  if (m.includes("too many links")) {
    return { code: "TOO_MANY_LINKS", title: "Too many links", hint: "Limit links to 2 per comment." };
  }
  if (m.includes("profanity")) {
    return { code: "PROFANITY", title: "Royal etiquette required", hint: "Profanity isn't allowed in the throne room." };
  }
  if (m.includes("commenting too fast")) {
    return { code: "RATE_TOO_FAST", title: "Slow down", hint: "Wait a moment between comments." };
  }
  if (m.includes("comment limit") || m.includes("take a breath")) {
    return { code: "RATE_LIMIT", title: "Comment limit reached", hint: "You've sent a few comments quickly — pause for a moment." };
  }
  return { code: "UNKNOWN", title: "Couldn't post comment", hint: message };
}
