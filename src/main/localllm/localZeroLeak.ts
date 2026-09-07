/**
 * Local Zero-Leak Engine
 *
 * Ephemeral credential masking & reverse restoration for Cloud AI Webview requests.
 * Pre-dispatch (Inbound):
 *   Scans for environment variables (KEY=val), private tokens (sk-, ghp_, etc.),
 *   database connection URIs, and private IPv4/internal domains.
 *   Replaces detected values with indexed placeholders ({{TRANSGENTIC_SECRET_KEY_n}}).
 *   Stores ephemeral mappings in memory bound to the requestId.
 * Post-dispatch (Outbound):
 *   Restores actual secret values from memory into the completed response before
 *   returning to Codex / MCP client.
 */

export interface SecretMaskResult {
  sanitizedText: string;
  maskedCount: number;
  mapping: Map<string, string>; // placeholder -> original
}

export class LocalZeroLeakManager {
  // Ephemeral per-request vault: requestId -> (placeholder -> originalValue)
  private requestVaults: Map<string, Map<string, string>> = new Map();

  // Keyword filter for environment variable secret discovery
  private static readonly SECRET_ENV_KEY_REGEX =
    /(?:API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|AUTH|CREDENTIAL|PRIVATE|ACCESS_?KEY|CLIENT_?SECRET|WEBHOOK|SIGNING_?KEY|SESSION_?SECRET|ENCRYPTION_?KEY)/i;

  // Patterns for credential detection
  private static readonly PATTERNS: Array<{ regex: RegExp; name: string }> = [
    // 1. Private API Tokens & Keys
    { regex: /\bsk-[a-zA-Z0-9_\-]{20,}\b/g, name: 'openai_token' },
    { regex: /\bsk-ant-[a-zA-Z0-9_\-]{20,}\b/g, name: 'anthropic_token' },
    { regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g, name: 'google_token' },
    { regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/g, name: 'github_token' },
    { regex: /\bgithub_pat_[a-zA-Z0-9_]{50,}\b/g, name: 'github_fine_grained_token' },
    { regex: /\bxox[baprs]-[0-9a-zA-Z\-]{10,64}\b/g, name: 'slack_token' },
    { regex: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g, name: 'aws_access_key' },
    { regex: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,}\b/g, name: 'stripe_token' },
    { regex: /\bhf_[a-zA-Z0-9]{34}\b/g, name: 'huggingface_token' },
    { regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, name: 'jwt_token' },
    { regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----[a-zA-Z0-9\/+=\s\r\n]+-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/g, name: 'private_key_block' },

    // 2. Database Connection URIs (postgres, mysql, mongodb, redis, etc.)
    { regex: /\b(?:postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|amqp|couchdb):\/\/[^\s"'<>]+/gi, name: 'database_uri' },

    // 3. Private IPv4 Addresses (RFC 1918)
    // 10.0.0.0/8
    { regex: /\b10\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g, name: 'private_ip_10' },
    // 172.16.0.0/12
    { regex: /\b172\.(?:1[6-9]|2[0-9]|3[0-1])\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g, name: 'private_ip_172' },
    // 192.168.0.0/16
    { regex: /\b192\.168\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g, name: 'private_ip_192' },

    // 4. Internal / Private Domains (.local, .internal, .corp, .lan, .intranet, .private)
    { regex: /\b[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.(?:local|internal|corp|lan|intranet|private)\b/gi, name: 'internal_domain' },
  ];

  /**
   * Pre-dispatch: Scans prompt for sensitive credentials and replaces them with indexed placeholders.
   * Stores the ephemeral mapping bound to reqId.
   */
  public sanitizePrompt(text: string, reqId: string): SecretMaskResult {
    if (!text || typeof text !== 'string') {
      return { sanitizedText: text, maskedCount: 0, mapping: new Map() };
    }

    let mapping = this.requestVaults.get(reqId);
    if (!mapping) {
      mapping = new Map<string, string>();
      this.requestVaults.set(reqId, mapping);
    }

    // Inverted lookup to ensure same secret gets same placeholder
    const reverseLookup = new Map<string, string>();
    for (const [ph, orig] of mapping.entries()) {
      reverseLookup.set(orig, ph);
    }

    let placeholderCounter = mapping.size + 1;
    let sanitized = text;

    const getOrCreatePlaceholder = (val: string): string => {
      const existing = reverseLookup.get(val);
      if (existing) return existing;

      const placeholder = `{{TRANSGENTIC_SECRET_KEY_${placeholderCounter++}}}`;
      mapping!.set(placeholder, val);
      reverseLookup.set(val, placeholder);
      return placeholder;
    };

    // Step A: Scan for Environment Variables (KEY=value or export KEY="value")
    // Target environment variable assignments with secret-indicative names
    const envVarPattern = /(?:^|[\s\r\n;,])(?:export\s+)?([A-Za-z0-9_]{3,})\s*=\s*(["']?)([^\s\r\n"']+)\2/gm;
    sanitized = sanitized.replace(envVarPattern, (fullMatch, keyName, quote, secretVal) => {
      // Check if variable name indicates secret or sensitive configuration
      if (LocalZeroLeakManager.SECRET_ENV_KEY_REGEX.test(keyName) && secretVal && secretVal.length >= 4) {
        // Skip common placeholder words
        if (/^(?:your_.*|dummy|test|example|xxx|<.*>)$/i.test(secretVal)) {
          return fullMatch;
        }
        const placeholder = getOrCreatePlaceholder(secretVal);
        return fullMatch.replace(secretVal, placeholder);
      }
      return fullMatch;
    });

    // Step B: Scan for Tokens, Database URIs, Private IPs, and Internal Domains
    for (const { regex } of LocalZeroLeakManager.PATTERNS) {
      const re = new RegExp(regex.source, regex.flags);
      sanitized = sanitized.replace(re, (match) => {
        // Skip already replaced placeholders
        if (match.startsWith('{{TRANSGENTIC_SECRET_KEY_') && match.endsWith('}}')) {
          return match;
        }
        return getOrCreatePlaceholder(match);
      });
    }

    return {
      sanitizedText: sanitized,
      maskedCount: mapping.size,
      mapping,
    };
  }

  /**
   * Post-dispatch: Restores original secret values in Cloud AI response.
   * Automatically replaces placeholders back to original secrets.
   */
  public restoreResponse(text: string, reqId: string): string {
    if (!text || typeof text !== 'string') return text;

    const mapping = this.requestVaults.get(reqId);
    if (!mapping || mapping.size === 0) {
      return text;
    }

    let restored = text;
    // Replace all placeholders with their original values
    for (const [placeholder, originalSecret] of mapping.entries()) {
      restored = restored.split(placeholder).join(originalSecret);
    }

    return restored;
  }

  /**
   * Checks if any secrets were sanitized for the given requestId.
   */
  public hasSecretsForRequest(reqId: string): boolean {
    const mapping = this.requestVaults.get(reqId);
    return Boolean(mapping && mapping.size > 0);
  }

  /**
   * Retrieves the secret count for a given requestId.
   */
  public getSecretCount(reqId: string): number {
    return this.requestVaults.get(reqId)?.size || 0;
  }

  /**
   * Strict purge of ephemeral secret vault for a specific request.
   * Guarantees zero lingering in-memory credentials once execution finishes.
   */
  public purgeRequestContext(reqId: string): void {
    if (!reqId) return;
    this.requestVaults.delete(reqId);
  }

  /**
   * Clears all request vaults across all requests.
   */
  public clearAll(): void {
    this.requestVaults.clear();
  }
}

export const globalLocalZeroLeakManager = new LocalZeroLeakManager();
