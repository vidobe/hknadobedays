/* eslint-disable */
/* global WebImporter */

// PARSER IMPORTS
import embedVideoParser from './parsers/embed-video.js';
import cardsEventsParser from './parsers/cards-events.js';

// TRANSFORMER IMPORTS
import cleanupTransformer from './transformers/heineken-cleanup.js';
import sectionsTransformer from './transformers/heineken-sections.js';

// PARSER REGISTRY
const parsers = {
  'embed-video': embedVideoParser,
  'cards-events': cardsEventsParser,
};

// PAGE TEMPLATE CONFIGURATION - Embedded from page-templates.json
const PAGE_TEMPLATE = {
  name: 'campaigns',
  description: 'Heineken Player 0.0 campaign hub page',
  urls: [
    'https://www.heineken.com/us/en/campaigns/player00hub',
  ],
  blocks: [
    {
      name: 'embed-video',
      instances: ['#layout-block-0990071b .rte', '#layout-block-1a5e8ebb .rte'],
    },
    {
      name: 'cards-events',
      instances: ['.cards-grid-v2-block'],
    },
  ],
  sections: [
    {
      id: 'section-1-hero',
      name: 'Hero',
      selector: ['.event-detail__hero'],
      style: null,
      blocks: [],
      defaultContent: ['.event-detail__hero'],
    },
    {
      id: 'section-2-trailer',
      name: 'Intro / Trailer',
      selector: ['#trailer'],
      style: null,
      blocks: [],
      defaultContent: ['#trailer .rte'],
    },
    {
      id: 'section-3-video1',
      name: 'Behind the scenes video',
      selector: ['#layout-block-0990071b'],
      style: null,
      blocks: ['embed-video'],
      defaultContent: ['#layout-block-0990071b .rte h3'],
    },
    {
      id: 'section-4-video2',
      name: 'Best driver video',
      selector: ['#layout-block-1a5e8ebb'],
      style: null,
      blocks: ['embed-video'],
      defaultContent: ['#layout-block-1a5e8ebb .rte h2', '#layout-block-1a5e8ebb .rte p'],
    },
    {
      id: 'section-5-events',
      name: 'Sponsored events',
      selector: ['#events'],
      style: 'grey',
      blocks: ['cards-events'],
      defaultContent: ['#events h1', '#events .arrow-link'],
    },
  ],
};

// TRANSFORMER REGISTRY - cleanup runs first; section transformer runs after (2+ sections)
const transformers = [
  cleanupTransformer,
  ...(PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1 ? [sectionsTransformer] : []),
];

/**
 * Execute all page transformers for a specific hook
 */
function executeTransformers(hookName, element, payload) {
  const enhancedPayload = {
    ...payload,
    template: PAGE_TEMPLATE,
  };

  transformers.forEach((transformerFn) => {
    try {
      transformerFn.call(null, hookName, element, enhancedPayload);
    } catch (e) {
      console.error(`Transformer failed at ${hookName}:`, e);
    }
  });
}

/**
 * Find all blocks on the page based on the embedded template configuration
 */
function findBlocksOnPage(document, template) {
  const pageBlocks = [];

  template.blocks.forEach((blockDef) => {
    blockDef.instances.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) {
        console.warn(`Block "${blockDef.name}" selector not found: ${selector}`);
      }
      elements.forEach((element) => {
        pageBlocks.push({
          name: blockDef.name,
          selector,
          element,
          section: blockDef.section || null,
        });
      });
    });
  });

  console.log(`Found ${pageBlocks.length} block instances on page`);
  return pageBlocks;
}

export default {
  transform: (payload) => {
    const {
      document, url, html, params,
    } = payload;

    const main = document.body;

    // 1. beforeTransform (initial cleanup)
    executeTransformers('beforeTransform', main, payload);

    // 2. Find blocks on page
    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);

    // 3. Parse each block using registered parsers
    pageBlocks.forEach((block) => {
      if (!block.element.parentNode) return; // Already replaced by earlier parser
      const parser = parsers[block.name];
      if (parser) {
        try {
          parser(block.element, { document, url, params });
        } catch (e) {
          console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
        }
      } else {
        console.warn(`No parser found for block: ${block.name}`);
      }
    });

    // 4. afterTransform (final cleanup + section breaks/metadata)
    executeTransformers('afterTransform', main, payload);

    // 5. WebImporter built-in rules
    const hr = document.createElement('hr');
    main.appendChild(hr);
    WebImporter.rules.createMetadata(main, document);
    WebImporter.rules.transformBackgroundImages(main, document);
    WebImporter.rules.adjustImageUrls(main, url, params.originalURL);

    // 6. Generate sanitized path
    const rawPath = new URL(params.originalURL).pathname
      .replace(/\/$/, '')
      .replace(/\.html?$/, '');
    const path = WebImporter.FileUtils.sanitizePath(rawPath === '' ? '/index' : rawPath);

    return [{
      element: main,
      path,
      report: {
        title: document.title,
        template: PAGE_TEMPLATE.name,
        blocks: pageBlocks.map((b) => b.name),
      },
    }];
  },
};
