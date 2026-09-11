/* eslint-disable */
var CustomImportScript = (() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // tools/importer/import-campaigns.js
  var import_campaigns_exports = {};
  __export(import_campaigns_exports, {
    default: () => import_campaigns_default
  });

  // tools/importer/parsers/embed-video.js
  function parse(element, { document: document2 }) {
    const iframe = element.querySelector("iframe[src]");
    const existingLink = element.querySelector('a[href*="youtube"], a[href*="youtu.be"], a[href*="vimeo"]');
    const videoUrl = iframe && iframe.getAttribute("src") || existingLink && existingLink.getAttribute("href") || "";
    const poster = element.querySelector("img[src]");
    if (!videoUrl) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const link = document2.createElement("a");
    link.href = videoUrl;
    link.textContent = videoUrl;
    const contentCell = [];
    if (poster) contentCell.push(poster);
    contentCell.push(link);
    const cells = [];
    cells.push([contentCell]);
    const block = WebImporter.Blocks.createBlock(document2, { name: "embed-video", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/cards-events.js
  function parse2(element, { document: document2 }) {
    const items = Array.from(element.querySelectorAll(".cards-grid-v2-item, article.card-grid"));
    const cells = [];
    items.forEach((item) => {
      const image = item.querySelector(".cards-grid-v2-img img, img");
      const contentEl = item.querySelector(".cards-grid-v2-content") || item;
      const contentCell = [];
      const title = contentEl.querySelector("h3.card-title, .card-title, h1, h2, h3");
      if (title) contentCell.push(title);
      const wrap = contentEl.querySelector(".cards-grid-v2-content-wrap") || contentEl;
      const dateSpans = Array.from(wrap.querySelectorAll(":scope > span")).filter((span) => span.textContent.trim());
      const description = contentEl.querySelector(".rte, p");
      dateSpans.forEach((span) => {
        const p = document2.createElement("p");
        const em = document2.createElement("em");
        em.textContent = span.textContent.trim();
        p.appendChild(em);
        if (description) {
          description.insertBefore(p, description.firstChild);
        } else {
          contentCell.push(p);
        }
      });
      if (description) contentCell.push(description);
      const cta = contentEl.querySelector('.cards-grid-v2-action a, a.btn, a[class*="btn"]');
      if (cta) contentCell.push(cta);
      if (image || contentCell.length) {
        cells.push([image || "", contentCell.length ? contentCell : ""]);
      }
    });
    if (!cells.length) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const block = WebImporter.Blocks.createBlock(document2, { name: "cards-events", cells });
    element.replaceWith(block);
  }

  // tools/importer/transformers/heineken-cleanup.js
  var TransformHook = { beforeTransform: "beforeTransform", afterTransform: "afterTransform" };
  function transform(hookName, element, payload) {
    if (hookName === TransformHook.afterTransform) {
      const breadcrumb = element.querySelector(".event-detail__breadcrumb");
      if (breadcrumb) {
        const wrapper = breadcrumb.closest(".container-large");
        (wrapper || breadcrumb).remove();
      }
      element.querySelectorAll("[style]").forEach((el) => {
        el.removeAttribute("style");
      });
      element.querySelectorAll("[data-id]").forEach((el) => {
        el.removeAttribute("data-id");
      });
      element.querySelectorAll("a.arrow-link, a.block-link").forEach((a) => {
        const parent = a.parentElement;
        if (parent && parent.tagName !== "P" && parent.tagName !== "LI") {
          const p = a.ownerDocument.createElement("p");
          a.replaceWith(p);
          p.append(a);
        }
      });
    }
  }

  // tools/importer/transformers/heineken-sections.js
  var SECTION_MARKER_ATTR = "data-excat-section-id";
  function querySection(root, selectors) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  function transform2(hookName, element, payload) {
    const sections = payload.template && payload.template.sections || [];
    if (hookName === "beforeTransform") {
      for (let i = sections.length - 1; i >= 0; i -= 1) {
        const section = sections[i];
        if (i === 0 && !section.style) continue;
        const sectionEl = querySection(element, section.selector);
        if (!sectionEl) continue;
        const hr = document.createElement("hr");
        if (section.style) hr.setAttribute(SECTION_MARKER_ATTR, section.id);
        sectionEl.before(hr);
      }
    }
    if (hookName === "afterTransform") {
      for (let i = sections.length - 1; i >= 0; i -= 1) {
        const section = sections[i];
        if (!section.style) continue;
        const marker = element.querySelector(`[${SECTION_MARKER_ATTR}="${section.id}"]`);
        const anchor = marker || querySection(element, section.selector);
        if (!anchor) continue;
        const metadataBlock = WebImporter.Blocks.createBlock(document, {
          name: "Section Metadata",
          cells: { style: section.style }
        });
        anchor.after(metadataBlock);
        if (marker) {
          marker.removeAttribute(SECTION_MARKER_ATTR);
          if (i === 0) marker.remove();
        }
      }
    }
  }

  // tools/importer/import-campaigns.js
  var parsers = {
    "embed-video": parse,
    "cards-events": parse2
  };
  var PAGE_TEMPLATE = {
    name: "campaigns",
    description: "Heineken Player 0.0 campaign hub page",
    urls: [
      "https://www.heineken.com/us/en/campaigns/player00hub"
    ],
    blocks: [
      {
        name: "embed-video",
        instances: ["#layout-block-0990071b .rte", "#layout-block-1a5e8ebb .rte"]
      },
      {
        name: "cards-events",
        instances: [".cards-grid-v2-block"]
      }
    ],
    sections: [
      {
        id: "section-1-hero",
        name: "Hero",
        selector: [".event-detail__hero"],
        style: null,
        blocks: [],
        defaultContent: [".event-detail__hero"]
      },
      {
        id: "section-2-trailer",
        name: "Intro / Trailer",
        selector: ["#trailer"],
        style: null,
        blocks: [],
        defaultContent: ["#trailer .rte"]
      },
      {
        id: "section-3-video1",
        name: "Behind the scenes video",
        selector: ["#layout-block-0990071b"],
        style: null,
        blocks: ["embed-video"],
        defaultContent: ["#layout-block-0990071b .rte h3"]
      },
      {
        id: "section-4-video2",
        name: "Best driver video",
        selector: ["#layout-block-1a5e8ebb"],
        style: null,
        blocks: ["embed-video"],
        defaultContent: ["#layout-block-1a5e8ebb .rte h2", "#layout-block-1a5e8ebb .rte p"]
      },
      {
        id: "section-5-events",
        name: "Sponsored events",
        selector: ["#events"],
        style: "grey",
        blocks: ["cards-events"],
        defaultContent: ["#events h1", "#events .arrow-link"]
      }
    ]
  };
  var transformers = [
    transform,
    ...PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1 ? [transform2] : []
  ];
  function executeTransformers(hookName, element, payload) {
    const enhancedPayload = __spreadProps(__spreadValues({}, payload), {
      template: PAGE_TEMPLATE
    });
    transformers.forEach((transformerFn) => {
      try {
        transformerFn.call(null, hookName, element, enhancedPayload);
      } catch (e) {
        console.error(`Transformer failed at ${hookName}:`, e);
      }
    });
  }
  function findBlocksOnPage(document2, template) {
    const pageBlocks = [];
    template.blocks.forEach((blockDef) => {
      blockDef.instances.forEach((selector) => {
        const elements = document2.querySelectorAll(selector);
        if (elements.length === 0) {
          console.warn(`Block "${blockDef.name}" selector not found: ${selector}`);
        }
        elements.forEach((element) => {
          pageBlocks.push({
            name: blockDef.name,
            selector,
            element,
            section: blockDef.section || null
          });
        });
      });
    });
    console.log(`Found ${pageBlocks.length} block instances on page`);
    return pageBlocks;
  }
  var import_campaigns_default = {
    transform: (payload) => {
      const {
        document: document2,
        url,
        html,
        params
      } = payload;
      const main = document2.body;
      executeTransformers("beforeTransform", main, payload);
      const pageBlocks = findBlocksOnPage(document2, PAGE_TEMPLATE);
      pageBlocks.forEach((block) => {
        if (!block.element.parentNode) return;
        const parser = parsers[block.name];
        if (parser) {
          try {
            parser(block.element, { document: document2, url, params });
          } catch (e) {
            console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
          }
        } else {
          console.warn(`No parser found for block: ${block.name}`);
        }
      });
      executeTransformers("afterTransform", main, payload);
      const hr = document2.createElement("hr");
      main.appendChild(hr);
      WebImporter.rules.createMetadata(main, document2);
      WebImporter.rules.transformBackgroundImages(main, document2);
      WebImporter.rules.adjustImageUrls(main, url, params.originalURL);
      const rawPath = new URL(params.originalURL).pathname.replace(/\/$/, "").replace(/\.html?$/, "");
      const path = WebImporter.FileUtils.sanitizePath(rawPath === "" ? "/index" : rawPath);
      return [{
        element: main,
        path,
        report: {
          title: document2.title,
          template: PAGE_TEMPLATE.name,
          blocks: pageBlocks.map((b) => b.name)
        }
      }];
    }
  };
  return __toCommonJS(import_campaigns_exports);
})();
