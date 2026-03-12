# Coord Picker — Automation Offset Tool

A Chrome extension for picking click coordinates from error screenshots to use in web automation code (`b.web.clickInCoordinates`).

Built for workflows where a bot runs on a remote Linux instance at 1920x1080 and sends screenshots when automation fails. You load the screenshot, click where the bot should click, and get the code snippet ready to paste.

## Install

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `coord-picker-extension` folder
5. Click the extension icon in the toolbar — it opens as a full browser tab

## Usage

### Loading a screenshot

- **Drag & drop** an image onto the canvas
- Click **Load** to pick a file
- Click **Paste** or press `Ctrl+V` to paste from clipboard

### Picking coordinates

Click anywhere on the screenshot. The sidebar shows:

- **Bot coordinates** — scaled to 1920x1080 with chrome bar subtracted
- **Code snippet** — ready to copy and paste into your automation

### Chrome bar offset

Screenshots from the bot include the browser toolbar (tab bar, address bar, etc.) at the top, but `clickInCoordinates` operates relative to the web content viewport. The **Chrome bar (px)** input in the sidebar subtracts this offset from the Y coordinate automatically.

- Default is `148` px (typical Chrome toolbar height)
- A red horizontal line shows where the chrome bar boundary sits on the image
- Adjust the value until the line aligns with where the web content starts
- The value is saved and persists across sessions

### Image scaling

If the screenshot resolution differs from 1920x1080 (e.g., a 2x retina capture at 3840x2160), coordinates are automatically scaled down to bot space. The status badge shows the scale factor (e.g., "2x → 1920×1080").

### Chain mode

Toggle **Chain** to rapidly pick multiple points in sequence:

- Each click saves the previous point's code and moves to the next
- All chained clicks stay visible on the image with numbered markers (1, 2, 3...)
- The code output panel accumulates all lines
- **Copy Code** copies all chained lines at once
- Toggling chain mode off clears the chain

### Navigation

- **Scroll wheel** — zoom in/out at cursor
- **Click & drag** — pan the image
- **+** / **-** keys — zoom in/out
- **0** key — fit to view
- **Esc** — clear the current pick

### Copy options

- **Copy x, y** — copies just the coordinate pair
- **Copy Code** — copies the full `b.web.clickInCoordinates(...)` snippet
- Click any **history item** to copy its code snippet

## Files

```
coord-picker-extension/
├── manifest.json    # Chrome extension manifest (MV3)
├── background.js    # Opens the tool as a full tab
├── popup.html       # UI layout and styles
├── popup.js         # All logic (coordinate math, zoom, chain mode, etc.)
├── icons/           # Extension icons (16, 48, 128)
└── README.md
```

## Notes

- The extension opens as a full browser tab (not a popup) to avoid HiDPI coordinate distortion
- Chrome bar height is in bot-screen pixels (1920x1080 space), not image pixels
- All coordinate display, code output, hover labels, and history show bot-space values
