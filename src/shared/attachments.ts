export const ATTACHMENT_LIMITS = {
  maxFiles: 10,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
} as const;

export type AttachmentKind = 'image' | 'document' | 'video';

export type AttachmentInput =
  | { path: string; name?: string; mimeType?: string }
  | { data: string; name: string; mimeType: string }
  | { url: string; name?: string; mimeType?: string };

/** Metadata returned by the trusted desktop picker. The path is never rendered. */
export interface DesktopAttachmentSelection {
  path: string;
  name: string;
  size: number;
}

export interface StagedAttachment {
  path: string;
  name: string;
  mimeType: string;
  kind: AttachmentKind;
  size: number;
  sha256: string;
}

export interface RequestAttachmentEnvelope {
  files: readonly StagedAttachment[];
  identity: string;
  totalBytes: number;
}

export interface NormalizedRequestEnvelope {
  promptText: string;
  mode: 'general' | 'writing' | 'coding' | 'image' | 'video' | 'music' | 'audio';
  attachments: RequestAttachmentEnvelope;
  caller: { transport: 'desktop' | 'loopback' | 'remote'; sessionId?: string };
}

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
const DOCUMENT_APPLICATION_MIME_TYPES = new Set([
  'application/pdf', 'application/json', 'application/ld+json', 'application/xml', 'application/yaml', 'application/toml',
  'application/javascript', 'application/typescript', 'application/sql', 'application/graphql', 'application/x-javascript',
  'application/x-typescript', 'application/x-python-code', 'application/x-httpd-php', 'application/x-sh',
]);

export function attachmentKindForMime(mimeType: string): AttachmentKind | undefined {
  const normalized = mimeType.toLowerCase().split(';', 1)[0].trim();
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(normalized)) return 'image';
  if ((VIDEO_MIME_TYPES as readonly string[]).includes(normalized)) return 'video';
  if (normalized.startsWith('text/') || DOCUMENT_APPLICATION_MIME_TYPES.has(normalized)) return 'document';
  return undefined;
}

export function attachmentIdentity(files: readonly Pick<StagedAttachment, 'sha256' | 'name' | 'mimeType'>[]): string {
  return files.map(file => `${file.sha256}:${file.mimeType}:${file.name}`).join('|');
}
