// js/stickers.js
// The sticker editor on the finished strip: add preset or your own
// stickers, then drag to move, drag the white corner to resize and turn,
// or use the buttons (also works with the keyboard).

const PRESET_SPRITES = [
    ['cat', 'Orange cat'], ['frog', 'Frog'], ['heart', 'Heart'], ['star', 'Star'],
    ['sparkle', 'Sparkle'], ['crown', 'Crown'], ['shades', 'Cool shades'],
    ['flower', 'Flower'], ['bow', 'Bow'], ['moon', 'Moon'],
];
const PRESET_WORDS = [
    ['SANA ALL', '#ffffff'], ['CHAROT', '#ffd1ea'], ['LODI', '#ffffff'], ['OMG', '#ffd65c'],
    ['LV UP!', '#c8f5a0'], ['HELLO!', '#ffffff'], ['LOL', '#ffd1ea'], ['I <3 U', '#ffffff'],
    ['BFF', '#cdb8ff'], ['PASS!', '#ffd65c'],
];

const Stickers = {
    list: [],
    selected: null,
    canvas: null,
    getBase: null,
    mine: [],
    drag: null,
    nextId: 1,
    frame: 0,
};

function stickerUiScale() {
    const rect = Stickers.canvas.getBoundingClientRect();
    return rect.width ? Stickers.canvas.width / rect.width : 1;
}

function redrawStickers() {
    const base = Stickers.getBase && Stickers.getBase();
    if (!base) return;
    renderWithStickers(Stickers.canvas, base, Stickers.list,
        Stickers.selected ? { selected: Stickers.selected, scale: stickerUiScale() } : null);
    document.getElementById('sticker-tools').hidden = !Stickers.selected;
}

function scheduleRedraw() {
    if (Stickers.frame) return;
    Stickers.frame = requestAnimationFrame(() => {
        Stickers.frame = 0;
        redrawStickers();
    });
}

function addSticker(src, { pixel = false, width = 0.3, label = 'Sticker' } = {}) {
    const offset = (Stickers.list.length % 5) * 0.06;
    const sticker = {
        id: Stickers.nextId++,
        src, pixel, label,
        x: 0.5 + offset - 0.12,
        y: 0.25 + offset,
        w: width,
        rot: pixel ? 0 : -0.08,
    };
    Stickers.list.push(sticker);
    Stickers.selected = sticker;
    redrawStickers();
    announce(`${label} added. Drag it where you want it.`);
}

function announce(text) {
    const status = document.getElementById('saved-msg');
    status.textContent = text;
    status.hidden = false;
}

function stickerTrayButton(container, src, label, onAdd) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sticker-btn';
    button.setAttribute('aria-label', `Add ${label} sticker`);
    button.title = label;
    const img = new Image();
    img.src = src.toDataURL ? src.toDataURL() : src.src;
    img.alt = '';
    img.draggable = false;
    button.appendChild(img);
    button.addEventListener('click', onAdd);
    container.appendChild(button);
}

function buildStickerTray() {
    const presets = document.getElementById('sticker-presets');
    presets.replaceChildren();
    PRESET_SPRITES.forEach(([name, label]) => {
        const src = spriteCanvas(name, 12);
        const big = name === 'cat' || name === 'frog';
        stickerTrayButton(presets, src, label, () => addSticker(src, { pixel: true, width: big ? 0.22 : 0.15, label }));
    });
    PRESET_WORDS.forEach(([text, fill]) => {
        const src = textBubbleCanvas(text, { fill });
        stickerTrayButton(presets, src, text, () => addSticker(src, { pixel: true, width: Math.min(0.6, 0.12 + text.length * 0.05), label: text }));
    });
    renderMineTray();
}

function renderMineTray() {
    const mine = document.getElementById('sticker-mine');
    mine.replaceChildren();
    if (!Stickers.mine.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-mine';
        empty.textContent = 'Add any picture from your device and use it as a sticker.';
        mine.appendChild(empty);
        return;
    }
    Stickers.mine.forEach((src, i) => {
        stickerTrayButton(mine, src, `your sticker ${i + 1}`, () => addSticker(src, { width: 0.32, label: 'Your sticker' }));
    });
}

// Your own images become stickers (kept only in this tab).
async function handleStickerUpload(input) {
    const files = [...input.files].filter(file => file.type.startsWith('image/'));
    input.value = '';
    for (const file of files) {
        try {
            const image = await loadImageFile(file);
            const max = 700;
            const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(image.naturalWidth * scale);
            canvas.height = Math.round(image.naturalHeight * scale);
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            Stickers.mine.push(canvas);
            renderMineTray();
            addSticker(canvas, { width: 0.32, label: 'Your sticker' });
        } catch (error) {
            announce('That file could not be opened as a picture. Try a PNG or JPG.');
        }
    }
}

function loadImageFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
        image.src = url;
    });
}

// ---------- Pointer editing on the canvas ----------
function canvasPoint(event) {
    const rect = Stickers.canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (Stickers.canvas.width / rect.width),
        y: (event.clientY - rect.top) * (Stickers.canvas.height / rect.height),
    };
}

function stickerBox(sticker) {
    const W = Stickers.canvas.width;
    const H = Stickers.canvas.height;
    const w = sticker.w * W;
    const h = w * (sticker.src.height / sticker.src.width);
    return { cx: sticker.x * W, cy: sticker.y * H, w, h };
}

