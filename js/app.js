// js/app.js
// Litrato: a free photobooth that runs fully in the browser.
// Flow: turn on camera -> take 4 photos (countdown + flash) -> strip -> save.

const $ = selector => document.querySelector(selector);

const els = {
    video: $('#video'),
    count: $('#count'),
    flash: $('#flash'),
    camStart: $('#cam-start'),
    camError: $('#cam-error'),
    btnCamera: $('#btn-camera'),
    btnShoot: $('#btn-shoot'),
    shootLabel: $('#btn-shoot .shutter-label'),
    status: $('#status'),
    slots: $('#slots'),
    trayHint: $('#tray-hint'),
    timer: $('#timer'),
    mirror: $('#mirror'),
    sound: $('#sound'),
    upload: $('#upload'),
    result: $('#result'),
    output: $('#output'),
    caption: $('#caption'),
    showDate: $('#show-date'),
    btnDownload: $('#btn-download'),
    btnShare: $('#btn-share'),
    btnAgain: $('#btn-again'),
    savedMsg: $('#saved-msg'),
};

const state = {
    stream: null,
    shots: [null, null, null, null],   // 4 canvases, each SHOT_W x SHOT_H
    layout: 'strip',
    filter: 'none',
    frame: 'paper',
    busy: false,
    stopRequested: false,
    uploadTarget: null,                // which slot an upload replaces (null = fill empty slots)
    takenAt: null,
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------- Sound (tiny beeps made in the browser, no files) ----------
let audio = null;
function audioContext() {
    if (!audio) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audio = Ctx ? new Ctx() : null;
    }
    if (audio && audio.state === 'suspended') audio.resume();
    return audio;
}
function beep(frequency = 880, duration = 0.07) {
    if (!els.sound.checked) return;
    const ctx = audioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
}
function shutterSound() {
    if (!els.sound.checked) return;
    const ctx = audioContext();
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * 0.14);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    gain.gain.value = 0.5;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
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

async function startCamera() {
    els.camError.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showCameraError(cameraErrorText(null));
        return;
    }
    els.btnCamera.disabled = true;
    els.btnCamera.textContent = 'Starting camera…';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
            audio: false,
        });
        state.stream = stream;
        els.video.srcObject = stream;
        await els.video.play().catch(() => {});
        els.camStart.hidden = true;
        els.btnShoot.disabled = false;
        setStatus('Camera is on. Press "Take 4 photos" when you are ready.');
    } catch (error) {
        console.error(error);
        showCameraError(cameraErrorText(error));
    } finally {
        els.btnCamera.disabled = false;
        els.btnCamera.textContent = 'Turn on camera';
    }
}

function showCameraError(text) {
    els.camError.textContent = text;
    els.camError.hidden = false;
}

function setStatus(text) {
    els.status.textContent = text;
}

