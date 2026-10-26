// js/app.js
// Milesue's Booth: a free 8-bit photobooth that runs fully in the browser.
// Flow: pick 1-8 photos -> camera takes that many + 2 extra -> pick your
// best -> add stickers -> save. Nothing is uploaded anywhere.

const $ = selector => document.querySelector(selector);
const EXTRA_SHOTS = 2;

const els = {
    video: $('#video'),
    count: $('#count'),
    flash: $('#flash'),
    screenLight: $('#screen-light'),
    camStart: $('#cam-start'),
    camError: $('#cam-error'),
    btnCamera: $('#btn-camera'),
    btnShoot: $('#btn-shoot'),
    shootLabel: $('#shoot-label'),
    btnSwitch: $('#btn-switch'),
    status: $('#status'),
    shots: $('#shots'),
    countNote: $('#count-note'),
    timer: $('#timer'),
    flashlight: $('#flashlight'),
    mirror: $('#mirror'),
    sound: $('#sound'),
    upload: $('#upload'),
    pick: $('#pick'),
    pickTitle: $('#pick-title'),
    pickGrid: $('#pick-grid'),
    btnUse: $('#btn-use'),
    btnRetakeAll: $('#btn-retake-all'),
    result: $('#result'),
    resultTitle: $('#result-title'),
    output: $('#output'),
    caption: $('#caption'),
    showDate: $('#show-date'),
    showMascots: $('#show-mascots'),
    btnDownload: $('#btn-download'),
    btnShare: $('#btn-share'),
    btnAgain: $('#btn-again'),
    savedMsg: $('#saved-msg'),
};

const state = {
    stream: null,
    facing: 'user',
    torch: false,              // camera has a real torch
    count: 4,                  // photos on the card (from the layout)
    shots: [],                 // everything taken (count + 2)
    picked: [],                // indexes into shots, in strip order
    layout: 'strip4',
    filter: 'none',
    frame: 'bubblegum',
    customColor: '#ff8fc7',    // for the "Any color" frame
    busy: false,
    stopRequested: false,
    takenAt: null,
    base: document.createElement('canvas'),   // strip without stickers
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function say(text) {
    els.status.textContent = text;
}

// ---------- Sounds (made in the browser, no files) ----------
let audio = null;
function audioContext() {
    if (!audio) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audio = Ctx ? new Ctx() : null;
    }
    if (audio && audio.state === 'suspended') audio.resume();
    return audio;
}
// 8-bit style square-wave beep.
function blip(frequency = 660, duration = 0.08) {
    if (!els.sound.checked) return;
    const ctx = audioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
}
function shutterSound() {
    if (!els.sound.checked) return;
    blip(1320, 0.05);
    setTimeout(() => blip(1760, 0.09), 60);
}

// ---------- Camera ----------
function cameraErrorText(error) {
    if (!window.isSecureContext) return 'The camera only works on a secure page (https or localhost).';
    switch (error && error.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return 'Camera access is blocked. Allow the camera for this site in your browser settings, then tap "Turn on camera" again.';
        case 'NotFoundError':
        case 'OverconstrainedError':
            return 'No camera was found. You can still use photos from your device.';
        case 'NotReadableError':
            return 'Your camera is being used by another app. Close that app, then try again.';
        default:
            return 'The camera could not start. Try again, or use photos from your device.';
    }
}

function stopStream() {
    if (state.stream) state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
}

async function startCamera() {
    els.camError.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showCameraError(cameraErrorText(null));
        return;
    }
    els.btnCamera.disabled = true;
    els.btnCamera.textContent = 'Starting…';
    try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 960 } },
            audio: false,
        });
        state.stream = stream;
        els.video.srcObject = stream;
        await els.video.play().catch(() => {});
        els.camStart.hidden = true;
        els.btnShoot.disabled = false;
        document.getElementById('cam-tools').hidden = false;
        const track = stream.getVideoTracks()[0];
        const caps = track && track.getCapabilities ? track.getCapabilities() : {};
        state.torch = Boolean(caps && caps.torch);
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        els.btnSwitch.hidden = devices.filter(device => device.kind === 'videoinput').length < 2;
        say(`Camera on! Press Start when you're ready.`);
    } catch (error) {
        console.error(error);
        showCameraError(cameraErrorText(error));
    } finally {
        els.btnCamera.disabled = false;
        els.btnCamera.textContent = 'Turn on camera';
    }
}

