import { WebContents } from 'electron';
import { ProviderId } from '../../shared/types.js';
import { ProjectManager, ProjectMetadata } from '../storage/projectManager.js';

export interface ProjectNavigationResult {
  inProject: boolean;
  projectName: string;
  isFallback: boolean;
  details?: string;
}

export class SmartProjectEngine {
  /**
   * Ensures the Webview is focused inside the structured Transgentic Project workspace.
   * Handles ChatGPT & Claude Project discovery, `/projects` hub navigation, auto-creation (Pro/Plus),
   * and guarantees that the browser is always in an interactive chat session with an active composer.
   */
  public static async ensureProjectWorkspace(
    webContents: WebContents,
    providerId: ProviderId,
    metadata?: ProjectMetadata
  ): Promise<ProjectNavigationResult> {
    const targetProjectName = ProjectManager.getTargetProjectName(metadata);

    try {
      if (providerId === 'chatgpt') {
        return await this.handleChatGptProject(webContents, targetProjectName);
      } else if (providerId === 'claude') {
        return await this.handleClaudeProject(webContents, targetProjectName);
      }

      return {
        inProject: false,
        projectName: targetProjectName,
        isFallback: true,
        details: 'Provider does not have a native Projects container',
      };
    } catch (err: any) {
      console.warn(`[SmartProjectEngine] ${providerId} project navigation warning:`, err?.message);
      return {
        inProject: false,
        projectName: targetProjectName,
        isFallback: true,
        details: err?.message || 'Fallback to standard conversation',
      };
    }
  }

