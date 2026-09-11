import { ProviderId, TaskMode, TransgenticConfig, doubleAgentConfig, normalizeRouteMode } from '../../shared/types.js';
import { ServiceManifestManager } from '../registry/serviceManifest.js';

export const BALANCED_DOUBLE_AGENT_DIRECTIVE = `
[TRANSGENTIC BALANCED Double-Agent DIRECTIVE]
You are operating in Balanced Double-Agent mode.
1. Compare and cross-examine the above output from Transgentic with your own internal reasoning, plan, or draft.
2. Identify discrepancies, potential bugs, edge cases, blind spots, or alternative perspectives.
3. Synthesize the best possible solution, or explain why you favor one approach over the other.
4. Proceed with confidence, or evaluate and determine whether to invoke Transgentic again (e.g. by mentioning "use Transgentic MCP") if critical ambiguities remain or further high-level planning is needed.
5. Stay within the user's request; a review or question does not authorize workspace edits.
`.trim();

export function formatBalancedDoubleAgentDirective(): string {
  return BALANCED_DOUBLE_AGENT_DIRECTIVE;
}

export const DUAL_DISPATCH_DOUBLE_AGENT_DIRECTIVE = `
[TRANSGENTIC DOUBLE-AGENT DIRECTIVE - WEIGHT ON TRANSGENTIC]
You are operating in Double-Agent Dual Dispatch mode.
1. Synthesize the dual perspectives provided above (Main Provider and Co-Reviewer) to evaluate the optimal approach.
2. Balanced Mode is disabled: This workflow is weighted heavily on Transgentic MCP.
3. Use Transgentic MCP for further assistance when useful. Stay within the user's requested scope; questions and reviews do not authorize workspace edits.
`.trim();

export function formatDualDispatchDoubleAgentDirective(): string {
  return DUAL_DISPATCH_DOUBLE_AGENT_DIRECTIVE;
}

export function getProviderDisplayName(providerId: string): string {
  if (!providerId) return 'AI Service';
  if (providerId === 'localllm') return 'Local LLM';

  try {
    const manifest = ServiceManifestManager.getManifest();
    const service = manifest?.services?.[providerId];
    if (service?.name) {
      return service.name;
    }
  } catch {}

  switch (providerId.toLowerCase()) {
    case 'chatgpt':
      return 'ChatGPT';
    case 'claude':
      return 'Claude';
    case 'gemini':
      return 'Gemini';
    case 'grok':
      return 'Grok';
    case 'localllm':
      return 'Local LLM';
    default:
      return providerId.charAt(0).toUpperCase() + providerId.slice(1);
  }
}

export function formatDualPerspectiveResponse(
  mainArg: string | { text?: string; provider?: string; model?: string } | null,
  coArgOrMainContent?: string | { text?: string; provider?: string; model?: string } | null,
  coNameOrMainErr?: string,
  coContentOrCoErr?: string
): string {
  let mainName = 'Main Provider';
  let mainText = '';
  let coName = 'Co-Reviewer';
  let coText = '';

  const isObjectCall =
    (mainArg !== null && typeof mainArg === 'object') ||
    (coArgOrMainContent !== null && typeof coArgOrMainContent === 'object') ||
    (mainArg === null && typeof coNameOrMainErr === 'string') ||
    (coArgOrMainContent === null && typeof coContentOrCoErr === 'string');

  if (isObjectCall) {
    const mainObj = mainArg as { text?: string; provider?: string; model?: string } | null;
    const coObj = coArgOrMainContent as { text?: string; provider?: string; model?: string } | null;
    const mainErr = coNameOrMainErr;
    const coErr = coContentOrCoErr;

    if (!mainObj && !coObj) {
      throw new Error(
        `Both Main and Co-Agent pipelines failed.\n- Main: ${mainErr || 'Unknown error'}\n- Co: ${coErr || 'Unknown error'}`
      );
    }

    if (mainObj) {
      const pName = getProviderDisplayName(mainObj.provider || '');
      mainName = mainObj.model ? `${pName} (${mainObj.model})` : pName;
      mainText = mainObj.text || '';
    } else {
      mainName = 'Main Provider';
      mainText = mainErr ? `${mainErr}` : 'Pipeline failed';
    }

    if (coObj) {
      const pName = getProviderDisplayName(coObj.provider || '');
      coName = coObj.model ? `${pName} (${coObj.model})` : pName;
      coText = coObj.text || '';
    } else {
      coName = 'Co-Reviewer';
      coText = coErr ? `${coErr}` : 'Pipeline failed';
    }
  } else {
    mainName = (mainArg as string) || 'Main Provider';
    mainText = (coArgOrMainContent as string) || '';
    coName = coNameOrMainErr || 'Co-Reviewer';
    coText = coContentOrCoErr || '';
  }

  const cleanMain = (mainText || '').trim() || '(No response returned)';
  const cleanCo = (coText || '').trim() || '(No response returned)';

  const mainHeader = mainName.startsWith('[Main Provider') || mainName.toLowerCase() === 'main provider'
    ? '### [Main Provider]'
    : `### [Main Provider: ${mainName}]`;

  const coHeader = coName.startsWith('[Co-Reviewer') || coName.toLowerCase() === 'co-reviewer'
    ? '### [Co-Reviewer]'
    : `### [Co-Reviewer: ${coName}]`;

  return `${mainHeader}\n${cleanMain}\n\n---\n${coHeader}\n${cleanCo}`;
}

