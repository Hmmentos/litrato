# Litrato

**A free photobooth that runs in your browser.** Take 4 photos, get a photo strip, and save it, with no fees and no watermark.

Most online photobooths ask you to pay before you can save your photo. Litrato doesn't. Everything happens on your own device: your photos are never uploaded or stored anywhere.

> *Litrato* is Filipino for "photo".

## Features

- **3-2-1 countdown** with a flash and a shutter sound
- **4 photos in a row**, then a finished **photo strip** or **2×2 grid**
- **6 filters:** Natural, B&W, Vintage, Warm, Cool, Pop (the live preview matches the saved photo)
- **5 frame colors**, an optional **caption**, and the **date**
- **Retake just one photo** by tapping it
- **Save as PNG** (988 × 3052 for the strip), or **Share** straight to apps on phones
- **No camera?** Use 4 photos from your device instead
- Timer (3, 5 or 10 seconds), mirror and sound toggles, plus **Esc** or **Stop** to cancel
- Works on phones and computers, with keyboard focus styles and reduced-motion support

## Privacy

Litrato has no server and no database. The camera feed and your photos stay in your browser's memory and disappear when you close the tab. The saved image goes straight to your device.

## Run it locally

You only need a simple local server, because browsers allow the camera only on `https` or `localhost`.

```bash
python -m http.server 5500
```

Then open **http://localhost:5500**.

## Deploy

It's a static site with no build step, so it works on any static host:

- **Vercel:** import the repo and deploy (no settings needed)
- **GitHub Pages:** Settings → Pages → deploy from the `main` branch

## How it works

| File | What it does |
|---|---|
| `index.html` | Page structure |
| `css/style.css` | The look: booth colors, countdown, layout |
| `js/app.js` | Camera, countdown, shooting, retakes, saving |
| `js/compose.js` | Builds the final strip or grid on a canvas |
| `js/filters.js` | Filters, using the canvas filter or a pixel fallback for older Safari |

Made with plain HTML, CSS and JavaScript using the browser's `getUserMedia` camera API, Canvas, and Web Audio. No frameworks and no libraries.

## Credits

- Fonts: [Bungee](https://github.com/djrrb/Bungee) and [Bricolage Grotesque](https://github.com/ateliertriay/bricolage), both under the SIL Open Font License (see `fonts/`).

## License

MIT © Genesis Ver R. Florento
