import { describe, it, expect, vi } from 'vitest';
import { DomWatchdog } from '../src/main/healing/domWatchdog.js';

describe('DomWatchdog Engine Unit Tests', () => {
  it('should generate audit scripts covering all 4 control landmarks', () => {
    const script = DomWatchdog.getAuditScript('chatgpt');

    expect(script).toContain('inputPrompt');
    expect(script).toContain('submitButton');
    expect(script).toContain('stopButton');
    expect(script).toContain('modelDropdownTrigger');

    // Should include inspection function and candidate checks
    expect(script).toContain('checkCandidate');
    expect(script).toContain('missingLandmarks');
  });

  it('includes adaptive attachment landmarks and semantic reveal locators in an audit', () => {
    const script = DomWatchdog.getAuditScript('custom_portal', undefined, undefined, {
      text: {
        fileInput: 'input[type="file"]',
        revealSteps: [{ action: 'click', target: { role: 'button', name: ['Add attachment'] } }],
        ready: '.attachment-chip',
        cleanup: 'button.remove-attachment',
        acceptedKinds: ['image'],
      },
    });

    expect(script).toContain('const inputKey');
    expect(script).toContain(String.raw`input[type=\"file\"]`);
    expect(script).toContain('revealSteps');
    expect(script).toContain('Add attachment');
    expect(script).toContain('attachmentLandmarks');
  });

  it('should inspect mock WebContents and return structured DomInspectionReport', async () => {
    const mockReport = {
      providerId: 'claude',
      timestamp: Date.now(),
      healthy: true,
      landmarks: {
        inputPrompt: { found: true, selector: 'div[contenteditable="true"]' },
        submitButton: { found: true, selector: 'button[aria-label*="Send"]' },
        stopButton: { found: true, selector: 'button[aria-label*="Stop"]' },
        modelDropdownTrigger: { found: true, selector: 'button[data-testid="model-selector-dropdown"]' },
      },
      missingLandmarks: [],
    };

    const mockWebContents = {
      isDestroyed: () => false,
      executeJavaScript: vi.fn().mockResolvedValue(mockReport),
    } as any;

    const report = await DomWatchdog.audit('claude', mockWebContents);
    expect(report.providerId).toBe('claude');
    expect(report.healthy).toBe(true);
    expect(report.allLandmarksHealthy).toBe(true);
    expect(report.landmarks.inputPrompt.found).toBe(true);
    expect(report.landmarks.submitButton.found).toBe(true);
    expect(report.landmarks.modelDropdownTrigger.found).toBe(true);
  });

  it('should build actionable repair prompt containing broken landmarks and snippet', () => {
    const brokenReport = {
      providerId: 'chatgpt' as const,
      timestamp: Date.now(),
      healthy: false,
      landmarks: {
        inputPrompt: { found: false },
        submitButton: { found: true, selector: 'button' },
        stopButton: { found: false },
        modelDropdownTrigger: { found: false },
      },
      missingLandmarks: ['inputPrompt' as const, 'modelDropdownTrigger' as const],
      htmlSnippet: '<div class="new-editor" contenteditable="true"></div><button id="model-switcher-v2">GPT-4o</button>',
    };

    const prompt = DomWatchdog.buildHealingPrompt(brokenReport);
    expect(prompt).toContain('inputPrompt');
    expect(prompt).toContain('modelDropdownTrigger');
    expect(prompt).toContain('new-editor');
    expect(prompt).toContain('model-switcher-v2');
    expect(prompt).toContain('CSS selector');
  });

  it('asks healing to repair a nested attachment selector without broad recipe changes', () => {
    const report = {
      providerId: 'custom_portal' as const,
      timestamp: Date.now(),
      healthy: false,
      allLandmarksHealthy: false,
      landmarks: {
        inputPrompt: { found: true, exists: true },
        submitButton: { found: true, exists: true },
        stopButton: { found: true, exists: true },
        modelDropdownTrigger: { found: true, exists: true },
      },
      missingLandmarks: ['attachment.text.revealSteps.1.selectors'],
      htmlSnippet: '<div role="menuitem"><span>Upload file or image</span></div>',
    };
    const prompt = DomWatchdog.buildHealingPrompt(report);
    expect(prompt).toContain('attachment.text.revealSteps.1.selectors');
    expect(prompt).toContain('input[type="file"]');
  });
});
