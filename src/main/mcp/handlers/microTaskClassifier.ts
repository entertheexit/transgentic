/**
 * Local LLM Micro-Task Classifier
 * 
 * Evaluates incoming Coding mode prompts against deterministic regex patterns
 * and lightweight heuristic classification to identify rapid, zero-quota micro-tasks:
 * 1. Regex construction / explanations
 * 2. TypeScript type / interface generation from JSON schemas
 * 3. Docstring / JSDoc / Comment generation
 * 4. Simple standalone unit test stubs
 * 
 * Complex logic, system architecture, multi-file refactoring, and deep reasoning
 * are explicitly classified as complex tasks, falling through to configured Route services
 * or prompting agentic IDEs (Codex) to reason locally.
 */

export type MicroTaskCategory = 'regex' | 'types' | 'docstring' | 'test_stubs' | 'helper_fn';

export interface MicroTaskClassification {
  isMicroTask: boolean;
  category?: MicroTaskCategory;
  reason?: string;
}

// 1. Complex Architecture & Deep Reasoning Exclusion Patterns
const COMPLEX_EXCLUSION_PATTERNS: RegExp[] = [
  /\b(system\s+architecture|architectural\s+plan(ning)?|design\s+system\s+architecture)\b/i,
  /\b(full[- ]stack\s+(plan|implementation|app|architecture)|microservices?(\s+architecture)?)\b/i,
  /\b(multi[- ]tier|database\s+schema\s+design|database\s+architecture)\b/i,
  /\b(deep\s+reasoning|strategic\s+plan(ning)?|high[- ]level\s+design|rfc\s+specification)\b/i,
  /\b(refactor\s+the\s+entire|project[- ]wide\s+refactor|codebase[- ]wide)\b/i,
  /\b(multi[- ]stage\s+migration|migrate\s+the\s+entire\s+codebase)\b/i,
  /\b(step[- ]by[- ]step\s+architectural|comprehensive\s+audit|security\s+audit\s+of\s+the\s+system)\b/i,
  /\b(distributed\s+consensus|event[- ]driven\s+architecture|cqrs|event\s+sourcing)\b/i,
];

// 2. Deterministic Regex Signatures for Micro-Tasks

// Regex Category: Construction, matching, validation, explanation
const REGEX_PATTERNS: RegExp[] = [
  /\b(regex|regexp|regular\s+expression)\b/i,
  /\b(write|create|generate|construct|build|make|give\s+me)\s+(a\s+)?(regex|regexp|regular\s+expression)\b/i,
  /\bexplain\s+(this\s+)?(regex|regexp|regular\s+expression)\b/i,
  /\b(regex|regexp|regular\s+expression)\s+(pattern|to\s+match|for\s+matching|for\s+validating|validation)\b/i,
];

// Types Category: TypeScript interface/type generation from JSON / schemas
const TYPES_PATTERNS: RegExp[] = [
  /\b(json\s+schema\s+to\s+(ts|typescript|interfaces?|types?))\b/i,
  /\b(generate|create|write|infer|convert|make|scaffold)\s+(a\s+)?(typescript|ts)?\s*(types?|interfaces?|type\s+definitions?)\s+(from|for)\b/i,
  /\b(typescript|ts)\s+(interfaces?|types?)\s+(for|from)\s+(this|the\s+following)?\s*(json|schema|object|payload|response)\b/i,
  /\b(convert|turn)\s+(this|the\s+following)?\s*(json|object)\s+(into|to)\s+(typescript|ts)?\s*(types?|interfaces?)\b/i,
  /\b(type\s+definitions?|interfaces?)\s+from\s+json\b/i,
];

// Docstrings Category: Docstring, JSDoc, TSDoc, comments
const DOCSTRING_PATTERNS: RegExp[] = [
  /\b(generate|write|add|create|produce)\s+(a\s+)?(docstring|docstrings|jsdoc|tsdoc|javadoc|godoc|inline\s+comments?|code\s+comments?)\b/i,
  /\b(add\s+jsdoc\s+(comments?\s+)?to)\b/i,
  /\bdocument\s+this\s+(function|method|class|interface|code|snippet)\b/i,
  /\b(generate\s+documentation\s+comments?)\b/i,
  /\b(add\s+docstrings?\s+to)\b/i,
  /\b(write\s+documentation\s+for\s+this\s+(function|method|class))\b/i,
];

