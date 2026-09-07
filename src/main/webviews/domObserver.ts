import { ProviderId, TaskMode } from '../../shared/types.js';
import { CustomRecipe } from '../../shared/types/recipe.js';

export interface DomInspectionResult {
  isGenerating: boolean;
  isThinking: boolean;
  isMediaRendering: boolean;
  hasActionButtons: boolean;
  isRateLimited: boolean;
  isSecurityWarning: boolean;
  securityWarningReason?: string;
  text: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'music';
}

export class DomObserver {
  /**
   * Generates browser-side DOM inspection script tailored for each provider
   * to accurately detect streaming status, thinking states, media rendering, and completion.
   */
  public static getInspectionScript(providerId: ProviderId, mode: TaskMode, recipeConfig?: CustomRecipe): string {
    return `
      (async function() {
        try {
          const bodyText = document.body ? (document.body.innerText || '') : '';

          // 1. Rate-Limit / Quota Exhaustion Detection
          const isRateLimited = 
            bodyText.includes("You've reached your limit") ||
            bodyText.includes("You have reached your limit") ||
            bodyText.includes("Too many requests") ||
            bodyText.includes("Rate limit exceeded") ||
            bodyText.includes("Usage cap reached") ||
            bodyText.includes("run out of Grok") ||
            bodyText.includes("You have run out of Grok queries") ||
            bodyText.includes("Please wait before sending more requests") ||
            bodyText.includes("Please wait a few moments") ||
            bodyText.includes("Capacity exceeded");

          // 2. Security, CAPTCHA, Reauthentication & Account Warning Detection
          let isSecurityWarning = false;
          let securityWarningReason = undefined;

          if (
            document.querySelector('#challenge-running, #cf-turnstile, iframe[src*="challenges.cloudflare.com"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .cf-turnstile') ||
            bodyText.includes("Verify you are human") ||
            bodyText.includes("Please verify you are a human") ||
            bodyText.includes("Completing the challenge") ||
            bodyText.includes("Security check") ||
            bodyText.includes("Checking your browser before accessing")
          ) {
            isSecurityWarning = true;
            securityWarningReason = "Verification challenge / CAPTCHA encountered";
          } else if (
            bodyText.includes("Session expired") ||
            bodyText.includes("Please log in again") ||
            bodyText.includes("Your session has timed out") ||
            bodyText.includes("Sign in to continue")
          ) {
            isSecurityWarning = true;
            securityWarningReason = "Session expired / Re-authentication required";
          } else if (
            bodyText.includes("Suspicious activity detected") ||
            bodyText.includes("Your account has been deactivated") ||
            bodyText.includes("Your account is restricted") ||
            bodyText.includes("Terms of service violation")
          ) {
            isSecurityWarning = true;
            securityWarningReason = "Provider account notice / restriction detected";
          }

          // 3. Helper to verify element visibility in DOM
          const isVisible = (el) => {
            if (!el) return false;
            return !!(el.offsetWidth || el.offsetHeight || (typeof el.getClientRects === 'function' && el.getClientRects().length > 0));
          };

          // 4. Active Stop Button Detection (Standard Active Generation Indicator)
          const isStopBtn = (btn) => {
            if (!isVisible(btn)) return false;
            if (btn.matches?.('button[data-testid="stop-button"], [data-testid="stop-button"]')) return true;
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            const text = (btn.textContent || '').toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            const testId = (btn.getAttribute('data-testid') || '').toLowerCase();

            if (testId.includes('stop')) return true;
            if (label.includes('stop') || label.includes('cancel') || label.includes('หยุด')) return true;
            if (title.includes('stop') || title.includes('cancel') || title.includes('หยุด')) return true;
            if (text.includes('stop generating') || text.includes('stop response') || text.includes('หยุดสร้าง') || text.includes('หยุดการตอบ')) return true;

            const hasSquare = !!btn.querySelector('.lucide-square, svg rect, svg [class*="square"]');
            if (hasSquare && (text.includes('stop') || label.includes('stop') || btn.querySelector('.sr-only, [class*="sr-only"]')?.textContent?.toLowerCase()?.includes('stop') || btn.classList.contains('bg-bg-brand-secondary'))) {
              return true;
            }
            return false;
          };

          let hasStopBtn = false;
          const allButtons = document.querySelectorAll('button, [role="button"]');
          for (const btn of allButtons) {
            if (isStopBtn(btn)) {
              hasStopBtn = true;
              break;
            }
          }

          if (!hasStopBtn) {
            const streamIndicators = document.querySelectorAll(
              '[data-is-streaming="true"], [data-testid*="streaming"], .streaming-indicator, .font-claude-message[data-is-streaming="true"]'
            );
            for (const ind of streamIndicators) {
              if (isVisible(ind)) {
                hasStopBtn = true;
                break;
              }
            }
          }

          // 5. Thinking / Reasoning State
          const isSpinner = (el) => {
            if (!isVisible(el)) return false;
            const cls = (el.className || '').toString().toLowerCase();
            return cls.includes('animate-spin') ||
                   cls.includes('animate-ai-spinner') ||
                   cls.includes('spinner') ||
                   cls.includes('ai-spinner');
          };

          let hasActiveSpinner = false;
          const spinnerCandidates = document.querySelectorAll(
            '.animate-spin, svg.animate-spin, [class*="animate-spin"], [class*="animate-ai-spinner"], [class*="spinner"], [data-testid*="thinking-spinner"], [data-testid*="spinner"]'
          );
          for (const sp of spinnerCandidates) {
            if (isSpinner(sp)) {
              hasActiveSpinner = true;
              break;
            }
          }

          const composerInput = document.querySelector('textarea[data-slot="textarea"], #prompt-textarea, textarea, input[data-testid="chat-input"]');
          const isComposerDisabled = composerInput ? (composerInput.disabled || composerInput.hasAttribute('disabled')) : false;

          let isThinking = (hasStopBtn && hasActiveSpinner) || (hasActiveSpinner && isComposerDisabled);

          // 6. Media Generation Progress Observer
          const mediaRenderingCandidates = document.querySelectorAll(
            'progress, ' +
            '.progress-bar, ' +
            '[role="progressbar"], ' +
            '.rendering-spinner, ' +
            'svg.animate-spin, ' +
            '.generating-media, ' +
            '[data-testid*="generating-placeholder"], ' +
            '[class*="placeholder-shimmer"], ' +
            '[class*="animate-image-placeholder-shimmer"], ' +
            '[class*="animate-music-bar-bounce"], ' +
            '[class*="music-bar-bounce"], ' +
            '[aria-label*="กำลังสร้างเพลง"], ' +
            '[aria-label*="กำลังสร้างเสียง"], ' +
            'image-loading-overlay:not(.done-generating)'
          );
          let isMediaRendering = false;
          for (const el of mediaRenderingCandidates) {
            // Ignore elements that have completed or are inside a completed container
            if (el.classList.contains('done-generating') || el.closest('.done-generating') || el.querySelector('.done-generating')) {
              continue;
            }
            if (isVisible(el)) {
              isMediaRendering = true;
              break;
            }
          }

          if (!isMediaRendering && /กำลังสร้าง(?:วิดีโอ|เพลง|เสียง|รูปภาพ)?.*กรุณารอสักครู่/.test(bodyText)) {
            isMediaRendering = true;
          }

          let isGenerating = hasStopBtn || hasActiveSpinner || isMediaRendering;

          // Helper to extract clean text from target markdown element
          const extractCleanText = (el) => {
            if (!el) return '';
            const markdownEl = el.querySelector(
              '.response-content-markdown, .streamdown-chat-md, .markdown, .markdown-content, .prose, .prose-chat, [data-testid="message-text"], [data-testid="response-text"]'
            );
            const target = markdownEl || el;

            try {
              const clone = target.cloneNode(true);
              if (clone && clone.querySelectorAll) {
                const toRemove = clone.querySelectorAll(
                  'details, ' +
                  '[data-testid*="thought" i], ' +
                  '[data-testid*="reasoning" i], ' +
                  '.thinking-accordion, ' +
                  '.thought-container, ' +
                  'button[aria-label*="Worked" i], ' +
                  'button[aria-label*="Thought" i], ' +
                  '[data-testid*="working" i], ' +
                  '[class*="animate-ai-spinner"], ' +
                  '[class*="spinner"], ' +
                  '.text-text-quaternary, ' +
                  '[data-testid*="generating-placeholder"], ' +
                  '[class*="placeholder-shimmer"], ' +
                  '[class*="animate-music-bar-bounce"], ' +
                  '[aria-label*="กำลังสร้างเพลง"], ' +
                  '[aria-label*="กำลังสร้างเสียง"], ' +
                  'thinking-overlay, ' +
                  'image-loading-overlay, ' +
                  '.generated-image-controls, ' +
                  'download-generated-image-button, ' +
                  '.model-response-label-announcer, ' +
                  'message-actions, ' +
                  '.response-container-header, ' +
                  '.response-container-footer, ' +
                  'sources-list, ' +
                  'freemium-rag-disclaimer, ' +
                  'footer, ' +
                  '[class*="disclaimer" i], ' +
                  '[data-testid*="disclaimer" i], ' +
                  'generated-video, ' +
                  'generated-music, ' +
                  'video-player, ' +
                  '.video-player, ' +
                  'input-slider'
                );
                for (const rem of toRemove) {
                  rem.remove();
                }

                const allDescendants = clone.querySelectorAll('*');
                for (const desc of allDescendants) {
                  const descText = (desc.textContent || '').trim();
                  if (
                    descText === 'กำลังประมวลผล กรุณารอสักครู่' ||
                    descText === 'กำลังประมวลผล' ||
                    descText === 'กรุณารอสักครู่' ||
                    descText.includes('กำลังสร้างวิดีโอ') ||
                    descText.includes('กำลังสร้างเพลง') ||
                    descText.includes('กำลังสร้างเสียง') ||
                    descText.includes('กำลังสร้างรูปภาพ') ||
                    descText.includes('Generating a more detailed image') ||
                    descText.includes('hang tight') ||
                    descText.includes('ThinkingGenerating') ||
                    descText === 'Processing, please wait' ||
                    descText === 'Thinking...' ||
                    descText === 'Reasoning...' ||
                    descText.includes('AI อาจผิดพลาดได้') ||
                    descText.includes('หลีกเลี่ยงการใส่ข้อมูลส่วนตัว') ||
                    descText.includes('AI may make mistakes')
                  ) {
                    desc.remove();
                  }
                }

                const extracted = (clone.innerText || clone.textContent || '').trim();
                if (
                  /^(Thinking|Thought|Working|Worked|Searching|Reasoning|Working\.\.\.|Thinking\.\.\.|Thought for.*|Worked for.*|Processing.*)$/i.test(extracted) ||
                  /^(Thinking)?Generating\s+(a\s+)?.*image.*hang\s*tight.*$/i.test(extracted) ||
                  /^(Thinking)?Generating\s+(an?\s+)?.*image.*$/i.test(extracted) ||
                  /^(Thinking)?Creating\s+(an?\s+)?.*image.*$/i.test(extracted) ||
                  /^Thinking\s*Generating.*$/i.test(extracted) ||
                  /^.*hang\s*tight\.?$/i.test(extracted) ||
                  /^(กำลังประมวลผล.*|กรุณารอสักครู่.*|กำลังคิด.*|กำลังสร้าง.*|กำลังสร้างวิดีโอ.*|กำลังสร้างเพลง.*|กำลังสร้างเสียง.*|.*\d+%\s*กรุณารอสักครู่.*)$/i.test(extracted) ||
                  /^(AI\s*อาจผิดพลาดได้.*|หลีกเลี่ยงการใส่ข้อมูลส่วนตัว.*|AI\s*may\s*make\s*mistakes.*)$/i.test(extracted)
                ) {
                  return '';
                }
                return extracted;
              }
            } catch (e) {}

            const raw = (target.innerText || target.textContent || '').trim();
            if (
              /^(Thinking|Thought|Working|Worked|Searching|Reasoning|Working\.\.\.|Thinking\.\.\.|Thought for.*|Worked for.*|Processing.*)$/i.test(raw) ||
              /^(Thinking)?Generating\s+(a\s+)?.*image.*hang\s*tight.*$/i.test(raw) ||
              /^(Thinking)?Generating\s+(an?\s+)?.*image.*$/i.test(raw) ||
              /^(Thinking)?Creating\s+(an?\s+)?.*image.*$/i.test(raw) ||
              /^Thinking\s*Generating.*$/i.test(raw) ||
              /^.*hang\s*tight\.?$/i.test(raw) ||
              /^(กำลังประมวลผล.*|กรุณารอสักครู่.*|กำลังคิด.*|กำลังสร้าง.*|กำลังสร้างวิดีโอ.*|กำลังสร้างเพลง.*|กำลังสร้างเสียง.*|.*\d+%\s*กรุณารอสักครู่.*)$/i.test(raw) ||
              /^(AI\s*อาจผิดพลาดได้.*|หลีกเลี่ยงการใส่ข้อมูลส่วนตัว.*|AI\s*may\s*make\s*mistakes.*)$/i.test(raw)
            ) {
              return '';
            }
            return raw;
          };

          // 7. Provider-Specific Response Text & Media Extraction
          let lastText = '';
          let mediaUrl = undefined;
          let mediaType = undefined;
          let hasActionButtons = false;

          switch (${JSON.stringify(providerId)}) {
            case 'chatgpt': {
              const assistantMessages = Array.from(document.querySelectorAll(
                '[data-message-author-role="assistant"], ' +
                'div[data-testid^="conversation-turn-"]:not([data-message-author-role="user"]), ' +
                'div.agent-turn'
              ));
              if (assistantMessages.length > 0) {
                const lastMsg = assistantMessages[assistantMessages.length - 1];

                const imgCandidates = Array.from(lastMsg.querySelectorAll(
                  'img[src*="backend-api/estuary/content"], ' +
                  'img[src*="estuary/content"], ' +
                  'img[alt*="Generated image" i], ' +
                  'div[class*="imagegen"] img, ' +
                  'div[id^="image-"] img, ' +
                  'img[src*="dall-e"], ' +
                  'img[src*="oaiusercontent"], ' +
                  'img.dall-e-image, ' +
                  'img[src^="data:image/"], ' +
                  'img[src^="blob:"]'
                ));

                const validImg = imgCandidates.find(im => {
                  const src = im.src || im.getAttribute('src') || '';
                  if (!src) return false;
                  if (src.includes('avatar') || src.includes('/logo') || src.includes('favicon')) return false;
                  return true;
                });

                if (validImg) {
                  let b64 = null;
                  try {
                    if (validImg.complete && validImg.naturalWidth > 0) {
                      const canvas = document.createElement('canvas');
                      canvas.width = validImg.naturalWidth;
                      canvas.height = validImg.naturalHeight;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(validImg, 0, 0);
                        b64 = canvas.toDataURL('image/png');
                      }
                    }
                  } catch (e) {}

                  mediaUrl = b64 || validImg.src || validImg.getAttribute('src');
                  mediaType = 'image';
                }

                // Video detection (Sora / ChatGPT video elements)
                const videoEl = lastMsg.querySelector(
                  'video source, video[src], [data-testid*="video"] video, video, a[download][href*="video"]'
                );
                if (videoEl && !mediaUrl) {
                  const vSrc = videoEl.src || videoEl.currentSrc || videoEl.getAttribute('src') || (videoEl.tagName === 'A' ? videoEl.href : '');
                  if (vSrc) {
                    mediaUrl = vSrc;
                    mediaType = 'video';
                  }
                }

                // Audio detection (Voice / Audio outputs)
                const audioEl = lastMsg.querySelector(
                  'audio source, audio[src], [data-testid*="audio"] audio, audio, [data-testid="audio-player"] audio'
                );
                if (audioEl && !mediaUrl) {
                  const aSrc = audioEl.src || audioEl.currentSrc || audioEl.getAttribute('src') || '';
                  if (aSrc) {
                    mediaUrl = aSrc;
                    mediaType = 'audio';
                  }
                }

                const hasDoneImage = !!validImg && (validImg.complete !== false) && !!(validImg.src || validImg.getAttribute('src'));
                const hasDoneVideo = !!mediaUrl && mediaType === 'video';
                const hasDoneAudio = !!mediaUrl && mediaType === 'audio';

                if (hasDoneImage || hasDoneVideo || hasDoneAudio) {
                  isMediaRendering = false;
                  isGenerating = false;
                  isThinking = false;
                }

                const hasChatGptImageGenerating = !hasDoneImage && (
                  !!lastMsg.querySelector('[class*="imagegen-loading"], [class*="placeholder-shimmer"], .animate-pulse') ||
                  (lastMsg.textContent || '').includes('Generating a more detailed image') ||
                  (lastMsg.textContent || '').includes('hang tight') ||
                  (lastMsg.textContent || '').includes('Creating image')
                );

                if (hasChatGptImageGenerating) {
                  isMediaRendering = true;
                  isGenerating = true;
                  isThinking = true;
                }

                lastText = extractCleanText(lastMsg);
                hasActionButtons = !isGenerating && !hasChatGptImageGenerating && (
                  hasDoneImage || hasDoneVideo || hasDoneAudio ||
                  !!lastMsg.querySelector(
                    'button[data-testid*="copy" i], ' +
                    'button[aria-label*="Copy" i], ' +
                    'button[aria-label*="Good response" i], ' +
                    'button[aria-label*="Bad response" i]'
                  )
                );
              }
              break;
            }

            case 'claude': {
              const messages = Array.from(document.querySelectorAll(
                '[data-test-render-count] .font-claude-message, ' +
                '.font-claude-message, ' +
                'div.grid-cols-1 .prose, ' +
                'div[data-is-streaming], ' +
                'div.prose'
              )).filter(el => !el.closest('[data-testid="user-message"], .font-user-message'));

              if (messages.length > 0) {
                const lastMsg = messages[messages.length - 1];
                lastText = extractCleanText(lastMsg);

                const isMsgStreaming = lastMsg.getAttribute('data-is-streaming') === 'true' ||
                  !!lastMsg.closest('[data-is-streaming="true"]') ||
                  !!document.querySelector('[data-is-streaming="true"]');

                if (isMsgStreaming) {
                  isGenerating = true;
                }

                const turnContainer = lastMsg.closest('[data-test-render-count], .group, div.relative') || lastMsg.parentElement;
                hasActionButtons = !isGenerating && !!turnContainer && !!turnContainer.querySelector(
                  'button[aria-label*="Copy" i], ' +
                  'button[aria-label*="Copy text" i], ' +
                  'button[aria-label*="Retry" i], ' +
                  'button[aria-label*="Thumbs up" i]'
                );
              }
              break;
            }

            case 'gemini': {
              const responseNodes = document.querySelectorAll('model-response, response-container, structured-content-container, message-content');
              if (responseNodes.length > 0) {
                const targetNode = responseNodes[responseNodes.length - 1];
                const turnContainer = targetNode.closest('model-response, response-container, structured-content-container') || targetNode.parentElement || targetNode;

                const hasDoneImage = !!turnContainer.querySelector(
                  'single-image img.loaded, ' +
                  'single-image img[src], ' +
                  'generated-image img.loaded, ' +
                  'generated-image img[src], ' +
                  '[data-test-id="download-generated-image-button"], ' +
                  'download-generated-image-button, ' +
                  'copy-button gem-icon-button, ' +
                  'share-button gem-icon-button'
                );

                const hasDoneVideo = !!turnContainer.querySelector(
                  'generated-video video[src], ' +
                  'video-player video[src], ' +
                  'button[aria-label*="Download video" i], ' +
                  'button[aria-label*="Play video" i]'
                );

                const hasDoneMusic = !!turnContainer.querySelector(
                  'generated-music video[src], ' +
                  'generated-music audio[src], ' +
                  'button[aria-label*="Download track" i], ' +
                  'button[aria-label*="Play music" i]'
                );

                if (hasDoneImage || hasDoneVideo || hasDoneMusic) {
                  isMediaRendering = false;
                  isGenerating = false;
                  isThinking = false;
                }

                const hasGeminiImageGenerating = !hasDoneImage && !!turnContainer.querySelector(
                  '[data-test-id="image-loading-overlay"]:not(.done-generating), ' +
                  '.shimmer-overlay:not(.done-generating)'
                );

                if (hasGeminiImageGenerating) {
                  isMediaRendering = true;
                  isGenerating = true;
                  isThinking = true;
                }

                lastText = extractCleanText(targetNode);
                hasActionButtons = !isGenerating && !hasGeminiImageGenerating && (
                  hasDoneImage || hasDoneVideo || hasDoneMusic ||
                  !!turnContainer.querySelector(
                    'button[aria-label*="Copy" i], ' +
                    'button[aria-label*="Good response" i], ' +
                    'button[aria-label*="Download" i], ' +
                    'button[aria-label*="Download video" i], ' +
                    'button[aria-label*="Play video" i], ' +
                    'button[aria-label*="Share video" i], ' +
                    'button[aria-label*="Download track" i], ' +
                    'button[aria-label*="Play music" i], ' +
                    'button[aria-label*="Share track" i], ' +
                    'button[aria-label*="Share image" i], ' +
                    'button[aria-label*="Copy image" i], ' +
                    'button[aria-label*="Download full size image" i], ' +
                    '[data-test-id="download-generated-image-button"], ' +
                    'download-generated-image-button, ' +
                    'copy-button, ' +
                    'share-button'
                  )
                );

                const musicEl = turnContainer.querySelector(
                  'generated-music video, ' +
                  'generated-music audio, ' +
                  'video-player video, ' +
                  'audio source, audio[src], ' +
                  'video[src*="contribution.usercontent.google.com"], ' +
                  'video[src*="output.mp4"], ' +
                  'video[src*="bard_storage"]'
                );

                const videoEl = turnContainer.querySelector(
                  'generated-video video, ' +
                  'generated-video video-player video, ' +
                  'video-player video, ' +
                  'video source, ' +
                  'video[src*="contribution.usercontent.google.com"], ' +
                  'video[src*="video.mp4"], ' +
                  'video[src]'
                );

                const imgCandidates = Array.from(turnContainer.querySelectorAll(
                  'generated-image img, ' +
                  'single-image img, ' +
                  '.generated-images img, ' +
                  '.attachment-container img, ' +
                  'img[src*="googleusercontent.com"], ' +
                  'img.generated-image, ' +
                  'img[alt*="AI generated" i], ' +
                  'img[alt*="Generated image" i], ' +
                  'img[src^="data:image/"], ' +
                  'img[src^="blob:"], ' +
                  '.image-container img, ' +
                  '[data-test-id*="image"] img'
                ));

                const isMusicMode = ${JSON.stringify(mode)} === 'audio' || ${JSON.stringify(mode)} === 'music' || !!turnContainer.querySelector('generated-music');
                const isVideoMode = ${JSON.stringify(mode)} === 'video' || !!turnContainer.querySelector('generated-video');

                if (isMusicMode && musicEl) {
                  const rawSrc = musicEl.src || musicEl.currentSrc || musicEl.getAttribute('src') || '';
                  if (rawSrc) {
                    mediaUrl = rawSrc.replace(/&amp;/g, '&');
                    // In Gemini, generated music is rendered as an MP4 video player (unlike some providers which generate raw audio)
                    mediaType = (rawSrc.includes('.mp4') || rawSrc.includes('output.mp4') || musicEl.tagName === 'VIDEO') ? 'video' : 'audio';
                  }
                } else if (isVideoMode && videoEl) {
                  const rawSrc = videoEl.src || videoEl.currentSrc || videoEl.getAttribute('src') || '';
                  if (rawSrc) {
                    mediaUrl = rawSrc.replace(/&amp;/g, '&');
                    mediaType = 'video';
                  }
                } else {
                  const validImg = imgCandidates.find(im => {
                    const src = im.src || im.getAttribute('src') || '';
                    return src && !src.includes('avatar') && !src.includes('sparkle') && !src.includes('logo');
                  });
                  if (validImg) {
                    let rawSrc = validImg.src || validImg.getAttribute('src') || '';
                    try {
                      if (validImg.complete && validImg.naturalWidth > 0) {
                        const canvas = document.createElement('canvas');
                        canvas.width = validImg.naturalWidth;
                        canvas.height = validImg.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                          ctx.drawImage(validImg, 0, 0);
                          const cData = canvas.toDataURL('image/jpeg', 0.95);
                          if (cData && cData.startsWith('data:image/')) {
                            rawSrc = cData;
                          }
                        }
                      }
                    } catch (e) {}

                    mediaUrl = rawSrc.replace(/&amp;/g, '&');
                    mediaType = 'image';
                  } else if (musicEl) {
                    const rawSrc = musicEl.src || musicEl.currentSrc || musicEl.getAttribute('src') || '';
                    if (rawSrc) {
                      mediaUrl = rawSrc.replace(/&amp;/g, '&');
                      mediaType = 'audio';
                    }
                  } else if (videoEl) {
                    const rawSrc = videoEl.src || videoEl.currentSrc || videoEl.getAttribute('src') || '';
                    if (rawSrc) {
                      mediaUrl = rawSrc.replace(/&amp;/g, '&');
                      mediaType = 'video';
                    }
                  }
                }
              }
              break;
            }

            case 'grok': {
              const turns = Array.from(document.querySelectorAll(
                '#last-reply-container [id^="response-"], ' +
                '[id^="response-"], ' +
                '[data-testid="assistant-message"], ' +
                'div.items-start .message-bubble, ' +
                'div.items-start .prose, ' +
                'div.items-start, ' +
                'main div.items-start, ' +
                '.response-turn'
              )).filter(el => {
                if (el.closest('form, nav, aside, [data-sidebar="sidebar"], header, .message-input')) return false;
                if (el.querySelector && el.querySelector('[data-testid="user-message"], [aria-label="You"]')) return false;
                if (el.getAttribute && el.getAttribute('data-testid') === 'user-message') return false;
                return true;
              });

              const targetList = turns.length > 0
                ? turns
                : Array.from(document.querySelectorAll('.response-content-markdown, .streamdown-chat-md, main .prose, .prose'));

              if (targetList.length > 0) {
                const lastTurn = targetList[targetList.length - 1];
                lastText = extractCleanText(lastTurn);

                const imgCandidates = Array.from(lastTurn.querySelectorAll(
                  'img[alt*="Generated image" i], ' +
                  'img[src*="grok"], ' +
                  'img[src*="twimg"], ' +
                  'img[src*="xai"], ' +
                  'img[src*="assets.grok.com"], ' +
                  'img.media-attachment, ' +
                  'img[src^="blob:"], ' +
                  'img[src^="data:image/"]'
                ));
                const validImg = imgCandidates.find(im => {
                  const src = im.src || im.getAttribute('src') || '';
                  return src && !src.includes('avatar') && !src.includes('profile') && !src.includes('logo');
                });
                if (validImg) {
                  let b64 = null;
                  try {
                    if (validImg.complete && validImg.naturalWidth > 0) {
                      const canvas = document.createElement('canvas');
                      canvas.width = validImg.naturalWidth;
                      canvas.height = validImg.naturalHeight;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(validImg, 0, 0);
                        b64 = canvas.toDataURL('image/jpeg', 0.95);
                      }
                    }
                  } catch (e) {}

                  mediaUrl = b64 || validImg.src || validImg.getAttribute('src');
                  mediaType = 'image';
                }

                const video = lastTurn.querySelector('video source, video[src], video');
                if (video && (video.src || video.currentSrc || video.getAttribute('src')) && !mediaUrl) {
                  mediaUrl = video.src || video.currentSrc || video.getAttribute('src');
                  mediaType = 'video';
                }

                const hasDoneImage = !!validImg && (validImg.complete !== false) && !!(validImg.src || validImg.getAttribute('src'));
                const hasDoneVideo = !!mediaUrl && mediaType === 'video';

                if (hasDoneImage || hasDoneVideo) {
                  isMediaRendering = false;
                  isGenerating = false;
                  isThinking = false;
                }

                const turnParent = lastTurn.closest('div.items-start, div[class*="turn"], div.group, [id^="response-"]') || lastTurn.parentElement || lastTurn;
                if (turnParent) {
                  hasActionButtons = !isGenerating && (
                    hasDoneImage || hasDoneVideo ||
                    !!turnParent.querySelector(
                      'button[aria-label*="Copy" i], ' +
                      'button[aria-label*="Like" i], ' +
                      'button[aria-label*="Share" i], ' +
                      'button[aria-label*="Regenerate" i], ' +
                      'button[aria-label*="Good response" i], ' +
                      'svg[class*="copy" i]'
                    )
                  );
                }
              }
              break;
            }

            default: {
              const recipeCfg = ${JSON.stringify(recipeConfig || null)};
              const toSelectorString = (sel) => {
                if (!sel) return '';
                if (Array.isArray(sel)) return sel.filter(Boolean).join(', ');
                return String(sel);
              };
              const containerSelector = toSelectorString(recipeCfg?.response?.container) || (
                '[data-message-author-role="assistant"], ' +
                '[data-role="assistant"], ' +
                'div[class*="message-assistant"], ' +
                'div[class*="assistant-message"], ' +
                'div[class*="bot-message"], ' +
                '.message-bubble, ' +
                'main .prose, ' +
                '.markdown'
              );

              const turns = Array.from(document.querySelectorAll(containerSelector)).filter(el => {
                if (el.tagName === 'MAIN' || el.tagName === 'BODY' || el.tagName === 'HTML') return false;
                if (el.closest('form, nav, aside, header, footer, .message-input, [data-role="user"], [class*="disclaimer" i]')) return false;
                if (el.querySelector && el.querySelector('[data-message-author-role="user"], [data-role="user"]')) return false;
                return true;
              });

              if (turns.length > 0) {
                const lastTurn = turns[turns.length - 1];
                const modeStr = ${JSON.stringify(mode)};
                const modeCfg = recipeCfg?.response?.modes?.[modeStr];

                // Image detection
                const imgSelector = toSelectorString(modeCfg?.contentSelector) || (
                  'img[alt*="Generated image" i], ' +
                  'img[title*="Generated image" i], ' +
                  'img[src*="storage.googleapis.com"], ' +
                  'img[src^="data:image/"], ' +
                  'img[src^="blob:"], ' +
                  'img.generated-image, ' +
                  '.markdown-content img'
                );
                const imgCandidates = Array.from(lastTurn.querySelectorAll(imgSelector));

                const validImg = imgCandidates.find(im => {
                  const src = im.src || im.getAttribute('src') || '';
                  if (!src) return false;
                  if (
                    src.includes('organization-images') ||
                    src.includes('icons/models') ||
                    src.includes('/icons/') ||
                    src.includes('/logo') ||
                    src.includes('avatar')
                  ) {
                    return false;
                  }
                  const alt = (im.getAttribute('alt') || '').toLowerCase();
                  if (alt.includes('openai') || alt.includes('google') || alt.includes('anthropic') || alt.includes('avatar')) {
                    return false;
                  }
                  return true;
                });

                if (validImg) {
                  let rawSrc = validImg.src || validImg.getAttribute('src') || '';
                  try {
                    if (validImg.complete && validImg.naturalWidth > 0) {
                      const canvas = document.createElement('canvas');
                      canvas.width = validImg.naturalWidth;
                      canvas.height = validImg.naturalHeight;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(validImg, 0, 0);
                        const cData = canvas.toDataURL('image/jpeg', 0.95);
                        if (cData && cData.startsWith('data:image/')) {
                          rawSrc = cData;
                        }
                      }
                    }
                  } catch (e) {}
                  mediaUrl = rawSrc;
                  mediaType = 'image';
                }

                // Video detection
                const videoSelector = (modeCfg?.mediaKind === 'video' && toSelectorString(modeCfg.contentSelector)) || (
                  'video source, video[src], [data-testid="video"], video, a[data-testid="download-button"], a[download][href*="video"], a[href*="download-video"], a[href*="video"]'
                );
                const videoCandidates = Array.from(lastTurn.querySelectorAll(videoSelector));
                for (const vid of videoCandidates) {
                  let src = vid.src || vid.currentSrc || vid.getAttribute('src') || (vid.tagName === 'A' ? vid.href : '');
                  if (src) {
                    if (src.includes('download-video?url=')) {
                      const urlParam = src.match(/url=([^&]+)/);
                      if (urlParam) {
                        src = decodeURIComponent(urlParam[1]);
                      }
                    }
                    mediaUrl = src.split('#')[0];
                    mediaType = 'video';
                    break;
                  }
                }

                // Audio detection
                const audioSelector = (modeCfg?.mediaKind === 'audio' && toSelectorString(modeCfg.contentSelector)) || (
                  'audio, audio source, audio a[href], audio[src], audio[src^="blob:"], audio[src^="data:audio/"], a[download][href*="audio"], a[download][href*="music"], a[href*="/music/"], a[href*=".mp3"], a[href*="download-audio"], a[href*="download-music"]'
                );
                const audioCandidates = Array.from(lastTurn.querySelectorAll(audioSelector));
                for (const aud of audioCandidates) {
                  let src = aud.src || aud.currentSrc || aud.getAttribute('src') || (aud.tagName === 'A' ? aud.href : '');
                  if (src) {
                    if (src.includes('download-audio?url=') || src.includes('download-music?url=')) {
                      const urlParam = src.match(/url=([^&]+)/);
                      if (urlParam) {
                        src = decodeURIComponent(urlParam[1]);
                      }
                    }
                    mediaUrl = src.split('#')[0];
                    mediaType = 'audio';
                    break;
                  }
                }

                const hasDoneImage = !!validImg && (validImg.complete !== false) && !!(validImg.src || validImg.getAttribute('src'));
                const hasDoneVideo = !!mediaUrl && mediaType === 'video';
                const hasDoneAudio = !!mediaUrl && mediaType === 'audio';

                if (hasDoneImage || hasDoneVideo || hasDoneAudio) {
                  isMediaRendering = false;
                  isGenerating = false;
                  isThinking = false;
                }

                const genIndicatorSelector = toSelectorString(recipeCfg?.response?.generatingIndicator) || (
                  '[class*="animate-ai-spinner"], .animate-ai-spinner-rotate, .animate-ai-spinner-pulse, .text-text-quaternary, [data-testid*="generating-placeholder"]'
                );

                const hasTurnThinking = !hasDoneImage && !hasDoneVideo && !hasDoneAudio && (
                  !!lastTurn.querySelector(genIndicatorSelector) ||
                  (lastTurn.textContent || '').includes('กำลังประมวลผล') ||
                  (lastTurn.textContent || '').includes('กำลังสร้างวิดีโอ') ||
                  (lastTurn.textContent || '').includes('กำลังสร้าง')
                );

                if (hasTurnThinking) {
                  isThinking = true;
                  isGenerating = true;
                }

                const textSelector = toSelectorString(recipeCfg?.response?.textSelector);
                const textTarget = textSelector
                  ? (lastTurn.querySelector(textSelector) || lastTurn)
                  : lastTurn;
                lastText = extractCleanText(textTarget);

                const actionSelector = toSelectorString(recipeCfg?.response?.actionButtons) || (
                  'button[aria-label*="Copy" i], ' +
                  'button[aria-label*="คัดลอก" i], ' +
                  'button[title*="Copy" i], ' +
                  'button[title*="คัดลอก" i], ' +
                  'button[aria-label*="Download" i], ' +
                  'button[title*="Download" i], ' +
                  'button[title*="ดาวน์โหลด" i], ' +
                  '[data-testid="download-button"], ' +
                  'svg[class*="copy" i], ' +
                  'svg.lucide-download'
                );

                const turnContainer = lastTurn.closest('div[class*="message"], div[class*="turn"], div.group') || lastTurn.parentElement || lastTurn;
                hasActionButtons = !isGenerating && !hasTurnThinking && (
                  hasDoneImage || hasDoneVideo || hasDoneAudio ||
                  (!!turnContainer && (
                    !!turnContainer.querySelector(actionSelector) ||
                    Array.from(turnContainer.querySelectorAll('button, a, span.sr-only')).some(b => {
                      const text = (b.textContent || '').toLowerCase();
                      return text.includes('copy message') || text.includes('copy') || text.includes('คัดลอก') || text.includes('download image') || text.includes('download') || text.includes('ดาวน์โหลด');
                    })
                  ))
                );
              }
              break;
            }
          }

          // Global Blob-to-DataURI Converter:
          // Browser-internal "blob:" URLs cannot be downloaded or saved by Node.js outside the browser.
          // Convert any blob media URL directly into a Base64 data URI within the page origin.
          if (mediaUrl && mediaUrl.startsWith('blob:')) {
            try {
              const bResp = await fetch(mediaUrl);
              const bBlob = await bResp.blob();
              const bDataUri = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(bBlob);
              });
              if (bDataUri && typeof bDataUri === 'string' && bDataUri.startsWith('data:')) {
                mediaUrl = bDataUri;
              }
            } catch (blobErr) {}
          }

          return {
            isGenerating,
            isThinking,
            isMediaRendering,
            hasActionButtons,
            isRateLimited,
            isSecurityWarning,
            securityWarningReason,
            text: lastText,
            mediaUrl,
            mediaType
          };
        } catch (e) {
          return {
            isGenerating: false,
            isThinking: false,
            isMediaRendering: false,
            hasActionButtons: false,
            isRateLimited: false,
            isSecurityWarning: false,
            text: '',
            error: e ? e.message : 'DOM inspection error'
          };
        }
      })()
    `;
  }
}
