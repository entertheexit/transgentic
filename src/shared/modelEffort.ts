const prefix = 'transgentic/effort/';
const effortPattern = /^[a-z][a-z0-9_-]{0,31}$/;

function isEffort(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && effortPattern.test(value);
}

export function effortModelId(model: string, effort: string): string {
  return prefix + encodeURIComponent(model) + '/' + effort;
}

export function parseEffortModel(id?: string, separate?: unknown): { model?: string; effort?: string } {
  if (separate !== undefined && !isEffort(separate)) {
    throw new Error('Invalid reasoning_effort.');
  }
  if (!id?.startsWith(prefix)) return { model: id, effort: separate as string | undefined };
  const parts = id.slice(prefix.length).split('/');
  if (parts.length !== 2 || !parts[0] || !isEffort(parts[1])) {
    throw new Error('Invalid model effort variant.');
  }
  if (separate !== undefined && separate !== parts[1]) throw new Error('Conflicting reasoning effort values.');
  return { model: decodeURIComponent(parts[0]), effort: parts[1] };
}

export function isLegacyCurrentEffort(id: string): boolean {
  return id.startsWith(prefix + 'default/');
}
