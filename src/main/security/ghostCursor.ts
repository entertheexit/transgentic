/**
 * Bézier Curve Mouse & Cursor Simulation (GhostCursor Adapter)
 * 
 * Generates human-like cursor trajectories using cubic Bézier curves with:
 * - Dynamic acceleration/deceleration (Ease-in-out / Fitts's Law timing)
 * - Randomized trajectory deflection & control points
 * - Natural overshoot past target coordinates before settling
 * - Idle cursor drift / micro-jitter & pre-click hesitation
 * - Full synthetic pointer & mouse event cascades (mousemove, mouseover, pointerdown, mousedown, mouseup, click)
 */

export interface GhostCursorOptions {
  overshoot?: boolean;
  hesitationMs?: number;
  steps?: number;
  randomDrift?: boolean;
}

export class GhostCursor {
  /**
   * Generates a self-contained browser script that computes a cubic Bézier trajectory
   * towards a target element, traverses the curve with realistic timing, and executes
   * a humanized click.
   */
  public static getClickScript(
    selector: string,
    options: GhostCursorOptions = {}
  ): string {
    const shouldOvershoot = options.overshoot ?? true;
    const hesitation = options.hesitationMs ?? 60;
    const randomDrift = options.randomDrift ?? true;

    return `
      (async function() {
        try {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) {
            return { success: false, error: 'Target element not found: ' + ${JSON.stringify(selector)} };
          }

          // Check visibility
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) {
            return { success: false, error: 'Target element is not visible: ' + ${JSON.stringify(selector)} };
          }

          // Scroll target into view if needed
          if (rect.top < 0 || rect.bottom > window.innerHeight) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 180));
          }

          const currentRect = el.getBoundingClientRect();
          const targetX = currentRect.left + currentRect.width * (0.3 + Math.random() * 0.4);
          const targetY = currentRect.top + currentRect.height * (0.3 + Math.random() * 0.4);

          // Track or initialize virtual mouse position
          window.__transgentic_mouse = window.__transgentic_mouse || {
            x: window.innerWidth * (0.2 + Math.random() * 0.6),
            y: window.innerHeight * (0.2 + Math.random() * 0.6)
          };

          const startX = window.__transgentic_mouse.x;
          const startY = window.__transgentic_mouse.y;

          const distance = Math.hypot(targetX - startX, targetY - startY);
          const duration = Math.min(600, Math.max(160, distance * 0.85 + (Math.random() * 80)));
          const steps = Math.max(15, Math.floor(duration / 16)); // ~60fps steps

          // 1. Calculate Cubic Bézier Control Points with lateral deviation
          const midX = (startX + targetX) / 2;
          const midY = (startY + targetY) / 2;
          const normalX = -(targetY - startY);
          const normalY = targetX - startX;
          const normalLen = Math.hypot(normalX, normalY) || 1;

          // Randomized curvature spread
          const spread = (Math.random() - 0.5) * Math.min(120, distance * 0.4);
          const cp1X = startX + (midX - startX) * 0.6 + (normalX / normalLen) * spread;
          const cp1Y = startY + (midY - startY) * 0.6 + (normalY / normalLen) * spread;
          const cp2X = midX + (targetX - midX) * 0.4 - (normalX / normalLen) * (spread * 0.5);
          const cp2Y = midY + (targetY - midY) * 0.4 - (normalY / normalLen) * (spread * 0.5);

          // 2. Overshoot destination calculation
          let destX = targetX;
          let destY = targetY;
          if (${shouldOvershoot} && distance > 50) {
            const dirX = (targetX - startX) / (distance || 1);
            const dirY = (targetY - startY) / (distance || 1);
            const overshootDist = 4 + Math.random() * 8;
            destX += dirX * overshootDist;
            destY += dirY * overshootDist;
          }

          // Cubic Bézier calculation
          const bezier = (p0, p1, p2, p3, t) => {
            const oneMinusT = 1 - t;
            return (
              Math.pow(oneMinusT, 3) * p0 +
              3 * Math.pow(oneMinusT, 2) * t * p1 +
              3 * oneMinusT * Math.pow(t, 2) * p2 +
              Math.pow(t, 3) * p3
            );
          };

          // EaseInOutQuad timing function
          const easeInOut = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

          // Dispatch mousemove along the curve
          for (let i = 0; i <= steps; i++) {
            const rawT = i / steps;
            const t = easeInOut(rawT);
            const curX = bezier(startX, cp1X, cp2X, destX, t);
            const curY = bezier(startY, cp1Y, cp2Y, destY, t);

            // Add micro-jitter / hand tremor
            const jitterX = ${randomDrift} ? (Math.random() - 0.5) * 1.5 : 0;
            const jitterY = ${randomDrift} ? (Math.random() - 0.5) * 1.5 : 0;

            const moveEvt = new MouseEvent('mousemove', {
              clientX: curX + jitterX,
              clientY: curY + jitterY,
              screenX: curX + jitterX + window.screenX,
              screenY: curY + jitterY + window.screenY,
              bubbles: true,
              cancelable: true
            });
            document.dispatchEvent(moveEvt);

            await new Promise(r => setTimeout(r, duration / steps));
          }

          // 3. Overshoot correction: smoothly snap back onto exact target
          if (${shouldOvershoot} && distance > 50) {
            for (let j = 0; j <= 5; j++) {
              const ct = j / 5;
              const snapX = destX + (targetX - destX) * ct;
              const snapY = destY + (targetY - destY) * ct;
              document.dispatchEvent(new MouseEvent('mousemove', {
                clientX: snapX,
                clientY: snapY,
                bubbles: true,
                cancelable: true
              }));
              await new Promise(r => setTimeout(r, 12));
            }
          }

          window.__transgentic_mouse = { x: targetX, y: targetY };

          // 4. Pre-click hesitation (simulates human eye-hand confirmation)
          await new Promise(r => setTimeout(r, ${hesitation} + Math.random() * 40));

          // 5. Dispatch full interactive click event cascade on the element
          const eventOptions = {
            clientX: targetX,
            clientY: targetY,
            screenX: targetX + window.screenX,
            screenY: targetY + window.screenY,
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
            buttons: 1
          };

          el.dispatchEvent(new MouseEvent('mouseover', eventOptions));
          el.dispatchEvent(new MouseEvent('mouseenter', eventOptions));
          el.dispatchEvent(new PointerEvent('pointerover', eventOptions));
          el.dispatchEvent(new PointerEvent('pointerenter', eventOptions));
          el.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
          el.dispatchEvent(new MouseEvent('mousedown', eventOptions));

          // Natural click hold duration
          const holdMs = 40 + Math.random() * 60;
          await new Promise(r => setTimeout(r, holdMs));

          el.dispatchEvent(new PointerEvent('pointerup', eventOptions));
          el.dispatchEvent(new MouseEvent('mouseup', eventOptions));
          el.dispatchEvent(new MouseEvent('click', eventOptions));

          // Native element click trigger if dispatchEvent didn't invoke native handler
          if (typeof el.click === 'function') {
            el.click();
          }

          return { success: true, targetX, targetY };
        } catch (err) {
          return { success: false, error: err ? err.message : 'Unknown GhostCursor error' };
        }
      })()
    `;
  }

  /**
   * Generates a subtle mouse movement / idle hover drift without clicking.
   */
  public static getHoverScript(selector: string): string {
    return `
      (async function() {
        try {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { success: false };
          const rect = el.getBoundingClientRect();
          const targetX = rect.left + rect.width / 2 + (Math.random() - 0.5) * 10;
          const targetY = rect.top + rect.height / 2 + (Math.random() - 0.5) * 10;

          window.__transgentic_mouse = { x: targetX, y: targetY };
          el.dispatchEvent(new MouseEvent('mousemove', {
            clientX: targetX,
            clientY: targetY,
            bubbles: true
          }));
          return { success: true };
        } catch {
          return { success: false };
        }
      })()
    `;
  }
}