async function switchCamera() {
    if (state.busy) return;
    state.facing = state.facing === 'user' ? 'environment' : 'user';
    els.mirror.checked = state.facing === 'user';
    applyMirror();
    await startCamera();
}

function showCameraError(text) {
    els.camError.textContent = text;
    els.camError.hidden = false;
}

// Current video frame, center-cropped to 4:3.
function captureFrame() {
    const video = els.video;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const target = SHOT_W / SHOT_H;
    let sw = vw;
    let sh = vw / target;
    if (sh > vh) { sh = vh; sw = vh * target; }
    const canvas = document.createElement('canvas');
    canvas.width = SHOT_W;
    canvas.height = SHOT_H;
    const ctx = canvas.getContext('2d');
    if (els.mirror.checked) {
        ctx.translate(SHOT_W, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, SHOT_W, SHOT_H);
    return canvas;
}

// Flash light: the phone's torch when there is one, otherwise the screen
// turns bright for a moment to light up your face.
async function withFlashLight(take) {
    if (!els.flashlight.checked) return take();
    const track = state.stream && state.stream.getVideoTracks()[0];
    if (state.torch && track) {
        try {
            await track.applyConstraints({ advanced: [{ torch: true }] });
            await sleep(250);
            const frame = take();
            track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
            return frame;
        } catch (error) { /* fall back to the screen light */ }
    }
    els.screenLight.classList.add('on');
    await sleep(320);
    const frame = take();
    setTimeout(() => els.screenLight.classList.remove('on'), 120);
    return frame;
}

// ---------- Countdown + shooting ----------
async function countdown(seconds) {
    for (let n = seconds; n >= 1; n -= 1) {
        if (state.stopRequested) return false;
        els.count.textContent = String(n);
        els.count.classList.remove('tick');
        void els.count.offsetWidth;
        els.count.classList.add('tick');
        blip(n === 1 ? 990 : 660);
        await sleep(1000);
    }
    els.count.textContent = '';
    return !state.stopRequested;
}

function fireFlash() {
    shutterSound();
    els.flash.classList.remove('go');
    void els.flash.offsetWidth;
    els.flash.classList.add('go');
}

const POSES = ['Smile!', 'Peace sign!', 'Silly face!', 'Heart hands!', 'Look cute!', 'Wacky pose!', 'Big laugh!', 'Wink!', 'Pout!', 'Last one, best one!'];

async function shootAll() {
    if (state.busy || !state.stream) return;
    const total = state.count + EXTRA_SHOTS;
    state.busy = true;
    state.stopRequested = false;
    state.shots = [];
    state.picked = [];
    hideAfterShooting();
    renderShotTray(total);
    setShootingUi(true);
    // On phones, make sure the whole camera is on screen while shooting.
    const camRect = document.querySelector('.cam-win').getBoundingClientRect();
    if (camRect.top < 0 || camRect.bottom > window.innerHeight) {
        document.querySelector('.cam-win').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
    const seconds = Number(els.timer.value) || 3;
    let completed = true;

    for (let i = 0; i < total; i += 1) {
        say(`Photo ${i + 1} of ${total}. ${POSES[i % POSES.length]}`);
        markNextSlot(i);
        const go = await countdown(seconds);
        if (!go) { completed = false; break; }
        const frame = await withFlashLight(captureFrame);
        fireFlash();
        if (frame) {
            state.shots.push(frame);
            renderShotTray(total);
        }
        await sleep(reduceMotion ? 300 : 800);
    }

    els.count.textContent = '';
    state.busy = false;
    setShootingUi(false);
    markNextSlot(-1);

    if (!completed) {
        say('Stopped. Press Start to try again.');
        return;
    }
    state.takenAt = new Date();
    showPicker();
}

function setShootingUi(shooting) {
    els.btnShoot.classList.toggle('is-stop', shooting);
    els.shootLabel.textContent = shooting ? 'Stop' : 'Start';
    document.querySelectorAll('.set-body input, .set-body select, .cam-tools input, .cam-filters input').forEach(input => { input.disabled = shooting; });
    els.btnSwitch.disabled = shooting;
}

// Thumbnails use the same crop as the strip, so you see what you'll get.
function thumbCanvas(shot, w = 160) {
    const crop = LAYOUTS[state.layout].crop;
    const src = crop ? centerCrop(shot, crop) : shot;
    const thumb = document.createElement('canvas');
    thumb.width = w;
    thumb.height = Math.round(w * (src.height / src.width));
    thumb.getContext('2d').drawImage(src, 0, 0, thumb.width, thumb.height);
    thumb.style.filter = FILTERS[state.filter].css;
    return thumb;
}

function renderShotTray(total) {
    els.shots.replaceChildren();
    for (let i = 0; i < total; i += 1) {
        const li = document.createElement('li');
        li.className = 'shot';
        if (state.shots[i]) li.appendChild(thumbCanvas(state.shots[i], 120));
        else li.textContent = String(i + 1);
        els.shots.appendChild(li);
    }
}

function markNextSlot(index) {
    [...els.shots.children].forEach((li, i) => li.classList.toggle('is-next', i === index));
}

// ---------- Pick your best ----------
function showPicker() {
    if (state.shots.length <= state.count) {
        state.picked = state.shots.map((_, i) => i);
        showResult();
        return;
    }
    if (!state.picked.length) state.picked = state.shots.slice(0, state.count).map((_, i) => i);
    els.pickTitle.textContent = state.count === 1 ? 'Pick your best shot' : `Pick your best ${state.count}`;
    renderPicker();
    els.pick.hidden = false;
    els.result.hidden = true;
    say(state.count === 1 ? 'Done! Now pick your best shot.' : `Done! Now pick your best ${state.count}.`);
    els.pick.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    els.pickTitle.focus({ preventScroll: true });
}

function renderPicker() {
    els.pickGrid.replaceChildren();
    state.shots.forEach((shot, i) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pick-item';
        const order = state.picked.indexOf(i);
        button.classList.toggle('is-picked', order !== -1);
        button.setAttribute('aria-pressed', String(order !== -1));
        button.setAttribute('aria-label', order !== -1 ? `Photo ${i + 1}, picked as number ${order + 1}` : `Photo ${i + 1}, not picked`);
        button.appendChild(thumbCanvas(shot, 320));
        if (order !== -1) {
            const badge = document.createElement('span');
            badge.className = 'pick-badge';
            badge.textContent = String(order + 1);
            button.appendChild(badge);
        }
        button.addEventListener('click', () => togglePick(i));
        li.appendChild(button);
        els.pickGrid.appendChild(li);
    });
    const ready = state.picked.length === state.count;
    els.btnUse.disabled = !ready;
    const left = state.count - state.picked.length;
    els.btnUse.textContent = ready ? 'Use these photos' : `Pick ${left} more`;
}

function togglePick(index) {
    const at = state.picked.indexOf(index);
    if (at !== -1) {
        state.picked.splice(at, 1);
    } else if (state.picked.length < state.count) {
        state.picked.push(index);
    } else {
        say(`You already picked ${state.count}. Tap one to remove it first.`);
        blip(220, 0.12);
        return;
    }
    renderPicker();
}

// ---------- Photos from the device ----------
function imageToShot(image) {
    const canvas = document.createElement('canvas');
    canvas.width = SHOT_W;
    canvas.height = SHOT_H;
    const ctx = canvas.getContext('2d');
    const scale = Math.max(SHOT_W / image.naturalWidth, SHOT_H / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.drawImage(image, (SHOT_W - w) / 2, (SHOT_H - h) / 2, w, h);
    return canvas;
}

async function handleUpload() {
    const files = [...els.upload.files].filter(file => file.type.startsWith('image/'));
    els.upload.value = '';
    if (!files.length) return;
    const max = state.count + EXTRA_SHOTS;
    for (const file of files) {
        if (state.shots.length >= max) break;
        try {
            state.shots.push(imageToShot(await loadImageFile(file)));
        } catch (error) {
            showCameraError('One of those files could not be opened. Try a PNG or JPG.');
        }
    }
    renderShotTray(Math.max(state.count, state.shots.length));
    if (state.shots.length < state.count) {
        say(`${state.shots.length} of ${state.count} photos added. Add ${state.count - state.shots.length} more.`);
        return;
    }
    state.takenAt = state.takenAt || new Date();
    state.picked = [];
    showPicker();
}

// ---------- Result ----------
async function fontsReady() {
    if (!document.fonts) return;
    try {
        await Promise.race([
            Promise.all([
                document.fonts.load('40px "Press Start 2P"'),
                document.fonts.load('600 32px "Pixelify Sans"'),
            ]),
            sleep(1500),
        ]);
    } catch (error) { /* system fonts are fine */ }
}

function pickedShots() {
    return state.picked.map(i => state.shots[i]);
}

function currentOptions() {
    return {
        layout: state.layout,
        filter: state.filter,
        frame: state.frame,
        customColor: state.customColor,
        caption: els.caption.value,
        showDate: els.showDate.checked,
        mascots: els.showMascots.checked,
        date: state.takenAt || new Date(),
    };
}

function rebuildStrip() {
    if (!state.picked.length) return;
    composeStrip(state.base, pickedShots(), currentOptions());
    els.output.classList.toggle('is-grid', LAYOUTS[state.layout].cols > 1 && state.picked.length > 1);
    redrawStickers();
}

async function showResult() {
    await fontsReady();
    rebuildStrip();
    els.pick.hidden = true;
    els.savedMsg.hidden = true;
    els.result.hidden = false;
    say('Your strip is ready! Add stickers, then save it.');
    els.result.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    els.resultTitle.focus({ preventScroll: true });
    updateShareButton();
    redrawStickers();
}

function hideAfterShooting() {
    els.pick.hidden = true;
    els.result.hidden = true;
    clearStickers();
}

function fileName() {
    const d = state.takenAt || new Date();
    const pad = n => String(n).padStart(2, '0');
    return `milesues-booth-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
}

// The saved image: the strip plus stickers, without the selection box.
function exportBlob() {
    const out = document.createElement('canvas');
    renderWithStickers(out, state.base, Stickers.list, null);
    return new Promise((resolve, reject) => {
        out.toBlob(blob => (blob ? resolve(blob) : reject(new Error('no blob'))), 'image/png');
    });
}

async function download() {
    try {
        const blob = await exportBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName();
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        els.savedMsg.textContent = `Saved as ${fileName()}. Check your Downloads.`;
        els.savedMsg.hidden = false;
        say('Saved! Want another round? Press Start.');
        blip(880, 0.08); setTimeout(() => blip(1175, 0.12), 90);
    } catch (error) {
        els.savedMsg.textContent = 'The photo strip could not be saved. Try again.';
        els.savedMsg.hidden = false;
    }
}

function updateShareButton() {
    let canShare = false;
    try {
        const test = new File([new Blob(['x'], { type: 'image/png' })], 'test.png', { type: 'image/png' });
        canShare = Boolean(navigator.canShare && navigator.canShare({ files: [test] }));
    } catch (error) { canShare = false; }
    els.btnShare.hidden = !canShare;
}

async function share() {
    try {
        const blob = await exportBlob();
        await navigator.share({ files: [new File([blob], fileName(), { type: 'image/png' })], title: "My Milesue's Booth strip" });
    } catch (error) {
        if (error && error.name === 'AbortError') return;
        els.savedMsg.textContent = 'Sharing did not work here. Use "Save photo strip" instead.';
        els.savedMsg.hidden = false;
    }
}

function startOver() {
    state.shots = [];
    state.picked = [];
    state.takenAt = null;
    els.caption.value = '';
    hideAfterShooting();
    renderShotTray(state.count + EXTRA_SHOTS);
    say(state.stream ? 'Ready for another round! Press Start.' : 'Hi! Turn on the camera, then press Start.');
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

// ---------- Options ----------
function setRadioGroup(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => { input.checked = input.value === value; });
}

// ---------- Layout picker ----------
// A small drawing of each layout, made of boxes.
function layoutIcon(key) {
    const layout = LAYOUTS[key];
    const icon = document.createElement('span');
    icon.className = `layout-icon is-${key}`;
    icon.style.setProperty('--cols', Math.min(layout.cols, layout.count));
    for (let i = 0; i < layout.count; i += 1) {
        const cell = document.createElement('i');
        icon.appendChild(cell);
    }
    return icon;
}

function renderLayoutCards() {
    const host = document.getElementById('layout-cards');
    host.replaceChildren();
    Object.entries(LAYOUTS).forEach(([key, layout]) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'layout-card';
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', String(key === state.layout));
        card.dataset.layout = key;
        const name = document.createElement('span');
        name.className = 'layout-name';
        name.textContent = layout.label;
        const note = document.createElement('span');
        note.className = 'layout-note';
        note.textContent = layout.note;
        card.append(layoutIcon(key), name, note);
        card.addEventListener('click', () => chooseLayout(key));
        host.appendChild(card);
    });
}

function chooseLayout(key) {
    if (!LAYOUTS[key] || state.busy) return;
    const changed = key !== state.layout;
    state.layout = key;
    state.count = LAYOUTS[key].count;
    renderLayoutCards();
    const layout = LAYOUTS[key];
    applyShotShape(layout);
    document.getElementById('chosen-name').textContent = layout.label;
    document.getElementById('chosen-icon').replaceChildren(layoutIcon(key));
    const total = state.count + EXTRA_SHOTS;
    els.countNote.textContent = `Takes ${total} shots, so you can pick your best ${state.count === 1 ? 'one' : state.count}.`;
    if (changed && state.shots.length) startOver();
    else renderShotTray(total);
    document.getElementById('layout-pick').hidden = true;
    document.getElementById('booth').hidden = false;
    document.getElementById('booth').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    say(state.stream ? 'Nice choice! Press Start when you are ready.' : 'Nice choice! Now turn on the camera.');
}

// The camera window takes the shape of the photos (wide, square or slim),
// so you can see what will fit before the shot.
function applyShotShape(layout) {
    const ratio = layout.crop || SHOT_W / SHOT_H;
    document.documentElement.style.setProperty('--shot-ratio', String(ratio));
    document.getElementById('window').classList.toggle('is-narrow', Boolean(layout.crop));
}

function showLayoutPicker() {
    if (state.busy) return;
    document.getElementById('layout-pick').hidden = false;
    document.getElementById('layout-pick').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    document.getElementById('layout-title').focus({ preventScroll: true });
}

function applyFilter(value) {
    if (!FILTERS[value]) return;
    state.filter = value;
    setRadioGroup('filter', value);
    setRadioGroup('filter2', value);
    els.video.style.filter = FILTERS[value].css;
    document.querySelectorAll('.shots canvas, .pick-grid canvas').forEach(c => { c.style.filter = FILTERS[value].css; });
    rebuildStrip();
}

function applyMirror() {
    els.video.classList.toggle('is-mirrored', els.mirror.checked);
}

// ---------- Wire up ----------
els.btnCamera.addEventListener('click', () => { audioContext(); startCamera(); });
els.btnSwitch.addEventListener('click', switchCamera);
els.btnShoot.addEventListener('click', () => {
    audioContext();
    if (state.busy) { state.stopRequested = true; return; }
    shootAll();
});
els.btnUse.addEventListener('click', showResult);
document.getElementById('btn-change-layout').addEventListener('click', showLayoutPicker);
els.btnRetakeAll.addEventListener('click', () => {
    document.getElementById('booth').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (state.stream) shootAll();
    else startOver();
});
els.upload.addEventListener('change', handleUpload);

document.addEventListener('change', event => {
    const input = event.target;
    if (input.name === 'filter' || input.name === 'filter2') applyFilter(input.value);
    if (input.name === 'frame') { state.frame = input.value; rebuildStrip(); }
    if (input === els.mirror) applyMirror();
    if (input === els.showDate || input === els.showMascots) rebuildStrip();
});
els.caption.addEventListener('input', rebuildStrip);

// "Any color" frame: picking a color also selects it.
const frameColor = document.getElementById('frame-color');
function useCustomColor() {
    state.customColor = frameColor.value;
    state.frame = 'custom';
    setRadioGroup('frame', 'custom');
    document.getElementById('custom-swatch').style.setProperty('--sw', frameColor.value);
    document.getElementById('custom-swatch').classList.add('is-set');
    rebuildStrip();
}
frameColor.addEventListener('input', useCustomColor);
frameColor.addEventListener('change', useCustomColor);
els.btnDownload.addEventListener('click', download);
els.btnShare.addEventListener('click', share);
els.btnAgain.addEventListener('click', startOver);
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.busy) state.stopRequested = true;
});
window.addEventListener('pagehide', stopStream);

// ---------- Start ----------
buildScene($('#scene'));
$('#title-cat').appendChild(spriteImg('cat', 4, ''));
$('#title-frog').appendChild(spriteImg('frog', 4, ''));
$('#peek-cat').appendChild(spriteImg('cat', 4, ''));
$('#buddy-frog').appendChild(spriteImg('frog', 4, ''));
applyMirror();
applyFilter('none');
renderLayoutCards();
document.getElementById('chosen-icon').replaceChildren(layoutIcon(state.layout));
renderShotTray(state.count + EXTRA_SHOTS);
setupQr(exportBlob, () => say('Scan the QR code to save the strip on your phone!'));
fontsReady().then(() => setupStickers(els.output, () => (state.picked.length ? state.base : null)));