// Grabs the current video frame, center-cropped to 4:3.
function captureFrame() {
    const video = els.video;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const target = SHOT_W / SHOT_H;
    let sw = vw;
    let sh = vw / target;
    if (sh > vh) { sh = vh; sw = vh * target; }
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = SHOT_W;
    canvas.height = SHOT_H;
    const ctx = canvas.getContext('2d');
    if (els.mirror.checked) {
        ctx.translate(SHOT_W, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, SHOT_W, SHOT_H);
    return canvas;
}

// ---------- Countdown + shooting ----------
async function countdown(seconds) {
    for (let n = seconds; n >= 1; n -= 1) {
        if (state.stopRequested) return false;
        els.count.textContent = String(n);
        els.count.classList.remove('tick');
        void els.count.offsetWidth;          // restart the animation
        els.count.classList.add('tick');
        beep(n === 1 ? 1175 : 880);
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

async function shoot(indices) {
    if (state.busy || !state.stream) return;
    state.busy = true;
    state.stopRequested = false;
    setShootingUi(true);
    const seconds = Number(els.timer.value) || 3;
    let completed = true;

    for (let i = 0; i < indices.length; i += 1) {
        const index = indices[i];
        setStatus(indices.length > 1
            ? `Photo ${i + 1} of ${indices.length}. Get ready!`
            : `Retaking photo ${index + 1}. Get ready!`);
        markSlot(index, 'next');
        const go = await countdown(seconds);
        if (!go) { completed = false; break; }
        const frame = captureFrame();
        fireFlash();
        if (frame) {
            state.shots[index] = frame;
            renderSlot(index);
        }
        await sleep(reduceMotion ? 300 : 900);
    }

    els.count.textContent = '';
    state.busy = false;
    setShootingUi(false);
    clearSlotMarks();

    if (!completed) {
        setStatus('Stopped. Press "Take 4 photos" to try again.');
        return;
    }
    if (state.shots.every(Boolean)) {
        state.takenAt = new Date();
        await showResult();
    }
}

function setShootingUi(shooting) {
    els.btnShoot.classList.toggle('is-stop', shooting);
    els.shootLabel.textContent = shooting ? 'Stop' : 'Take 4 photos';
    document.querySelectorAll('.controls input, .controls select').forEach(input => {
        input.disabled = shooting;
    });
    els.slots.classList.toggle('is-busy', shooting);
}

// ---------- Photo slots (the tray) ----------
function renderSlot(index) {
    const slot = els.slots.children[index];
    const shot = state.shots[index];
    slot.replaceChildren();
    if (!shot) {
        const empty = document.createElement('span');
        empty.className = 'slot-empty';
        empty.textContent = String(index + 1);
        slot.appendChild(empty);
        return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'slot-photo';
    button.setAttribute('aria-label', `Retake photo ${index + 1}`);
    const thumb = document.createElement('canvas');
    thumb.width = 240;
    thumb.height = 180;
    thumb.getContext('2d').drawImage(shot, 0, 0, 240, 180);
    thumb.style.filter = FILTERS[state.filter].css;
    const tag = document.createElement('span');
    tag.className = 'slot-retake';
    tag.textContent = 'Retake';
    button.append(thumb, tag);
    button.addEventListener('click', () => retake(index));
    slot.appendChild(button);
    updateTrayHint();
}

function renderAllSlots() {
    state.shots.forEach((_, index) => renderSlot(index));
    updateTrayHint();
}

function markSlot(index, mark) {
    clearSlotMarks();
    els.slots.children[index]?.classList.add(`is-${mark}`);
}

function clearSlotMarks() {
    [...els.slots.children].forEach(slot => slot.classList.remove('is-next'));
}

function updateTrayHint() {
    const taken = state.shots.filter(Boolean).length;
    els.trayHint.textContent = taken === 0
        ? 'Your 4 shots drop in here.'
        : taken < 4
            ? `${taken} of 4 taken.`
            : 'All 4 taken. Tap a photo to retake it.';
}

function retake(index) {
    if (state.busy) return;
    if (state.stream) {
        document.getElementById('booth').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        shoot([index]);
    } else {
        state.uploadTarget = index;
        els.upload.multiple = false;
        els.upload.click();
    }
}

// ---------- Photos from the device (when there is no camera) ----------
function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open that image.')); };
        image.src = url;
    });
}

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
    els.upload.multiple = true;
    if (!files.length) return;
    try {
        if (state.uploadTarget !== null) {
            state.shots[state.uploadTarget] = imageToShot(await loadImage(files[0]));
            renderSlot(state.uploadTarget);
        } else {
            for (const file of files) {
                const empty = state.shots.findIndex(shot => !shot);
                if (empty === -1) break;
                state.shots[empty] = imageToShot(await loadImage(file));
                renderSlot(empty);
            }
        }
    } catch (error) {
        showCameraError(error.message);
    }
    state.uploadTarget = null;
    const missing = state.shots.filter(shot => !shot).length;
    if (missing) {
        setStatus(`${4 - missing} of 4 photos added. Add ${missing} more.`);
    } else {
        state.takenAt = state.takenAt || new Date();
        await showResult();
    }
}

// ---------- Result ----------
async function fontsReady() {
    if (!document.fonts) return;
    try {
        await Promise.race([
            Promise.all([
                document.fonts.load('76px "Bungee"'),
                document.fonts.load('600 34px "Bricolage Grotesque"'),
            ]),
            sleep(1500),
        ]);
    } catch (error) { /* fall back to system fonts */ }
}