// Test Stubs Category: Simple standalone unit test stubs & test cases
const TEST_STUB_PATTERNS: RegExp[] = [
  /\b(generate|write|create|scaffold|stub|provide|include|add|with)\s+(a\s+)?(simple\s+|standalone\s+)?(vitest|jest|pytest|mocha|chai\s+)?(unit\s+)?(tests?|test\s+stubs?|stubs?|specs?|test\s+cases?)\b/i,
  /\b(unit\s+tests?\s+(stubs?|scaffold|cases?|helpers?)\s+for\s+this)\b/i,
  /\b(vitest|jest|pytest|mocha|chai)\s+((unit\s+)?tests?|test\s+stubs?|stubs?|specs?|test\s+cases?)\b/i,
  /\b(write|include|add)\s+tests?\s+for\s+this\s+(function|method|helper|utility)\b/i,
  /\b(unit[- ]tests?(\s+stubs?|\s+helpers?|\s+cases?|\s+specs?)?)\b/i,
];

// Helper Functions Category: Standalone helper, utility, or pure algorithm functions
const HELPER_FUNCTION_PATTERNS: RegExp[] = [
  /\b(write|create|generate|implement|give\s+me)\s+(only\s+)?(a\s+)?(standalone|helper|utility|pure|simple)\s+([a-z0-9_#+<>-]+\s+)?(function|method|algorithm|routine|util|helper)\b/i,
  /\b(standalone|helper|utility|pure)\s+([a-z0-9_#+<>-]+\s+)?(function|helper|utility|algorithm)\b/i,
  /\b(single|isolated|standalone)\s+function\b/i,
  /\b(string|array|math|date|object|collection)\s+(utility|helper)\s+(function|method)\b/i,
];

// Explicit Micro-Task Category: Direct mention of micro-task / unit-test helper
const EXPLICIT_MICROTASK_PATTERNS: RegExp[] = [
  /\b(micro[- ]?tasks?)\b/i,
  /\b(unit[- ]test\s+helper)\b/i,
];

/**
 * Classifies an incoming Coding mode prompt as a micro-task or complex task.
 */
export function classifyMicroTask(prompt: string): MicroTaskClassification {
  if (!prompt || typeof prompt !== 'string') {
    return { isMicroTask: false, reason: 'Empty prompt' };
  }

  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    return { isMicroTask: false, reason: 'Empty prompt' };
  }

  // 1. Exclude complex architecture, multi-file refactors, deep reasoning
  for (const pattern of COMPLEX_EXCLUSION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isMicroTask: false,
        reason: 'Prompt contains complex system architecture, system design, or deep reasoning requirements',
      };
    }
  }

  // 2. Length heuristic: prompts with excessive prose (> 3000 chars) without code/json blocks
  // are likely complex specifications rather than focused micro-tasks.
  const hasCodeOrJson = /```[\s\S]*?```|\{[\s\S]*\}/.test(trimmed);
  if (!hasCodeOrJson && trimmed.length > 3000) {
    return {
      isMicroTask: false,
      reason: 'Prose length exceeds micro-task budget without structured code or JSON context',
    };
  }

  // 3. Deterministic Category Evaluation

  // 3a. Regex construction / explanation
  for (const pattern of REGEX_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isMicroTask: true,
        category: 'regex',
        reason: 'Matched deterministic regex construction or explanation pattern',
      };
    }
  }

  // 3b. TypeScript type / interface generation from JSON schemas
  for (const pattern of TYPES_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isMicroTask: true,
        category: 'types',
        reason: 'Matched deterministic TypeScript type or interface generation pattern',
      };
    }
  }

  // 3c. Docstring / JSDoc / Comment generation
  for (const pattern of DOCSTRING_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isMicroTask: true,
        category: 'docstring',
        reason: 'Matched deterministic docstring or JSDoc generation pattern',
      };
    }
  }

  // 3d. Simple standalone unit test stubs & test cases
  for (const pattern of TEST_STUB_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isMicroTask: true,
        category: 'test_stubs',
        reason: 'Matched deterministic unit test stub pattern',
      };
    }
  }

  // 3e. Standalone helper, utility, or pure algorithm functions
  for (const pattern of HELPER_FUNCTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isMicroTask: true,
        category: 'helper_fn',
        reason: 'Matched deterministic standalone helper/utility function pattern',
      };
    }
  }

  // 3f. Explicit micro-task declaration
  for (const pattern of EXPLICIT_MICROTASK_PATTERNS) {
    if (pattern.test(trimmed)) {
      const category: MicroTaskCategory = /\b(test|spec|vitest|jest|pytest)\b/i.test(trimmed)
        ? 'test_stubs'
        : 'helper_fn';
      return {
        isMicroTask: true,
        category,
        reason: 'Prompt explicitly requests a micro-task / unit-test helper',
      };
    }
  }

  return {
    isMicroTask: false,
    reason: 'Did not match micro-task patterns (classified as general/complex coding task)',
  };
}
