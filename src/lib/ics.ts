// Minimal ICS (RFC 5545) event generator for calendar downloads.
// Kept dependency-free so scheduled battle "Add to calendar" buttons work
// in-browser without extra libraries.

export interface IcsEventInput {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  start: Date;
  /** duration in minutes, defaults to 30 */
  durationMinutes?: number;
}

const pad = (n: number) => n.toString().padStart(2, "0");

/** Format a Date as UTC ICS timestamp: YYYYMMDDTHHMMSSZ */
export function formatIcsDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/** RFC 5545 escape for TEXT values. */
function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Build a valid single-event VCALENDAR string. */
export function buildIcsEvent(input: IcsEventInput): string {
  const dtStart = formatIcsDate(input.start);
  const end = new Date(input.start.getTime() + (input.durationMinutes ?? 30) * 60_000);
  const dtEnd = formatIcsDate(end);
  const dtStamp = formatIcsDate(new Date());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CrownMe//Battle Arena//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`);
  if (input.url) lines.push(`URL:${input.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

/** Trigger a browser download of an .ics file. */
export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
