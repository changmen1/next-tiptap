// 目录滚动定位工具。
// 所有目录跳转都在编辑器自己的滚动容器内完成，不滚动 window。
const DEFAULT_OUTLINE_SCROLL_OFFSET = 80;

export interface ScrollToOutlineHeadingOptions {
  offset?: number;
  behavior?: ScrollBehavior;
}

export function getOutlineScrollOffset(element?: HTMLElement | null): number {
  // CSS 变量允许样式层根据顶栏/工具栏高度调整滚动偏移。
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

  // 将标题相对滚动容器顶部的位置换算成 scrollTop 增量，再减去工具栏偏移。
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
