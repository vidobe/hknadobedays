/* eslint-disable */
/* global WebImporter */
/**
 * Parser for cards-events. Base: cards.
 * Source: https://www.heineken.com/us/en/campaigns/player00hub
 * Instance: '.cards-grid-v2-block'
 * Structure (library): 2 columns. First data row = block name.
 * Each subsequent row = one card: cell 1 = image (mandatory),
 * cell 2 = text content (title heading, optional eyebrow/date, description, CTA link).
 * Generated for content import.
 */
export default function parse(element, { document }) {
  // One row per card. Source cards are .cards-grid-v2-item articles.
  const items = Array.from(element.querySelectorAll('.cards-grid-v2-item, article.card-grid'));

  const cells = [];

  items.forEach((item) => {
    // Cell 1: card image.
    const image = item.querySelector('.cards-grid-v2-img img, img');

    // Cell 2: text content — title, optional eyebrow/date, description, CTA.
    const contentEl = item.querySelector('.cards-grid-v2-content') || item;
    const contentCell = [];

    // Title (heading).
    const title = contentEl.querySelector('h3.card-title, .card-title, h1, h2, h3');
    if (title) contentCell.push(title);

    // Optional eyebrow / date: a bare <span> sibling of the title inside the
    // content-wrap (not the span nested inside the title itself, and not the
    // CTA link). Select only direct-child spans of the content-wrap.
    const wrap = contentEl.querySelector('.cards-grid-v2-content-wrap') || contentEl;
    const dateSpans = Array.from(wrap.querySelectorAll(':scope > span'))
      .filter((span) => span.textContent.trim());

    // Description.
    const description = contentEl.querySelector('.rte, p');

    // Emit each eyebrow/date as an *emphasized* paragraph. A <p> whose only
    // content is a bare text node is pruned by html2md during markdown
    // serialization (that dropout is why this line vanished from the imported
    // plain.html); giving it real inline markup (<em>) yields a formatted
    // paragraph that html2md always preserves. When a description exists we
    // insert the date paragraph *inside* the description block, immediately
    // before its content, so the surviving-description container carries it
    // through as well.
    dateSpans.forEach((span) => {
      const p = document.createElement('p');
      const em = document.createElement('em');
      em.textContent = span.textContent.trim();
      p.appendChild(em);
      if (description) {
        description.insertBefore(p, description.firstChild);
      } else {
        contentCell.push(p);
      }
    });

    if (description) contentCell.push(description);

    // CTA link.
    const cta = contentEl.querySelector('.cards-grid-v2-action a, a.btn, a[class*="btn"]');
    if (cta) contentCell.push(cta);

    // Only add the row if the card has content; pad missing image cell so every
    // row keeps 2 columns.
    if (image || contentCell.length) {
      cells.push([image || '', contentCell.length ? contentCell : '']);
    }
  });

  // Empty-block guard: no cards found.
  if (!cells.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-events', cells });
  element.replaceWith(block);
}
