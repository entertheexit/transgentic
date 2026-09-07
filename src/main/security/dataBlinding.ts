import crypto from 'crypto';
import { BlindedTokenMap } from '../../shared/types.js';
import { globalMemoryDb } from '../storage/memoryDb.js';

interface VaultEntry {
  token: string;
  original: string;
  type: BlindedTokenMap['type'];
  detectedAt: number;
  samplePreview: string;
  contextId?: string;
}

export class DataBlindingEngine {
  private vault = new Map<string, VaultEntry>();
  private reverseVault = new Map<string, string>(); // original -> token
  private listeners: Array<(secrets: BlindedTokenMap[]) => void> = [];

  // Patterns for regex secret discovery
  private static readonly PATTERNS: Array<{ regex: RegExp; type: BlindedTokenMap['type'] }> = [
    // OpenAI API Keys
    { regex: /sk-[a-zA-Z0-9_-]{20,}/g, type: 'api_key' },
    // Anthropic API Keys
    { regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g, type: 'api_key' },
    // Google Cloud / Gemini API Keys
    { regex: /AIza[0-9A-Za-z-_]{35}/g, type: 'api_key' },
    // HuggingFace Access Tokens
    { regex: /hf_[a-zA-Z0-9]{34}/g, type: 'api_key' },
    // Slack Bot/User/App Tokens
    { regex: /xox[baprs]-[0-9a-zA-Z-]{10,64}/g, type: 'api_key' },
    // AWS Access Key ID
    { regex: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g, type: 'api_key' },
    // GitHub Personal Access Token
    { regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}/g, type: 'api_key' },
    { regex: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g, type: 'api_key' },
    // Stripe API Keys
    { regex: /(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,}/g, type: 'api_key' },
    // Generic Bearer Tokens
    { regex: /Bearer\s+([a-zA-Z0-9_\-\.]{24,})/gi, type: 'generic_secret' },
    // Private Key Blocks (RSA, EC, OPENSSH, DSA, PGP)
    { regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----[a-zA-Z0-9\/+=\s\r\n]+-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/g, type: 'generic_secret' },
    // JWT Tokens
    { regex: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, type: 'jwt' },
    // Database Connection URIs (Postgres, MySQL, Mongo, Redis, CouchDB, AMQP)
    { regex: /(?:postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|amqp|couchdb):\/\/[^\s"'<>]+/gi, type: 'generic_secret' },
    // IPv4 addresses (excluding standard loopback and broadcast)
    { regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g, type: 'ip' },
    // Email addresses
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, type: 'email' },
  ];

