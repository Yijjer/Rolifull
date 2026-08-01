const DEBUG_PREFIX = "[rroliful]";

// ── Rare serials (universal) ──────────────────────────────────────────────────

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
    },

    label(serial) {
        const n = Number(serial);
        if (n < 10) return `#${n} (Under #10)`;
        if (n === 1337) return `#1337`;
        if ([123, 1234, 12345, 123456].includes(n)) return `#${n} (Sequential)`;
        if ([69, 67, 420].includes(n)) return `#${n} (Funny)`;
        const s = String(n);
        if ([...s].every(c => c === s[0])) return `#${n} (Repeated)`;
        return `#${n}`;
    }
};

function debug(msg){
    console.log(DEBUG_PREFIX, msg);
}

function processAds() {
    document.querySelectorAll(".mix_item").forEach(ad => {
        const playerLink = ad.querySelector('a[href*="/player/"]');
        if(!playerLink) return;

        const userId = playerLink.href.match(/\/player\/(\d+)/)?.[1];
        if(!userId) return;

        if(ad.dataset.userId === userId) return;

        ad.querySelector(".roli-player-info")?.remove();
        ad.querySelector(".roli-inv-btn")?.remove();
        delete ad.dataset.roliCalcStarted;
        delete ad.dataset.roliCalcWaiting;
        delete ad.dataset.newTrader;

        ad.dataset.userId = userId;
        processAd(ad);
    });
}

function processAd(ad){
    const playerLink = ad.querySelector('a[href*="/player/"]');
    if(!playerLink) return;
    const match = playerLink.href.match(/\/player\/(\d+)/);
    if(match){
        createInfoBox(ad, match[1]);
        createInventoryBtn(ad, match[1]);
        checkTradeButton(ad, match[1]);
    }
}

// ── Trade eligibility checker ─────────────────────────────────────────────────

const TRADE_REASONS = {
    CannotTradeWithSelf:  "You can't trade with yourself.",
    TargetCannotTrade:    "This user has trading disabled.",
    TargetUserIneligible: "This user is not eligible to trade.",
    PremiumRequired:      "One or both users need Roblox Premium.",
    SenderCannotTrade:    "Your account cannot send trades.",
    PrivacySettings:      "This user's privacy settings block trades."
};

const tradeTooltip = (() => {
    const el = document.createElement("div");
    el.id = "roli-trade-tooltip";
    Object.assign(el.style, {
        position:      "fixed",
        background:    "#1c1f26",
        color:         "#fff",
        border:        "1px solid #444",
        borderRadius:  "8px",
        padding:       "6px 10px",
        fontSize:      "12px",
        whiteSpace:    "normal",
        maxWidth:      "240px",
        textAlign:     "center",
        zIndex:        "2147483647",
        opacity:       "0",
        transition:    "opacity .15s ease",
        pointerEvents: "none",
        lineHeight:    "1.5"
    });
    document.body.appendChild(el);
    return el;
})();

function showTradeTooltip(btn, reasonText) {
    tradeTooltip.innerHTML = `
        <div style="font-weight:600;margin-bottom:3px;">Cannot receive trades</div>
        <div style="color:#b8b8b8;font-size:11px;">${reasonText}</div>
    `;
    btn.addEventListener("mouseenter", () => {
        const rect = btn.getBoundingClientRect();
        tradeTooltip.style.left      = `${rect.left + rect.width / 2}px`;
        tradeTooltip.style.top       = `${rect.top - 8}px`;
        tradeTooltip.style.transform = "translate(-50%, -100%)";
        tradeTooltip.style.opacity   = "1";
    });
    btn.addEventListener("mouseleave", () => {
        tradeTooltip.style.opacity = "0";
    });
}

function checkTradeButton(ad, userId) {
    const btn = ad.querySelector('a.send_trade_button');
    if (!btn) return;

    if (btn.dataset.tradeChecked === userId) return;
    btn.dataset.tradeChecked = userId;

    chrome.runtime.sendMessage({ type: "canTradeWith", userId }, (result) => {
        if (chrome.runtime.lastError || !result?.success) return;
        if (result.data.canTrade) return;

        console.log("User cannot be traded with:", {
            userId,
            reason: result.data.mutualTradeEligibility
        });

        btn.style.opacity       = "0.45";
        btn.style.filter        = "grayscale(100%)";
        btn.style.cursor        = "not-allowed";
        btn.style.pointerEvents = "auto";

        btn.addEventListener("click", e => e.preventDefault(), { capture: true });

        const reason =
            TRADE_REASONS[result.data.mutualTradeEligibility] ??
            result.data.mutualTradeEligibility ??
            "Unknown reason";

        showTradeTooltip(btn, reason);
    });
}

function createInfoBox(ad, userId){
    if(!infoboxEnabled) return;

    const info = document.createElement("div");
    info.className = "roli-player-info";

    Object.assign(info.style, {
        position: "absolute",
        right: "calc(100% + 12px)",
        top: "50%",
        transform: "translateY(-50%)",
        width: "160px",
        background: "#181a1f",
        border: "1px solid #333",
        borderRadius: "12px",
        padding: "12px",
        color: "white",
        fontSize: "13px",
        boxShadow: "0 4px 15px rgba(0,0,0,.35)",
        boxSizing: "border-box",
        zIndex: "1000"
    });

    ad.style.position = "relative";
    ad.style.overflow = "visible";
    ad.appendChild(info);

    loadPlayer(info, ad, userId);
}

async function loadPlayer(info, ad, userId){
    info.innerHTML = `<div style="color:#aaa;">Loading...</div>`;

    try{
        const result = await chrome.runtime.sendMessage({
            type: "playerInfo",
            userId
        });

        if(ad.dataset.userId !== userId) return;

        if(!result || !result.success){
            const errorCode = result?.status || null;
            showError(info, ad, userId, errorCode);
            return;
        }

        renderPlayer(info, result.data, ad);

    }catch(e){
        if(ad.dataset.userId === userId) showError(info, ad, userId, null);
    }
}

