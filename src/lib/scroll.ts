/**
 * The app deliberately makes body the scroll container (to prevent horizontal
 * overflow on mobile). In that layout window.scrollY remains zero.
 */
export function pageScroller(): HTMLElement {
  const body = document.body;
  const bodyOverflow = window.getComputedStyle(body).overflowY;
  if (body.scrollHeight > body.clientHeight && /auto|scroll/.test(bodyOverflow)) {
    return body;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

export function pageScrollTop() {
  return pageScroller().scrollTop;
}

export function scrollPageTo(top: number) {
  pageScroller().scrollTo({ top, behavior: 'auto' });
}
