import { createGridModelRenderer, loadModel } from '/vendor/badge-renderer.mjs';

// One shared WebGL context avoids exhausting browser context limits on a long catalogue.
const canvas = document.createElement('canvas');
canvas.id = 'product-badge-layer';
canvas.setAttribute('aria-hidden', 'true');
(document.querySelector('nav')?.parentElement || document.body).append(canvas);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let renderer, views = [], raf = 0, previous = 0, width = 0, height = 0, dpr = 1;
const tracked = new WeakMap();
const pending = new Set();
let dead = false;

function invalidate() {
  if (!raf && !document.hidden && !dead) raf = requestAnimationFrame(paint);
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  const physicalWidth = Math.round(width * dpr), physicalHeight = Math.round(height * dpr);
  if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
    canvas.width = physicalWidth;
    canvas.height = physicalHeight;
    renderer?.syncSize();
  }
  invalidate();
}

function sync() {
  views = [...document.querySelectorAll('[data-badge-model]')].map(element => {
    let view = tracked.get(element);
    if (!view) {
      view = { element, modelUrl: element.dataset.badgeModel, hovered: false };
      tracked.set(element, view);
      const card = element.closest('[data-product]') || element.closest('.checkout-card') || element;
      const setHover = hovered => { view.hovered = hovered && !reducedMotion.matches; invalidate(); };
      card.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') setHover(true); });
      card.addEventListener('pointerleave', () => setHover(false));
      card.addEventListener('focusin', () => setHover(true));
      card.addEventListener('focusout', event => { if (!card.contains(event.relatedTarget)) setHover(false); });
      card.addEventListener('pointerdown', event => {
        if (event.pointerType === 'touch') { setHover(true); setTimeout(() => setHover(false), 1500); }
      });
    }
    if (view.modelUrl !== element.dataset.badgeModel) view.modelUrl = element.dataset.badgeModel;
    return view;
  });
  invalidate();
}

function paint(now) {
  raf = 0;
  if (!renderer || document.hidden || dead) return;
  const dt = previous ? Math.min(50, now - previous) : 16;
  previous = now;
  renderer.clear();
  const visible = new Set(), needsFrame = [false];
  for (const view of views) {
    const element = view.element;
    // display:none filtering and detached checkout DOM must never leave ghost badges.
    if (!element.isConnected || !element.getClientRects().length) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width) continue;
    visible.add(view);
    const model = loadModel(view.modelUrl);
    if (!model.ready) {
      if (!pending.has(model)) {
        pending.add(model);
        model.whenReady.then(() => { element.dataset.badgeReady = model.ready ? 'true' : 'error'; invalidate(); });
      }
      continue;
    }
    element.dataset.badgeReady = 'true';
    renderer.drawModel(view, Math.round(rect.left * dpr), Math.round((height - rect.bottom) * dpr),
      Math.round(rect.width * dpr), Math.round(rect.height * dpr), dt, 1, needsFrame);
  }
  renderer.releaseViews(visible);
  if (needsFrame[0]) invalidate();
  else previous = 0;
}

function start() {
  resize();
  renderer = createGridModelRenderer(canvas);
  if (!renderer) { canvas.remove(); return; }
  sync();
}

// Canvas loss can happen after a device/GPU reset; restore the same visible view set.
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); dead = true; cancelAnimationFrame(raf); raf = 0; });
canvas.addEventListener('webglcontextrestored', () => { dead = false; renderer?.dispose(); renderer = createGridModelRenderer(canvas); resize(); sync(); });
const observer = new MutationObserver(sync);
observer.observe(document.querySelector('main') || document.body, {
  childList: true, subtree: true, attributes: true,
  attributeFilter: ['hidden', 'data-badge-model', 'class']
});
window.addEventListener('scroll', invalidate, { passive: true });
window.addEventListener('resize', resize, { passive: true });
document.addEventListener('visibilitychange', () => { previous = 0; invalidate(); });
reducedMotion.addEventListener('change', () => { for (const view of views) view.hovered = false; invalidate(); });
start();