function currentOptions() {
    return {
        layout: state.layout,
        filter: state.filter,
        frame: state.frame,
        caption: els.caption.value,
        showDate: els.showDate.checked,
        date: state.takenAt || new Date(),
    };
}

function redraw() {
    if (!state.shots.every(Boolean)) return;
    composeStrip(els.output, state.shots, currentOptions());
    els.output.classList.toggle('is-grid', state.layout === 'grid');
}

async function showResult() {
    await fontsReady();
    redraw();
    els.savedMsg.hidden = true;
    els.result.hidden = false;
    setStatus('Done! Your strip is ready below.');
    els.result.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    els.result.querySelector('h2').focus({ preventScroll: true });
    updateShareButton();
}

function fileName() {
    const d = state.takenAt || new Date();
    const pad = n => String(n).padStart(2, '0');
    return `litrato-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
}

function outputBlob() {
    return new Promise((resolve, reject) => {
        els.output.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not create the image.'))), 'image/png');
    });
}

async function download() {
    try {
        const blob = await outputBlob();
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
        const blob = await outputBlob();
        const file = new File([blob], fileName(), { type: 'image/png' });
        await navigator.share({ files: [file], title: 'My Litrato photo strip' });
    } catch (error) {
        if (error && error.name === 'AbortError') return;   // user closed the share sheet
        els.savedMsg.textContent = 'Sharing did not work here. Use "Save photo strip" instead.';
        els.savedMsg.hidden = false;
    }
}

function startOver() {
    state.shots = [null, null, null, null];
    state.takenAt = null;
    els.caption.value = '';
    els.result.hidden = true;
    renderAllSlots();
    setStatus(state.stream ? 'Ready for a new set. Press "Take 4 photos".' : '');
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

// ---------- Options (layout / filter / frame) ----------
function setRadioGroup(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => { input.checked = input.value === value; });
}

function applyFilter(value) {
    if (!FILTERS[value]) return;
    state.filter = value;
    setRadioGroup('filter', value);
    setRadioGroup('filter2', value);
    els.video.style.filter = FILTERS[value].css;
    els.slots.querySelectorAll('canvas').forEach(thumb => { thumb.style.filter = FILTERS[value].css; });
    redraw();
}

function applyLayout(value) {
    if (!LAYOUTS[value]) return;
    state.layout = value;
    setRadioGroup('layout', value);
    setRadioGroup('layout2', value);
    els.slots.classList.toggle('is-grid', value === 'grid');
    redraw();
}

function applyMirror() {
    els.video.classList.toggle('is-mirrored', els.mirror.checked);
}

// ---------- Wire up ----------
els.btnCamera.addEventListener('click', () => { audioContext(); startCamera(); });
els.btnShoot.addEventListener('click', () => {
    audioContext();
    if (state.busy) { state.stopRequested = true; return; }
    if (state.shots.some(Boolean)) {
        state.shots = [null, null, null, null];
        els.result.hidden = true;
        renderAllSlots();
    }
    shoot([0, 1, 2, 3]);
});
els.upload.addEventListener('change', handleUpload);
document.querySelector('label[for="upload"]').addEventListener('click', () => {
    state.uploadTarget = null;
    els.upload.multiple = true;
});

document.addEventListener('change', event => {
    const input = event.target;
    if (input.name === 'filter' || input.name === 'filter2') applyFilter(input.value);
    if (input.name === 'layout' || input.name === 'layout2') applyLayout(input.value);
    if (input.name === 'frame') { state.frame = input.value; redraw(); }
    if (input === els.mirror) applyMirror();
    if (input === els.showDate) redraw();
});
els.caption.addEventListener('input', redraw);
els.btnDownload.addEventListener('click', download);
els.btnShare.addEventListener('click', share);
els.btnAgain.addEventListener('click', startOver);
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.busy) state.stopRequested = true;
});
window.addEventListener('pagehide', () => {
    if (state.stream) state.stream.getTracks().forEach(track => track.stop());
});

applyMirror();
applyFilter('none');
applyLayout('strip');
renderAllSlots();
