/**
 * Transgentic Sync - In-Tab Visual Element Inspector
 * 
 * Allows users to point-and-click to map UI elements (prompt, submit, response container, etc.)
 * directly in the target AI web service. Supports pause/free-navigation across pages, multi-pass
 * fallback selectors (e.g. New Chat vs Ongoing Chat), and dedicated mode routes (e.g. /imagine).
 * Generates a valid CustomRecipe JSON and synchronizes directly with the Transgentic desktop application.
 */

(function () {
  'use strict';

  // Prevent multiple instances
  if (window.__TRANSGENTIC_INSPECTOR_ACTIVE__) {
    const existing = document.getElementById('transgentic-inspector-root');
    if (existing) {
      existing.remove();
    }
    window.__TRANSGENTIC_INSPECTOR_ACTIVE__ = false;
  }
  window.__TRANSGENTIC_INSPECTOR_ACTIVE__ = true;

  const STEPS = [
    {
      key: 'inputPrompt',
      title: 'Prompt Input Area',
      desc: 'Click on the textarea, input, or contenteditable field where prompts are typed.',
      required: true,
      category: 'input'
    },
    {
      key: 'submitButton',
      title: 'Submit / Send Button',
      desc: 'Click on the send, arrow, or submit button that dispatches prompts.',
      required: true,
      category: 'action'
    },
    {
      key: 'responseContainer',
      title: 'AI Response Container',
      desc: 'Click on a message bubble or wrapper containing an AI response.',
      required: true,
      category: 'output'
    },
    {
      key: 'textResponse',
      title: 'Response Text / Markdown',
      desc: 'Click on the generated text paragraph or markdown element inside the response.',
      required: true,
      category: 'output'
    },
    {
      key: 'modelSwitcher',
      title: 'Model Switcher (Optional)',
      desc: 'Click on the model selection dropdown or pill button (if present).',
      required: false,
      category: 'config'
    },
    {
      key: 'stopButton',
      title: 'Stop Generation Button (Optional)',
      desc: 'Click on the stop / pause button that appears while streaming (if visible).',
      required: false,
      category: 'action'
    },
    {
      key: 'imageResult',
      title: 'Image Result / Studio (Optional)',
      desc: 'Click on a generated image. (Tip: If images are in a studio page like /imagine, click Pause, navigate there, click Resume, and pick!)',
      required: false,
      category: 'media'
    },
    {
      key: 'videoResult',
      title: 'Video Result / Studio (Optional)',
      desc: 'Click on a generated video element or download button.',
      required: false,
      category: 'media'
    },
    {
      key: 'audioResult',
      title: 'Audio Result / Studio (Optional)',
      desc: 'Click on a generated audio player or music element.',
      required: false,
      category: 'media'
    }
  ];

  let currentStepIndex = 0;
  // recordedSelectors: Record<stepKey, string[]>
  const recordedSelectors = {};
  const recordedModeUrls = {};
  let hoveredElement = null;
  let isPaused = false;
  let isAddingFallback = false;

  // Session Persistence Helpers
  function saveSessionState() {
    try {
      const state = {
        inProgress: true,
        isPaused,
        currentStepIndex,
        recordedSelectors,
        recordedModeUrls,
        domain: window.location.hostname,
        targetUrl: window.location.href,
        timestamp: Date.now()
      };
      sessionStorage.setItem('transgentic_wizard_session', JSON.stringify(state));
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ transgentic_wizard_session: state });
      }
    } catch {}
  }

  function clearSessionState() {
    try {
      sessionStorage.removeItem('transgentic_wizard_session');
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove('transgentic_wizard_session');
      }
    } catch {}
  }

  // Restore saved session if page navigated / reloaded
  try {
    const raw = sessionStorage.getItem('transgentic_wizard_session');
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.inProgress && saved.domain === window.location.hostname) {
        currentStepIndex = typeof saved.currentStepIndex === 'number' ? saved.currentStepIndex : 0;
        if (saved.recordedSelectors) Object.assign(recordedSelectors, saved.recordedSelectors);
        if (saved.recordedModeUrls) Object.assign(recordedModeUrls, saved.recordedModeUrls);
        // On cross-page navigation, start in paused state so newly loaded page can be freely browsed
        isPaused = true;
      }
    }
  } catch {}

  // Web Audio subtle feedback blip
  function playBeep(freq = 600, duration = 0.08) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      setTimeout(() => ctx.close(), duration * 1000 + 200);
    } catch {}
  }

  // Generate robust CSS selector
  function computeSelector(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';

    // 1. Check ID
    if (el.id && typeof el.id === 'string' && !el.id.match(/\d{5,}|:r[a-z0-9]+:|svelte-|jsx-|css-/i)) {
      const idSel = `#${CSS.escape(el.id)}`;
      try {
        if (document.querySelectorAll(idSel).length === 1) {
          return idSel;
        }
      } catch {}
    }

    // 2. Check reliable data attributes
    const testAttrs = ['data-testid', 'data-qa', 'data-cy', 'data-element', 'data-id', 'data-component'];
    for (const attr of testAttrs) {
      const val = el.getAttribute(attr);
      if (val) {
        const attrSel = `[${attr}="${CSS.escape(val)}"]`;
        try {
          if (document.querySelectorAll(attrSel).length === 1) {
            return attrSel;
          }
        } catch {}
      }
    }

    // 3. Check aria-label / role / placeholder / name
    const tag = el.tagName.toLowerCase();
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.length < 50) {
      const ariaSel = `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
      try {
        if (document.querySelectorAll(ariaSel).length === 1) {
          return ariaSel;
        }
      } catch {}
    }

    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.length < 50) {
      const phSel = `${tag}[placeholder*="${CSS.escape(placeholder.slice(0, 24))}"]`;
      try {
        if (document.querySelectorAll(phSel).length === 1) {
          return phSel;
        }
      } catch {}
    }

    const role = el.getAttribute('role');
    if (role && ['textbox', 'button', 'combobox', 'listbox'].includes(role)) {
      const roleSel = `${tag}[role="${role}"]`;
      try {
        if (document.querySelectorAll(roleSel).length === 1) {
          return roleSel;
        }
      } catch {}
    }

    // 4. Hierarchical path calculation
    const path = [];
    let curr = el;
    while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.body && curr !== document.documentElement) {
      let segment = curr.tagName.toLowerCase();

      // Check if current node has id
      if (curr.id && !curr.id.match(/\d{5,}|:r[a-z0-9]+:|svelte-|jsx-|css-/i)) {
        segment = `#${CSS.escape(curr.id)}`;
        path.unshift(segment);
        break;
      }

      // Check unique classes
      const meaningfulClasses = Array.from(curr.classList || []).filter(c =>
        !c.match(/^hover:|^focus:|^active:|^dark:|^sm:|^md:|^lg:|\d{4,}|tailwind|css-/i) &&
        (c.includes('chat') || c.includes('message') || c.includes('input') || c.includes('prompt') || c.includes('button') || c.includes('send') || c.includes('submit') || c.includes('markdown') || c.includes('prose') || c.includes('bubble') || c.includes('result'))
      );

      if (meaningfulClasses.length > 0) {
        segment += `.${meaningfulClasses.slice(0, 2).map(c => CSS.escape(c)).join('.')}`;
      } else {
        const parent = curr.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(child => child.tagName === curr.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(curr) + 1;
            segment += `:nth-of-type(${index})`;
          }
        }
      }

      path.unshift(segment);
      if (path.length >= 4) break;
      curr = curr.parentElement;
    }

    const built = path.join(' > ');
    return built || tag;
  }

  // Shadow DOM Container setup
  const root = document.createElement('div');
  root.id = 'transgentic-inspector-root';
  root.style.cssText = 'all: initial; position: static; z-index: 2147483647;';
  const shadow = root.attachShadow({ mode: 'open' });

  // Stylesheet
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    .inspector-banner {
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      width: min(840px, calc(100vw - 32px));
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(59, 130, 246, 0.35);
      border-radius: 12px;
      box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.55), 0 0 24px rgba(59, 130, 246, 0.18);
      z-index: 2147483647;
      padding: 12px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      color: #f8fafc;
      animation: transgentic-slide-down 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes transgentic-slide-down {
      from { transform: translate(-50%, -24px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }

    @keyframes transgentic-slide-up {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .banner-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .brand-box {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-badge {
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 6px;
      text-transform: uppercase;
    }

    .brand-title {
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.01em;
    }

    .banner-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-pause {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #fcd34d;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }

    .btn-pause:hover {
      background: rgba(245, 158, 11, 0.28);
      color: #ffffff;
      border-color: #f59e0b;
    }

    .btn-exit {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #fca5a5;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
    }

    .btn-exit:hover {
      background: rgba(239, 68, 68, 0.25);
      color: #ffffff;
    }

    /* Step Timeline / Pills */
    .steps-timeline {
      display: flex;
      align-items: center;
      gap: 5px;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
    }
    .steps-timeline::-webkit-scrollbar {
      display: none;
    }

    .step-dot {
      flex: 1;
      height: 4px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 2px;
      transition: all 0.2s ease;
    }

    .step-dot.completed {
      background: #10b981;
    }

    .step-dot.active {
      background: #3b82f6;
      box-shadow: 0 0 8px #3b82f6;
    }

    /* Main Step Content */
    .step-body {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .step-details {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    .step-header-line {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .step-number-tag {
      font-size: 11px;
      font-weight: 700;
      color: #93c5fd;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .step-title {
      font-size: 15px;
      font-weight: 700;
      color: #f8fafc;
    }

    .step-desc {
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.4;
    }

    .hover-preview-box {
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(0, 0, 0, 0.35);
      border: 1px dashed rgba(59, 130, 246, 0.3);
      padding: 4px 8px;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      color: #60a5fa;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hover-tag {
      background: rgba(59, 130, 246, 0.25);
      color: #bfdbfe;
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 600;
    }

    /* Captured Candidates (Fallbacks) */
    .candidates-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }

    .candidate-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: #6ee7b7;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 5px;
    }

    .candidate-pill.fallback {
      background: rgba(168, 85, 247, 0.15);
      border-color: rgba(168, 85, 247, 0.35);
      color: #d8b4fe;
    }

    .candidate-badge {
      font-weight: 700;
      font-size: 9px;
      text-transform: uppercase;
      background: rgba(255, 255, 255, 0.15);
      padding: 1px 4px;
      border-radius: 3px;
    }

    .candidate-remove {
      cursor: pointer;
      opacity: 0.65;
      font-size: 11px;
      transition: opacity 0.15s;
    }

    .candidate-remove:hover {
      opacity: 1;
      color: #f87171;
    }

    .step-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      align-self: center;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .btn-action {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    .btn-action:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.16);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.3);
    }

    .btn-action:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .btn-primary-action {
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      border: 1px solid #60a5fa;
      color: #ffffff;
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.35);
    }

    .btn-primary-action:hover:not(:disabled) {
      background: linear-gradient(135deg, #1d4ed8, #2563eb);
      box-shadow: 0 6px 14px rgba(37, 99, 235, 0.5);
    }

    .btn-add-fallback {
      background: rgba(147, 51, 234, 0.18);
      border: 1px solid rgba(168, 85, 247, 0.4);
      color: #d8b4fe;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 7px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
    }

    .btn-add-fallback:hover {
      background: rgba(147, 51, 234, 0.32);
      color: #ffffff;
      border-color: #a855f7;
    }

    .btn-add-fallback.active {
      background: #a855f7;
      color: #ffffff;
      box-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
    }

    /* Collapsed Paused Floating Dock */
    .inspector-paused-dock {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(59, 130, 246, 0.45);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-radius: 12px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(59, 130, 246, 0.15);
      padding: 10px 16px;
      display: none;
      align-items: center;
      gap: 14px;
      z-index: 2147483647;
      animation: transgentic-slide-up 0.25s ease;
    }

    .inspector-paused-dock.active {
      display: flex;
    }

    .dock-status {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .dock-icon {
      font-size: 18px;
      animation: pulse-pause 2s infinite ease-in-out;
    }

    @keyframes pulse-pause {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.65; transform: scale(0.95); }
    }

    .dock-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .dock-title {
      font-size: 12px;
      font-weight: 700;
      color: #fcd34d;
    }

    .dock-sub {
      font-size: 11px;
      color: #94a3b8;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dock-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-dock-resume {
      background: linear-gradient(135deg, #10b981, #059669);
      border: 1px solid #34d399;
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 7px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }

    .btn-dock-resume:hover {
      background: linear-gradient(135deg, #059669, #047857);
      box-shadow: 0 6px 16px rgba(16, 185, 129, 0.6);
    }

    .btn-dock-discard {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #94a3b8;
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-dock-discard:hover {
      background: rgba(239, 68, 68, 0.2);
      color: #fca5a5;
      border-color: rgba(239, 68, 68, 0.4);
    }

    /* Result Modal Overlay */
    .result-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      animation: transgentic-fade-in 0.2s ease;
    }

    @keyframes transgentic-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .result-card {
      background: #0f172a;
      border: 1px solid rgba(59, 130, 246, 0.35);
      border-radius: 14px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
      width: min(680px, calc(100vw - 32px));
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 20px;
      color: #f8fafc;
    }

    .result-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .result-title {
      font-size: 16px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .result-badge {
      background: #10b981;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
    }

    .recipe-json-viewer {
      background: #020617;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      color: #38bdf8;
      max-height: 280px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .result-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 4px;
    }

    .toast-msg {
      font-size: 12px;
      color: #ffffff;
      padding: 6px 12px;
      border-radius: 6px;
      display: none;
      align-self: flex-start;
      animation: transgentic-fade-in 0.2s ease;
    }

    .toast-msg.show {
      display: inline-block;
    }
  `;
  shadow.appendChild(style);

  // Highlight Elements
  const highlightBox = document.createElement('div');
  highlightBox.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #3b82f6;
    background: rgba(59, 130, 246, 0.16);
    border-radius: 6px;
    z-index: 2147483646;
    transition: top 0.04s ease-out, left 0.04s ease-out, width 0.04s ease-out, height 0.04s ease-out;
    display: none;
  `;
  shadow.appendChild(highlightBox);

  const highlightTag = document.createElement('div');
  highlightTag.style.cssText = `
    position: fixed;
    pointer-events: none;
    background: #1d4ed8;
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    padding: 2px 7px;
    border-radius: 4px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
    z-index: 2147483647;
    display: none;
  `;
  shadow.appendChild(highlightTag);

  // Top Banner DOM
  const banner = document.createElement('div');
  banner.className = 'inspector-banner';
  banner.innerHTML = `
    <div class="banner-top">
      <div class="brand-box">
        <span class="brand-badge">Recipe Wizard</span>
        <span class="brand-title">Visual Element Inspector</span>
      </div>
      <div class="banner-actions">
        <button type="button" class="btn-pause" id="btnPause" title="Pause inspection to click links, switch pages, or new chat">
          <span>⏸️</span> Pause (Navigate)
        </button>
        <button type="button" class="btn-exit" id="btnExit">
          <span>✕</span> Exit (Esc)
        </button>
      </div>
    </div>
    <div class="steps-timeline" id="timelineBar">
      ${STEPS.map((_, i) => `<div class="step-dot" data-step="${i}"></div>`).join('')}
    </div>
    <div class="step-body">
      <div class="step-details">
        <div class="step-header-line">
          <span class="step-number-tag" id="stepCounter">STEP 1 OF ${STEPS.length}</span>
          <span class="step-title" id="stepTitle">Loading...</span>
        </div>
        <div class="step-desc" id="stepDesc">Loading...</div>
        <div class="candidates-container" id="candidatesContainer"></div>
        <div class="hover-preview-box">
          <span class="hover-tag" id="hoverTagPreview">Target</span>
          <span id="hoverSelectorPreview">Hover over any page element to inspect...</span>
        </div>
      </div>
      <div class="step-controls">
        <button type="button" class="btn-action" id="btnPrev" disabled>◀ Back</button>
        <button type="button" class="btn-add-fallback" id="btnAddFallback" style="display: none;">+ Add Fallback</button>
        <button type="button" class="btn-action btn-primary-action" id="btnNext" style="display: none;">Next Step ▶</button>
        <button type="button" class="btn-action" id="btnSkip">Skip ↷</button>
      </div>
    </div>
  `;
  shadow.appendChild(banner);

  // Collapsed Paused Floating Dock DOM
  const pausedDock = document.createElement('div');
  pausedDock.className = 'inspector-paused-dock';
  pausedDock.id = 'pausedDock';
  pausedDock.innerHTML = `
    <div class="dock-status">
      <span class="dock-icon">⏸️</span>
      <div class="dock-info">
        <span class="dock-title">Inspector Paused (Free Navigation)</span>
        <span class="dock-sub" id="dockStepLabel">Step 1: Loading...</span>
      </div>
    </div>
    <div class="dock-actions">
      <button type="button" class="btn-dock-resume" id="btnDockResume">▶️ Resume</button>
      <button type="button" class="btn-dock-discard" id="btnDockDiscard" title="Discard & Exit">✕</button>
    </div>
  `;
  shadow.appendChild(pausedDock);

  document.documentElement.appendChild(root);

  // Element handles
  const timelineBar = shadow.getElementById('timelineBar');
  const stepCounterEl = shadow.getElementById('stepCounter');
  const stepTitleEl = shadow.getElementById('stepTitle');
  const stepDescEl = shadow.getElementById('stepDesc');
  const candidatesContainer = shadow.getElementById('candidatesContainer');
  const hoverTagPreviewEl = shadow.getElementById('hoverTagPreview');
  const hoverSelectorPreviewEl = shadow.getElementById('hoverSelectorPreview');
  const btnPrev = shadow.getElementById('btnPrev');
  const btnNext = shadow.getElementById('btnNext');
  const btnAddFallback = shadow.getElementById('btnAddFallback');
  const btnSkip = shadow.getElementById('btnSkip');
  const btnPause = shadow.getElementById('btnPause');
  const btnExit = shadow.getElementById('btnExit');
  const dockStepLabel = shadow.getElementById('dockStepLabel');
  const btnDockResume = shadow.getElementById('btnDockResume');
  const btnDockDiscard = shadow.getElementById('btnDockDiscard');

  function renderCandidates() {
    candidatesContainer.innerHTML = '';
    const step = STEPS[currentStepIndex];
    if (!step) return;

    const list = recordedSelectors[step.key] || [];
    if (list.length === 0) {
      btnAddFallback.style.display = 'none';
      btnNext.style.display = 'none';
      return;
    }

    list.forEach((sel, idx) => {
      const pill = document.createElement('div');
      pill.className = `candidate-pill ${idx > 0 ? 'fallback' : ''}`;
      pill.innerHTML = `
        <span class="candidate-badge">${idx === 0 ? 'Primary' : `Fallback ${idx}`}</span>
        <span>${sel}</span>
        <span class="candidate-remove" title="Remove selector" data-idx="${idx}">✕</span>
      `;
      candidatesContainer.appendChild(pill);
    });

    // Remove candidate handler
    candidatesContainer.querySelectorAll('.candidate-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const removeIdx = parseInt(btn.getAttribute('data-idx') || '0', 10);
        list.splice(removeIdx, 1);
        saveSessionState();
        renderCandidates();
        updateStepUI();
      });
    });

    btnAddFallback.style.display = 'inline-flex';
    btnNext.style.display = 'inline-flex';
  }

  function updateStepUI() {
    const step = STEPS[currentStepIndex];
    if (!step) {
      finishInspection();
      return;
    }

    const list = recordedSelectors[step.key] || [];
    const hasCandidates = list.length > 0;

    stepCounterEl.textContent = `STEP ${currentStepIndex + 1} OF ${STEPS.length} ${step.required ? '(REQUIRED)' : '(OPTIONAL)'}`;
    stepTitleEl.textContent = step.title;

    if (isAddingFallback) {
      stepDescEl.textContent = `[CAPTURE FALLBACK] Click another element for "${step.title}" (or click 'Pause' to switch to another page/view first, then click 'Resume' and pick).`;
      btnAddFallback.classList.add('active');
      btnAddFallback.textContent = 'Cancel Fallback';
    } else {
      stepDescEl.textContent = step.desc;
      btnAddFallback.classList.remove('active');
      btnAddFallback.textContent = '+ Add Fallback';
    }

    dockStepLabel.textContent = `Step ${currentStepIndex + 1}/${STEPS.length}: ${step.title}${hasCandidates ? ` (${list.length} mapped)` : ''}`;

    // Timeline dots
    const dots = timelineBar.querySelectorAll('.step-dot');
    dots.forEach((dot, idx) => {
      dot.className = 'step-dot';
      const stepKey = STEPS[idx]?.key;
      const stepHasVal = (recordedSelectors[stepKey] || []).length > 0;
      if (stepHasVal) dot.classList.add('completed');
      if (idx === currentStepIndex) dot.classList.add('active');
    });

    btnPrev.disabled = currentStepIndex === 0;
    btnSkip.textContent = step.required ? 'Skip (Dev)' : 'Skip ↷';
    btnSkip.style.display = 'inline-flex';

    renderCandidates();

    // Mode-specific page indicator
    if (['imageResult', 'videoResult', 'audioResult'].includes(step.key) && recordedModeUrls[step.key]) {
      const modeNote = document.createElement('div');
      modeNote.style.cssText = 'font-size: 11px; color: #a7f3d0; margin-top: 2px;';
      modeNote.textContent = `📌 Route mapped: ${recordedModeUrls[step.key]}`;
      candidatesContainer.appendChild(modeNote);
    }
  }

  // Position highlight box over hovered element
  function positionHighlight(el) {
    if (isPaused || !el || el === document.body || el === document.documentElement) {
      highlightBox.style.display = 'none';
      highlightTag.style.display = 'none';
      return;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    highlightBox.style.display = 'block';
    highlightBox.style.top = `${rect.top}px`;
    highlightBox.style.left = `${rect.left}px`;
    highlightBox.style.width = `${rect.width}px`;
    highlightBox.style.height = `${rect.height}px`;

    const selector = computeSelector(el);
    highlightTag.style.display = 'block';
    highlightTag.textContent = `${el.tagName.toLowerCase()} ${selector}`;

    let tagTop = rect.top - 24;
    if (tagTop < 5) tagTop = rect.bottom + 6;
    highlightTag.style.top = `${tagTop}px`;
    highlightTag.style.left = `${Math.max(5, rect.left)}px`;

    hoverTagPreviewEl.textContent = el.tagName.toLowerCase();
    hoverSelectorPreviewEl.textContent = selector;
  }

  // Hover tracker
  function onMouseMove(e) {
    if (isPaused) return;
    const target = e.target;
    if (!target || root.contains(target)) return;
    if (target === hoveredElement) return;
    hoveredElement = target;
    positionHighlight(target);
  }

  // Click interceptor
  function onClick(e) {
    if (isPaused) return;
    const target = e.target;
    if (!target || root.contains(target)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const selector = computeSelector(target);
    const step = STEPS[currentStepIndex];
    if (!step) return;

    if (!recordedSelectors[step.key]) {
      recordedSelectors[step.key] = [];
    }

    if (!recordedSelectors[step.key].includes(selector)) {
      recordedSelectors[step.key].push(selector);
    }

    // If on a subroute for a media step, auto-record the dedicated pageUrl
    if (['imageResult', 'videoResult', 'audioResult'].includes(step.key)) {
      const pathname = window.location.pathname;
      if (pathname && pathname !== '/' && pathname.length > 1) {
        recordedModeUrls[step.key] = pathname;
      }
    }

    // Feedback
    playBeep(750, 0.08);
    highlightBox.style.borderColor = '#10b981';
    highlightBox.style.background = 'rgba(16, 185, 129, 0.25)';

    saveSessionState();

    setTimeout(() => {
      highlightBox.style.borderColor = '#3b82f6';
      highlightBox.style.background = 'rgba(59, 130, 246, 0.16)';

      if (isAddingFallback) {
        isAddingFallback = false;
        updateStepUI();
      } else {
        // If single selection, update candidates and UI so user can choose to advance or add fallback
        updateStepUI();
      }
    }, 160);
  }

  // Pause / Free-Navigation Mode
  function pauseInspector() {
    isPaused = true;
    highlightBox.style.display = 'none';
    highlightTag.style.display = 'none';
    banner.style.display = 'none';
    pausedDock.classList.add('active');
    saveSessionState();
  }

  function resumeInspector() {
    isPaused = false;
    pausedDock.classList.remove('active');
    banner.style.display = 'flex';
    updateStepUI();
    saveSessionState();
    playBeep(560, 0.06);
  }

  btnPause.addEventListener('click', pauseInspector);
  btnDockResume.addEventListener('click', resumeInspector);

  // Toggle Fallback Mode
  btnAddFallback.addEventListener('click', () => {
    isAddingFallback = !isAddingFallback;
    updateStepUI();
  });

  // Next step
  btnNext.addEventListener('click', () => {
    playBeep(650, 0.06);
    isAddingFallback = false;
    currentStepIndex++;
    updateStepUI();
    saveSessionState();
  });

  // Skip step
  btnSkip.addEventListener('click', () => {
    playBeep(400, 0.05);
    isAddingFallback = false;
    currentStepIndex++;
    updateStepUI();
    saveSessionState();
  });

  // Prev step
  btnPrev.addEventListener('click', () => {
    if (currentStepIndex > 0) {
      isAddingFallback = false;
      currentStepIndex--;
      updateStepUI();
      saveSessionState();
    }
  });

  // Exit cleanup
  function destroyInspector() {
    clearSessionState();
    window.removeEventListener('mousemove', onMouseMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKeyDown, true);
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
    window.__TRANSGENTIC_INSPECTOR_ACTIVE__ = false;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (isPaused) {
        resumeInspector();
      } else {
        destroyInspector();
      }
    }
  }

  btnExit.addEventListener('click', destroyInspector);
  btnDockDiscard.addEventListener('click', destroyInspector);

  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKeyDown, true);

  // Generate Custom Recipe JSON
  function buildRecipeDraft() {
    const domain = window.location.hostname;
    const cleanDomain = domain.replace(/^(www|app|chat)\./, '');
    const serviceSlug = cleanDomain.split('.')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const pageTitle = document.title ? document.title.split(/[-|–]/)[0].trim() : serviceSlug.toUpperCase();

    const formatCandidate = (val, fallbackDefault) => {
      if (!val || (Array.isArray(val) && val.length === 0)) return fallbackDefault;
      if (Array.isArray(val)) {
        return val.length === 1 ? val[0] : val;
      }
      return val;
    };

    const modes = ['general'];
    if (recordedSelectors.textResponse?.length > 0) modes.push('coding');
    if (recordedSelectors.imageResult?.length > 0) modes.push('image');
    if (recordedSelectors.videoResult?.length > 0) modes.push('video');
    if (recordedSelectors.audioResult?.length > 0) modes.push('audio');

    const inputPromptVal = formatCandidate(recordedSelectors.inputPrompt, 'textarea');
    const submitButtonVal = formatCandidate(recordedSelectors.submitButton, 'button[type="submit"]');
    const containerVal = formatCandidate(recordedSelectors.responseContainer, '.response');
    const textSelectorVal = formatCandidate(recordedSelectors.textResponse, '.response');

    const recipe = {
      version: '1.0',
      id: serviceSlug || 'custom_ai',
      title: pageTitle || 'Custom AI Service',
      name: pageTitle || 'Custom AI Service',
      domainMatch: domain,
      domain: domain,
      url: window.location.origin,
      authStrategy: 'cookie_sync',
      createdAt: new Date().toISOString(),
      selectors: {
        inputPrompt: inputPromptVal,
        submitButton: submitButtonVal,
        ...(recordedSelectors.stopButton?.length > 0 ? { stopButton: formatCandidate(recordedSelectors.stopButton) } : {}),
        ...(recordedSelectors.modelSwitcher?.length > 0 ? { modelDropdownTrigger: formatCandidate(recordedSelectors.modelSwitcher) } : {}),
      },
      response: {
        container: containerVal,
        textSelector: textSelectorVal,
        modes: {
          text: {
            enabled: true,
            mediaKind: 'text',
            contentSelector: formatCandidate(recordedSelectors.textResponse)
          },
          ...(recordedSelectors.imageResult?.length > 0 ? {
            image: {
              enabled: true,
              mediaKind: 'image',
              contentSelector: formatCandidate(recordedSelectors.imageResult),
              ...(recordedModeUrls.imageResult ? { pageUrl: recordedModeUrls.imageResult } : {})
            }
          } : {}),
          ...(recordedSelectors.videoResult?.length > 0 ? {
            video: {
              enabled: true,
              mediaKind: 'video',
              contentSelector: formatCandidate(recordedSelectors.videoResult),
              ...(recordedModeUrls.videoResult ? { pageUrl: recordedModeUrls.videoResult } : {})
            }
          } : {}),
          ...(recordedSelectors.audioResult?.length > 0 ? {
            audio: {
              enabled: true,
              mediaKind: 'audio',
              contentSelector: formatCandidate(recordedSelectors.audioResult),
              ...(recordedModeUrls.audioResult ? { pageUrl: recordedModeUrls.audioResult } : {})
            }
          } : {})
        }
      },
      author: 'Visual Inspector'
    };

    return recipe;
  }

  // Inspection Finished: Show modal
  function finishInspection() {
    clearSessionState();

    // Hide banner, highlight & dock
    banner.style.display = 'none';
    pausedDock.classList.remove('active');
    highlightBox.style.display = 'none';
    highlightTag.style.display = 'none';

    const recipe = buildRecipeDraft();
    const recipeJson = JSON.stringify(recipe, null, 2);

    const resultModal = document.createElement('div');
    resultModal.className = 'result-backdrop';
    resultModal.innerHTML = `
      <div class="result-card">
        <div class="result-header">
          <div class="result-title">
            <span>🎉 Recipe Created!</span>
            <span class="result-badge">${recipe.title || recipe.name}</span>
          </div>
          <button type="button" class="btn-exit" id="btnModalClose">✕ Close</button>
        </div>
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          All selectors, multi-page fallbacks, and routes have been mapped. You can copy or synchronize this recipe directly into Transgentic now.
        </p>
        <div class="recipe-json-viewer">${recipeJson}</div>
        <div class="toast-msg" id="toastMsg"></div>
        <div class="result-actions">
          <button type="button" class="btn-action" id="btnCopyJson">📋 Copy JSON</button>
          <button type="button" class="btn-action btn-primary-action" id="btnSaveSync">🚀 Sync to Transgentic</button>
        </div>
      </div>
    `;
    shadow.appendChild(resultModal);

    const toastMsg = shadow.getElementById('toastMsg');
    const btnModalClose = shadow.getElementById('btnModalClose');
    const btnCopyJson = shadow.getElementById('btnCopyJson');
    const btnSaveSync = shadow.getElementById('btnSaveSync');

    function showToast(text, isError = false) {
      toastMsg.textContent = text;
      toastMsg.style.background = isError ? '#ef4444' : '#10b981';
      toastMsg.classList.add('show');
      setTimeout(() => toastMsg.classList.remove('show'), 3000);
    }

    btnCopyJson.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(recipeJson);
        showToast('Recipe JSON copied to clipboard!');
      } catch (err) {
        showToast('Failed to copy JSON: ' + err.message, true);
      }
    });

    btnSaveSync.addEventListener('click', async () => {
      btnSaveSync.disabled = true;
      btnSaveSync.textContent = 'Syncing...';

      // 1. Dispatch window event for in-app Electron browser
      window.postMessage({ type: 'TRANSGENTIC_INSPECTOR_RESULT', recipe }, '*');
      if (typeof window.__transgenticInspectorCallback === 'function') {
        try {
          window.__transgenticInspectorCallback(recipe);
        } catch {}
      }

      const doDirectFetch = async () => {
        try {
          const res = await fetch('http://127.0.0.1:58420/api/recipes/install-and-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipe, origin: window.location.href })
          });
          const data = await res.json();
          if (data.success) {
            showToast('Successfully installed in Transgentic desktop app!');
            setTimeout(() => {
              destroyInspector();
            }, 1500);
          } else {
            const errStr = typeof data.error === 'object' && data.error !== null ? (data.error.message || JSON.stringify(data.error)) : (data.error || 'Check if Transgentic is running');
            showToast('App response: ' + errStr, true);
            btnSaveSync.disabled = false;
            btnSaveSync.textContent = 'Sync to Transgentic';
          }
        } catch (err) {
          showToast('Could not confirm installation: ' + err.message, true);
          btnSaveSync.disabled = false;
          btnSaveSync.textContent = 'Sync to Transgentic';
        }
      };

      // 2. Dispatch chrome runtime message if in Chrome Extension context to extract session cookies
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage(
            { action: 'save_and_sync_recipe', recipe, url: window.location.href },
            (response) => {
              if (response && response.success) {
                const count = response.cookiesCount || 0;
                showToast(`Successfully installed with ${count} session cookies!`);
                setTimeout(() => {
                  destroyInspector();
                }, 1500);
              } else if (response && response.success === false) {
                showToast(String(response.error || 'Installation was declined or failed.'), true);
                btnSaveSync.disabled = false;
                btnSaveSync.textContent = 'Sync to Transgentic';
              } else {
                doDirectFetch();
              }
            }
          );
        } catch {
          doDirectFetch();
        }
      } else {
        doDirectFetch();
      }
    });

    btnModalClose.addEventListener('click', destroyInspector);
  }

  // Initial render: if session was restored from cross-page navigation, start paused
  if (isPaused) {
    pauseInspector();
  } else {
    updateStepUI();
    playBeep(520, 0.08);
  }
})();
