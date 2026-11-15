/** Serializable into provider pages. Search only the given scope and its open roots. */
export function queryProviderElements(root: ParentNode, selector: string, openShadow = false): Element[] {
  if (!openShadow) return Array.from(root.querySelectorAll(selector));

  const result: Element[] = [];
  function visit(scope: ParentNode): void {
    const matches = new Set(scope.querySelectorAll(selector));
    if (scope instanceof Element && scope.shadowRoot) visit(scope.shadowRoot);
    for (const element of scope.querySelectorAll('*')) {
      if (matches.has(element)) result.push(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  }
  visit(root);
  return result;
}

export function providerQueryScript(openShadow: boolean): string {
  return `const openShadowDom = ${openShadow};
    const queryAll = (root, selector) => (${queryProviderElements.toString()})(root, selector, ${openShadow});
    const queryOne = (root, selector) => openShadowDom ? queryAll(root, selector)[0] || null : root.querySelector(selector);`;
}