  /**
   * ChatGPT Projects & Workspaces Navigation & Auto-Creation Engine
   */
  private static async handleChatGptProject(
    webContents: WebContents,
    targetProjectName: string
  ): Promise<ProjectNavigationResult> {
    const script = `
      (async function() {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const targetName = ${JSON.stringify(targetProjectName)};

        const closeGptSidebarIfOverlay = async () => {
          const closeBtn = document.querySelector(
            'button[aria-label*="Close sidebar" i], ' +
            'button[aria-label*="Close" i], ' +
            'button:has(svg use[href*="cross"]), ' +
            'button:has(svg use[href*="close"]), ' +
            'button:has(svg path[d*="close"])'
          );
          if (closeBtn && closeBtn.getAttribute('data-testid') !== 'open-sidebar-button') {
            closeBtn.click();
            await sleep(200);
          } else {
            const openBtn = document.querySelector('button[data-testid="open-sidebar-button"][aria-expanded="true"]');
            if (openBtn) {
              openBtn.click();
              await sleep(200);
            }
          }
        };

        const ensureChatPageIfStranded = async () => {
          const hasComposer = !!document.querySelector('#prompt-textarea, div.ProseMirror[contenteditable="true"]');
          if (!hasComposer && (window.location.pathname === '/projects' || window.location.pathname.startsWith('/projects/'))) {
            const newChatLink = document.querySelector('a[href="/"], button[aria-label*="New chat" i]');
            if (newChatLink) {
              newChatLink.click();
            } else {
              window.location.href = '/';
            }
            await sleep(500);
          }
        };

        try {
          const currentUrl = window.location.href;

          // 1. Check if already inside a specific Project workspace (e.g. /g/g-p-... or /project/...)
          if (currentUrl.includes('/g/') || (currentUrl.includes('/project/') && !currentUrl.endsWith('/projects'))) {
            const heading = document.querySelector('h1, header, [data-testid*="project"], .text-heading-app');
            if (heading && (heading.innerText || '').includes(targetName)) {
              const newChatInProj = document.querySelector('button[aria-label*="New chat" i], a[href*="/new"], button:has(svg use[href*="plus"])');
              if (newChatInProj) newChatInProj.click();
              await closeGptSidebarIfOverlay();
              return { success: true, action: 'already_in_project' };
            }
          }

          // 2. If on the /projects hub directory
          if (currentUrl.includes('/projects') || document.querySelector('[data-testid="project-directory-scroll-root"], [aria-label="Projects"]')) {
            // Check for matching project row in the directory
            const rows = Array.from(document.querySelectorAll('[data-page-table-selectable-row="true"], div[role="row"]'));
            const matchedRow = rows.find((r) => {
              const text = (r.innerText || '').trim();
              return text.includes(targetName);
            });

            if (matchedRow) {
              matchedRow.click();
              await sleep(600);
              await closeGptSidebarIfOverlay();
              return { success: true, action: 'opened_existing_project_from_hub' };
            }

            // Click the "New" / "New project" button on /projects hub
            const newBtn = Array.from(document.querySelectorAll('button')).find((b) => {
              const t = (b.innerText || '').trim();
              return t === 'New' || t.toLowerCase() === 'new project' || t.toLowerCase().includes('create project');
            });

            if (newBtn) {
              newBtn.click();
              await sleep(400);

              // Search strictly inside dialog/modal or exclude search bar
              const nameInput = document.querySelector(
                'dialog input, [role="dialog"] input, div.group\\\\/dialog input, [data-state="open"] input, input:not(#projects-page-search)'
              );
              if (nameInput) {
                nameInput.focus();
                nameInput.value = targetName;
                nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                nameInput.dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(150);

                const confirmBtn = Array.from(document.querySelectorAll('dialog button, [role="dialog"] button, button[type="submit"]')).find((b) => {
                  const t = (b.innerText || '').trim().toLowerCase();
                  return t.includes('create') || t.includes('save') || t.includes('continue');
                });

                if (confirmBtn && !confirmBtn.disabled) {
                  confirmBtn.click();
                  await sleep(600);
                  await closeGptSidebarIfOverlay();
                  return { success: true, action: 'created_project_from_hub' };
                }
              }
            }

            // If project was not entered from /projects, navigate to main chat / so composer is available
            await ensureChatPageIfStranded();
            await closeGptSidebarIfOverlay();
            return { success: false, action: 'navigated_from_hub_to_home' };
          }

          // 3. If on standard chat (home /), check sidebar for Projects link
          let openedSidebar = false;
          const openSidebarBtn = document.querySelector('button[data-testid="open-sidebar-button"]');
          if (openSidebarBtn && openSidebarBtn.getAttribute('aria-expanded') === 'false') {
            openSidebarBtn.click();
            openedSidebar = true;
            await sleep(300);
          }

          const sidebarLinks = Array.from(document.querySelectorAll(
            'nav a, nav button, nav div[role="button"], [role="navigation"] a, [role="navigation"] button, [data-testid*="sidebar"] a, [data-testid*="sidebar"] button'
          ));

          // Look for direct project link in sidebar
          const directProjectLink = sidebarLinks.find((el) => {
            const text = (el.innerText || '').trim();
            return text === targetName || (text.includes(targetName) && !text.includes('New chat'));
          });

          if (directProjectLink) {
            directProjectLink.click();
            await sleep(500);
            const newChatInProj = document.querySelector('button[aria-label*="New chat" i], a[href*="/new"], button:has(svg use[href*="plus"])');
            if (newChatInProj) newChatInProj.click();
            await closeGptSidebarIfOverlay();
            return { success: true, action: 'navigated_direct_sidebar_project' };
          }

          // Look for "Projects" item in the sidebar
          const projectsItem = sidebarLinks.find((el) => {
            const text = (el.innerText || '').trim();
            return text === 'Projects' || text.toLowerCase().startsWith('projects') || el.getAttribute('href')?.includes('/projects');
          });

          if (projectsItem) {
            projectsItem.click();
            await sleep(500);

            // Now on projects hub, find or create
            const hubRows = Array.from(document.querySelectorAll('[data-page-table-selectable-row="true"], div[role="row"]'));
            const matchedHubRow = hubRows.find((r) => (r.innerText || '').includes(targetName));

            if (matchedHubRow) {
              matchedHubRow.click();
              await sleep(600);
              await closeGptSidebarIfOverlay();
              return { success: true, action: 'navigated_existing_hub_project' };
            }

            const hubNewBtn = Array.from(document.querySelectorAll('button')).find((b) => {
              const t = (b.innerText || '').trim();
              return t === 'New' || t.toLowerCase() === 'new project';
            });

            if (hubNewBtn) {
              hubNewBtn.click();
              await sleep(400);

              const nameInput = document.querySelector('dialog input, [role="dialog"] input, div.group\\\\/dialog input, input:not(#projects-page-search)');
              if (nameInput) {
                nameInput.focus();
                nameInput.value = targetName;
                nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                nameInput.dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(150);

                const confirmBtn = Array.from(document.querySelectorAll('dialog button, [role="dialog"] button')).find((b) => {
                  const t = (b.innerText || '').trim().toLowerCase();
                  return t.includes('create') || t.includes('save') || t.includes('continue');
                });

                if (confirmBtn && !confirmBtn.disabled) {
                  confirmBtn.click();
                  await sleep(600);
                  await closeGptSidebarIfOverlay();
                  return { success: true, action: 'created_project_from_hub_via_sidebar' };
                }
              }
            }

            // Fallback from hub back to /
            await ensureChatPageIfStranded();
          }

          // 4. Clean up sidebar overlay if opened
          if (openedSidebar) {
            await closeGptSidebarIfOverlay();
          }

          return { success: false, action: 'fallback_standard_chatgpt' };
        } catch (e) {
          await closeGptSidebarIfOverlay();
          await ensureChatPageIfStranded();
          return { success: false, error: e.message };
        }
      })()
    `;

    const res = await webContents.executeJavaScript(script, true);
    if (res && res.success) {
      return {
        inProject: true,
        projectName: targetProjectName,
        isFallback: false,
        details: `ChatGPT project workspace active: ${res.action}`,
      };
    }

    return {
      inProject: false,
      projectName: targetProjectName,
      isFallback: true,
      details: 'ChatGPT standard chat active with structured naming',
    };
  }

