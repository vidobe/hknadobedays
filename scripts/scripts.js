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
  sendEvent,
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
  // Disable the plugin's built-in page view: it is sent with `documentUnloading: true`,
  // which forces a `navigator.sendBeacon` transport — invisible in the Network XHR/Fetch
  // filter (shows as a `ping`, 204) and geared for unload rather than initial load. We
  // send an explicit page view via `sendEvent` in the lazy phase instead (normal fetch, 200).
  trackPageView: false,
  launchUrls: ['https://assets.adobedtm.com/962ef22b31a8/d5c300c59d31/launch-261b0b21b771-development.min.js'],
};

// Compatibility shim for the Launch/Tags container. Its `setDataLayer` rule reads a
// global `window.dataLayer` (classic GTM-style array), but this project uses the Adobe
// Client Data Layer (`window.adobeDataLayer`). Without this, the rule throws
// `ReferenceError: dataLayer is not defined` before the martech data layer initializes.
// Defining it at module scope (before the delayed-phase Launch load) prevents the error;
// point the Launch rule at `adobeDataLayer` to remove the shim later.
window.dataLayer = window.dataLayer || [];

/**
 * Builds the XDM for a page-view ExperienceEvent using only STANDARD
 * `web.webPageDetails` fields (present in every AEP Web SDK ExperienceEvent
 * schema). The Web SDK auto-collects URL, referrer, device and environment
 * context; it does NOT set the page name, so we derive a clean one here.
 *
 * Note: any site-specific/custom fields depend on the XDM schema mapped to the
 * datastream (visible only in Data Collection → Datastreams → dataset → schema).
 * Add them here once that schema's field paths are known.
 * @returns {Object} the xdm payload
 */
function buildPageViewXdm() {
  const h1 = document.querySelector('main h1');
  const pageName = (h1?.textContent || document.title || '').trim();
  const { pathname, href } = window.location;
  return {
    eventType: 'web.webpagedetails.pageViews',
    web: {
      webPageDetails: {
        name: pageName,
        URL: href,
        pageViews: { value: 1 },
        siteSection: pathname,
      },
      webReferrer: { URL: document.referrer || '' },
    },
  };
}

/**
 * Wires link-click tracking on the primary CTAs, sending standard
 * `web.webinteraction.linkClicks` ExperienceEvents. Uses one delegated
 * listener so links added later (blocks, fragments) are covered too.
 * `linkType: 'other'` is the XDM enum for a same/other content link;
 * `exit`/`download` are the alternatives — these CTAs are neither.
 * @param {Element} scope The root to listen on (document by default)
 */
function trackLinkClicks(scope = document) {
  // The CTAs worth tracking on this campaign page: the hero "Buy" button, the
  // event-card actions, and the trailing "view all" link.
  const CTA_SELECTOR = [
    'main .default-content-wrapper a',
    'main .cards-events a',
    'main .embed-video a',
  ].join(', ');

  scope.addEventListener('click', (e) => {
    const link = e.target.closest(CTA_SELECTOR);
    if (!link || !scope.contains(link)) return;
    const name = (link.textContent || link.getAttribute('aria-label') || '').trim();
    if (!name) return;
    sendAnalyticsEvent({
      eventType: 'web.webinteraction.linkClicks',
      web: {
        webInteraction: {
          name,
          URL: link.href,
          linkClicks: { value: 1 },
          type: 'other',
        },
      },
    });
  });
}

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

