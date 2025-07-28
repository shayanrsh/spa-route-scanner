# 🚀 SPA Route Scanner

✨ **SPA Route Scanner** is a Chrome extension that finds and lists all routes in Single Page Applications (SPAs). It auto-scans JavaScript files, analyzes resources, and gives you a searchable/exportable list of discovered front-end routes.

## 🛠️ Features

- 🕵️ Detects if a site is a SPA and scans for client-side routes.
- 🔄 Real-time scan progress and route updates.
- 📤 Export routes as **JSON, CSV, or plain text**.
- 🖼️ Modern popup UI with search/filtering.
- 💻 Works on any open tab directly from the Chrome toolbar.

## 📦 Installation

1. **Clone or Download this Repository**

git clone https://github.com/YOUR_USERNAME/spa-route-scanner.git


2. **Open Google Chrome**

3. **Navigate to:** `chrome://extensions/`

4. **Enable "Developer Mode"** (toggle at the top right)

5. **Click "Load unpacked"** and select the folder with the extension’s files.

6. You’ll see the SPA Route Scanner icon in your toolbar—you're ready!

## 🚦 Usage

1. Open any website (ideally a SPA).
2. Click the SPA Route Scanner icon in your Chrome toolbar.
3. Click ✨ **Scan** to start scanning.
4. View discovered routes in the popup.
5. Use 🔍 search, filter by origin, and export your results.

## 📁 File Structure

- `manifest.json` – Chrome extension manifest
- `background.js` – Handles scanning & messaging
- `content.js` – Message bridge
- `popup.html`, `popup.js`, `popup.css` – Extension popup UI files
- `icon16.png`, `icon48.png`, `icon128.png` – Icons

## 🤝 Contributing

Pull requests and issues are welcome! Open one for bugs, features, or ideas.

## 📜 License

[MIT](LICENSE) — free to use, share, and modify.

## ⚠️ Disclaimer

This extension analyzes JavaScript and resources loaded by web pages. Please respect site terms and privacy policies.

---
