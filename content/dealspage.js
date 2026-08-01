console.log("[Rolijoy] Deals page script loaded");

(() => {
    let enabled = false;
    let serialsEnabled = false;
    let serialItemsOnly = false;
    let scanRunning = false;
    let serialisedItems = null; // Set of item IDs that have serials
    const checkedAssets = new Set();
    const NON_FACE_BUNDLES = new Set(["939596"]);
    const SERIAL_CONCURRENCY = 3;

    // ── Styles ───────────────────────────────────────────────────────────────

    const style = document.createElement("style");
    style.textContent = `
    /* ── Toasts ── */

    #joyful-toast-container {
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
    }

    .joyful-toast {
        pointer-events: auto;
        background: #181a1f;
        border: 1px solid #333;
        border-radius: 10px;
        padding: 10px 16px;
        color: white;
        font-family: sans-serif;
        font-size: 13px;
        box-shadow: 0 4px 15px rgba(0,0,0,.45);
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 220px;
        max-width: 360px;
        animation: toastIn 0.2s ease;
    }

    .joyful-toast.success { border-color: #4caf7d; }
    .joyful-toast.warning { border-color: #e8a838; }
    .joyful-toast.error   { border-color: #ff6b6b; }

    .joyful-toast-icon { font-size: 16px; flex-shrink: 0; }
    .joyful-toast-msg  { flex: 1; line-height: 1.4; }

    .joyful-toast-close {
        cursor: pointer;
        color: #aaa;
        font-size: 15px;
        flex-shrink: 0;
        background: none;
        border: none;
        padding: 0;
        line-height: 1;
    }

    .joyful-toast-close:hover { color: white; }

    @keyframes toastIn {
        from { opacity: 0; transform: translateY(-8px); }
        to   { opacity: 1; transform: translateY(0);    }
    }

    /* ── Toolbar ── */

    #joyful-toolbar {
        position: fixed;
        top: 80px;
        left: 16px;
        z-index: 99999;
        background: #181a1f;
        border: 1px solid #333;
        border-radius: 14px;
        padding: 12px;
        width: 210px;
        box-shadow: 0 4px 18px rgba(0,0,0,.45);
        color: white;
        font-family: sans-serif;
        user-select: none;
        overflow: hidden;
        transition: height .25s ease, width .25s ease;
    }

    #joyful-toolbar > *:not(h3) {
        opacity: 1;
        max-height: 200px;
        transition: opacity .2s ease, max-height .25s ease;
    }

    #joyful-toolbar.collapsed > *:not(h3) {
        opacity: 0;
        max-height: 0;
        pointer-events: none;
    }

    #joyful-toolbar.collapsed { height: 48px; }

    #joyful-toolbar h3 {
        margin: 0;
        padding-bottom: 10px;
        font-size: 13px;
        font-weight: 700;
        color: white;
        border-bottom: 1px solid #2a2d35;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: color .2s ease;
    }

    #joyful-collapse-icon {
        font-size: 12px;
        color: #aaa;
        transition: transform .2s ease;
        cursor: pointer;
    }

    #joyful-toolbar.collapsed #joyful-collapse-icon { transform: rotate(180deg); }
    #joyful-toolbar h3:active { cursor: grabbing; }

    .joyful-section-title {
        margin-top: 12px;
        margin-bottom: 8px;
        color: #888;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .08em;
    }

    .joyful-setting {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #22252d;
        border: 1px solid #333;
        border-radius: 10px;
        padding: 9px 10px;
        margin-bottom: 8px;
        transition: transform .15s ease, background .15s ease, border-color .15s ease;
    }

    .joyful-setting:hover {
        transform: translateY(-1px);
        background: #2b2e38;
        border-color: #555;
    }

    .joyful-setting-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 13px;
    }

    .joyful-setting-count {
        color: #aaa;
        font-size: 11px;
    }

    /* ── Switch ── */

    .joyful-switch {
        position: relative;
        width: 38px;
        height: 20px;
        flex-shrink: 0;
    }

    .joyful-switch input { display: none; }

    .joyful-slider {
        position: absolute;
        inset: 0;
        background: #444;
        border-radius: 20px;
        cursor: pointer;
        transition: .2s;
    }

    .joyful-slider:before {
        content: "";
        position: absolute;
        width: 16px;
        height: 16px;
        left: 2px;
        top: 2px;
        background: white;
        border-radius: 50%;
        transition: .2s;
    }

    .joyful-switch input:checked + .joyful-slider         { background: #136f99; }
    .joyful-switch input:checked + .joyful-slider:before  { transform: translateX(18px); }

    /* ── Footer ── */

    .joyful-footer {
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px solid #2a2d35;
        color: #666;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    #joyful-settings-btn {
        background: none;
        border: none;
        color: #777;
        font-size: 14px;
        cursor: pointer;
        padding: 2px 4px;
        transition: color .2s ease, transform .2s ease;
    }

    #joyful-settings-btn:hover { color: white; transform: rotate(45deg); }

    /* ── Settings panel ── */

    #joyful-settings-panel {
        position: fixed;
        z-index: 99998;
        background: #181a1f;
        border: 1px solid #333;
        border-radius: 14px;
        padding: 12px;
        width: 210px;
        box-shadow: 0 4px 18px rgba(0,0,0,.45);
        color: white;
        font-family: sans-serif;
        user-select: none;
        display: none;
    }

    #joyful-settings-panel.open { display: block; }

    #joyful-settings-panel h4 {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        color: white;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    #joyful-settings-close {
        background: none;
        border: none;
        color: #aaa;
        font-size: 15px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }

    #joyful-settings-close:hover { color: white; }

    /* ── Color wheel button ── */

    #joyful-serial-color-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid #555;
        background: conic-gradient(
            hsl(0,100%,50%),hsl(30,100%,50%),hsl(60,100%,50%),hsl(90,100%,50%),
            hsl(120,100%,50%),hsl(150,100%,50%),hsl(180,100%,50%),hsl(210,100%,50%),
            hsl(240,100%,50%),hsl(270,100%,50%),hsl(300,100%,50%),hsl(330,100%,50%),
            hsl(360,100%,50%)
        );
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        transition: transform .15s ease, border-color .15s ease;
    }

    /* ── Dynamic face hide (survives MixItUp re-filter) ── */

    .joyful-hidden-face { display: none !important; }

    /* ── Serial items only filter ── */

    .joyful-non-serial { display: none !important; }

    /* ── Serial badge ── */

    :root {
        --rolijoy-serial-color: #7ec8e3;
    }

    .joyful-serial-badge {
        position: absolute;
        top: 4px;
        right: 4px;
        background: rgba(24, 26, 31, 0.88);
        border: 1px solid #555;
        border-radius: 6px;
        padding: 2px 6px;
        color: var(--rolijoy-serial-color);
        font-size: 11px;
        font-weight: 600;
        font-family: sans-serif;
        z-index: 2;
        pointer-events: none;
        white-space: nowrap;
    }

    .joyful-serial-badge.rare {
        color: #ffd700;
        border-color: #ffd700;
    }
    `;
    document.head.appendChild(style);

    // ── Toast ────────────────────────────────────────────────────────────────

    function showToast(msg, type = "success", duration = 5000) {
        const container = document.getElementById("joyful-toast-container");
        if (!container) return;

        const icons = { success: "✅", warning: "⚠️", error: "❌" };

        const toast = document.createElement("div");
        toast.className = `joyful-toast ${type}`;
        toast.innerHTML = `
            <span class="joyful-toast-icon">${icons[type] ?? "ℹ️"}</span>
            <span class="joyful-toast-msg">${msg}</span>
            <button class="joyful-toast-close" title="Dismiss">✕</button>
        `;

        toast.querySelector(".joyful-toast-close").onclick = () => dismissToast(toast);
        container.appendChild(toast);

        if (duration > 0) setTimeout(() => dismissToast(toast), duration);
    }

    function dismissToast(toast) {
        if (!toast.isConnected) return;
        toast.style.transition = "opacity 0.2s ease";
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 200);
    }

    // ── Toolbar ──────────────────────────────────────────────────────────────

    function createToolbar() {

        // Toast container
        const toastContainer = document.createElement("div");
        toastContainer.id = "joyful-toast-container";
        document.body.appendChild(toastContainer);

        const toolbar = document.createElement("div");
        toolbar.id = "joyful-toolbar";

        toolbar.innerHTML = `
            <h3 id="joyful-toolbar-header">
                <span>Rolijoy Tools</span>
                <span id="joyful-collapse-icon">▲</span>
            </h3>

            <div class="joyful-section-title">Filters</div>

            <div class="joyful-setting">
                <div class="joyful-setting-text">
                    <span>Hide dynamic faces</span>
                    <span class="joyful-setting-count" id="joyful-hidden-count">0 available</span>
                </div>
                <label class="joyful-switch">
                    <input type="checkbox" id="joyful-dynamic-toggle">
                    <span class="joyful-slider"></span>
                </label>
            </div>

            <div class="joyful-setting">
                <div class="joyful-setting-text">
                    <span>Show serials</span>
                    <span class="joyful-setting-count" id="joyful-serial-count">off</span>
                </div>
                <label class="joyful-switch">
                    <input type="checkbox" id="joyful-serial-toggle">
                    <span class="joyful-slider"></span>
                </label>
            </div>

            <div class="joyful-setting">
                <div class="joyful-setting-text">
                    <span>Serial items only</span>
                </div>
                <label class="joyful-switch">
                    <input type="checkbox" id="joyful-serial-items-toggle">
                    <span class="joyful-slider"></span>
                </label>
            </div>

            <div class="joyful-footer">
                <span>v1.0.0</span>
                <button id="joyful-settings-btn" title="Settings">⚙</button>
            </div>
        `;

        document.body.appendChild(toolbar);

        // ── Settings panel ──
        const settingsPanel = document.createElement("div");
        settingsPanel.id = "joyful-settings-panel";
        settingsPanel.innerHTML = `
            <h4>
                <span>⚙ Settings</span>
                <button id="joyful-settings-close">✕</button>
            </h4>

            <div class="joyful-section-title">Serial Badge</div>

            <div class="joyful-setting">
                <div class="joyful-setting-text">
                    <span>Text color</span>
                    <span class="joyful-setting-count" id="joyful-serial-color-hex">#7ec8e3</span>
                </div>
                <button id="joyful-serial-color-btn" title="Pick serial color"></button>
            </div>
        `;
        document.body.appendChild(settingsPanel);

        // ── Collapse ──
        const collapseIcon = document.getElementById("joyful-collapse-icon");
        collapseIcon.onclick = (e) => {
            e.stopPropagation();
            toolbar.classList.toggle("collapsed");
            collapseIcon.textContent = toolbar.classList.contains("collapsed") ? "▼" : "▲";
        };

        // ── Drag ──
        const toolbarHeader = document.getElementById("joyful-toolbar-header");
        let dragging = false, offsetX = 0, offsetY = 0;

        toolbarHeader.onmousedown = (e) => {
            if (e.target.id === "joyful-collapse-icon") return;
            dragging = true;
            const rect = toolbar.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            toolbarHeader.style.cursor = "grabbing";
        };

        document.addEventListener("mousemove", (e) => {
            if (!dragging) return;
            toolbar.style.left  = (e.clientX - offsetX) + "px";
            toolbar.style.top   = (e.clientY - offsetY) + "px";
            toolbar.style.right = "auto";
        });

        document.addEventListener("mouseup", () => {
            dragging = false;
            toolbarHeader.style.cursor = "grab";
        });

        // ── Hide dynamic faces toggle ──
        const dynamicToggle = document.getElementById("joyful-dynamic-toggle");
        dynamicToggle.checked = enabled;
        dynamicToggle.onchange = () => {
            enabled = dynamicToggle.checked;
            if (!enabled) {
                // When disabling, remove the class from ALL cards immediately
                console.log('[Rolijoy] Hiding disabled — clearing all hidden-face classes');
                document.querySelectorAll('.joyful-hidden-face').forEach(el => {
                    el.classList.remove('joyful-hidden-face');
                });
            }
            scanDeals();
        };

        // ── Show serials toggle ──
        const serialToggle = document.getElementById("joyful-serial-toggle");
        serialToggle.checked = serialsEnabled;
        serialToggle.onchange = () => {
            serialsEnabled = serialToggle.checked;
            const counter = document.getElementById("joyful-serial-count");
            if (serialsEnabled) {
                console.log("[Rolijoy] Serials enabled — scanning deals");
                counter.textContent = "scanning...";
                scanDeals();
            } else {
                console.log("[Rolijoy] Serials disabled — removing badges");
                counter.textContent = "off";
                document.querySelectorAll('.joyful-serial-badge').forEach(b => b.remove());
                document.querySelectorAll('[data-rolijoy-serial-done]').forEach(el => {
                    delete el.dataset.rolijoySerialDone;
                });
            }
        };

        // ── Serial items only toggle ──
        const serialItemsToggle = document.getElementById("joyful-serial-items-toggle");
        serialItemsToggle.checked = serialItemsOnly;
        serialItemsToggle.onchange = () => {
            serialItemsOnly = serialItemsToggle.checked;
            if (serialItemsOnly) {
                console.log("[Rolijoy] Serial items only enabled");
            } else {
                console.log("[Rolijoy] Serial items only disabled — clearing filter");
                document.querySelectorAll('.joyful-non-serial').forEach(el => {
                    el.classList.remove('joyful-non-serial');
                });
            }
            scanDeals();
        };

        // ── Serial color wheel ──
        const serialColorBtn = document.getElementById("joyful-serial-color-btn");
        const serialColorHex = document.getElementById("joyful-serial-color-hex");

        function applySerialColor(hex) {
            document.documentElement.style.setProperty('--rolijoy-serial-color', hex);
            serialColorHex.textContent = hex;
            serialColorBtn.style.borderColor = hex;
        }

        function createSerialColorWheel() {
            const popup = document.createElement("div");
            popup.id = "joyful-serial-colorwheel-popup";
            Object.assign(popup.style, {
                position: "fixed", zIndex: "999999", background: "#181a1f",
                border: "1px solid #444", borderRadius: "14px", padding: "14px",
                boxShadow: "0 6px 24px rgba(0,0,0,.6)", display: "none",
                flexDirection: "column", alignItems: "center", gap: "10px", userSelect: "none"
            });

            const canvas = document.createElement("canvas");
            canvas.width = 160; canvas.height = 160;
            canvas.style.borderRadius = "50%";
            canvas.style.cursor = "crosshair";
            canvas.style.display = "block";

            const lightnessRow = document.createElement("div");
            Object.assign(lightnessRow.style, { display:"flex", alignItems:"center", gap:"8px", width:"100%" });
            const lightnessLabel = document.createElement("span");
            lightnessLabel.textContent = "L";
            lightnessLabel.style.cssText = "color:#aaa;font-size:11px;flex-shrink:0;";
            const lightnessSlider = document.createElement("input");
            lightnessSlider.type = "range"; lightnessSlider.min = "10"; lightnessSlider.max = "90";
            lightnessSlider.value = "50"; lightnessSlider.style.cssText = "flex:1;accent-color:#aaa;";
            lightnessRow.appendChild(lightnessLabel);
            lightnessRow.appendChild(lightnessSlider);

            const previewRow = document.createElement("div");
            Object.assign(previewRow.style, { display:"flex", alignItems:"center", gap:"8px", width:"100%" });
            const previewSwatch = document.createElement("div");
            Object.assign(previewSwatch.style, { width:"24px", height:"24px", borderRadius:"6px", border:"1px solid #555", flexShrink:"0" });
            const previewHexEl = document.createElement("span");
            previewHexEl.style.cssText = "color:white;font-size:12px;font-family:monospace;";
            previewRow.appendChild(previewSwatch);
            previewRow.appendChild(previewHexEl);

            popup.appendChild(canvas);
            popup.appendChild(lightnessRow);
            popup.appendChild(previewRow);
            document.body.appendChild(popup);

            const ctx = canvas.getContext("2d");
            const cx = canvas.width / 2, cy = canvas.height / 2, radius = cx;
            let currentH = 197, currentS = 50, currentL = 70;

            function hslToRgb(h, s, l) {
                s /= 100; l /= 100;
                const k = n => (n + h/30) % 12;
                const a = s * Math.min(l, 1-l);
                const f = n => l - a * Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n), 1)));
                return [Math.round(f(0)*255), Math.round(f(8)*255), Math.round(f(4)*255)];
            }

            function rgbToHex(r,g,b) {
                return "#" + [r,g,b].map(v => v.toString(16).padStart(2,"0")).join("");
            }

            function drawWheel() {
                const imageData = ctx.createImageData(canvas.width, canvas.height);
                const data = imageData.data;
                for(let y = 0; y < canvas.height; y++){
                    for(let x = 0; x < canvas.width; x++){
                        const dx = x - cx, dy = y - cy;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if(dist > radius){ const i=(y*canvas.width+x)*4; data[i+3]=0; continue; }
                        const hue = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
                        const sat = (dist / radius) * 100;
                        const [r,g,b] = hslToRgb(hue, sat, currentL);
                        const i = (y * canvas.width + x) * 4;
                        data[i]=r; data[i+1]=g; data[i+2]=b; data[i+3]=255;
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                drawCursor();
            }

            function drawCursor() {
                const angle = (currentH * Math.PI) / 180;
                const dist  = (currentS / 100) * radius;
                const px = cx + Math.cos(angle) * dist;
                const py = cy + Math.sin(angle) * dist;
                ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI*2);
                ctx.strokeStyle = "white"; ctx.lineWidth = 2.5; ctx.stroke();
                ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2);
                ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
            }

            function updatePreview() {
                const [r,g,b] = hslToRgb(currentH, currentS, currentL);
                const hex = rgbToHex(r,g,b);
                previewSwatch.style.background = hex;
                previewHexEl.textContent = hex;
                return hex;
            }

            function pickFromCanvas(e) {
                const rect = canvas.getBoundingClientRect();
                const dx = e.clientX - rect.left - cx;
                const dy = e.clientY - rect.top  - cy;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if(dist > radius) return;
                currentH = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
                currentS = Math.min((dist / radius) * 100, 100);
                drawWheel();
                applySerialColor(updatePreview());
            }

            let draggingWheel = false;
            canvas.addEventListener("mousedown", (e) => { draggingWheel = true; pickFromCanvas(e); });
            document.addEventListener("mousemove", (e) => { if(draggingWheel) pickFromCanvas(e); });
            document.addEventListener("mouseup",   ()  => { draggingWheel = false; });

            lightnessSlider.oninput = () => {
                currentL = Number(lightnessSlider.value);
                drawWheel();
                applySerialColor(updatePreview());
            };

            popup._syncToHex = function(hex) {
                const r = parseInt(hex.slice(1,3),16)/255;
                const g = parseInt(hex.slice(3,5),16)/255;
                const b = parseInt(hex.slice(5,7),16)/255;
                const max=Math.max(r,g,b), min=Math.min(r,g,b);
                let h=0,s=0,l=(max+min)/2;
                if(max!==min){
                    const d=max-min;
                    s=l>0.5?d/(2-max-min):d/(max+min);
                    switch(max){
                        case r: h=((g-b)/d+(g<b?6:0))/6; break;
                        case g: h=((b-r)/d+2)/6; break;
                        case b: h=((r-g)/d+4)/6; break;
                    }
                }
                currentH = h*360; currentS = s*100; currentL = l*100;
                lightnessSlider.value = Math.round(currentL);
                drawWheel(); updatePreview();
            };

            drawWheel(); updatePreview();
            return popup;
        }

        const serialColorWheel = createSerialColorWheel();
        serialColorWheel._syncToHex("#7ec8e3");
        applySerialColor("#7ec8e3");

        serialColorBtn.onclick = (e) => {
            e.stopPropagation();
            const isOpen = serialColorWheel.style.display === "flex";
            if(isOpen){ serialColorWheel.style.display = "none"; return; }
            const rect = serialColorBtn.getBoundingClientRect();
            serialColorWheel.style.display = "flex";
            const pw = serialColorWheel.offsetWidth  || 200;
            const ph = serialColorWheel.offsetHeight || 240;
            let left = rect.left - pw/2 + rect.width/2;
            let top  = rect.top  - ph - 10;
            left = Math.max(8, Math.min(left, window.innerWidth  - pw - 8));
            top  = Math.max(8, Math.min(top,  window.innerHeight - ph - 8));
            serialColorWheel.style.left = left + "px";
            serialColorWheel.style.top  = top  + "px";
        };

        serialColorBtn.onmouseenter = () => { serialColorBtn.style.transform = "scale(1.15) rotate(30deg)"; };
        serialColorBtn.onmouseleave = () => { serialColorBtn.style.transform = ""; };

        document.addEventListener("click", (e) => {
            if(
                serialColorWheel.style.display === "flex" &&
                !serialColorWheel.contains(e.target) &&
                e.target !== serialColorBtn
            ){
                serialColorWheel.style.display = "none";
            }
        });

        // ── Settings panel open/close ──
        const settingsBtn   = document.getElementById("joyful-settings-btn");
        const settingsClose = document.getElementById("joyful-settings-close");

        function positionSettingsPanel() {
            const tbRect = toolbar.getBoundingClientRect();
            settingsPanel.style.top  = tbRect.top + "px";
            settingsPanel.style.left = (tbRect.right + 10) + "px";
        }

        settingsBtn.onclick = () => {
            const open = settingsPanel.classList.toggle("open");
            settingsBtn.style.transform = open ? "rotate(45deg)" : "";
            settingsBtn.style.color     = open ? "white" : "";
            if (open) positionSettingsPanel();
        };

        settingsClose.onclick = () => {
            settingsPanel.classList.remove("open");
            settingsBtn.style.transform = "";
            settingsBtn.style.color     = "";
        };
    }

    // ── Hidden count ─────────────────────────────────────────────────────────

    function updateHiddenCount() {
        const counter = document.getElementById("joyful-hidden-count");
        if (!counter) return;
        const count = document.querySelectorAll(
            '.mix_item[data-rolijoy-dynamic-face="true"]'
        ).length;
        counter.textContent = `${count} available`;
    }

    // ── Serial number helpers ────────────────────────────────────────────────

    const RARE_SERIALS = {
        _specific: new Set([1337, 123, 1234, 12345, 123456, 69, 67, 420]),
        isRare(serial) {
            if (serial == null) return false;
            const n = Number(serial);
            if (!Number.isInteger(n) || n <= 0) return false;
            if (n < 10) return true;
            if (this._specific.has(n)) return true;
            const s = String(n);
            if (s.length >= 2 && s.length <= 6 && [...s].every(c => c === s[0])) return true;
            return false;
        }
    };

    async function fetchDealSerial(type, id) {
        const resp = await new Promise(resolve => {
            chrome.runtime.sendMessage(
                { type: "dealSerial", itemType: type, id },
                resolve
            );
        });
        if (!resp || !resp.success || !resp.data) return null;
        return resp.data.serialNumber ?? null;
    }

    function addSerialBadge(dealEl, serial) {
        if (dealEl.querySelector('.joyful-serial-badge')) return;
        const imgContainer = dealEl.querySelector('.float-left');
        if (!imgContainer) return;
        imgContainer.style.position = 'relative';
        const badge = document.createElement('div');
        badge.className = 'joyful-serial-badge' +
            (RARE_SERIALS.isRare(serial) ? ' rare' : '');
        badge.textContent = `#${serial}`;
        imgContainer.appendChild(badge);
    }

    // ── Scan ─────────────────────────────────────────────────────────────────

    async function scanDeals() {
        if (scanRunning) return;
        scanRunning = true;

        const deals = document.querySelectorAll(".mix_item[data-ref='item']");

        const serialQueue = [];

        for (const deal of deals) {
            const link = deal.querySelector(
                "a[href*='/catalog/'], a[href*='/bundles/']"
            );
            if (!link) continue;

            const match = link.href.match(/(catalog|bundles)\/(\d+)(?:\/|$)/);
            if (!match) continue;

            const type    = match[1];
            const id      = match[2];

            // Dynamic face filtering
            if (!checkedAssets.has(id)) {
                checkedAssets.add(id);
                if (type === "bundles" && !NON_FACE_BUNDLES.has(id)) {
                    checkedAssets.add("dyn_" + id);
                }
            }
            if (type === "bundles" && checkedAssets.has("dyn_" + id)) {
                deal.dataset.rolijoyDynamicFace = "true";
                deal.classList.toggle('joyful-hidden-face', enabled);
            } else if (type === "bundles") {
                // Ensure non-dynamic bundles don't have the class
                deal.classList.remove('joyful-hidden-face');
            }

            // Serial items only filter
            if (serialItemsOnly && serialisedItems) {
                const isSerialised = (type === "catalog" && serialisedItems.has(id)) || type === "bundles";
                deal.classList.toggle('joyful-non-serial', !isSerialised);
            } else {
                deal.classList.remove('joyful-non-serial');
            }

            if (serialsEnabled && !deal.dataset.rolijoySerialDone) {
                // Only queue items that are in the serialised list
                if (type === "catalog" && serialisedItems && !serialisedItems.has(id)) {
                    deal.dataset.rolijoySerialDone = "skip";
                    continue;
                }
                serialQueue.push({ deal, type, id });
            }
        }

        // Parallel serial fetching
        if (serialsEnabled && serialQueue.length > 0) {
            const skipped = document.querySelectorAll('[data-rolijoy-serial-done="skip"]').length;
            console.log(`[Rolijoy] Fetching serials for ${serialQueue.length} deals (${skipped} skipped — not serialised)`);
            let fetched = 0;

            for (let i = 0; i < serialQueue.length; i += SERIAL_CONCURRENCY) {
                const batch = serialQueue.slice(i, i + SERIAL_CONCURRENCY);
                const results = await Promise.allSettled(
                    batch.map(async ({ deal, type, id }) => {
                        deal.dataset.rolijoySerialDone = "1";
                        const serial = await fetchDealSerial(type, id);
                        if (serial != null) {
                            addSerialBadge(deal, serial);
                            fetched++;
                            console.log(`[Rolijoy] Serial for ${type}/${id}: #${serial}`);
                        } else {
                            console.log(`[Rolijoy] No serial found for ${type}/${id}`);
                        }
                    })
                );
            }

            const counter = document.getElementById("joyful-serial-count");
            if (counter) counter.textContent = `${fetched} shown`;
            console.log(`[Rolijoy] Serial scan complete — ${fetched}/${serialQueue.length} resolved`);
        }

        scanRunning = false;
        updateHiddenCount();
    }

    // ── Observer ─────────────────────────────────────────────────────────────

    function observeDeals() {
        let scanTimeout;

        const observer = new MutationObserver(() => {
            clearTimeout(scanTimeout);
            scanTimeout = setTimeout(() => scanDeals(), 1000);
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Listen for MixItUp filter changes (survives filter dropdown changes)
        document.addEventListener('mixEnd', () => {
            console.log('[Rolijoy] Filter changed — rescanning...');
            clearTimeout(scanTimeout);
            scanTimeout = setTimeout(() => scanDeals(), 500);
        });
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    async function init() {
        // Load serialised items list
        try {
            const url = chrome.runtime.getURL('serialiseditems.json');
            const resp = await fetch(url);
            const arr = await resp.json();
            serialisedItems = new Set(arr);
            console.log(`[Rolijoy] Loaded serialised items list: ${serialisedItems.size} items`);
        } catch (e) {
            console.log('[Rolijoy] Failed to load serialiseditems.json:', e);
            serialisedItems = null;
        }

        createToolbar();
        observeDeals();
        setTimeout(() => scanDeals(), 2000);
    }

    init();

})();