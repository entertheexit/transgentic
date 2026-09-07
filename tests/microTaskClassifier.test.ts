import { describe, it, expect } from 'vitest';
import { classifyMicroTask } from '../src/main/mcp/handlers/microTaskClassifier.js';

describe('MicroTaskClassifier', () => {
  describe('Regex Construction & Explanations', () => {
    it('should classify regex construction requests as micro-tasks', () => {
      const prompt = 'Write a regex to validate an email address';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('regex');
    });

    it('should classify regexp pattern matching requests', () => {
      const prompt = 'Create a regular expression for matching international phone numbers';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('regex');
    });

    it('should classify regex explanation requests', () => {
      const prompt = 'Explain this regex: ^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('regex');
    });

    it('should classify date format regex requests', () => {
      const prompt = 'Give me a regex pattern to match YYYY-MM-DD dates';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('regex');
    });
  });

  describe('TypeScript Type / Interface Generation from JSON Schemas', () => {
    it('should classify JSON schema to TypeScript type requests', () => {
      const prompt = 'Generate TypeScript interface from this JSON: { "id": "1", "name": "Admin", "roles": ["super"] }';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('types');
    });

    it('should classify json schema to ts converter requests', () => {
      const prompt = 'JSON schema to TS interfaces for user profile payload';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('types');
    });

    it('should classify infer typescript types requests', () => {
      const prompt = 'Infer TypeScript types for the following response object';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('types');
    });

    it('should classify convert json to typescript types requests', () => {
      const prompt = 'Convert this JSON into TypeScript types';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('types');
    });
  });

  describe('Docstring / JSDoc / Comment Generation', () => {
    it('should classify JSDoc generation requests', () => {
      const prompt = 'Generate JSDoc for this function:\nfunction calculateDiscount(price, rate) { return price * (1 - rate); }';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('docstring');
    });

    it('should classify docstring addition requests', () => {
      const prompt = 'Add docstrings to this Python method';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('docstring');
    });

    it('should classify document this function requests', () => {
      const prompt = 'Document this function with parameters and return value';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('docstring');
    });

    it('should classify TSDoc comments requests', () => {
      const prompt = 'Write TSDoc comments for the AuthManager class';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('docstring');
    });
  });

  describe('Simple Standalone Unit Test Stubs', () => {
    it('should classify unit test stub generation requests', () => {
      const prompt = 'Generate simple unit test stubs for this function';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('test_stubs');
    });

    it('should classify vitest test stubs requests', () => {
      const prompt = 'Write Vitest stubs for the string formatting helper';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('test_stubs');
    });

    it('should classify jest test case scaffold requests', () => {
      const prompt = 'Create Jest test stubs for calculateTotal';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('test_stubs');
    });

    it('should classify write tests for helper requests', () => {
      const prompt = 'Write tests for this utility function';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(true);
      expect(result.category).toBe('test_stubs');
    });
  });

  describe('Complex Logic, Architecture & Deep Reasoning Exclusion', () => {
    it('should reject system architecture requests even if they mention types or tests', () => {
      const prompt = 'Design the system architecture for a high-throughput microservices trading engine and provide test cases';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(false);
      expect(result.reason).toContain('system architecture');
    });

    it('should reject full-stack application plans', () => {
      const prompt = 'Provide a full-stack plan for migrating our auth system to OAuth2 with database schema design';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(false);
    });

    it('should reject deep reasoning and strategic planning requests', () => {
      const prompt = 'Apply deep reasoning to identify architectural bottlenecks and create a strategic plan for refactoring';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(false);
    });

    it('should reject codebase-wide refactoring requests', () => {
      const prompt = 'Refactor the entire codebase to replace callback patterns with async/await and update all unit test stubs';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(false);
    });

    it('should reject multi-tier database schema design requests', () => {
      const prompt = 'Design the database architecture and relational schema for multi-tenant billing';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty or null prompts gracefully', () => {
      expect(classifyMicroTask('').isMicroTask).toBe(false);
      expect(classifyMicroTask('   ').isMicroTask).toBe(false);
      expect(classifyMicroTask(null as any).isMicroTask).toBe(false);
    });

    it('should classify general coding prompts without micro-task keywords as not a micro-task', () => {
      const prompt = 'Why is this variable returning undefined in my component state?';
      const result = classifyMicroTask(prompt);

      expect(result.isMicroTask).toBe(false);
    });
  });
});