// Social links shown in the hero "Share" row (matches the source layout, where the
// icons sit under the hero banner, right-aligned). Footer keeps its own set.
// Inline SVGs use `currentColor` so CSS can brand-color them (green on the white
// hero) — the source's footer-*.svg files are white-on-transparent and vanish here.
const HERO_SHARE_ICONS = {
  facebook: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M14 8.5h2V6h-2c-1.9 0-3 1.2-3 3v1.5H9V13h2v6h2.5v-6h2L16 10.5h-2.5V9c0-.4.2-.5.5-.5z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 8.8A3.2 3.2 0 1 0 12 15.2 3.2 3.2 0 0 0 12 8.8zm0 5.2a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.4-5.9a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zM17 6.3c-.6-.6-1.4-.8-2.2-.8-.9 0-3.7 0-4.6 0-.8 0-1.6.2-2.2.8s-.8 1.4-.8 2.2c0 .9 0 3.7 0 4.6 0 .8.2 1.6.8 2.2s1.4.8 2.2.8c.9 0 3.7 0 4.6 0 .8 0 1.6-.2 2.2-.8s.8-1.4.8-2.2c0-.9 0-3.7 0-4.6 0-.8-.2-1.6-.8-2.2zm-1 7.6c-.2.5-.6.9-1.1 1.1-.8.3-2.6.2-3.5.2s-2.7.1-3.5-.2c-.5-.2-.9-.6-1.1-1.1-.3-.8-.2-2.6-.2-3.5s-.1-2.7.2-3.5c.2-.5.6-.9 1.1-1.1.8-.3 2.6-.2 3.5-.2s2.7-.1 3.5.2c.5.2.9.6 1.1 1.1.3.8.2 2.6.2 3.5s.1 2.7-.2 3.5z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21.6 8.2a2.5 2.5 0 0 0-1.8-1.8C18.2 6 12 6 12 6s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 8.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 3.8 2.5 2.5 0 0 0 1.8 1.8C5.8 18 12 18 12 18s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-3.8zM10 15V9l5 3z"/></svg>',
};

const HERO_SHARE_LINKS = [
  { href: 'https://www.facebook.com/heineken', label: 'Facebook', icon: HERO_SHARE_ICONS.facebook },
  { href: 'https://www.instagram.com/heineken/', label: 'Instagram', icon: HERO_SHARE_ICONS.instagram },
  { href: 'https://www.youtube.com/user/heineken', label: 'YouTube', icon: HERO_SHARE_ICONS.youtube },
];

/**
 * Appends a right-aligned "Share" social row directly below the hero banner.
 * The hero is the first section and is default content (a single full-bleed
 * image), so the row is injected by code rather than authored inline.
 * @param {Element} main The main element
 */
function buildHeroShareRow(main) {
  const heroSection = main.querySelector(':scope > div');
  if (!heroSection || !heroSection.querySelector('picture, img')) return;
  if (heroSection.querySelector('.hero-share')) return; // idempotent

  const share = document.createElement('div');
  share.className = 'hero-share';
  const label = document.createElement('span');
  label.className = 'hero-share-label';
  label.textContent = 'Share';
  const list = document.createElement('ul');
  HERO_SHARE_LINKS.forEach(({ href, label: alt, icon }) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = href;
    a.setAttribute('aria-label', alt);
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = icon;
    li.append(a);
    list.append(li);
  });
  share.append(label, list);
  heroSection.append(share);
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
    // Hero share row is page-only (not for header/footer fragments, which also
    // pass through decorateMain), so it runs here against the real page main.
    buildHeroShareRow(main);
    document.body.classList.add('appear');
    await Promise.all([
      martechLoadedPromise
        .then(() => martechEager())
        .then((response) => applyHeroOffer(response)),
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

  // Register widget (name + email → registration event to AEP). Loaded here in
  // the lazy phase — right after the header — so its nav icon appears promptly
  // rather than waiting for the 3s delayed phase.
  import('./register-widget.js').then(({ default: initRegisterWidget }) => initRegisterWidget());

  // Run the lazy martech phase (loads/settles the data layer and analytics).
  await martechLazy();

  // Send an explicit page view as a normal fetch event (visible in the Network
  // XHR/Fetch tab, 200). The plugin's built-in page view is disabled
  // (`trackPageView: false`) because it uses a sendBeacon transport that is
  // hidden under the `ping` type and geared for unload rather than initial load.
  sendEvent({ xdm: buildPageViewXdm() });

  // Track clicks on the primary CTAs (link-click events).
  trackLinkClicks(doc);
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