export type DispatchScenario =
  | 'scenario_1_balanced_double'
  | 'scenario_1_balanced_cross_examine'
  | 'scenario_2_dual_dispatch'
  | 'scenario_2_dual_concurrent'
  | 'standard_balanced'
  | 'standard_single';

export function determineDispatchScenario(
  balancedModeOrConfig: boolean | TransgenticConfig,
  doubleAgent?: doubleAgentConfig,
  taskMode?: TaskMode
): DispatchScenario {
  let isBalanced = false;
  let daConfig: doubleAgentConfig | undefined;

  if (typeof balancedModeOrConfig === 'object' && balancedModeOrConfig !== null) {
    isBalanced = Boolean(balancedModeOrConfig.balancedMode ?? balancedModeOrConfig.coding?.balancedMode ?? true);
    daConfig = balancedModeOrConfig.doubleAgent;
  } else {
    isBalanced = Boolean(balancedModeOrConfig);
    daConfig = doubleAgent;
  }

  const routeMode = taskMode ? normalizeRouteMode(taskMode) : undefined;
  const isModeActive = routeMode && daConfig?.modes ? (daConfig.modes[routeMode] ?? true) : true;
  const isDoubleAgent = Boolean(daConfig?.enabled) && isModeActive;
  if (isDoubleAgent && isBalanced) {
    return 'scenario_1_balanced_double';
  }
  if (isDoubleAgent && !isBalanced) {
    return 'scenario_2_dual_dispatch';
  }
  if (isBalanced) {
    return 'standard_balanced';
  }
  return 'standard_single';
}

export interface PipelineExecutionResult {
  text: string;
  finalResponseWithLocalPath?: string;
  provider: ProviderId;
  modelUsed?: string;
  mediaPath?: string;
  accountAlias?: string;
  accountProfileId?: string;
  wasRolledOver?: boolean;
  wasNewChat?: boolean;
}

export interface DualDispatchResult {
  combinedText: string;
  text: string; // alias for combinedText
  mainResult: PipelineExecutionResult | null;
  coResult: PipelineExecutionResult | null;
  mainError?: Error;
  coError?: Error;
  primaryProvider: ProviderId;
  coProvider: ProviderId;
  durationMs: number;
}

/**
 * Executes Main and Co pipeline dispatches concurrently via Promise.allSettled.
 * Applies Partial Failure Resiliency:
 * - If both succeed: returns both side-by-side in Markdown.
 * - If one fails: returns the surviving provider's result alongside the honest error message.
 * - If both fail: throws an aggregate error detailing both failures.
 */
export async function executeConcurrentDualDispatch(
  executeMain: () => Promise<PipelineExecutionResult>,
  executeCo: () => Promise<PipelineExecutionResult>,
  mainProviderId: ProviderId = 'claude',
  coProviderId: ProviderId = 'chatgpt'
): Promise<DualDispatchResult> {
  const startTime = Date.now();
  const mainDisplayName = getProviderDisplayName(mainProviderId);
  const coDisplayName = getProviderDisplayName(coProviderId);

  const [mainSettled, coSettled] = await Promise.allSettled([executeMain(), executeCo()]);

  const mainSucceeded = mainSettled.status === 'fulfilled';
  const coSucceeded = coSettled.status === 'fulfilled';

  if (!mainSucceeded && !coSucceeded) {
    const mainErr = (mainSettled as PromiseRejectedResult).reason;
    const coErr = (coSettled as PromiseRejectedResult).reason;
    throw new Error(
      `Both Main and Co-Agent pipelines failed.\n- Main Provider (${mainDisplayName}): ${mainErr?.message || mainErr}\n- Co-Reviewer (${coDisplayName}): ${coErr?.message || coErr}`
    );
  }

  let mainContent: string;
  let mainResult: PipelineExecutionResult | null = null;
  let mainError: Error | undefined;

  if (mainSucceeded) {
    mainResult = (mainSettled as PromiseFulfilledResult<PipelineExecutionResult>).value;
    mainContent = mainResult.text;
  } else {
    mainError = (mainSettled as PromiseRejectedResult).reason;
    mainContent = mainError?.message || String(mainError);
  }

  let coContent: string;
  let coResult: PipelineExecutionResult | null = null;
  let coError: Error | undefined;

  if (coSucceeded) {
    coResult = (coSettled as PromiseFulfilledResult<PipelineExecutionResult>).value;
    coContent = coResult.text;
  } else {
    coError = (coSettled as PromiseRejectedResult).reason;
    coContent = coError?.message || String(coError);
  }

  const combinedText = formatDualPerspectiveResponse(
    mainResult ? { ...mainResult, text: mainResult.finalResponseWithLocalPath ?? mainResult.text } : null,
    coResult ? { ...coResult, text: coResult.finalResponseWithLocalPath ?? coResult.text } : null,
    mainError ? (mainError.message || String(mainError)) : undefined,
    coError ? (coError.message || String(coError)) : undefined
  );

  return {
    combinedText,
    text: combinedText,
    mainResult,
    coResult,
    mainError,
    coError,
    primaryProvider: mainProviderId,
    coProvider: coProviderId,
    durationMs: Date.now() - startTime,
  };
}
