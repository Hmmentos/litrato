// js/filters.js
// Photo filters. The live camera preview uses the CSS version; the saved
// strip uses the canvas version, so what you see is what you save.
// Browsers without canvas `ctx.filter` (older Safari) get a pixel version
// that looks very close.

const FILTERS = {
    none:    { label: 'Natural', css: 'none' },
    bw:      { label: 'B&W',     css: 'grayscale(1) contrast(1.12)' },
    vintage: { label: 'Vintage', css: 'sepia(0.55) contrast(1.05) saturate(0.9) brightness(1.04)' },
    warm:    { label: 'Warm',    css: 'sepia(0.22) saturate(1.2) brightness(1.04)' },
    cool:    { label: 'Cool',    css: 'saturate(0.9) hue-rotate(12deg) brightness(1.03)' },
    pop:     { label: 'Pop',     css: 'contrast(1.22) saturate(1.4)' },
};

const canvasFilterWorks = (() => {
    try {
        const ctx = document.createElement('canvas').getContext('2d');
        if (typeof ctx.filter !== 'string') return false;
        ctx.filter = 'grayscale(1)';
        return ctx.filter === 'grayscale(1)';
    } catch (error) {
        return false;
    }
})();

function clamp255(value) {
    return value < 0 ? 0 : value > 255 ? 255 : value;
}

// Pixel version of each filter (used only when ctx.filter is missing).
function applyPixelFilter(ctx, width, height, name) {
    if (name === 'none') return;
    const image = ctx.getImageData(0, 0, width, height);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        if (name === 'bw') {
            const c = (luma - 128) * 1.12 + 128;
            r = g = b = c;
        } else if (name === 'vintage') {
            const sr = 0.393 * r + 0.769 * g + 0.189 * b;
            const sg = 0.349 * r + 0.686 * g + 0.168 * b;
            const sb = 0.272 * r + 0.534 * g + 0.131 * b;
            r = (r * 0.45 + sr * 0.55) * 1.04;
            g = (g * 0.45 + sg * 0.55) * 1.04;
            b = (b * 0.45 + sb * 0.55) * 1.04;
        } else if (name === 'warm') {
            r = (r + (luma - r) * -0.2) * 1.06 + 6;
            g = (g + (luma - g) * -0.2) * 1.03;
            b = (b + (luma - b) * -0.2) * 0.9;
        } else if (name === 'cool') {
            r = (r + (luma - r) * 0.1) * 0.94;
            g = (g + (luma - g) * 0.1) * 1.02;
            b = (b + (luma - b) * 0.1) * 1.1 + 6;
        } else if (name === 'pop') {
            r = luma + (r - luma) * 1.4;
            g = luma + (g - luma) * 1.4;
            b = luma + (b - luma) * 1.4;
            r = (r - 128) * 1.22 + 128;
            g = (g - 128) * 1.22 + 128;
            b = (b - 128) * 1.22 + 128;
        }
        d[i] = clamp255(r);
        d[i + 1] = clamp255(g);
        d[i + 2] = clamp255(b);
    }
    ctx.putImageData(image, 0, 0);
}

// Draws `source` (a canvas) onto ctx at (x, y, w, h) with the filter.
function drawFiltered(ctx, source, x, y, w, h, name) {
    const filter = FILTERS[name] || FILTERS.none;
    if (canvasFilterWorks) {
        ctx.save();
        ctx.filter = filter.css;
        ctx.drawImage(source, x, y, w, h);
        ctx.restore();
        return;
    }
    const temp = document.createElement('canvas');
    temp.width = w;
    temp.height = h;
    const tctx = temp.getContext('2d');
    tctx.drawImage(source, 0, 0, w, h);
    applyPixelFilter(tctx, w, h, name);
    ctx.drawImage(temp, x, y);
}
