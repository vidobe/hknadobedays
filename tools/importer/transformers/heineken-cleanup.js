/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: heineken site-wide cleanup.
 * All selectors verified against migration-work/cleaned.html.
 *
 * The scraper already stripped the global header/footer/nav — only <main> remains.
 * The one non-authorable element inside <main> is the breadcrumb, wrapped in a
 * standalone `div.container-large`. Note `.container-large` is reused inside
 * `#events` for authorable content, so we remove ONLY the wrapper that contains
 * the breadcrumb, never bare `.container-large`.
 */

const TransformHook = { beforeTransform: 'beforeTransform', afterTransform: 'afterTransform' };

export default function transform(hookName, element, payload) {
  if (hookName === TransformHook.afterTransform) {
    // Non-authorable: breadcrumb navigation.
    // Found in cleaned.html: <div class="container-large"><div class="event-detail__breadcrumb">...
    const breadcrumb = element.querySelector('.event-detail__breadcrumb');
    if (breadcrumb) {
      const wrapper = breadcrumb.closest('.container-large');
      (wrapper || breadcrumb).remove();
    }

    // Strip inline color styling from spans/headings that authors wouldn't set.
    // Found in cleaned.html: <span style="color: rgb(0, 53, 142);">
    element.querySelectorAll('[style]').forEach((el) => {
      el.removeAttribute('style');
    });

    // Remove leftover non-authorable attributes seen in cleaned.html.
    element.querySelectorAll('[data-id]').forEach((el) => {
      el.removeAttribute('data-id');
    });

    // Wrap bare, block-level "arrow"/"view all" links in a <p> so they survive
    // html2md. Found in cleaned.html: the trailing default-content link
    // <a class="block-link arrow-link">View All Ways to Engage with Us</a>, a
    // direct child of the events section with no block-level wrapper — bare
    // inline anchors between block elements are otherwise dropped on conversion.
    element.querySelectorAll('a.arrow-link, a.block-link').forEach((a) => {
      const parent = a.parentElement;
      if (parent && parent.tagName !== 'P' && parent.tagName !== 'LI') {
        const p = a.ownerDocument.createElement('p');
        a.replaceWith(p);
        p.append(a);
      }
    });
  }
}
