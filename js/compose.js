// js/compose.js
// Builds the finished strip (1 column) or grid (2 columns) for 1-8 photos,
// then draws the stickers on top.

const SHOT_W = 900;   // each photo is 4:3
const SHOT_H = 675;
const PAD = 44;
const GAP = 26;

const FRAMES = {
    bubblegum: { label: 'Bubblegum', bg: '#ffc2e2', text: '#1b0f3b', soft: '#8a3d6b' },
    night:     { label: 'Night',     bg: '#2a1a5e', text: '#ffd1ea', soft: '#b79cff', stars: true },
    lavender:  { label: 'Lavender',  bg: '#cdb8ff', text: '#1b0f3b', soft: '#4d2f8f' },
    mint:      { label: 'Mint',      bg: '#bff5df', text: '#1b0f3b', soft: '#2f6b57' },
    paper:     { label: 'Paper',     bg: '#ffffff', text: '#1b0f3b', soft: '#6b6f7d' },
};

// "Any color" frame: the text turns dark or light so it stays readable.
function frameColors(options) {
    if (options.frame !== 'custom') return FRAMES[options.frame] || FRAMES.bubblegum;
    const bg = /^#[0-9a-f]{6}$/i.test(options.customColor || '') ? options.customColor : '#ff8fc7';
    const [r, g, b] = [1, 3, 5].map(i => parseInt(bg.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35;
    return dark
        ? { bg, text: '#ffffff', soft: 'rgba(255, 255, 255, 0.78)' }
        : { bg, text: '#1b0f3b', soft: 'rgba(27, 15, 59, 0.72)' };
}

function formatStripDate(date) {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fitFont(ctx, text, family, maxSize, minSize, maxWidth) {
    let size = maxSize;
    do {
        ctx.font = `${size}px ${family}`;
        if (ctx.measureText(text).width <= maxWidth) break;
        size -= 2;
    } while (size > minSize);
    return size;
}

// The layouts people pick before shooting.
// count = photos on the card, cols = columns, square = Polaroid-style crop.
const LAYOUTS = {
    polaroid: { label: 'Polaroid', note: 'one shot', count: 1, cols: 1, square: true },
    cut2:     { label: '2 cut', note: 'two big photos', count: 2, cols: 1 },
    strip4:   { label: '4 cut', note: 'the classic strip', count: 4, cols: 1 },
    grid4:    { label: '2 × 2', note: 'four on a card', count: 4, cols: 2 },
    grid6:    { label: '6 cut', note: 'six on a card', count: 6, cols: 2 },
    grid8:    { label: '8 cut', note: 'double strip', count: 8, cols: 2 },
};

// Where each photo goes. Returns { width, height, cells, cellW, cellH, footTop, foot }.
function stripGeometry(layoutKey, count, hasFootText, mascots) {
    const layout = LAYOUTS[layoutKey] || LAYOUTS.strip4;
    const cols = Math.min(layout.cols, count);
    const cellW = layout.square ? SHOT_H : SHOT_W;
    const cellH = SHOT_H;
    const pad = layout.square ? 56 : PAD;
    const rows = Math.ceil(count / cols);
    const width = pad * 2 + cols * cellW + (cols - 1) * GAP;
    const photosH = rows * cellH + (rows - 1) * GAP;
    // A Polaroid always has its thick bottom edge.
    const foot = layout.square ? 230 : hasFootText ? 240 : mascots ? 150 : pad;
    const cells = [];
    for (let i = 0; i < count; i += 1) {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, count - row * cols);
        const col = i % cols;
        const rowWidth = inRow * cellW + (inRow - 1) * GAP;
        const startX = (width - rowWidth) / 2;
        cells.push({ x: startX + col * (cellW + GAP), y: pad + row * (cellH + GAP) });
    }
    return { width, height: pad + photosH + foot, cells, cellW, cellH, pad, footTop: pad + photosH, foot };
}

// Center-crops a 4:3 shot to a square (for the Polaroid layout).
function squareCrop(shot) {
    const size = shot.height;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(shot, (shot.width - size) / 2, 0, size, size, 0, 0, size, size);
    return canvas;
}

function drawFrameStars(ctx, width, height) {
    const rnd = seededRandom(11);
    for (let i = 0; i < Math.round((width * height) / 26000); i += 1) {
        const x = Math.floor(rnd() * width);
        const y = Math.floor(rnd() * height);
        ctx.fillStyle = rnd() > 0.7 ? '#ffd65c' : '#ffe3f1';
        const s = rnd() > 0.85 ? 8 : 4;
        ctx.fillRect(x, y, s, s);
    }
}

// Draws one sticker (centered at its x/y, rotated, sized by width share).
function drawSticker(ctx, sticker, W, H) {
    const w = sticker.w * W;
    const h = w * (sticker.src.height / sticker.src.width);
    ctx.save();
    ctx.translate(sticker.x * W, sticker.y * H);
    ctx.rotate(sticker.rot);
    ctx.imageSmoothingEnabled = !sticker.pixel;
    ctx.drawImage(sticker.src, -w / 2, -h / 2, w, h);
    ctx.restore();
    return { w, h };
}

// Size of the on-canvas handles, so they look the same size on any screen.
function handleRadius(uiScale) {
    return 22 * uiScale;
}

function drawSelection(ctx, sticker, W, H, uiScale) {
    const w = sticker.w * W;
    const h = w * (sticker.src.height / sticker.src.width);
    const r = handleRadius(uiScale);
    ctx.save();
    ctx.translate(sticker.x * W, sticker.y * H);
    ctx.rotate(sticker.rot);
    ctx.lineWidth = 4 * uiScale;
    ctx.setLineDash([10 * uiScale, 8 * uiScale]);
    ctx.strokeStyle = '#ff4f9a';
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.setLineDash([]);
    // Delete (top-right).
    ctx.fillStyle = '#ff4f9a';
    ctx.strokeStyle = '#1b0f3b';
    ctx.fillRect(w / 2 - r, -h / 2 - r, r * 2, r * 2);
    ctx.strokeRect(w / 2 - r, -h / 2 - r, r * 2, r * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5 * uiScale;
    ctx.beginPath();
    ctx.moveTo(w / 2 - r * 0.45, -h / 2 - r * 0.45);
    ctx.lineTo(w / 2 + r * 0.45, -h / 2 + r * 0.45);
    ctx.moveTo(w / 2 + r * 0.45, -h / 2 - r * 0.45);
    ctx.lineTo(w / 2 - r * 0.45, -h / 2 + r * 0.45);
    ctx.stroke();
    // Resize + rotate (bottom-right).
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1b0f3b';
    ctx.lineWidth = 4 * uiScale;
    ctx.fillRect(w / 2 - r, h / 2 - r, r * 2, r * 2);
    ctx.strokeRect(w / 2 - r, h / 2 - r, r * 2, r * 2);
    ctx.fillStyle = '#1b0f3b';
    ctx.beginPath();
    ctx.moveTo(w / 2 + r * 0.5, h / 2 + r * 0.5);
    ctx.lineTo(w / 2 - r * 0.2, h / 2 + r * 0.5);
    ctx.lineTo(w / 2 + r * 0.5, h / 2 - r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// Draws the photos, frame, caption, date and mascots (no stickers).
function composeStrip(canvas, shots, options) {
    const frame = frameColors(options);
    const caption = (options.caption || '').trim();
    const dateText = options.showDate ? formatStripDate(options.date || new Date()) : '';
    const geo = stripGeometry(options.layout, shots.length, Boolean(caption || dateText), options.mascots);
    const square = Boolean((LAYOUTS[options.layout] || {}).square);
    if (canvas.width !== geo.width) canvas.width = geo.width;
    if (canvas.height !== geo.height) canvas.height = geo.height;
    const ctx = canvas.getContext('2d');
    const { width, height } = geo;

    ctx.fillStyle = frame.bg;
    ctx.fillRect(0, 0, width, height);
    if (frame.stars) drawFrameStars(ctx, width, height);

    shots.forEach((shot, i) => {
        const { x, y } = geo.cells[i];
        drawFiltered(ctx, square ? squareCrop(shot) : shot, x, y, geo.cellW, geo.cellH, options.filter);
    });

    // Footer: caption + date in the middle, cat and frog in the corners.
    const centerX = width / 2;
    const footMid = geo.footTop + geo.foot / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const mascotRoom = options.mascots ? 230 : 0;
    const textWidth = width - geo.pad * 2 - mascotRoom;
    if (caption) {
        const family = '"Press Start 2P", monospace';
        const size = fitFont(ctx, caption, family, 56, 22, textWidth);
        ctx.fillStyle = frame.text;
        ctx.font = `${size}px ${family}`;
        ctx.fillText(caption, centerX, dateText ? footMid - 26 : footMid);
    }
    if (dateText) {
        ctx.fillStyle = caption ? frame.soft : frame.text;
        ctx.font = `600 ${caption ? 32 : 38}px "Pixelify Sans", monospace`;
        ctx.fillText(dateText, centerX, caption ? footMid + 42 : footMid);
    }
    if (options.mascots) {
        ctx.imageSmoothingEnabled = false;
        const size = Math.min(110, geo.foot - 30);
        const cat = spriteCanvas('cat', 8);
        const frog = spriteCanvas('frog', 8);
        ctx.drawImage(cat, geo.pad, footMid - size / 2, size, size);
        ctx.drawImage(frog, width - geo.pad - size, footMid - size / 2, size, size);
        ctx.imageSmoothingEnabled = true;
    }

    return geo;
}

// Copies the finished base strip, then draws the stickers (and, while
// editing, the selection box) on top. Fast enough to run while dragging.
function renderWithStickers(target, base, stickers, ui = null) {
    if (target.width !== base.width) target.width = base.width;
    if (target.height !== base.height) target.height = base.height;
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(base, 0, 0);
    stickers.forEach(sticker => drawSticker(ctx, sticker, target.width, target.height));
    if (ui && ui.selected) drawSelection(ctx, ui.selected, target.width, target.height, ui.scale);
}
