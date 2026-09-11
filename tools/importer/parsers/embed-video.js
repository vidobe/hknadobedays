/* eslint-disable */
/* global WebImporter */
/**
 * Parser for embed-video. Base: embed.
 * Source: https://www.heineken.com/us/en/campaigns/player00hub
 * Instances: '#layout-block-0990071b .rte', '#layout-block-1a5e8ebb .rte'
 * Structure (library): 1 column. First data row = single cell with the external
 * video URL as a link (optional poster image above the link).
 * Generated for content import.
 */
export default function parse(element, { document }) {
  // Extract the external video URL. In source it lives on an <iframe src>,
  // but fall back to an existing anchor href if the markup differs.
  const iframe = element.querySelector('iframe[src]');
  const existingLink = element.querySelector('a[href*="youtube"], a[href*="youtu.be"], a[href*="vimeo"]');
  const videoUrl = (iframe && iframe.getAttribute('src'))
    || (existingLink && existingLink.getAttribute('href'))
    || '';

  // Optional poster image (library allows an image above the link in the cell).
  const poster = element.querySelector('img[src]');

  // Empty-block guard: nothing to embed.
  if (!videoUrl) {
    element.replaceWith(...element.childNodes);
    return;
  }

  // Build the link element pointing at the external video.
  const link = document.createElement('a');
  link.href = videoUrl;
  link.textContent = videoUrl;

  // 1-column block: one row, one cell holding poster (optional) + link.
  const contentCell = [];
  if (poster) contentCell.push(poster);
  contentCell.push(link);

  const cells = [];
  cells.push([contentCell]);

  const block = WebImporter.Blocks.createBlock(document, { name: 'embed-video', cells });
  element.replaceWith(block);
}
