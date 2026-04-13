export function normalizeLeadingCapital(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  const firstLetterIndex = trimmed.search(/[A-Za-z]/);
  if (firstLetterIndex === -1) return trimmed;

  return `${trimmed.slice(0, firstLetterIndex)}${trimmed[firstLetterIndex].toUpperCase()}${trimmed.slice(firstLetterIndex + 1)}`;
}

export function normalizeDriverName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(part => {
      if (!part) return part;
      const firstLetterIndex = part.search(/[A-Za-z]/);
      if (firstLetterIndex === -1) return part;
      return `${part.slice(0, firstLetterIndex)}${part[firstLetterIndex].toUpperCase()}${part.slice(firstLetterIndex + 1).toLowerCase()}`;
    })
    .join(' ');
}

export function normalizeDriverId(value: string, fallbackName = ''): string {
  const source = value.trim() || fallbackName;
  return normalizeDriverName(source);
}

export function normalizeMachineId(value: string): string {
  return normalizeLeadingCapital(value);
}
