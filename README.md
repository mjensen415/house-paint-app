# House Paint App

A simple static web application to preview paint colors on house exteriors or interiors.

## Features
- Upload a photo of a house.
- Toggle between Exterior and Interior modes.
- Automatically mask the house/walls using a backend API.
- Pick any color and see it applied realistically (adjusting for shadows/luminance).
- Runs entirely in the browser (except for the masking step).

## Setup & Running Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/mjensen415/house-paint-app.git
   cd house-paint-app
   ```

2. **Configure the Worker URL**:
   - Open `app.js`.
   - Locate the constant at the very top:
     ```javascript
     const WORKER_URL = "https://YOUR_WORKER_URL/house-mask";
     ```
   - Replace `https://YOUR_WORKER_URL/house-mask` with your actual backend Cloudflare Worker URL.

3. **Run the App**:
   - Since this is a static site with no build step, you can simply open `index.html` in your browser.
   - For a better experience (to avoid local file CORS issues if testing extensively), use a simple local server:
     ```bash
     npx serve
     # or
     python3 -m http.server
     ```

## Deployment
This project is designed for **Cloudflare Pages**.
1. Connect your GitHub repo to Cloudflare Pages.
2. Select the repository `house-paint-app`.
3. **Build settings**: None (HTML/Static).
4. **Root directory**: `/` (default).
5. Deploy!