function showError(info, ad, userId, statusCode){
    let errorMsg = "Unknown error";

    if(statusCode === 429) errorMsg = "Rate limited (429)";
    else if(statusCode === 404) errorMsg = "Player not found (404)";
    else if(statusCode === 500) errorMsg = "Server error (500)";
    else if(statusCode === 503) errorMsg = "Service unavailable (503)";
    else if(statusCode === 401 || statusCode === 403) errorMsg = "Access denied ("+statusCode+")";
    else if(statusCode) errorMsg = "Error "+statusCode;
    else errorMsg = "No response";

    info.dataset.failed = "1";
    info.dataset.userId = userId;

    info.innerHTML = `
    <div style="color:#ff6b6b;font-size:12px;margin-bottom:6px;">Failed to load</div>
    <div style="color:#aaa;font-size:11px;margin-bottom:8px;">${errorMsg}</div>
    <button class="roli-retry-btn" style="
        background:#2a2d35;
        color:white;
        border:1px solid #555;
        border-radius:6px;
        padding:4px 10px;
        font-size:12px;
        cursor:pointer;
        width:100%;
    ">↺ Retry</button>
    `;

    info.querySelector(".roli-retry-btn").onclick = () => {
        info.dataset.failed = "0";
        loadPlayer(info, ad, userId);
    };
}

function renderPlayer(info, data, ad){
    const badges = data.rolibadges || {};

    const isNewTrader =
        !badges.create_100_trade_ads &&
        !badges.create_1000_trade_ads &&
        !badges.create_10000_trade_ads;

    ad.dataset.newTrader = isNewTrader ? "1" : "0";

    ad.querySelector(".roli-new-trader-badge")?.remove();

    if(isNewTrader){
        const nameLink = ad.querySelector('a.ad_creator_name');

        if(nameLink){
            const badge = document.createElement("span");
            badge.className = "roli-new-trader-badge";
            badge.textContent = "NEW TRADER";

            Object.assign(badge.style, {
                display: "inline-block",
                marginLeft: "6px",
                padding: "2px 6px",
                borderRadius: "5px",
                background: "#ffffff",
                color: "#111",
                fontSize: "10px",
                fontWeight: "700",
                letterSpacing: "0.5px",
                verticalAlign: "middle",
                whiteSpace: "nowrap",
                position: "relative",
                top: "-1px"
            });

            nameLink.insertAdjacentElement("afterend", badge);
        }
    }

    let badgeHTML = "";

    function addBadge(file, title){
        badgeHTML += `<img src="${chrome.runtime.getURL("rolibadges/"+file)}"
        title="${title}"
        style="width:34px;height:34px;object-fit:contain;margin:2px;">`;
    }

    if(badges.booster) addBadge("booster.svg", "Booster");
    if(badges.roligang) addBadge("roligang.svg", "Roligang");

    if(badges.create_10000_trade_ads)
        addBadge("trade10000.svg", "10,000 Trade Ads");
    else if(badges.create_1000_trade_ads)
        addBadge("trade1000.svg", "1,000 Trade Ads");
    else if(badges.create_100_trade_ads)
        addBadge("trade100.svg", "100 Trade Ads");
    else if(badges.create_10_trade_ads)
        addBadge("trade10.svg", "10 Trade Ads");

    if(isNewTrader){
        info.style.border = "1px solid white";
        info.style.boxShadow =
        `
        0 0 8px white,
        0 0 20px white,
        0 0 ${newTraderGlowIntensity}px ${newTraderGlowColor}
        `;
    }

    info.dataset.failed = "0";

    info.innerHTML = `
    <div style="font-size:15px;font-weight:bold;margin-bottom:8px;">
    ${isNewTrader ? "⭐ " : ""}${data.name}
    </div>

    <div style="color:#aaa;font-size:11px;">VALUE</div>
    <div style="font-size:18px;font-weight:bold;">${data.value.toLocaleString()}</div>

    <div style="color:#aaa;font-size:11px;">RAP</div>
    <div style="font-size:18px;font-weight:bold;">${data.rap.toLocaleString()}</div>

    ${badgeHTML ? `<div style="margin-top:12px">${badgeHTML}</div>` : ""}
    `;

    if(filterActive){
        filterNewTraders();
    }
}

// ── Styles ───────────────────────────────────────────────────────────────────

