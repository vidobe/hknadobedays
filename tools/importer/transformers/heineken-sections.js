/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: heineken section breaks + section metadata.
 * Uses payload.template.sections from page-templates.json.
 *
 * Section selectors verified against migration-work/cleaned.html:
 *   section-1-hero    -> .event-detail__hero
 *   section-2-trailer -> #trailer
 *   section-3-video1  -> #layout-block-0990071b
 *   section-4-video2  -> #layout-block-1a5e8ebb
 *   section-5-events  -> #events (style: grey)
 *
 * Breaks are inserted in beforeTransform (while every section element still
 * exists, before parsers replace them) with a marker attribute; Section
 * Metadata is inserted in afterTransform anchored to the surviving marker.
 * Sections are iterated in reverse so inserts never shift not-yet-processed
 * elements. See references/generate-import-transformer.md ("Why both hooks").
 */

const SECTION_MARKER_ATTR = 'data-excat-section-id';

// section.selector is an array of candidate selectors — first match wins.
function querySection(root, selectors) {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

export default function transform(hookName, element, payload) {
  const sections = (payload.template && payload.template.sections) || [];

  if (hookName === 'beforeTransform') {
    for (let i = sections.length - 1; i >= 0; i -= 1) {
      const section = sections[i];
      if (i === 0 && !section.style) continue; // first section: no leading break needed
      const sectionEl = querySection(element, section.selector);
      if (!sectionEl) continue; // no selector matched — skip, never guess

      const hr = document.createElement('hr');
      if (section.style) hr.setAttribute(SECTION_MARKER_ATTR, section.id);
      sectionEl.before(hr);
    }
  }

  if (hookName === 'afterTransform') {
    for (let i = sections.length - 1; i >= 0; i -= 1) {
      const section = sections[i];
      if (!section.style) continue;

      const marker = element.querySelector(`[${SECTION_MARKER_ATTR}="${section.id}"]`);
      const anchor = marker || querySection(element, section.selector);
      if (!anchor) continue; // neither survived — skip, never guess

      const metadataBlock = WebImporter.Blocks.createBlock(document, {
        name: 'Section Metadata',
        cells: { style: section.style },
      });
      anchor.after(metadataBlock);

      if (marker) {
        marker.removeAttribute(SECTION_MARKER_ATTR);
        if (i === 0) marker.remove(); // section 0 never gets a real leading break
      }
    }
  }
}