  /**
   * Claude Projects Navigation & Auto-Creation Engine
   */
  private static async handleClaudeProject(
    webContents: WebContents,
    targetProjectName: string
  ): Promise<ProjectNavigationResult> {
    const script = `
      (async function() {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const targetName = ${JSON.stringify(targetProjectName)};

        const closeClaudeSidebarIfOverlay = async () => {
          const closeBtn = document.querySelector(
            'button[aria-label*="Close sidebar" i], ' +
            'button[aria-label*="Close menu" i], ' +
            'button[aria-label*="Close" i], ' +
            'button:has(svg.lucide-x)'
          );
          if (closeBtn) {
            closeBtn.click();
            await sleep(200);
          }
        };

        const ensureClaudeChatPage = async () => {
          const hasComposer = !!document.querySelector('div.ProseMirror[contenteditable="true"], div[contenteditable="true"], textarea');
          if (!hasComposer && window.location.pathname.startsWith('/project')) {
            const newChatBtn = document.querySelector('a[href="/new"], a[href="/"], button[aria-label*="New chat" i]');
            if (newChatBtn) {
              newChatBtn.click();
            } else {
              window.location.href = '/new';
            }
            await sleep(400);
          }
        };

        try {
          // 1. Check if we are already inside the target project workspace
          const currentUrl = window.location.href;
          const currentHeading = document.querySelector('h1, [data-testid="project-header"], header');
          if (
            currentUrl.includes('/project/') &&
            (currentHeading && (currentHeading.innerText || '').includes(targetName))
          ) {
            const newChatBtn = document.querySelector('button[aria-label*="New chat" i], a[href*="/new"], button:has(svg.lucide-plus)');
            if (newChatBtn) newChatBtn.click();
            await closeClaudeSidebarIfOverlay();
            return { success: true, action: 'already_in_project' };
          }

          // 2. Small-screen check: If sidebar is collapsed, open hamburger menu
          let openedSidebar = false;
          const hamburgerBtn = document.querySelector(
            'button[aria-label*="Open menu" i], ' +
            'button[aria-label*="Open sidebar" i], ' +
            'button[aria-label*="Show sidebar" i], ' +
            'button[aria-label*="Toggle navigation" i], ' +
            'button:has(svg.lucide-menu)'
          );
          if (hamburgerBtn) {
            hamburgerBtn.click();
            openedSidebar = true;
            await sleep(300);
          }

          // 3. Search sidebar for existing matching project
          const sidebarLinks = Array.from(document.querySelectorAll('a[href*="/project/"], nav a, [role="navigation"] a, div[role="button"]'));
          const existingProjectLink = sidebarLinks.find((el) => {
            const text = el.innerText || '';
            return text.trim() === targetName || text.includes(targetName);
          });

          if (existingProjectLink) {
            existingProjectLink.click();
            await sleep(400);
            const projectNewChat = document.querySelector('button[aria-label*="New chat" i], a[href*="/new"], button:has(svg.lucide-plus)');
            if (projectNewChat) projectNewChat.click();
            await closeClaudeSidebarIfOverlay();
            return { success: true, action: 'navigated_existing' };
          }

          // 4. Navigate to Projects Hub or Click Projects tab
          const projectsTab = Array.from(document.querySelectorAll('a[href*="/projects"], button, nav a')).find((el) => {
            const t = (el.innerText || '').trim().toLowerCase();
            return t === 'projects' || el.getAttribute('href') === '/projects';
          });

          if (projectsTab) {
            projectsTab.click();
            await sleep(450);
          }

          // 5. Look for project on /projects list page
          const projectCards = Array.from(document.querySelectorAll('a[href*="/project/"], [data-testid*="project-card"]'));
          const cardMatch = projectCards.find((el) => (el.innerText || '').includes(targetName));
          if (cardMatch) {
            cardMatch.click();
            await sleep(400);
            await closeClaudeSidebarIfOverlay();
            return { success: true, action: 'navigated_from_list' };
          }

          // 6. Pro/Team Auto-Creation: Check for "Create project" or "New project" button
          const createProjectBtn = Array.from(document.querySelectorAll('button, a')).find((el) => {
            const t = (el.innerText || '').trim().toLowerCase();
            return t === 'create project' || t === 'new project' || t === '+ create project' || el.getAttribute('aria-label') === 'Create project';
          });

          if (createProjectBtn) {
            createProjectBtn.click();
            await sleep(350);

            const nameInput = document.querySelector('input[placeholder*="Project name" i], input[name="name"], input[type="text"]');
            if (nameInput) {
              nameInput.focus();
              nameInput.value = targetName;
              nameInput.dispatchEvent(new Event('input', { bubbles: true }));
              nameInput.dispatchEvent(new Event('change', { bubbles: true }));
              await sleep(150);

              const confirmBtn = Array.from(document.querySelectorAll('dialog button, [role="dialog"] button')).find((b) => {
                const text = (b.innerText || '').trim().toLowerCase();
                return text.includes('create') || text.includes('save') || text.includes('continue');
              });

              if (confirmBtn && !confirmBtn.disabled) {
                confirmBtn.click();
                await sleep(500);
                await closeClaudeSidebarIfOverlay();
                return { success: true, action: 'project_created' };
              }
            }
          }

          // 7. Ensure chat page is loaded if creation wasn't possible
          await ensureClaudeChatPage();

          // 8. Ensure sidebar overlay is closed if we opened it
          if (openedSidebar) {
            await closeClaudeSidebarIfOverlay();
          }

          return { success: false, action: 'fallback_free_tier' };
        } catch (e) {
          await closeClaudeSidebarIfOverlay();
          await ensureClaudeChatPage();
          return { success: false, error: e.message };
        }
      })()
    `;

    const res = await webContents.executeJavaScript(script, true);
    if (res && res.success) {
      return {
        inProject: true,
        projectName: targetProjectName,
        isFallback: false,
        details: `Claude project workspace active: ${res.action}`,
      };
    }

    return {
      inProject: false,
      projectName: targetProjectName,
      isFallback: true,
      details: 'Claude Free Tier or Project creation unavailable; falling back to direct thread',
    };
  }
}
