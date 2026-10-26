// js/config.js
// QR code sharing uploads a finished strip to YOUR Supabase storage, so
// friends can scan the QR code and save it. Leave these empty to turn the
// "Get QR code" button off (then nothing is ever uploaded).
//
// Setup (about 5 minutes) is in README.md. The publishable key is meant to be public
// (never paste the secret key here);
// the storage policy only lets visitors upload PNG files, not list or delete.

window.BOOTH_CONFIG = {
    supabaseUrl: 'https://vxspsywxgpdhvmattbhx.supabase.co',        // e.g. 'https://abcdefgh.supabase.co'
    supabaseAnonKey: 'sb_publishable_gnFix9vL3ZU8EqyW1EwWnw_xMj1n6Op',    // Settings → API Keys → Publishable key (starts with sb_publishable_)
    bucket: 'strips',
};
