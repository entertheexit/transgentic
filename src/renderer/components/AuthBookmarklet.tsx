import React, { useState } from 'react';
import { Copy, Check, Bookmark, Terminal, Sparkles, Key, Code, HelpCircle } from 'lucide-react';
import { ProviderId } from '../../shared/types.js';

interface AuthBookmarkletProps {
  providerId: ProviderId;
  providerName: string;
  providerUrl: string;
}

export function generateConsoleSnippet(providerId: ProviderId): string {
  return `(async () => {
  const provider = '${providerId}';
  const ls = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) ls[k] = localStorage.getItem(k);
  }
  const payload = {
    provider,
    origin: window.location.origin,
    cookies: document.cookie || '',
    localStorage: ls
  };
  const payloadStr = 'TRANSGENTIC_AUTH:' + JSON.stringify(payload);
  
  try {
    await navigator.clipboard.writeText(payloadStr);
    console.log('%c[Transgentic]%c Session payload copied to clipboard!', 'color:#14b8a6;font-weight:bold;', 'color:#fff;');
    alert('✅ Transgentic Session Copied to Clipboard!\\n\\nNow switch to Transgentic and click "Paste & Sync Session".');
  } catch (err) {
    prompt('Copy this session data for Transgentic:', payloadStr);
  }
})();`;
}

export function generateBookmarkletCode(providerId: ProviderId): string {
  const code = `javascript:(async function(){
    try {
      const p = '${providerId}';
      const ls = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) ls[k] = localStorage.getItem(k);
      }
      const payloadStr = 'TRANSGENTIC_AUTH:' + JSON.stringify({
        provider: p,
        origin: window.location.origin,
        cookies: document.cookie || '',
        localStorage: ls
      });
      await navigator.clipboard.writeText(payloadStr);
      alert('✅ Transgentic Session Copied to Clipboard!\\n\\nSwitch to Transgentic to apply.');
    } catch(e) {
      alert('Error: ' + e.message);
    }
  })();`;

  return code.replace(/\s+/g, ' ').trim();
}

export const AuthBookmarklet: React.FC<AuthBookmarkletProps> = ({ providerId, providerName, providerUrl }) => {
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);

  const consoleSnippet = generateConsoleSnippet(providerId);
  const bookmarkletCode = generateBookmarkletCode(providerId);

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(consoleSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleCopyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopiedBookmarklet(true);
    setTimeout(() => setCopiedBookmarklet(false), 2000);
  };

  return (
    <div className="space-y-3">
      {/* Method 1: 1-Click Console Copy (Zero CSP Restrictions) */}
      <div className="p-3.5 rounded-xl bg-teal-950/30 border border-teal-500/30 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-bold text-slate-200">1-Click DevTools Script</span>
          </div>
          <span className="text-[10px] font-mono text-teal-400/90 bg-teal-500/15 px-2 py-0.5 rounded border border-teal-500/30">
            Guaranteed (Bypasses CSP)
          </span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
          In Chrome on <strong>{providerName}</strong>, press <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-teal-300 font-mono text-[10px]">F12</kbd> (or Right Click → Inspect → <strong>Console</strong>), paste this script and hit Enter.
        </p>

        <button
          onClick={handleCopySnippet}
          className="w-full py-2 px-3 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer select-none"
        >
          {copiedSnippet ? (
            <>
              <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
              <span>Copied Script to Clipboard!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-950" />
              <span>Copy DevTools Console Script</span>
            </>
          )}
        </button>
      </div>

      {/* Method 2: cURL / Network Header Copy Instructions */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-300 text-xs font-semibold">
            <Key className="w-3.5 h-3.5 text-cyan-400" />
            <span>Alternative: Copy from DevTools Network</span>
          </div>
        </div>
        <ol className="text-[10.5px] text-slate-400 space-y-1 list-decimal list-inside leading-relaxed font-sans">
          <li>In Chrome DevTools → <strong>Network</strong> tab, refresh or send a message.</li>
          <li>Right-click any request (e.g. <code className="text-cyan-300">chat</code> or <code className="text-cyan-300">/api</code>) → <strong>Copy</strong> → <strong>Copy as cURL</strong>.</li>
          <li>Come back here and click <strong>"Paste & Sync Session"</strong> below.</li>
        </ol>
      </div>
    </div>
  );
};
