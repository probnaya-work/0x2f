// Parse a positive decimal task ID; invalid values return null.
export function parseTaskId(value) {
  if (typeof value !== 'string' || value.length === 0 || !/^[0-9]+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
