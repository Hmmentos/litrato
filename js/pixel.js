// js/pixel.js
// All the pixel art, drawn in code: the orange cat, the frog, the sticker
// sprites, the speech-bubble stickers, and the night-city background.

const INK = '#1b0f3b';

// One letter = one pixel color. "." = see-through.
const PIXEL_COLORS = {
    K: INK,         // outline
    O: '#ff9a3c',   // cat orange
    D: '#e0702a',   // cat stripes
    W: '#ffffff',
    P: '#ff8fc7',   // pink
    H: '#ff4f9a',   // hot pink
    G: '#5ccf6a',   // frog green
    L: '#c8f5a0',   // frog belly
    Y: '#ffd65c',   // yellow
    B: '#8fd3ff',   // light blue
    V: '#9b7bff',   // violet
};

const SPRITES = {
    cat: [
        '..KK........KK..',
        '.KOOK......KOOK.',
        '.KOPOK....KOPOK.',
        '.KOOOOKKKKOOOOK.',
        'KOOOOOOOOOOOOOOK',
        'KOODOOOOOOOODOOK',
        'KOOKKOOOOOOKKOOK',
        'KOOKWOOOOOOKWOOK',
        'KOOOOOOPPOOOOOOK',
        'KWWOOOKOOKOOOWWK',
        '.KWWWWWKKWWWWWK.',
        '..KOOWWWWWWOOK..',
        '.KOOOWWWWWWOOOK.',
        '.KOOOOWWWWOOOOK.',
        '.KOOKOOOOOOKOOK.',
        '..KKKKKKKKKKKK..',
    ],
    frog: [
        '...KKK....KKK...',
        '..KWWWK..KWWWK..',
        '..KWKWK..KWKWK..',
        '.KGWWWKKKKWWWGK.',
        'KGGGGGGGGGGGGGGK',
        'KGGPGGGGGGGGPGGK',
        'KGGGKGGGGGGKGGGK',
        'KGGGGKKKKKKGGGGK',
        '.KGGLLLLLLLLGGK.',
        '.KGLLLLLLLLLLGK.',
        'KGGLLLLLLLLLLGGK',
        'KGGGLLLLLLLLGGGK',
        '.KGGGGGGGGGGGGK.',
        'KGGKGGGGGGGGKGGK',
        'KGGKK......KKGGK',
        '.KK..........KK.',
    ],
    heart: [
        '.KK...KK.',
        'KPPK.KPPK',
        'KPWPKPPPK',
        'KPPPPPPPK',
        '.KPPPPPK.',
        '..KPPPK..',
        '...KPK...',
        '....K....',
    ],
    star: [
        '....K....',
        '...KYK...',
        '...KYK...',
        'KKKKYKKKK',
        'KYYYYYYYK',
        '.KYYYYYK.',
        '.KYYKYYK.',
        'KYYK.KYYK',
        'KKK...KKK',
    ],
    sparkle: [
        '...K...',
        '..KWK..',
        '.KKWKK.',
        'KWWWWWK',
        '.KKWKK.',
        '..KWK..',
        '...K...',
    ],
    crown: [
        'K....K....K',
        'KYK.KYK.KYK',
        'KYYKYYYKYYK',
        'KYYYYYYYYYK',
        'KYHYYHYYHYK',
        'KYYYYYYYYYK',
        'KKKKKKKKKKK',
    ],
    shades: [
        'KKKKKKKKKKKKKK',
        'KWKKKKKKWKKKKK',
        '.KKKKK..KKKKK.',
        '..KKK....KKK..',
    ],
    flower: [
        '..KKK..',
        '.KPPPK.',
        'KPPYPPK',
        'KPYYYPK',
        'KPPYPPK',
        '.KPPPK.',
        '..KGK..',
        '.KGGK..',
        '..KG...',
    ],
    bow: [
        'KK.....KK',
        'KHK...KHK',
        'KHHKKKHHK',
        'KHHKHKHHK',
        'KHHKKKHHK',
        'KHK...KHK',
        'KK.....KK',
    ],
    moon: [
        '..KKKK..',
        '.KYYYYK.',
        'KYYYKYYK',
        'KYYYYYYK',
        'KYKYYYYK',
        'KYYYYKYK',
        '.KYYYYK.',
        '..KKKK..',
    ],
};

// Draws a sprite into a new canvas, each pixel `scale` screen pixels big.
function spriteCanvas(name, scale = 8) {
    const rows = SPRITES[name];
    const canvas = document.createElement('canvas');
    canvas.width = rows[0].length * scale;
    canvas.height = rows.length * scale;
    const ctx = canvas.getContext('2d');
    rows.forEach((row, y) => {
        [...row].forEach((cell, x) => {
            if (cell === '.') return;
            ctx.fillStyle = PIXEL_COLORS[cell];
            ctx.fillRect(x * scale, y * scale, scale, scale);
        });
    });
    return canvas;
}

