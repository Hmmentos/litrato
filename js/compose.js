// js/compose.js
// Builds the finished photo strip (or 2x2 grid) on a canvas.

const SHOT_W = 900;   // each photo is 4:3
const SHOT_H = 675;

const FRAMES = {
    paper: { bg: '#ffffff', text: '#1a1d29', soft: '#6b6f7d' },
    flash: { bg: '#ffd23f', text: '#1a1d29', soft: '#5c4a00' },
    booth: { bg: '#1d5654', text: '#ffffff', soft: '#bfe0dc' },
    rose:  { bg: '#f4a7b9', text: '#3a1220', soft: '#7a3346' },
    ink:   { bg: '#1a1d29', text: '#ffffff', soft: '#a9adbb' },
};

const LAYOUTS = {
    strip: { cols: 1, rows: 4, pad: 44, gap: 26, foot: 230 },
    grid:  { cols: 2, rows: 2, pad: 44, gap: 26, foot: 210 },
};

function formatStripDate(date) {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Shrinks the caption until it fits the width.
function fitFont(ctx, text, family, maxSize, minSize, maxWidth) {
    let size = maxSize;
    do {
        ctx.font = `${size}px ${family}`;
        if (ctx.measureText(text).width <= maxWidth) break;
        size -= 2;
    } while (size > minSize);
    return size;
}

function composeStrip(canvas, shots, options) {
    const base = LAYOUTS[options.layout] || LAYOUTS.strip;
    const frame = FRAMES[options.frame] || FRAMES.paper;
    const caption = (options.caption || '').trim();
    const dateText = options.showDate ? formatStripDate(options.date || new Date()) : '';
    // No caption and no date: just a normal border at the bottom.
    const layout = caption || dateText ? base : { ...base, foot: base.pad };
    const width = layout.pad * 2 + layout.cols * SHOT_W + (layout.cols - 1) * layout.gap;
    const photosHeight = layout.rows * SHOT_H + (layout.rows - 1) * layout.gap;
    const height = layout.pad + photosHeight + layout.foot;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = frame.bg;
    ctx.fillRect(0, 0, width, height);

    shots.forEach((shot, index) => {
        const col = index % layout.cols;
        const row = Math.floor(index / layout.cols);
        const x = layout.pad + col * (SHOT_W + layout.gap);
        const y = layout.pad + row * (SHOT_H + layout.gap);
        if (shot) {
            drawFiltered(ctx, shot, x, y, SHOT_W, SHOT_H, options.filter);
        } else {
            ctx.fillStyle = 'rgba(127,127,127,0.18)';
            ctx.fillRect(x, y, SHOT_W, SHOT_H);
        }
    });

    // Footer: caption and date, centered under the photos.
    const footTop = layout.pad + photosHeight;
    const centerX = width / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (caption && dateText) {
        const size = fitFont(ctx, caption, '"Bungee", "Arial Black", sans-serif', 76, 36, width - layout.pad * 2);
        ctx.fillStyle = frame.text;
        ctx.font = `${size}px "Bungee", "Arial Black", sans-serif`;
        ctx.fillText(caption, centerX, footTop + layout.foot * 0.42);
        ctx.fillStyle = frame.soft;
        ctx.font = '600 34px "Bricolage Grotesque", Arial, sans-serif';
        ctx.fillText(dateText, centerX, footTop + layout.foot * 0.74);
    } else if (caption) {
        const size = fitFont(ctx, caption, '"Bungee", "Arial Black", sans-serif', 84, 36, width - layout.pad * 2);
        ctx.fillStyle = frame.text;
        ctx.font = `${size}px "Bungee", "Arial Black", sans-serif`;
        ctx.fillText(caption, centerX, footTop + layout.foot * 0.52);
    } else if (dateText) {
        ctx.fillStyle = frame.text;
        ctx.font = '600 40px "Bricolage Grotesque", Arial, sans-serif';
        ctx.fillText(dateText, centerX, footTop + layout.foot * 0.52);
    }
    return canvas;
}
