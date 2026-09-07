export interface ProjectMetadata {
  projectName?: string;
  topic?: string;
  requestId?: string;
}

export class ProjectManager {
  /**
   * Returns the standardized Project/Workspace container title.
   */
  public static getTargetProjectName(metadata?: ProjectMetadata): string {
    if (metadata?.projectName && metadata.projectName.trim().length > 0) {
      return `Transgentic: ${metadata.projectName.trim()}`;
    }
    return 'Transgentic';
  }

  /**
   * Generates the structured Thread / Conversation title.
   * Format: Transgentic: <Project_Name>: <Auto_Generated_Topic>
   */
  public static getThreadTitle(metadata?: ProjectMetadata, promptSnippet?: string): string {
    const proj = metadata?.projectName && metadata.projectName.trim().length > 0 
      ? metadata.projectName.trim() 
      : 'General';

    let topic = metadata?.topic?.trim();
    if (!topic && promptSnippet) {
      // Extract first 5-8 words or 40 characters
      const cleanSnippet = promptSnippet.replace(/[\r\n]+/g, ' ').trim();
      topic = cleanSnippet.slice(0, 35);
      if (cleanSnippet.length > 35) topic += '...';
    }
    if (!topic) {
      topic = new Date().toISOString().replace('T', ' ').slice(0, 19);
    }

    return `Transgentic: ${proj}: ${topic}`;
  }
}
