// Parse a positive decimal task ID; invalid values return null.
export function parseTaskId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
