import { describe, it, expect } from 'vitest';
import { ProjectManager } from '../src/main/storage/projectManager.js';

describe('ProjectManager', () => {
  it('should format project names with Transgentic prefix', () => {
    expect(ProjectManager.getTargetProjectName({ projectName: 'SuperApp' })).toBe('Transgentic: SuperApp');
    expect(ProjectManager.getTargetProjectName({ projectName: '' })).toBe('Transgentic');
    expect(ProjectManager.getTargetProjectName(undefined)).toBe('Transgentic');
  });

  it('should format thread titles with standardized hierarchical pattern', () => {
    const title = ProjectManager.getThreadTitle(
      { projectName: 'Dashboard', topic: 'Refactor Auth' },
      'Write a function to authenticate user'
    );
    expect(title).toBe('Transgentic: Dashboard: Refactor Auth');
  });

  it('should auto-derive topic from prompt snippet when topic is not provided', () => {
    const title = ProjectManager.getThreadTitle(
      { projectName: 'MyBackend' },
      'Implement Redis caching layer for GraphQL API endpoints'
    );
    expect(title).toContain('Transgentic: MyBackend: Implement Redis caching layer for G');
  });

  it('should gracefully handle non-project providers in SmartProjectEngine', async () => {
    const { SmartProjectEngine } = await import('../src/main/webviews/smartProjectEngine.js');
    const mockWebContents: any = {};
    const res = await SmartProjectEngine.ensureProjectWorkspace(mockWebContents, 'gemini', { projectName: 'TestApp' });
    expect(res.inProject).toBe(false);
    expect(res.isFallback).toBe(true);
    expect(res.projectName).toBe('Transgentic: TestApp');
  });
});