function spriteImg(name, scale, alt = '') {
    const img = new Image();
    img.src = spriteCanvas(name, scale).toDataURL();
    img.alt = alt;
    img.className = 'sprite';
    img.draggable = false;
    return img;
}

// A pixel speech bubble with text, used as a meme sticker.
function textBubbleCanvas(text, { fill = '#ffffff', color = INK, accent = '#ff4f9a' } = {}) {
    const px = 6;                       // pixel size of the bubble edges
    const fontSize = 40;
    const font = `${fontSize}px "Press Start 2P", monospace`;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    const textW = Math.ceil(measure.measureText(text).width);
    const w = textW + px * 10;
    const bodyH = fontSize + px * 10;
    const h = bodyH + px * 4;           // room for the tail
    const canvas = document.createElement('canvas');
    canvas.width = w + px * 2;
    canvas.height = h + px * 2;
    const ctx = canvas.getContext('2d');
    const o = px;                       // offset so the shadow fits

    // Hard pixel shadow, then outline, then fill (stepped corners).
    const box = (x, y, bw, bh, c) => {
        ctx.fillStyle = c;
        ctx.fillRect(x + px, y, bw - px * 2, bh);
        ctx.fillRect(x, y + px, bw, bh - px * 2);
    };
    box(o + px, o + px, w, bodyH, accent);
    box(o, o, w, bodyH, color);
    box(o + px, o + px, w - px * 2, bodyH - px * 2, fill);
    // Tail (bottom-left).
    ctx.fillStyle = color;
    ctx.fillRect(o + px * 4, o + bodyH - px, px * 4, px * 2);
    ctx.fillRect(o + px * 4, o + bodyH + px, px * 2, px * 2);
    ctx.fillStyle = fill;
    ctx.fillRect(o + px * 5, o + bodyH - px * 2, px * 2, px * 2);

    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, o + w / 2, o + bodyH / 2 + px * 0.5);
    return canvas;
}

// ---------- Night-city background (an SVG of little squares) ----------
function seededRandom(seed) {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
}

function buildScene(host) {
    const W = 320;
    const H = 200;
    const rnd = seededRandom(7);
    const rects = [];
    const r = (x, y, w, h, fill) => rects.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);

    // Stars.
    for (let i = 0; i < 70; i += 1) {
        const x = Math.floor(rnd() * W);
        const y = Math.floor(rnd() * 120);
        r(x, y, 1, 1, rnd() > 0.8 ? '#ffd65c' : '#ffe3f1');
    }
    // Moon.
    const mx = 238, my = 26, mr = 15;
    for (let y = -mr; y <= mr; y += 1) {
        for (let x = -mr; x <= mr; x += 1) {
            const d = x * x + y * y;
            if (d <= mr * mr) {
                const shade = (x + 3) * (x + 3) + (y - 4) * (y - 4) < 20 || (x - 6) * (x - 6) + (y + 5) * (y + 5) < 8;
                r(mx + x, my + y, 1, 1, shade ? '#f2be3d' : '#ffd65c');
            }
        }
    }
    // Clouds.
    const cloud = (cx, cy, s) => {
        const parts = [[0, 4, 26, 6], [4, 1, 10, 4], [12, 0, 10, 5], [20, 2, 8, 3], [-4, 7, 34, 4]];
        parts.forEach(([x, y, w, h]) => r(cx + x * s, cy + y * s, w * s, h * s, '#ffb3d9'));
        r(cx - 4 * s, cy + 10 * s, 34 * s, 2 * s, '#e58cc6');
    };
    cloud(18, 18, 1.5);
    cloud(150, 40, 1);
    cloud(214, 34, 1.4);
    cloud(276, 64, 1);
    cloud(70, 70, 0.9);

    // Skyline.
    const colors = ['#5a2d8c', '#6b37a3', '#7d3fb5', '#4c2578'];
    let x = -4;
    while (x < W) {
        const bw = 14 + Math.floor(rnd() * 22);
        const bh = 34 + Math.floor(rnd() * 46);
        const top = 170 - bh;
        const c = colors[Math.floor(rnd() * colors.length)];
        r(x, top, bw, bh + 30, c);
        if (rnd() > 0.7) r(x + Math.floor(bw / 2) - 1, top - 8, 2, 8, c);
        for (let wy = top + 4; wy < 166; wy += 6) {
            for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
                if (rnd() > 0.55) r(wx, wy, 2, 3, rnd() > 0.5 ? '#ffd1ea' : '#ffd65c');
            }
        }
        x += bw + 1;
    }
    // Sidewalk bricks.
    r(0, 170, W, 30, '#b25aa8');
    for (let y = 172; y < H; y += 5) {
        const shift = ((y - 172) / 5) % 2 ? 4 : 0;
        for (let bx = -shift; bx < W; bx += 9) r(bx, y, 8, 3, '#c96fbd');
    }
    r(0, 168, W, 2, INK);

    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}</svg>`;
}
