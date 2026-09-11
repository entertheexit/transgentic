import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import https from 'https';

export function getDefaultAssetsDirectory(): string {
  try {
    // Attempt to resolve native Documents directory via Electron or OS environment
    const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
    return path.join(homeDir, 'Documents', 'Transgentic');
  } catch {
    return path.join(process.cwd(), 'Documents', 'Transgentic');
  }
}

export class AssetManager {
  private assetsDir: string;
  private migratedAssetsDir = '';

  constructor(baseDir?: string) {
    this.assetsDir = baseDir || getDefaultAssetsDirectory();
    this.ensureDirectoryExists();
  }

  public setAssetsDirectory(newDir: string): void {
    if (newDir && typeof newDir === 'string') {
      this.assetsDir = newDir;
      this.ensureDirectoryExists();
    }
  }

  public getAssetsDirectory(): string {
    return this.assetsDir;
  }

  public getLibraryDirectory(type?: 'image' | 'video' | 'audio' | 'music' | 'Images' | 'Videos' | 'Music' | 'Audio' | string): string {
    const t = type?.toLowerCase() || '';
    const sub = t.includes('image') ? 'Images' : t.includes('video') ? 'Videos' : t.includes('music') ? 'Music' : t.includes('audio') ? 'Audio' : '';
    return sub ? path.join(this.assetsDir, 'Library', sub) : path.join(this.assetsDir, 'Library');
  }

  public getRecipesDirectory(sub?: 'Custom' | 'Healed' | 'History'): string {
    return sub ? path.join(this.assetsDir, 'Recipes', sub) : path.join(this.assetsDir, 'Recipes');
  }

  private ensureDirectoryExists(): void {
    try {
      const dirs = [
        this.assetsDir,
        path.join(this.assetsDir, 'Library', 'Images'),
        path.join(this.assetsDir, 'Library', 'Videos'),
        path.join(this.assetsDir, 'Library', 'Music'),
        path.join(this.assetsDir, 'Recipes', 'Custom'),
        path.join(this.assetsDir, 'Recipes', 'Healed'),
        path.join(this.assetsDir, 'Recipes', 'History'),
      ];
      for (const d of dirs) {
        if (!fs.existsSync(d)) {
          fs.mkdirSync(d, { recursive: true });
        }
      }
      this.migrateLegacyMusicLibrary();
    } catch (e: any) {
      console.warn(`[Transgentic AssetManager] Notice creating directory ${this.assetsDir}:`, e.message);
    }
  }

  private migrateLegacyMusicLibrary(): void {
    if (this.migratedAssetsDir === this.assetsDir) return;
    this.migratedAssetsDir = this.assetsDir;
    const legacyDir = path.join(this.assetsDir, 'Library', 'Audios');
    const musicDir = path.join(this.assetsDir, 'Library', 'Music');
    if (!fs.existsSync(legacyDir)) return;
    for (const name of fs.readdirSync(legacyDir)) {
      const source = path.join(legacyDir, name);
      const target = path.join(musicDir, name);
      if (fs.existsSync(target)) {
        console.warn(`[Transgentic AssetManager] Kept legacy music asset because the target already exists: ${source}`);
        continue;
      }
      try {
        fs.renameSync(source, target);
      } catch (error: any) {
        console.warn(`[Transgentic AssetManager] Notice migrating legacy music asset ${source}:`, error?.message);
      }
    }
    try {
      if (fs.readdirSync(legacyDir).length === 0) fs.rmdirSync(legacyDir);
    } catch {}
  }

  /**
   * Scans text for any inline Base64 data URIs (e.g. data:image/..., data:video/..., data:audio/...),
   * converts each into a local file saved in the active assets directory, and replaces the massive
   * Base64 string in the text with the local file path.
   */
  public async sanitizeAndPersistEmbeddedBase64(
    text: string,
    providerId: string = 'media',
    mode: string = 'media'
  ): Promise<{ text: string; firstExtractedPath?: string }> {
    if (!text || typeof text !== 'string' || !text.includes('data:')) {
      return { text };
    }

    let updatedText = text;
    let firstExtractedPath: string | undefined = undefined;

    const dataUriRegex = /data:(image|video|audio)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
    const matches = Array.from(text.matchAll(dataUriRegex));

    for (const match of matches) {
      const fullDataUri = match[0];
      const mediaType = match[1] as 'image' | 'video' | 'audio';
      try {
        const saved = await this.saveMediaAsset(
          fullDataUri,
          mediaType,
          `${providerId}_${mode}`,
          undefined,
          mode
        );
        if (!firstExtractedPath) {
          firstExtractedPath = saved.filePath;
        }
        updatedText = updatedText.replace(fullDataUri, saved.filePath);
      } catch (err: any) {
        console.warn('[Transgentic AssetManager] Notice converting embedded Base64 media:', err?.message);
      }
    }

    return { text: updatedText, firstExtractedPath };
  }

