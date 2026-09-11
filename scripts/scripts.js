import {
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  buildBlock,
  readBlockConfig,
} from './aem.js';
import {
  initMartech,
  martechEager,
  martechLazy,
  martechDelayed,
  sendAnalyticsEvent,
  // eslint-disable-next-line import/no-relative-packages
} from '../plugins/martech/src/index.js';

// Adobe Experience Platform Web SDK configuration.
// Datastream ID and Org ID come from Data Collection → Datastreams / your org.
// These are public client-side identifiers (safe to commit), not secrets.
const MARTECH_WEB_SDK_CONFIG = {
  datastreamId: '8b082166-1bea-41ac-9f3b-f5d9f691bc86',
  orgId: '8AB51935659C10E40A495FA2@AdobeOrg',
  defaultConsent: 'pending',
};

// Named AJO/Target decision scope for the hero offer. Author a web campaign in
// Adobe Journey Optimizer against this scope name to deliver the hero offer.
const HERO_OFFER_SCOPE = 'hero-offer';

// Library behaviour. Personalization (AJO/Target decisioning) is ON: decisions
// for HERO_OFFER_SCOPE (plus the implicit `__view__` page scope) are fetched in
// the eager phase and applied before LCP (no flicker). AJO visual/DOM-action
// offers auto-render; custom HTML/JSON offers render via applyHeroOffer() below.
const MARTECH_CONFIG = {
  analytics: true,
  dataLayer: true,
  personalization: true,
  decisionScopes: [HERO_OFFER_SCOPE],
  launchUrls: ['https://assets.adobedtm.com/962ef22b31a8/d5c300c59d31/launch-261b0b21b771-development.min.js'],
};

/**
 * Renders a code-based (HTML) AJO offer for the hero-offer scope into a
 * placeholder. Visual/VEC offers (authored against a CSS selector) render
 * automatically via the plugin; this handles custom HTML/JSON code offers,
 * which the plugin fetches but leaves for project code to place.
 *
 * Add a placeholder to any page/section that should show the offer:
 *   <div class="hero-offer" data-decision-scope="hero-offer"></div>
 *
 * @param {Object} response The alloy propositionFetch response (from martechEager)
 */
function applyHeroOffer(response) {
  const slot = document.querySelector('.hero-offer[data-decision-scope="hero-offer"]');
  if (!slot) return;

  const proposition = (response?.propositions || [])
    .find((p) => p.scope === HERO_OFFER_SCOPE);
  const htmlItem = proposition?.items
    ?.find((i) => i.data?.content && /html/i.test(i.data?.format || 'text/html'));
  if (!htmlItem) return;

  slot.innerHTML = htmlItem.data.content;

  // Report the display back to AJO so impression metrics are captured.
  sendAnalyticsEvent({
    eventType: 'decisioning.propositionDisplay',
    _experience: {
      decisioning: {
        propositions: [{
          id: proposition.id,
          scope: proposition.scope,
          scopeDetails: proposition.scopeDetails,
        }],
        propositionEventType: { display: 1 },
      },
    },
  });
}

if (window.trustedTypes && window.trustedTypes.createPolicy) {
  const innerTT = window.trustedTypes.createPolicy('tt-inner', {
    createHTML: (s) => s, // avoid stack overflow
  });

  window.trustedTypes.createPolicy('default', {
    createHTML: (input, type, sink) => {
      let processedInput = input;
      if (/srcdoc\s*=/i.test(processedInput)) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('iframe[srcdoc]').forEach((el) => el.removeAttribute('srcdoc'));
        processedInput = doc.body.innerHTML;
      }
      if (sink.includes('createContextualFragment') || sink.includes('Document write')) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('script').forEach((el) => el.remove());
        processedInput = doc.body.innerHTML;
      }
      return processedInput;
    },
    createScriptURL: (input) => input,
    createScript: (input) => input,
  });
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Turns `/widgets/...` links into widget blocks.
 * @param {Element} main The container element
 */
function buildWidgetAutoBlocks(main) {
  const widgetLinks = [...main.querySelectorAll('a[href*="/widgets/"]')];
  widgetLinks.forEach((link) => {
    if (link.closest('.widget')) return;
    const newLink = link.cloneNode(true);
    const widgetBlock = buildBlock('widget', { elems: [newLink] });
    const p = link.closest('p');
    if (
      p
      && p.querySelectorAll('a').length === 1
      && p.querySelector('a') === link
      && p.textContent.trim() === link.textContent.trim()
    ) {
      p.replaceWith(widgetBlock);
    } else {
      link.replaceWith(widgetBlock);
    }
  });
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }
    buildWidgetAutoBlocks(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // high-impact call-to-action
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/**
 * Applies `.section-metadata` blocks to their parent section as classes and
 * data attributes, then removes the block. The vendored aem.js decorateSections
 * does not handle section-metadata, so this restores the standard EDS behaviour.
 * @param {Element} main The main element
 */
function decorateSectionMetadata(main) {
  main.querySelectorAll(':scope > .section .section-metadata').forEach((sectionMeta) => {
    const section = sectionMeta.closest('.section');
    const meta = readBlockConfig(sectionMeta);
    Object.keys(meta).forEach((key) => {
      if (key === 'style') {
        const styles = meta.style
          .split(',')
          .map((style) => style.trim())
          .map((style) => style.toLowerCase().replace(/[^0-9a-z]/g, '-'));
        styles.forEach((style) => section.classList.add(style));
      } else {
        section.dataset[key.replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = meta[key];
      }
    });
    sectionMeta.parentNode.remove();
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateSectionMetadata(main);
  decorateBlocks(main);
  decorateButtons(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();

  // Initialize Adobe Web SDK as early as possible so event collection (and, once
  // enabled, AJO/Target personalization) is ready before LCP. Kicks off in
  // parallel with the eager section render below.
  const martechLoadedPromise = initMartech(MARTECH_WEB_SDK_CONFIG, MARTECH_CONFIG);

  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await Promise.all([
      martechLoadedPromise.then(() => martechEager()),
      loadSection(main.querySelector('.section'), waitForFirstImage),
    ]);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('body > header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('body > footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  // Send the deferred analytics/page-view events (kept off the LCP path).
  await martechLazy();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => {
    martechDelayed(); // loads Launch/Tags container(s) well after LCP
    import('./consent-check.js');
    // load anything that can be postponed to the latest here
  }, 3000);
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