const style = document.createElement("style");
style.textContent = `
@keyframes roliShine{
    0%{background-position:200% 0;}
    100%{background-position:-200% 0;}
}

.roli-retry-btn:hover{
    background:#3a3d45 !important;
}

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

.joyful-toast.success { border-color:#4caf7d; }
.joyful-toast.warning { border-color:#e8a838; }
.joyful-toast.error   { border-color:#ff6b6b; }

.joyful-toast-icon {
    font-size:16px;
    flex-shrink:0;
}

.joyful-toast-msg {
    flex:1;
    line-height:1.4;
}

.joyful-toast-close {
    cursor:pointer;
    color:#aaa;
    font-size:15px;
    flex-shrink:0;
    background:none;
    border:none;
    padding:0;
    line-height:1;
}

.joyful-toast-close:hover {
    color:white;
}

@keyframes toastIn {
    from {
        opacity:0;
        transform:translateY(-8px);
    }
    to {
        opacity:1;
        transform:translateY(0);
    }
}

/* ── Toolbar ── */

#joyful-toolbar {
    position:fixed;
    top:80px;
    left:16px;
    z-index:99999;
    background:#181a1f;
    border:1px solid #333;
    border-radius:14px;
    padding:12px;
    width:210px;
    box-shadow:0 4px 18px rgba(0,0,0,.45);
    color:white;
    font-family:sans-serif;
    user-select:none;
    overflow:hidden;
    transition: height .25s ease, width .25s ease;
}

#joyful-toolbar > *:not(h3) {
    opacity:1;
    max-height:200px;
    transition: opacity .2s ease, max-height .25s ease;
}

#joyful-toolbar.collapsed > *:not(h3) {
    opacity:0;
    max-height:0;
    pointer-events:none;
}

#joyful-toolbar.collapsed {
    height:48px;
}

#joyful-toolbar h3 {
    margin:0;
    padding-bottom:10px;
    font-size:13px;
    font-weight:700;
    color:white;
    border-bottom:1px solid #2a2d35;
    cursor:grab;
    display:flex;
    align-items:center;
    justify-content:space-between;
    transition:color .2s ease;
}

#joyful-collapse-icon {
    font-size:12px;
    color:#aaa;
    transition:transform .2s ease;
    cursor:pointer;
}

#joyful-toolbar.collapsed #joyful-collapse-icon {
    transform:rotate(180deg);
}

#joyful-toolbar h3:active {
    cursor:grabbing;
}

.joyful-section-title {
    margin-top:12px;
    margin-bottom:8px;
    color:#888;
    font-size:11px;
    text-transform:uppercase;
    letter-spacing:.08em;
}

.joyful-setting {
    display:flex;
    align-items:center;
    justify-content:space-between;
    background:#22252d;
    border:1px solid #333;
    border-radius:10px;
    padding:9px 10px;
    margin-bottom:8px;
    transition: transform .15s ease, background .15s ease, border-color .15s ease;
}

.joyful-setting:hover {
    transform:translateY(-1px);
    background:#2b2e38;
    border-color:#555;
}

.joyful-setting-text {
    display:flex;
    flex-direction:column;
    gap:3px;
    font-size:13px;
}

.joyful-setting-count {
    color:#aaa;
    font-size:11px;
}

/* ── Switch ── */

.joyful-switch {
    position:relative;
    width:38px;
    height:20px;
    flex-shrink:0;
}

.joyful-switch input {
    display:none;
}

.joyful-slider {
    position:absolute;
    inset:0;
    background:#444;
    border-radius:20px;
    cursor:pointer;
    transition:.2s;
}

.joyful-slider:before {
    content:"";
    position:absolute;
    width:16px;
    height:16px;
    left:2px;
    top:2px;
    background:white;
    border-radius:50%;
    transition:.2s;
}

.joyful-switch input:checked + .joyful-slider {
    background:#998c13;
}

.joyful-switch input:checked + .joyful-slider:before {
    transform:translateX(18px);
}

/* ── Actions ── */

.joyful-action {
    display:flex;
    align-items:center;
    justify-content:space-between;
    width:100%;
    background:#22252d;
    color:white;
    border:1px solid #333;
    border-radius:10px;
    padding:9px 10px;
    font-size:13px;
    cursor:pointer;
    transition: transform .15s ease, background .15s ease, border-color .15s ease;
}

.joyful-action:hover:not(:disabled) {
    transform:translateY(-1px);
    background:#2b2e38;
    border-color:#555;
}

.joyful-action:disabled {
    opacity:.45;
    cursor:not-allowed;
}

/* ── Footer ── */

.joyful-footer {
    margin-top:12px;
    padding-top:8px;
    border-top:1px solid #2a2d35;
    color:#666;
    font-size:10px;
    display:flex;
    align-items:center;
    justify-content:space-between;
}

#joyful-settings-btn {
    background:none;
    border:none;
    color:#777;
    font-size:14px;
    cursor:pointer;
    padding:2px 4px;
    transition: color .2s ease, transform .2s ease;
}

#joyful-settings-btn:hover {
    color:white;
    transform:rotate(45deg);
}

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

#joyful-settings-panel.open {
    display: block;
}

#joyful-settings-panel h4 {
    margin: 0 0 10px 0;
    font-size: 13px;
    font-weight: 700;
    color: white;
    border-bottom: 1px solid #2a2d35;
    padding-bottom: 8px;
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

#joyful-settings-close:hover {
    color: white;
}

/* ── Inventory button ── */

.roli-inv-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: #ccc;
    font-size: 13px;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 6px;
    transition: background .15s ease, color .15s ease;
    white-space: nowrap;
    vertical-align: middle;
}

.roli-inv-btn:hover {
    background: rgba(255,255,255,.08);
    color: white;
}

/* ── Inventory panel ── */

.roli-inv-panel {
    position: absolute;
    z-index: 999998;
    width: 300px;
    max-height: 480px;
    overflow-y: auto;
    background: #181a1f;
    border: 1px solid #333;
    border-radius: 14px;
    padding: 14px;
    box-shadow: 0 6px 28px rgba(0,0,0,.6);
    color: white;
    font-family: sans-serif;
    font-size: 13px;
    display: none;
}

.roli-inv-panel.open {
    display: block;
}

.roli-inv-panel::-webkit-scrollbar { width: 5px; }
.roli-inv-panel::-webkit-scrollbar-track { background: #1e2026; border-radius: 10px; }
.roli-inv-panel::-webkit-scrollbar-thumb { background: #444; border-radius: 10px; }

.roli-inv-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #2a2d35;
}

.roli-inv-header span { font-size: 13px; font-weight: 700; }

.roli-inv-close {
    background: none;
    border: none;
    color: #aaa;
    font-size: 15px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}
.roli-inv-close:hover { color: white; }

.roli-inv-section-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #888;
    margin: 10px 0 6px;
}

.roli-inv-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    border-radius: 9px;
    background: #22252d;
    margin-bottom: 5px;
    transition: background .12s ease;
}
.roli-inv-item:hover { background: #2b2e38; }

.roli-inv-thumb {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
    background: #2a2d35;
}

.roli-inv-item-info { flex: 1; min-width: 0; }

.roli-inv-item-name {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.roli-inv-item-rap { font-size: 11px; color: #aaa; margin-top: 2px; }

.roli-inv-copies {
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: #3a3d45;
    border-radius: 5px;
    padding: 2px 6px;
    flex-shrink: 0;
}

.roli-inv-hoard-badge {
    font-size: 10px;
    font-weight: 700;
    color: #f4c430;
    background: rgba(244,196,48,.12);
    border: 1px solid rgba(244,196,48,.3);
    border-radius: 5px;
    padding: 2px 6px;
    flex-shrink: 0;
}

/* ── Send Trade button: disabled state ── */

.send_trade_button[data-trade-blocked="1"] {
    opacity: 0.45 !important;
    filter: grayscale(100%) !important;
    cursor: not-allowed !important;
    pointer-events: auto !important;
}

`;
document.head.appendChild(style);

