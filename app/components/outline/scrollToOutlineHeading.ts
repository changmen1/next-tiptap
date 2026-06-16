// 滚动定位工具
const DEFAULT_OUTLINE_SCROLL_OFFSET = 80;

export interface ScrollToOutlineHeadingOptions {
  offset?: number;
  behavior?: ScrollBehavior;
}

export function getOutlineScrollOffset(element?: HTMLElement | null): number {
  const target = element ?? document.documentElement;
  const raw = getComputedStyle(target).getPropertyValue('--we-outline-scroll-offset').trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_OUTLINE_SCROLL_OFFSET;
}

export function scrollToOutlineHeading(
  scrollParent: HTMLElement | null | undefined,
  headingEl: HTMLElement | null | undefined,
  options?: ScrollToOutlineHeadingOptions
): boolean {
  if (!scrollParent || !headingEl) return false;

  const offset = options?.offset ?? getOutlineScrollOffset(scrollParent);
  const containerRect = scrollParent.getBoundingClientRect();
  const headingRect = headingEl.getBoundingClientRect();
  const delta = headingRect.top - containerRect.top - offset;

  scrollParent.scrollTo({
    top: scrollParent.scrollTop + delta,
    behavior: options?.behavior ?? 'smooth'
  });

  return true;
}