  /**
   * Calculates Shannon entropy of a string.
   */
  public static calculateEntropy(str: string): number {
    if (!str || str.length === 0) return 0;
    const freq: Record<string, number> = {};
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      freq[char] = (freq[char] || 0) + 1;
    }
    let entropy = 0;
    for (const char in freq) {
      const p = freq[char] / str.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  /**
   * Generates a unique request context ID.
   */
  public createRequestContext(): string {
    return `req_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Blinds secrets in a given prompt string with cryptographically random request-scoped tokens.
   */
  public blind(
    text: string,
    contextId?: string
  ): { maskedText: string; replacementsCount: number; tokens: BlindedTokenMap[] } {
    if (!text || typeof text !== 'string') {
      return { maskedText: text, replacementsCount: 0, tokens: [] };
    }

    let masked = text;
    const createdTokens: BlindedTokenMap[] = [];
    let replacementsCount = 0;

    // 1. Apply Pattern-based masking
    for (const { regex, type } of DataBlindingEngine.PATTERNS) {
      const re = new RegExp(regex.source, regex.flags);
      masked = masked.replace(re, (match) => {
        // Don't mask loopback addresses or 0.0.0.0
        if (type === 'ip' && (match === '127.0.0.1' || match === '0.0.0.0' || match === '255.255.255.255')) {
          return match;
        }

        const token = this.getOrCreateToken(match, type, contextId);
        replacementsCount++;
        const entry = this.vault.get(token);
        if (entry && !createdTokens.some((t) => t.token === token)) {
          createdTokens.push({
            token: entry.token,
            type: entry.type,
            detectedAt: entry.detectedAt,
            samplePreview: entry.samplePreview,
          });
        }
        return token;
      });
    }

    // 2. High-entropy token scanner for unrecognized long alphanumeric strings (> 24 chars, entropy > 4.2)
    const words = masked.match(/[A-Za-z0-9_\-\.]{24,}/g) || [];
    for (const word of words) {
      // Ignore already blinded tokens
      if (
        (word.startsWith('[[TG_SEC_') || word.startsWith('[[TG_SECRET_')) &&
        word.endsWith(']]')
      ) {
        continue;
      }

      const entropy = DataBlindingEngine.calculateEntropy(word);
      if (entropy > 4.2 && word.length >= 24) {
        const token = this.getOrCreateToken(word, 'generic_secret', contextId);
        masked = masked.split(word).join(token);
        replacementsCount++;
        const entry = this.vault.get(token);
        if (entry && !createdTokens.some((t) => t.token === token)) {
          createdTokens.push({
            token: entry.token,
            type: entry.type,
            detectedAt: entry.detectedAt,
            samplePreview: entry.samplePreview,
          });
        }
      }
    }

    return {
      maskedText: masked,
      replacementsCount,
      tokens: createdTokens,
    };
  }

  /**
   * Replaces [[TG_SEC_...]] placeholders in response with original values.
   * Automatically purges the secret from in-memory vault and SQLite upon successful unblinding!
   */
  public unblind(text: string): string {
    if (!text || typeof text !== 'string') return text;

    let modified = false;
    const result = text.replace(/\[\[(?:TG_SEC_[a-f0-9]+|TG_SECRET_\d+)\]\]/gi, (match) => {
      let originalVal: string | null = null;
      const entry = this.vault.get(match);
      if (entry) {
        originalVal = entry.original;
        this.vault.delete(match);
        this.reverseVault.delete(entry.original);
        globalMemoryDb.deleteSecret(match);
        modified = true;
      } else {
        const decrypted = globalMemoryDb.getSecret(match);
        if (decrypted) {
          originalVal = decrypted;
          globalMemoryDb.deleteSecret(match);
          modified = true;
        }
      }

      if (originalVal !== null) {
        return originalVal;
      }
      return match;
    });

    if (modified) {
      this.notifyListeners();
    }

    return result;
  }

  /**
   * Strict purge of all secrets associated with a request context.
   * Invoked in 'finally' blocks to guarantee zero lingering in-memory credentials.
   */
  public purgeRequestContext(contextId: string): void {
    if (!contextId) return;
    let modified = false;
    for (const [token, entry] of Array.from(this.vault.entries())) {
      if (entry.contextId === contextId) {
        this.vault.delete(token);
        this.reverseVault.delete(entry.original);
        globalMemoryDb.deleteSecret(token);
        modified = true;
      }
    }
    if (modified) {
      this.notifyListeners();
    }
  }

  /**
   * Retrieve active tokens list for UI inspector.
   */
  public getTokens(): BlindedTokenMap[] {
    if (this.vault.size > 0) {
      return Array.from(this.vault.values()).map((e) => ({
        token: e.token,
        type: e.type,
        detectedAt: e.detectedAt,
        samplePreview: e.samplePreview,
      }));
    }
    return globalMemoryDb.getAllSecrets();
  }

  /**
   * Flush all secret tokens from volatile memory and encrypted SQLite.
   */
  public clearVault(): void {
    this.vault.clear();
    this.reverseVault.clear();
    globalMemoryDb.wipeAllSecrets();
    this.notifyListeners();
  }

  public onSecretsUpdate(listener: (secrets: BlindedTokenMap[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    const tokens = this.getTokens();
    for (const listener of this.listeners) {
      try {
        listener(tokens);
      } catch {}
    }
  }

  private getOrCreateToken(
    original: string,
    type: BlindedTokenMap['type'],
    contextId?: string
  ): string {
    if (this.reverseVault.has(original)) {
      return this.reverseVault.get(original)!;
    }

    // Cryptographically random token (10 hex characters = 40 bits of entropy)
    const token = `[[TG_SEC_${crypto.randomBytes(5).toString('hex')}]]`;
    const preview = this.createPreview(original, type);

    const entry: VaultEntry = {
      token,
      original,
      type,
      detectedAt: Date.now(),
      samplePreview: preview,
      contextId,
    };

    this.vault.set(token, entry);
    this.reverseVault.set(original, token);
    globalMemoryDb.insertSecret(token, original, type, preview, entry.detectedAt);
    this.notifyListeners();
    return token;
  }

  public getVaultEntries(): BlindedTokenMap[] {
    return this.getTokens();
  }

  private createPreview(original: string, type: BlindedTokenMap['type']): string {
    if (type === 'email') {
      const parts = original.split('@');
      return `${parts[0].slice(0, 2)}***@${parts[1] || '***'}`;
    }
    if (type === 'ip') {
      const parts = original.split('.');
      return `${parts[0]}.${parts[1]}.*.*`;
    }
    if (original.length > 8) {
      return `${original.slice(0, 4)}...${original.slice(-3)}`;
    }
    return `${original.slice(0, 2)}***`;
  }
}

export const globalBlindingEngine = new DataBlindingEngine();