// ── Toolbar ──────────────────────────────────────────────────────────────────

let filterActive = false;
let retryReady = false;
let infoboxEnabled = true;
let newTraderGlowColor = "#998c13";
let newTraderGlowIntensity = 35;

let toolbarPosition = {
    left: "16px",
    top: "80px"
};

setTimeout(() => {
    retryReady = true;
    updateRetryBtn();
}, 3000);

function createToolbar(){

    // ── Toast container ──
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

        <div class="joyful-section-title">
            Filters
        </div>

        <div class="joyful-setting">
            <div class="joyful-setting-text">
                <span>⭐ New traders</span>
                <span class="joyful-setting-count" id="joyful-new-count">
                    0 found on this page
                </span>
            </div>
            <label class="joyful-switch">
                <input type="checkbox" id="joyful-newtrader-toggle">
                <span class="joyful-slider"></span>
            </label>
        </div>

        <div class="joyful-section-title">
            Actions
        </div>

        <button class="joyful-action" id="joyful-retry-btn" disabled>
            <span>↺ Retry all failures</span>
            <span></span>
        </button>

        <div class="joyful-footer">
            <span>v1.0.0</span>
            <button id="joyful-settings-btn" title="Settings">
                ⚙
            </button>
        </div>
    `;

    document.body.appendChild(toolbar);

    chrome.storage.local.get(["toolbarPosition"], (result) => {
        if(result.toolbarPosition){
            toolbar.style.left = result.toolbarPosition.left;
            toolbar.style.top = result.toolbarPosition.top;
            toolbar.style.right = "auto";
        }
    });

    const toolbarHeader = document.getElementById("joyful-toolbar-header");
    const collapseIcon  = document.getElementById("joyful-collapse-icon");

    collapseIcon.onclick = (e) => {
        e.stopPropagation();
        toolbar.classList.toggle("collapsed");
        const collapsed = toolbar.classList.contains("collapsed");
        collapseIcon.textContent = collapsed ? "▼" : "▲";
    };

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    toolbarHeader.onmousedown = (e) => {
        if(e.target.id === "joyful-collapse-icon") return;
        dragging = true;
        const rect = toolbar.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        toolbarHeader.style.cursor = "grabbing";
    };

    document.addEventListener("mousemove", (e) => {
        if(!dragging) return;
        toolbar.style.left = (e.clientX - offsetX) + "px";
        toolbar.style.top  = (e.clientY - offsetY) + "px";
        toolbar.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
        if(dragging){
            chrome.storage.local.set({
                toolbarPosition:{
                    left: toolbar.style.left,
                    top: toolbar.style.top
                }
            });
        }
        dragging = false;
        toolbarHeader.style.cursor = "grab";
    });

    const newTraderToggle = document.getElementById("joyful-newtrader-toggle");
    newTraderToggle.checked = filterActive;
    newTraderToggle.onchange = () => {
        filterActive = newTraderToggle.checked;
        if(filterActive){
            filterNewTraders();
        } else {
            unfilterNewTraders();
        }
        updateNewTraderCount();
    };

    const retryBtn = document.getElementById("joyful-retry-btn");
    retryBtn.onclick = () => {
        if(!retryReady || retryBtn.disabled) return;
        retryAllFailed();
    };
    updateNewTraderCount();

    const settingsPanel = document.createElement("div");
    settingsPanel.id = "joyful-settings-panel";
    settingsPanel.innerHTML = `
        <h4>
            <span>⚙ Settings</span>
            <button id="joyful-settings-close">✕</button>
        </h4>

        <div class="joyful-section-title">Display</div>

        <div class="joyful-setting">
            <div class="joyful-setting-text">
                <span>Player infobox</span>
                <span class="joyful-setting-count">Show stats beside ads</span>
            </div>
            <label class="joyful-switch">
                <input type="checkbox" id="joyful-infobox-toggle" checked>
                <span class="joyful-slider"></span>
            </label>
        </div>

        <div class="joyful-setting">
            <div class="joyful-setting-text">
                <span>New trader glow</span>
                <span class="joyful-setting-count" id="joyful-color-hex-label">#998c13</span>
            </div>
            <button
                id="joyful-color-wheel-btn"
                title="Pick glow color"
                style="
                    width:32px;height:32px;border-radius:50%;border:2px solid #555;
                    background: conic-gradient(
                        hsl(0,100%,50%),hsl(30,100%,50%),hsl(60,100%,50%),hsl(90,100%,50%),
                        hsl(120,100%,50%),hsl(150,100%,50%),hsl(180,100%,50%),hsl(210,100%,50%),
                        hsl(240,100%,50%),hsl(270,100%,50%),hsl(300,100%,50%),hsl(330,100%,50%),
                        hsl(360,100%,50%)
                    );
                    cursor:pointer;padding:0;flex-shrink:0;
                    transition:transform .15s ease, border-color .15s ease;
                "
            ></button>
        </div>

        <div class="joyful-setting">
            <div class="joyful-setting-text">
                <span>Glow intensity</span>
                <span class="joyful-setting-count" id="joyful-glow-value">35px</span>
            </div>
            <input type="range" id="joyful-glow-slider" min="0" max="100" value="35" style="width:90px;">
        </div>
    `;

    document.body.appendChild(settingsPanel);

    const colorWheelBtn = document.getElementById("joyful-color-wheel-btn");
    const colorHexLabel = document.getElementById("joyful-color-hex-label");

    function applyGlowColor(hex){
        newTraderGlowColor = hex;
        colorHexLabel.textContent = hex;
        colorWheelBtn.style.borderColor = hex;
        document.querySelectorAll(".joyful-switch input:checked + .joyful-slider").forEach(slider => {
            slider.style.background = hex;
        });
        updateSwitchAccentStyle(hex);
        chrome.storage.local.set({ newTraderGlowColor: hex });
        document.querySelectorAll(".roli-player-info").forEach(info => {
            if(info.closest(".mix_item")?.dataset.newTrader === "1"){
                info.style.boxShadow =
                    `0 0 8px white, 0 0 20px white, 0 0 ${newTraderGlowIntensity}px ${hex}`;
            }
        });
    }

    let switchAccentStyleEl = null;
    function updateSwitchAccentStyle(hex){
        if(!switchAccentStyleEl){
            switchAccentStyleEl = document.createElement("style");
            switchAccentStyleEl.id = "joyful-switch-accent";
            document.head.appendChild(switchAccentStyleEl);
        }
        switchAccentStyleEl.textContent =
            `.joyful-switch input:checked + .joyful-slider { background: ${hex} !important; }`;
    }

    function createColorWheel(){
        const popup = document.createElement("div");
        popup.id = "joyful-colorwheel-popup";
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
        const previewHex = document.createElement("span");
        previewHex.style.cssText = "color:white;font-size:12px;font-family:monospace;";
        previewRow.appendChild(previewSwatch);
        previewRow.appendChild(previewHex);

        popup.appendChild(canvas);
        popup.appendChild(lightnessRow);
        popup.appendChild(previewRow);
        document.body.appendChild(popup);

        const ctx = canvas.getContext("2d");
        const cx = canvas.width / 2, cy = canvas.height / 2, radius = cx;
        let currentH = 45, currentS = 70, currentL = 50;

        function drawWheel(){
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

        function drawCursor(){
            const angle = (currentH * Math.PI) / 180;
            const dist  = (currentS / 100) * radius;
            const px = cx + Math.cos(angle) * dist;
            const py = cy + Math.sin(angle) * dist;
            ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI*2);
            ctx.strokeStyle = "white"; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI*2);
            ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
        }

        function hslToRgb(h, s, l){
            s /= 100; l /= 100;
            const k = n => (n + h/30) % 12;
            const a = s * Math.min(l, 1-l);
            const f = n => l - a * Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n), 1)));
            return [Math.round(f(0)*255), Math.round(f(8)*255), Math.round(f(4)*255)];
        }

        function rgbToHex(r,g,b){
            return "#" + [r,g,b].map(v => v.toString(16).padStart(2,"0")).join("");
        }

        function updatePreview(){
            const [r,g,b] = hslToRgb(currentH, currentS, currentL);
            const hex = rgbToHex(r,g,b);
            previewSwatch.style.background = hex;
            previewHex.textContent = hex;
            return hex;
        }

        function pickFromCanvas(e){
            const rect = canvas.getBoundingClientRect();
            const dx = e.clientX - rect.left - cx;
            const dy = e.clientY - rect.top  - cy;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if(dist > radius) return;
            currentH = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
            currentS = Math.min((dist / radius) * 100, 100);
            drawWheel();
            applyGlowColor(updatePreview());
        }

        let draggingWheel = false;
        canvas.addEventListener("mousedown", (e) => { draggingWheel = true; pickFromCanvas(e); });
        document.addEventListener("mousemove", (e) => { if(draggingWheel) pickFromCanvas(e); });
        document.addEventListener("mouseup",   ()  => { draggingWheel = false; });

        lightnessSlider.oninput = () => {
            currentL = Number(lightnessSlider.value);
            drawWheel();
            applyGlowColor(updatePreview());
        };

        popup._syncToHex = function(hex){
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

    const colorWheelPopup = createColorWheel();

    chrome.storage.local.get(["newTraderGlowColor"], (result) => {
        const hex = result.newTraderGlowColor || "#998c13";
        applyGlowColor(hex);
        colorWheelPopup._syncToHex(hex);
    });

    colorWheelBtn.onclick = (e) => {
        e.stopPropagation();
        const isOpen = colorWheelPopup.style.display === "flex";
        if(isOpen){ colorWheelPopup.style.display = "none"; return; }
        const rect = colorWheelBtn.getBoundingClientRect();
        colorWheelPopup.style.display = "flex";
        const pw = colorWheelPopup.offsetWidth  || 200;
        const ph = colorWheelPopup.offsetHeight || 240;
        let left = rect.left - pw/2 + rect.width/2;
        let top  = rect.top  - ph - 10;
        left = Math.max(8, Math.min(left, window.innerWidth  - pw - 8));
        top  = Math.max(8, Math.min(top,  window.innerHeight - ph - 8));
        colorWheelPopup.style.left = left + "px";
        colorWheelPopup.style.top  = top  + "px";
    };

    colorWheelBtn.onmouseenter = () => { colorWheelBtn.style.transform = "scale(1.15) rotate(30deg)"; };
    colorWheelBtn.onmouseleave = () => { colorWheelBtn.style.transform = ""; };

    document.addEventListener("click", (e) => {
        if(
            colorWheelPopup.style.display === "flex" &&
            !colorWheelPopup.contains(e.target) &&
            !e.target.classList.contains("roli-inv-btn") &&
            e.target !== colorWheelBtn
        ){
            colorWheelPopup.style.display = "none";
        }
    });

    const glowSlider = document.getElementById("joyful-glow-slider");
    const glowValue  = document.getElementById("joyful-glow-value");

    chrome.storage.local.get(["newTraderGlowIntensity"], (result) => {
        if(result.newTraderGlowIntensity !== undefined){
            newTraderGlowIntensity = result.newTraderGlowIntensity;
            glowSlider.value = newTraderGlowIntensity;
            glowValue.textContent = newTraderGlowIntensity + "px";
        }
    });

    glowSlider.oninput = () => {
        newTraderGlowIntensity = Number(glowSlider.value);
        glowValue.textContent = newTraderGlowIntensity + "px";
        chrome.storage.local.set({ newTraderGlowIntensity });
        document.querySelectorAll(".roli-player-info").forEach(info => {
            if(info.closest(".mix_item")?.dataset.newTrader === "1"){
                info.style.boxShadow =
                    `0 0 8px white, 0 0 20px white, 0 0 ${newTraderGlowIntensity}px ${newTraderGlowColor}`;
            }
        });
    };

    function positionSettingsPanel(){
        const tbRect = toolbar.getBoundingClientRect();
        settingsPanel.style.top  = tbRect.top + "px";
        settingsPanel.style.left = (tbRect.right + 10) + "px";
    }

    const settingsBtn = document.getElementById("joyful-settings-btn");

    settingsBtn.onclick = () => {
        const open = settingsPanel.classList.toggle("open");
        settingsBtn.style.transform = open ? "rotate(45deg)" : "";
        settingsBtn.style.color     = open ? "white" : "";
        if(open) positionSettingsPanel();
    };

    document.getElementById("joyful-settings-close").onclick = () => {
        settingsPanel.classList.remove("open");
        settingsBtn.style.transform = "";
        settingsBtn.style.color     = "";
    };

    const infoboxToggle = document.getElementById("joyful-infobox-toggle");

    chrome.storage.local.get(["infoboxEnabled"], (result) => {
        if(result.infoboxEnabled === false){
            infoboxEnabled = false;
            infoboxToggle.checked = false;
            setInfoboxVisibility(false);
        }
    });

    infoboxToggle.onchange = () => {
        infoboxEnabled = infoboxToggle.checked;
        chrome.storage.local.set({ infoboxEnabled });
        setInfoboxVisibility(infoboxEnabled);

        if(infoboxEnabled){
            document.querySelectorAll(".mix_item").forEach(ad => {
                delete ad.dataset.userId;
            });
            processAds();
        }
    };
}

function setInfoboxVisibility(visible){
    document.querySelectorAll(".roli-player-info").forEach(info => {
        info.style.display = visible ? "" : "none";
    });
}

function updateNewTraderCount(){
    const counter = document.getElementById("joyful-new-count");
    if(!counter) return;
    const count = document.querySelectorAll('.mix_item[data-new-trader="1"]').length;
    counter.textContent = `${count} found on this page`;
}

function updateRetryBtn(){
    const retryBtn = document.getElementById("joyful-retry-btn");
    if(!retryBtn) return;

    const failedCount = document.querySelectorAll(".roli-player-info[data-failed='1']").length;

    if(!retryReady){
        retryBtn.disabled = true;
        retryBtn.querySelector("span:first-child").textContent = "↺ Retry all failures";
        return;
    }

    if(failedCount === 0){
        retryBtn.disabled = true;
        retryBtn.querySelector("span:first-child").textContent = "↺ Retry all failures";
    } else {
        retryBtn.disabled = false;
        retryBtn.querySelector("span:first-child").textContent = `↺ Retry all failures (${failedCount})`;
    }
}

// ── Toast notifications ───────────────────────────────────────────────────────

function showToast(msg, type = "success", duration = 5000){
    const container = document.getElementById("joyful-toast-container");
    if(!container) return;

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

    if(duration > 0) setTimeout(() => dismissToast(toast), duration);
}

function dismissToast(toast){
    if(!toast.isConnected) return;
    toast.style.transition = "opacity 0.2s ease";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
}

// ── Retry all failed ──────────────────────────────────────────────────────────

function retryAllFailed(){
    const retryBtn = document.getElementById("joyful-retry-btn");

    const failedInfos = [...document.querySelectorAll(".roli-player-info[data-failed='1']")];
    if(failedInfos.length === 0) return;

    retryReady = false;
    retryBtn.disabled = true;
    retryBtn.querySelector("span:first-child").textContent = "↺ Retrying...";

    const promises = failedInfos.map(info => {
        const ad = info.closest(".mix_item");
        if(!ad) return Promise.resolve("skipped");
        const userId = info.dataset.userId;
        if(!userId) return Promise.resolve("skipped");

        info.dataset.failed = "0";

        return new Promise(resolve => {
            loadPlayer(info, ad, userId).then(() => {
                resolve(info.dataset.failed === "1" ? "failed" : "success");
            }).catch(() => resolve("failed"));
        });
    });

    Promise.allSettled(promises).then(results => {
        const succeeded = results.filter(r => r.value === "success").length;
        const failed    = results.filter(r => r.value === "failed").length;

        let msg, type;
        if(failed === 0){
            msg  = `All ${succeeded} failed box${succeeded !== 1 ? "es" : ""} reloaded successfully.`;
            type = "success";
        } else if(succeeded === 0){
            msg  = `All ${failed} retr${failed !== 1 ? "ies" : "y"} failed again.`;
            type = "error";
        } else {
            msg  = `${succeeded} reloaded, ${failed} still failed.`;
            type = "warning";
        }

        showToast(msg, type);
        retryReady = true;
        updateRetryBtn();
    });
}

// ── Inventory ─────────────────────────────────────────────────────────────────

const invPanel = (() => {
    const panel = document.createElement("div");
    panel.className = "roli-inv-panel";
    panel.innerHTML = `
        <div class="roli-inv-header">
            <span id="roli-inv-title">Inventory</span>
            <button class="roli-inv-close">✕</button>
        </div>
        <div id="roli-inv-body"></div>
    `;
    document.body.appendChild(panel);

    panel.querySelector(".roli-inv-close").onclick = () => closeInvPanel();

    document.addEventListener("click", (e) => {
        if(
            panel.classList.contains("open") &&
            !panel.contains(e.target) &&
            !e.target.classList.contains("roli-inv-btn")
        ){
            closeInvPanel();
        }
    });

    return panel;
})();

let activeInvBtn = null;

function closeInvPanel(){
    invPanel.classList.remove("open");
    if(activeInvBtn) activeInvBtn.classList.remove("roli-inv-btn-active");
    activeInvBtn = null;
}

function positionInvPanel(btn) {
    const btnRect = btn.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const pw      = invPanel.offsetWidth || 300;
    const margin  = 6;

    const top  = btnRect.top  + scrollY - margin;
    // Center the panel on the button so wider panels shift left naturally
    let   left = btnRect.left + scrollX + btnRect.width / 2 - pw / 2;

    if (left + pw > scrollX + window.innerWidth - margin) {
        left = scrollX + window.innerWidth - pw - margin;
    }
    if (left < scrollX + margin) {
        left = scrollX + margin;
    }

    invPanel.style.top       = top  + "px";
    invPanel.style.left      = left + "px";
    invPanel.style.transform = "translateY(-100%)";
}

function createInventoryBtn(ad, userId) {
    ad.querySelector(".roli-inv-btn")?.remove();

    const btn = document.createElement("button");
    btn.className = "roli-inv-btn";
    btn.innerHTML = `🎒 Inventory`;

    const actionDiv = ad.querySelector(".py-1.my-auto.ml-auto");
    if (actionDiv) {
        actionDiv.insertAdjacentElement("afterbegin", btn);
    } else {
        ad.style.position = "relative";
        ad.appendChild(btn);
    }

    btn.addEventListener("click", (e) => {
        e.stopPropagation();

        if (activeInvBtn === btn) {
            closeInvPanel();
            return;
        }

        closeInvPanel();
        activeInvBtn = btn;

        invPanel.style.width = "300px";
        positionInvPanel(btn);
        invPanel.classList.add("open");

        document.getElementById("roli-inv-title").textContent = "Inventory";
        document.getElementById("roli-inv-body").innerHTML = `
            <div style="color:#aaa;text-align:center;padding:20px 0;">
                Loading inventory...
            </div>
        `;

        chrome.runtime.sendMessage({ type: "inventoryInfo", userId }, (result) => {
            if (activeInvBtn !== btn) return;

            if (!result || !result.success) {
                const code = result?.status || "network error";
                document.getElementById("roli-inv-body").innerHTML = `
                    <div style="color:#ff6b6b;text-align:center;padding:20px 0;">
                        Failed to load inventory (${code}).<br>
                        <span style="color:#aaa;font-size:11px;">Cookie has been altered, DM yijj on discord if this problem shows up.</span>
                    </div>
                `;
                return;
            }

            renderInventoryPanel(result.data, userId);
        });
    });
}

let roliItemData = null;

function ensureItemData() {
    if (roliItemData) return Promise.resolve(roliItemData);
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "itemDetails" }, (result) => {
            if (result?.success) roliItemData = result.data;
            resolve(roliItemData);
        });
    });
}

function renderInventoryPanel(data, userId) {
    const body  = document.getElementById("roli-inv-body");
    const title = document.getElementById("roli-inv-title");
    const items = data.items  || [];
    const total = data.total  || 0;

    title.textContent = "Inventory";

    if (items.length === 0) {
        body.innerHTML = `<div style="color:#aaa;text-align:center;padding:20px 0;">No tradable items found.</div>`;
        return;
    }

    ensureItemData().then(itemData => {
        const top5      = items.slice(0, 5);
        const hoards    = items.filter(i => i.copies > 2);
        const rareItems = items.filter(i => i.serials?.some(s => RARE_SERIALS.isRare(s)));
        const totalRareSerials = rareItems.reduce((sum, i) => sum + i.serials.filter(s => RARE_SERIALS.isRare(s)).length, 0);

        const numColumns = 1 + (hoards.length > 0 ? 1 : 0) + (rareItems.length > 0 ? 1 : 0);
        invPanel.style.width = (numColumns * 300) + "px";
        if (activeInvBtn) positionInvPanel(activeInvBtn);

        const sectionTitle = (label, count) =>
            `<div class="roli-inv-section-title" style="display:flex;justify-content:space-between;align-items:center;">
                <span>${label}</span>
                <span style="background:#2a2d35;border-radius:5px;padding:1px 6px;color:#aaa;font-size:10px;font-weight:700;text-transform:none;letter-spacing:0;">${count}</span>
            </div>`;

        let html = '';

        if (numColumns === 1) {
            html += sectionTitle("⭐ Top Items", total);
            for (const item of top5) html += inventoryItemHTML(item, false, itemData);
        } else {
            const columns = [];

            columns.push(`
                <div style="flex:1;min-width:0;padding-right:12px;border-right:1px solid #2a2d35;">
                    ${sectionTitle("⭐ Top Items", total)}
                    ${top5.map(i => inventoryItemHTML(i, false, itemData)).join('')}
                </div>`);

            if (hoards.length > 0) {
                const notLast = rareItems.length > 0;
                columns.push(`
                <div style="flex:1;min-width:0;padding-left:12px;${notLast ? "padding-right:12px;border-right:1px solid #2a2d35;" : ""}">
                    ${sectionTitle("📦 Hoarded", hoards.length)}
                    ${hoards.map(i => inventoryItemHTML(i, true, itemData)).join('')}
                </div>`);
            }

            if (rareItems.length > 0) {
                columns.push(`
                <div style="flex:1;min-width:0;padding-left:12px;">
                    ${sectionTitle("💎 Rare Serials", totalRareSerials)}
                    ${rareItems.map(item => {
                        const rareSerials = item.serials.filter(s => RARE_SERIALS.isRare(s));
                        return inventoryRareSerialHTML(item, rareSerials, itemData);
                    }).join('')}
                </div>`);
            }

            html += `<div style="display:flex;gap:0;align-items:flex-start;">${columns.join('')}</div>`;
        }

        body.innerHTML = html;

        body.querySelectorAll("img[data-asset-id]").forEach(img => {
            chrome.runtime.sendMessage({ type: "thumbnailInfo", assetId: img.dataset.assetId }, response => {
                const imageUrl = response?.data?.data?.[0]?.imageUrl;
                if (imageUrl) img.src = imageUrl;
            });
        });
    });
}

function inventoryItemHTML(item, showHoardBadge, itemData) {
    const roli       = itemData?.[item.assetId];
    const acronym    = roli?.[1] && roli[1] !== -1  ? roli[1]  : null;
    const value      = roli?.[3] && roli[3] > 0     ? roli[3]  : null;
    const projected  = roli?.[7] === 1;

    const rapStr = item.rap > 0 ? `RAP: ${item.rap.toLocaleString()}` : "No RAP";
    const valStr = value        ? `<span style="color:#f4c430;font-size:11px;font-weight:700;">Val: ${value.toLocaleString()}</span> · ` : "";

    const badge = showHoardBadge
        ? `<span class="roli-inv-hoard-badge">×${item.copies}</span>`
        : (item.copies > 1 ? `<span class="roli-inv-copies">×${item.copies}</span>` : "");

    const onHoldBadge = item.onHold > 0
        ? `<span style="font-size:10px;color:#ff9d4d;background:rgba(255,157,77,.12);border:1px solid rgba(255,157,77,.3);border-radius:5px;padding:2px 5px;flex-shrink:0;" title="${item.onHold} cop${item.onHold > 1 ? "ies" : "y"} on hold">🔒 ${item.onHold}</span>`
        : "";

    return `
    <div class="roli-inv-item">
        <div style="position:relative;flex-shrink:0;">
            <img class="roli-inv-thumb"
                 data-asset-id="${item.assetId}"
                 src=""
                 alt=""
                 style="filter:brightness(1.25);"
                 onerror="this.style.opacity='0.3'"
            >
            ${projected ? `<span style="position:absolute;top:-4px;left:-4px;font-size:13px;" title="Projected">⚠️</span>` : ""}
        </div>
        <div class="roli-inv-item-info">
            <div class="roli-inv-item-name" title="${escapeHtml(item.name)}">
                ${escapeHtml(item.name)}${acronym ? ` <span style="color:#888;font-size:10px;">[${escapeHtml(acronym)}]</span>` : ""}
            </div>
            <div class="roli-inv-item-rap">${valStr}<span style="color:#aaa;font-size:11px;">${rapStr}</span></div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">
            ${badge}
            ${onHoldBadge}
        </div>
    </div>`;
}


function inventoryRareSerialHTML(item, rareSerials, itemData) {
    const roli  = itemData?.[item.assetId];
    const value = roli?.[3] && roli[3] > 0 ? roli[3] : null;
    const rapStr = item.rap > 0 ? `RAP: ${item.rap.toLocaleString()}` : "No RAP";
    const valStr = value ? `<span style="color:#f4c430;font-size:11px;font-weight:700;">Val: ${value.toLocaleString()}</span> · ` : "";

    const serialBadges = rareSerials.map(s =>
        `<span style="display:inline-block;background:rgba(100,200,255,.12);border:1px solid rgba(100,200,255,.3);border-radius:4px;padding:1px 5px;font-size:10px;color:#7dd3fc;margin:1px 1px 2px 0;">${RARE_SERIALS.label(s)}</span>`
    ).join('');

    const onHoldBadge = item.onHold > 0
        ? `<span style="font-size:10px;color:#ff9d4d;background:rgba(255,157,77,.12);border:1px solid rgba(255,157,77,.3);border-radius:5px;padding:2px 5px;flex-shrink:0;" title="${item.onHold} cop${item.onHold > 1 ? "ies" : "y"} on hold">🔒 ${item.onHold}</span>`
        : "";

    return `
    <div class="roli-inv-item">
        <img class="roli-inv-thumb" data-asset-id="${item.assetId}" src="" alt=""
             style="filter:brightness(1.25);" onerror="this.style.opacity='0.3'">
        <div class="roli-inv-item-info">
            <div class="roli-inv-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            <div style="margin-top:3px;">${serialBadges}</div>
            <div class="roli-inv-item-rap">${valStr}<span style="color:#aaa;font-size:11px;">${rapStr}</span></div>
        </div>
        ${onHoldBadge}
    </div>`;
}

function escapeHtml(str){
    return String(str)
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;");
}

// ── Observer & init ──────────────────────────────────────────────────────────

processAds();
createToolbar();

let processTimer;

const observer = new MutationObserver(() => {
    clearTimeout(processTimer);
    processTimer = setTimeout(() => {
        processAds();
        updateRetryBtn();
        updateNewTraderCount();
    }, 1000);
});

const tradeArea = document.querySelector(".trades-container") || document.body;

observer.observe(tradeArea, {
    childList: true,
    subtree: true
});

window.addEventListener("hashchange", () => {
    console.log("[RoliCalc] Page changed:", location.hash);

    setTimeout(() => {
        processAds();

        if(filterActive){
            setTimeout(() => {
                filterNewTraders();
            }, 1500);
        }

        updateRetryBtn();
        updateNewTraderCount();

    }, 1000);
});

function filterNewTraders(){
    document.querySelectorAll(".mix_item").forEach(ad => {
        const isNew = ad.dataset.newTrader === "1";
        ad.style.display = isNew ? "" : "none";
    });
}

function unfilterNewTraders(){
    document.querySelectorAll(".mix_item").forEach(ad => {
        ad.style.display = "";
    });
}