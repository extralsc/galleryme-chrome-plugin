# GalleryMe

A Chrome extension that extracts and displays all images and videos from any webpage in a beautiful gallery view.

## About

This is an open source educational project. I created it to learn how Chrome extensions work and to explore the Manifest V3 API. Feel free to use, modify, and learn from the code.

## Features

- Scan any webpage for images and videos
- View media in a fullscreen gallery with slideshow
- Auto-detect new media as pages load dynamically
- Zoom and pan on images
- Filter by images or videos
- Sort by oldest or newest
- Select multiple items for custom slideshow
- Download media directly
- Keyboard navigation support

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the project folder

## Usage

1. Navigate to any webpage with images or videos
2. Click the GalleryMe extension icon
3. Click "Scan Page for Media"
4. Click any thumbnail to open the fullscreen gallery
5. Use arrow keys or buttons to navigate
6. Press Space to start/stop slideshow

## Keyboard Shortcuts (Gallery View)

| Key | Action |
|-----|--------|
| ← / → | Previous / Next |
| Space | Play / Pause slideshow |
| Home / End | First / Last item |
| R | Reset zoom |
| Escape | Close |

## Project Structure

```
├── manifest.json
├── popup.html
├── gallery.html
├── css/
│   ├── popup.css
│   └── gallery.css
├── js/
│   ├── background.js
│   ├── content.js
│   ├── popup.js
│   └── gallery.js
└── icons/
    ├── icon_16.png
    ├── icon_48.png
    └── icon_128.png
```

## Disclaimer

This software is provided "as is" without warranty of any kind. I do not take any responsibility for its use, misuse, or any damages that may arise from using this extension. Use at your own risk.

## License

Open source - free to use and modify for any purpose.

## Links

- [GitHub Repository](https://github.com/extralsc/galleryme-chrome-plugin)
- [Privacy Policy](PRIVACY_POLICY.md)
- [Buy Me a Coffee](https://buymeacoffee.com/christophers12)