  /**
   * Saves a base64 encoded data URI, remote URL, or raw buffer to the local assets folder.
   * Ensures MCP clients receive only short local file paths rather than massive Base64 strings.
   */
  public async saveMediaAsset(
    data: string | Buffer,
    type: 'image' | 'video' | 'audio' | 'music' | 'Images' | 'Videos',
    suggestedName?: string,
    cookieHeader?: string,
    taskCategory?: string,
  ): Promise<{ filePath: string; relativePath: string; fileName: string; sizeBytes: number }> {
    this.ensureDirectoryExists();

    const timestamp = Date.now();
    const hash = crypto.randomBytes(4).toString('hex');
    let ext = 'png';
    const mediaType = type.toLowerCase();
    if (mediaType.includes('video')) ext = 'mp4';
    if (mediaType === 'audio' || mediaType === 'music') ext = 'mp3';

    if (typeof data === 'string') {
      const fnMatch = data.match(/filename=([^&]+)/i);
      if (fnMatch && fnMatch[1]) {
        const parsedExt = path.extname(fnMatch[1]).replace('.', '').toLowerCase();
        if (parsedExt) ext = parsedExt;
      }
    }

    let buffer: Buffer;

    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (typeof data === 'string' && (data.startsWith('http://') || data.startsWith('https://'))) {
      // Download remote asset to local disk
      buffer = await this.downloadRemoteBuffer(data, cookieHeader);
    } else if (typeof data === 'string' && data.startsWith('data:')) {
      const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches[2]) {
        buffer = Buffer.from(matches[2], 'base64');
        const mime = matches[1];
        if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
        if (mime.includes('webp')) ext = 'webp';
        if (mime.includes('webm')) ext = 'webm';
        if (mime.includes('mp4')) ext = 'mp4';
        if (mime.includes('wav')) ext = 'wav';
        if (mime.includes('mp3') || mime.includes('mpeg')) ext = 'mp3';
      } else {
        buffer = Buffer.from(data, 'utf-8');
      }
    } else if (typeof data === 'string') {
      buffer = Buffer.from(data, 'base64');
    } else {
      buffer = Buffer.from(String(data), 'utf-8');
    }

    // Inspect magic bytes if buffer is long enough
    if (buffer && buffer.length >= 8) {
      if (buffer.subarray(4, 8).toString('utf-8') === 'ftyp') {
        ext = 'mp4';
      } else if (buffer.subarray(0, 3).toString('utf-8') === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
        ext = 'mp3';
      } else if (buffer.subarray(0, 4).toString('utf-8') === 'RIFF' && buffer.length >= 12 && buffer.subarray(8, 12).toString('utf-8') === 'WAVE') {
        ext = 'wav';
      } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        ext = 'png';
      } else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        ext = 'jpg';
      }
    }

    const cleanBaseName = suggestedName ? suggestedName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30) : type;
    const category = (taskCategory || (mediaType === 'audio' ? 'music' : mediaType)).toLowerCase();
    const subFolder = category.includes('image') ? 'Images' : category.includes('video') ? 'Videos' : category.includes('music') ? 'Music' : 'Audio';
    const fileName = `${cleanBaseName}_${timestamp}_${hash}.${ext}`;
    const targetDir = path.join(this.assetsDir, 'Library', subFolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const filePath = path.join(targetDir, fileName);

    await fs.promises.writeFile(filePath, buffer);
    const sizeBytes = buffer.length;

    return {
      filePath,
      relativePath: `./Library/${subFolder}/${fileName}`,
      fileName,
      sizeBytes,
    };
  }

  private downloadRemoteBuffer(url: string, cookieHeader?: string): Promise<Buffer> {
    const cleanUrl = url.split('#')[0];
    return new Promise((resolve, reject) => {
      const get = (targetUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          return reject(new Error('Too many redirects downloading remote asset'));
        }
        try {
          const parsed = new URL(targetUrl);
          const client = targetUrl.startsWith('https://') ? https : http;
          const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,audio/*,*/*;q=0.8',
            'Referer': `${parsed.protocol}//${parsed.hostname}/`,
          };
          if (cookieHeader) {
            headers['Cookie'] = cookieHeader;
          }
          const options = {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            headers,
          };
          client.get(options, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              if (res.headers.location.includes('accounts.google.com/ServiceLogin')) {
                return reject(new Error('Failed to download asset: Authentication required (redirected to Google login).'));
              }
              return get(res.headers.location, redirectCount + 1);
            }
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              return reject(new Error(`Failed to download asset: HTTP status ${res.statusCode}`));
            }
            const contentType = res.headers['content-type'] || '';
            if (contentType.includes('text/html')) {
              return reject(new Error('Failed to download asset: Server returned HTML page instead of media content.'));
            }
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
          }).on('error', reject);
        } catch (err) {
          reject(err);
        }
      };
      get(cleanUrl);
    });
  }
}

export const globalAssetManager = new AssetManager();
