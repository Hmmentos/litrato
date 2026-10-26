// js/share-qr.js
// "Get QR code": uploads the finished strip (only when the person agrees),
// then shows a QR code. Everyone in the photo scans it and gets a page with
// a Save button (get.html). Uses Supabase Storage's plain REST API.

const QR = {
    config: window.BOOTH_CONFIG || {},
    lastLink: '',
    getBlob: null,       // set by app.js: () => Promise<Blob>
    onShown: null,
};

function qrEnabled() {
    return Boolean(QR.config.supabaseUrl && QR.config.supabaseAnonKey && QR.config.bucket);
}

function randomId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

function storageBase() {
    return QR.config.supabaseUrl.replace(/\/+$/, '') + '/storage/v1';
}

function publicFileUrl(path, download = false) {
    const url = `${storageBase()}/object/public/${QR.config.bucket}/${path}`;
    return download ? `${url}?download=` : url;
}

async function uploadStrip(blob) {
    const day = new Date().toISOString().slice(0, 10);
    const path = `${day}/${randomId()}.png`;
    const key = QR.config.supabaseAnonKey;
    const headers = {
        apikey: key,
        'Content-Type': 'image/png',
        'x-upsert': 'false',
        'cache-control': '31536000',
    };
    // New Supabase keys (sb_publishable_...) go only in "apikey".
    // Old "anon" keys (long JWTs that start with "eyJ") also need Authorization.
    if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
    const response = await fetch(`${storageBase()}/object/${QR.config.bucket}/${path}`, {
        method: 'POST',
        headers,
        body: blob,
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Upload failed (${response.status}). ${text.slice(0, 160)}`);
    }
    return path;
}

// The link inside the QR code. On a real website it opens get.html (a page
// with a Save button). On localhost, phones can't open "localhost", so it
// points straight at the image instead.
function shareLink(path) {
    const host = location.hostname;
    const local = host === 'localhost' || host === '127.0.0.1' || host === '' || host.endsWith('.local');
    if (local) return publicFileUrl(path);
    const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    return `${base}get.html?f=${encodeURIComponent(path)}`;
}

function drawQr(canvas, text) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const cells = qr.getModuleCount();
    const quiet = 4;
    const total = cells + quiet * 2;
    const scale = Math.floor(canvas.width / total);
    const size = scale * total;
    const offset = Math.floor((canvas.width - size) / 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1b0f3b';
    for (let r = 0; r < cells; r += 1) {
        for (let c = 0; c < cells; c += 1) {
            if (qr.isDark(r, c)) ctx.fillRect(offset + (c + quiet) * scale, offset + (r + quiet) * scale, scale, scale);
        }
    }
}

function qrShow(part) {
    ['qr-ask', 'qr-busy', 'qr-done'].forEach(id => { document.getElementById(id).hidden = id !== part; });
}

function openQr() {
    const overlay = document.getElementById('qr-overlay');
    document.getElementById('qr-error').hidden = true;
    qrShow('qr-ask');
    overlay.hidden = false;
    document.getElementById('qr-go').focus();
}

function closeQr() {
    document.getElementById('qr-overlay').hidden = true;
    document.getElementById('btn-qr').focus();
}

async function makeQr() {
    const error = document.getElementById('qr-error');
    error.hidden = true;
    qrShow('qr-busy');
    try {
        const blob = await QR.getBlob();
        const path = await uploadStrip(blob);
        QR.lastLink = shareLink(path);
        drawQr(document.getElementById('qr-canvas'), QR.lastLink);
        document.getElementById('qr-link').textContent = QR.lastLink;
        qrShow('qr-done');
        document.getElementById('qr-done-title').focus();
        if (QR.onShown) QR.onShown();
    } catch (err) {
        console.error(err);
        qrShow('qr-ask');
        error.textContent = navigator.onLine === false
            ? 'You are offline. Connect to the internet, then try again.'
            : 'The strip could not be uploaded. Check your connection and try again.';
        error.hidden = false;
    }
}

async function copyQrLink() {
    const button = document.getElementById('qr-copy');
    try {
        await navigator.clipboard.writeText(QR.lastLink);
        button.textContent = 'Link copied';
    } catch (err) {
        button.textContent = 'Copy failed. Hold the link below to copy it.';
    }
    setTimeout(() => { button.textContent = 'Copy link'; }, 2500);
}

function setupQr(getBlob, onShown) {
    QR.getBlob = getBlob;
    QR.onShown = onShown;
    document.getElementById('btn-qr').hidden = !qrEnabled();
    document.getElementById('btn-qr').addEventListener('click', openQr);
    document.getElementById('qr-go').addEventListener('click', makeQr);
    document.getElementById('qr-cancel').addEventListener('click', closeQr);
    document.getElementById('qr-close').addEventListener('click', closeQr);
    document.getElementById('qr-copy').addEventListener('click', copyQrLink);
    document.getElementById('qr-overlay').addEventListener('click', event => {
        if (event.target.id === 'qr-overlay') closeQr();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !document.getElementById('qr-overlay').hidden) closeQr();
    });
}