// Point in the sticker's own (unrotated) coordinates.
function localPoint(sticker, p) {
    const { cx, cy } = stickerBox(sticker);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const cos = Math.cos(-sticker.rot);
    const sin = Math.sin(-sticker.rot);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

function hitHandle(sticker, p) {
    const { w, h } = stickerBox(sticker);
    const local = localPoint(sticker, p);
    const r = handleRadius(stickerUiScale()) * 1.35;
    if (Math.abs(local.x - w / 2) <= r && Math.abs(local.y + h / 2) <= r) return 'delete';
    if (Math.abs(local.x - w / 2) <= r && Math.abs(local.y - h / 2) <= r) return 'transform';
    return null;
}

function hitSticker(p) {
    for (let i = Stickers.list.length - 1; i >= 0; i -= 1) {
        const sticker = Stickers.list[i];
        const { w, h } = stickerBox(sticker);
        const local = localPoint(sticker, p);
        if (Math.abs(local.x) <= w / 2 && Math.abs(local.y) <= h / 2) return sticker;
    }
    return null;
}

function removeSticker(sticker) {
    Stickers.list = Stickers.list.filter(item => item !== sticker);
    if (Stickers.selected === sticker) Stickers.selected = null;
    redrawStickers();
    announce('Sticker removed.');
}

function onPointerDown(event) {
    if (!Stickers.list.length) return;
    const p = canvasPoint(event);
    if (Stickers.selected) {
        const handle = hitHandle(Stickers.selected, p);
        if (handle === 'delete') { removeSticker(Stickers.selected); return; }
        if (handle === 'transform') {
            const { cx, cy } = stickerBox(Stickers.selected);
            Stickers.drag = {
                mode: 'transform',
                id: event.pointerId,
                startDist: Math.hypot(p.x - cx, p.y - cy) || 1,
                startAngle: Math.atan2(p.y - cy, p.x - cx),
                startW: Stickers.selected.w,
                startRot: Stickers.selected.rot,
            };
            Stickers.canvas.setPointerCapture(event.pointerId);
            event.preventDefault();
            return;
        }
    }
    const hit = hitSticker(p);
    if (hit) {
        Stickers.selected = hit;
        const { cx, cy } = stickerBox(hit);
        Stickers.drag = { mode: 'move', id: event.pointerId, dx: p.x - cx, dy: p.y - cy };
        Stickers.canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
    } else {
        Stickers.selected = null;
    }
    redrawStickers();
}

function onPointerMove(event) {
    const drag = Stickers.drag;
    const sticker = Stickers.selected;
    if (!drag || !sticker || drag.id !== event.pointerId) return;
    const p = canvasPoint(event);
    const W = Stickers.canvas.width;
    const H = Stickers.canvas.height;
    if (drag.mode === 'move') {
        sticker.x = Math.min(1, Math.max(0, (p.x - drag.dx) / W));
        sticker.y = Math.min(1, Math.max(0, (p.y - drag.dy) / H));
    } else {
        const { cx, cy } = stickerBox(sticker);
        const dist = Math.hypot(p.x - cx, p.y - cy);
        sticker.w = Math.min(1.4, Math.max(0.05, drag.startW * (dist / drag.startDist)));
        sticker.rot = drag.startRot + (Math.atan2(p.y - cy, p.x - cx) - drag.startAngle);
    }
    scheduleRedraw();
}

function onPointerUp(event) {
    if (Stickers.drag && Stickers.drag.id === event.pointerId) Stickers.drag = null;
}

// On phones: only stop the page from scrolling when the finger lands on a sticker.
function onTouchStart(event) {
    if (!Stickers.list.length || event.touches.length !== 1) return;
    const p = canvasPoint(event.touches[0]);
    const onHandle = Stickers.selected && hitHandle(Stickers.selected, p);
    if (onHandle || hitSticker(p)) event.preventDefault();
}

function stickerTool(tool) {
    const sticker = Stickers.selected;
    if (!sticker) return;
    if (tool === 'smaller') sticker.w = Math.max(0.05, sticker.w * 0.85);
    if (tool === 'bigger') sticker.w = Math.min(1.4, sticker.w * 1.15);
    if (tool === 'left') sticker.rot -= Math.PI / 12;
    if (tool === 'right') sticker.rot += Math.PI / 12;
    if (tool === 'front') {
        Stickers.list = Stickers.list.filter(item => item !== sticker).concat(sticker);
    }
    if (tool === 'delete') { removeSticker(sticker); return; }
    redrawStickers();
}

function onCanvasKey(event) {
    const sticker = Stickers.selected;
    if (!sticker) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const keys = {
        ArrowLeft: () => { sticker.x = Math.max(0, sticker.x - step); },
        ArrowRight: () => { sticker.x = Math.min(1, sticker.x + step); },
        ArrowUp: () => { sticker.y = Math.max(0, sticker.y - step); },
        ArrowDown: () => { sticker.y = Math.min(1, sticker.y + step); },
        '+': () => stickerTool('bigger'),
        '=': () => stickerTool('bigger'),
        '-': () => stickerTool('smaller'),
        Delete: () => stickerTool('delete'),
        Backspace: () => stickerTool('delete'),
        Escape: () => { Stickers.selected = null; },
    };
    if (!keys[event.key]) return;
    event.preventDefault();
    keys[event.key]();
    redrawStickers();
}

function setupStickers(canvas, getBase) {
    Stickers.canvas = canvas;
    Stickers.getBase = getBase;
    canvas.tabIndex = 0;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('keydown', onCanvasKey);
    document.getElementById('sticker-upload').addEventListener('change', event => handleStickerUpload(event.target));
    document.getElementById('sticker-tools').addEventListener('click', event => {
        const button = event.target.closest('[data-tool]');
        if (button) stickerTool(button.dataset.tool);
    });
    window.addEventListener('resize', () => { if (Stickers.selected) scheduleRedraw(); });
    buildStickerTray();
}

function clearStickers() {
    Stickers.list = [];
    Stickers.selected = null;
}
