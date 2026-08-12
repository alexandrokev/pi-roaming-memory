const WIB_TIME_ZONE = "Asia/Jakarta";

/** Formats canonical UTC time for human display in Western Indonesian Time. */
export function formatWibTimestamp(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.valueOf())) {
    throw new Error("invalid created_at timestamp");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} WIB`;
}
