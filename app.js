const WORKER_URL = "https://YOUR_WORKER_URL/house-mask";

// DOM Elements
const imageInput = document.getElementById('imageInput');
const btnMask = document.getElementById('btnMask');
const btnApply = document.getElementById('btnApply');
const colorPicker = document.getElementById('colorPicker');
const mainCanvas = document.getElementById('mainCanvas');
const ctx = mainCanvas.getContext('2d', { willReadFrequently: true });
const statusMessage = document.getElementById('statusMessage');
const loadingOverlay = document.getElementById('loadingOverlay');
const placeholderText = document.getElementById('placeholderText');
const modeToggle = document.getElementById('modeExternalToggle');

// State
let originalImage = null; // The loaded Image object
let maskCanvas = null;    // Offscreen canvas holding the mask
let maskCtx = null;
let currentFile = null;

// Constants
const MAX_WIDTH = 2048; // Downscale large images for performance

// --- Event Listeners ---

imageInput.addEventListener('change', handleImageUpload);
btnMask.addEventListener('click', handleMasking);
btnApply.addEventListener('click', applyColor);

// Mode Toggle Listener (Exterior / Interior)
modeToggle.addEventListener('change', () => {
    // Reset mask if mode changes? Maybe not, but good to note.
    console.log("Mode changed to:", modeToggle.checked ? "Interior" : "Exterior");
});

// --- Functions ---

function setStatus(msg, type = 'normal') {
    statusMessage.textContent = msg;
    statusMessage.className = 'status-message';
    if (type === 'error') statusMessage.classList.add('status-error');
    if (type === 'success') statusMessage.classList.add('status-success');
}

function setLoading(isLoading) {
    if (isLoading) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    currentFile = file;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            // Reset state
            maskCanvas = null;
            btnMask.disabled = false;
            btnApply.disabled = true;
            placeholderText.style.display = 'none';

            // Resize canvas to fit image (constrained by max width)
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH) {
                const scale = MAX_WIDTH / width;
                width = MAX_WIDTH;
                height = height * scale;
            }

            mainCanvas.width = width;
            mainCanvas.height = height;

            // Draw original image
            ctx.drawImage(originalImage, 0, 0, width, height);
            setStatus("Image loaded. Click 'Mask House' to detect areas.");
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

async function handleMasking() {
    if (!currentFile) return;

    setLoading(true);
    setStatus("Uploading and masking...");

    try {
        const formData = new FormData();
        formData.append('image', currentFile);
        formData.append('scene', modeToggle.checked ? 'interior' : 'exterior');
        formData.append('mode', 'auto');

        const response = await fetch(WORKER_URL, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.maskPngBase64) {
            throw new Error("Invalid response: No mask data received");
        }

        await loadMask(data.maskPngBase64);
        
        setStatus("Mask generated successfully!", "success");
        btnApply.disabled = false;
        
        // Auto-apply current color
        applyColor();

    } catch (err) {
        console.error(err);
        setStatus("Error generating mask: " + err.message, "error");
    } finally {
        setLoading(false);
    }
}

function loadMask(base64) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            // Create offscreen canvas for the mask
            maskCanvas = document.createElement('canvas');
            maskCanvas.width = mainCanvas.width;
            maskCanvas.height = mainCanvas.height;
            maskCtx = maskCanvas.getContext('2d');

            // Draw mask image scaled to canvas size
            // Apply slight blur for feathering
            maskCtx.filter = 'blur(2px)';
            maskCtx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
            maskCtx.filter = 'none'; // Reset

            resolve();
        };
        img.onerror = reject;
        img.src = "data:image/png;base64," + base64;
    });
}

function applyColor() {
    if (!originalImage || !maskCanvas) return;

    setStatus("Applying color...");
    
    // Get target color
    const hex = colorPicker.value;
    const [rT, gT, bT] = hexToRgb(hex);
    const [hT, sT, lT] = rgbToHsl(rT, gT, bT);

    const width = mainCanvas.width;
    const height = mainCanvas.height;

    // Redraw original first to clear previous paints
    ctx.drawImage(originalImage, 0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const maskData = maskCtx.getImageData(0, 0, width, height).data;

    for (let i = 0; i < data.length; i += 4) {
        // Mask Alpha determines how much we paint
        // The mask is likely white on black/transparent. Let's assume alpha channel usage or grayscale value.
        // If the mask PNG is standard (transparent background, white house), we use alpha.
        const maskAlpha = maskData[i + 3]; 

        if (maskAlpha > 0) {
            // Original Color
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];

            // Convert Original to HSL to get Luminance
            const [h, s, l] = rgbToHsl(r, g, b);

            // New Color: Target Hue/Sat, Original Luminance
            // Blend: We can also blend based on maskAlpha for feathering (0-255)
            const alphaFactor = maskAlpha / 255.0;

            // Colorize logic: Preserve L, usage Target H and S.
            // Adjust Saturation can be tuned. Often full target saturation looks fake on walls.
            // Let's take target saturation but maybe dampen it slightly or blend it.
            // For now: specific requirements say "Preserve luminance so shadows remain realistic".
            
            const [newR, newG, newB] = hslToRgb(hT, sT, l);

            // Blend new color with old color based on mask feathering
            data[i]     = lerp(r, newR, alphaFactor);
            data[i + 1] = lerp(g, newG, alphaFactor);
            data[i + 2] = lerp(b, newB, alphaFactor);
        }
    }

    ctx.putImageData(imgData, 0, 0);
    setStatus("Color applied.", "success");
}

// --- Helpers ---

function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 */
function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max == min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return [h, s, l];
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 */
function hslToRgb(h, s, l) {
    let r, g, b;

    if (s == 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
