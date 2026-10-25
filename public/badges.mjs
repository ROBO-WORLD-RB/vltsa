import { createGridModelRenderer, loadModel } from '/vendor/badge-renderer.mjs';

// One shared WebGL renderer supplies card-local canvases. The browser moves
// each canvas with its card, so scroll alignment never waits for JavaScript.
const canvas = document.createElement('canvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const touchLayout = matchMedia('(hover: none), (pointer: coarse)');
const tracked = new WeakMap();
const pending = new Set();
let renderer, views = [], raf = 0, previous = 0, dead = false;

function invalidate() {
  if (!raf && !document.hidden && !dead) raf = requestAnimationFrame(paint);
}

function sync() {
  const next = [...document.querySelectorAll('[data-badge-model]')].map(element => {
    let view = tracked.get(element);
    if (!view) {
      view = { element, modelUrl: element.dataset.badgeModel, hovered: false };
      tracked.set(element, view);
      const card = element.closest('[data-product], .checkout-card') || element;
      const setHover = value => { view.hovered = value && !reducedMotion.matches && !touchLayout.matches; invalidate(); };
      card.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') setHover(true); });
      card.addEventListener('pointerleave', () => setHover(false));
      card.addEventListener('focusin', () => setHover(true));
      card.addEventListener('focusout', event => { if (!card.contains(event.relatedTarget)) setHover(false); });
    }
    if (view.modelUrl !== element.dataset.badgeModel) {
      view.modelUrl = element.dataset.badgeModel;
      delete element.dataset.badgeReady;
      view.context?.clearRect(0, 0, view.surface.width, view.surface.height);
    }
    return view;
  });
  for (const view of views) if (!next.includes(view)) { view.surface?.remove(); delete view.element.dataset.badgeReady; }
  views = next;
  invalidate();
}

function paint(now) {
  raf = 0;
  if (!renderer || document.hidden || dead) return;
  const dt = previous ? Math.min(50, now - previous) : 16;
  previous = now;
  const visible = new Set();
  const dpr = Math.min(devicePixelRatio || 1, touchLayout.matches ? 1.5 : 2);
  let moving = false;
  for (const view of views) {
    const { element } = view;
    if (!element.isConnected || !element.getClientRects().length) continue;
    const rect = element.getBoundingClientRect();
    // Warm up before cards enter the viewport during a fast swipe.
    if (rect.width < 1 || rect.height < 1 || rect.bottom < -200 || rect.top > innerHeight + 200 || rect.right <= 0 || rect.left >= innerWidth) continue;
    visible.add(view);
    const model = loadModel(view.modelUrl);
    if (!model.ready) {
      if (!pending.has(model)) {
        pending.add(model);
        model.whenReady.then(invalidate);
      }
      continue;
    }
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (!view.surface) {
      view.surface = document.createElement('canvas');
      view.surface.className = 'product-badge-surface';
      view.surface.setAttribute('aria-hidden', 'true');
      view.context = view.surface.getContext('2d');
      if (!view.context) continue;
      element.append(view.surface);
    }
    if (!view.context) continue;
    if (view.surface.width !== w || view.surface.height !== h) {
      view.surface.width = w;
      view.surface.height = h;
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      renderer.syncSize();
    }
    if (touchLayout.matches) view.hovered = !reducedMotion.matches;
    const needsFrame = [false];
    renderer.clear();
    if (!renderer.drawModel(view, 0, 0, w, h, dt, 1, needsFrame)) continue;
    view.context.clearRect(0, 0, w, h);
    view.context.drawImage(canvas, 0, 0);
    element.dataset.badgeReady = 'true';
    moving ||= needsFrame[0];
  }
  renderer.releaseViews(visible);
  if (moving) invalidate();
  else previous = 0;
}

canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); dead = true; cancelAnimationFrame(raf); raf = 0;
});
canvas.addEventListener('webglcontextrestored', () => {
  dead = false; renderer?.dispose(); renderer = createGridModelRenderer(canvas); invalidate();
});
const observer = new MutationObserver(sync);
observer.observe(document.querySelector('main') || document.body, {
  childList: true, subtree: true, attributes: true,
  attributeFilter: ['hidden', 'data-badge-model', 'class']
});
window.addEventListener('scroll', invalidate, { passive: true });
window.addEventListener('resize', invalidate, { passive: true });
document.addEventListener('visibilitychange', () => { previous = 0; invalidate(); });
for (const media of [reducedMotion, touchLayout]) media.addEventListener('change', () => {
  for (const view of views) view.hovered = false;
  previous = 0; invalidate();
});
renderer = createGridModelRenderer(canvas);
if (renderer) sync();
