const itemMatch = location.pathname.match(/^\/item\/(\d+)/);
if (!itemMatch) throw new Error("Not an item page");

const itemId = itemMatch[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const JUMPER_TABLES = ["hoards_table", "bc_owners_table", "all_copies_table"];

injectItemToolbar();
injectPageJumpers();
setTimeout(() => injectMarketStats(itemId), 0);

// ── Item Toolbar ─────────────────────────────────────────────────────────────

function injectItemToolbar() {
    const style = document.createElement("style");
    style.textContent = `
        #joyful-item-toolbar {
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

        #joyful-item-toolbar > *:not(h3) {
            opacity: 1;
            max-height: 500px;
            transition: opacity .2s ease, max-height .25s ease;
        }

        #joyful-item-toolbar.collapsed > *:not(h3) {
            opacity: 0;
            max-height: 0;
            pointer-events: none;
        }

        #joyful-item-toolbar.collapsed {
            height: 48px;
        }

        #joyful-item-toolbar h3 {
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
        }

        #joyful-item-toolbar h3:active {
            cursor: grabbing;
        }

        #joyful-item-collapse-icon {
            font-size: 12px;
            color: #aaa;
            transition: transform .2s ease;
            cursor: pointer;
        }

        #joyful-item-toolbar.collapsed #joyful-item-collapse-icon {
            transform: rotate(180deg);
        }

        .joyful-item-footer {
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px solid #2a2d35;
            color: #666;
            font-size: 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
    `;
    document.head.appendChild(style);

    const toolbar = document.createElement("div");
    toolbar.id = "joyful-item-toolbar";

    toolbar.innerHTML = `
        <h3 id="joyful-item-toolbar-header">
            <span>Roliful Tools</span>
            <span id="joyful-item-collapse-icon">▲</span>
        </h3>

        <div class="joyful-item-footer">
            <span>v1.0.0</span>
        </div>
    `;

    document.body.appendChild(toolbar);

    chrome.storage.local.get(["itemToolbarPosition"], (result) => {
        if (result.itemToolbarPosition) {
            toolbar.style.left  = result.itemToolbarPosition.left;
            toolbar.style.top   = result.itemToolbarPosition.top;
            toolbar.style.right = "auto";
        }
    });

    chrome.storage.local.get(["itemToolbarCollapsed"], (result) => {
        if (result.itemToolbarCollapsed) {
            toolbar.classList.add("collapsed");
            document.getElementById("joyful-item-collapse-icon").textContent = "▼";
        }
    });

    const header       = document.getElementById("joyful-item-toolbar-header");
    const collapseIcon = document.getElementById("joyful-item-collapse-icon");

    collapseIcon.onclick = (e) => {
        e.stopPropagation();
        toolbar.classList.toggle("collapsed");
        const isCollapsed = toolbar.classList.contains("collapsed");
        collapseIcon.textContent = isCollapsed ? "▼" : "▲";
        chrome.storage.local.set({ itemToolbarCollapsed: isCollapsed });
    };

    let dragging = false, offsetX = 0, offsetY = 0;

    header.onmousedown = (e) => {
        if (e.target.id === "joyful-item-collapse-icon") return;
        dragging = true;
        const rect = toolbar.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        header.style.cursor = "grabbing";
    };

    document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        toolbar.style.left  = (e.clientX - offsetX) + "px";
        toolbar.style.top   = (e.clientY - offsetY) + "px";
        toolbar.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
        if (dragging) {
            chrome.storage.local.set({
                itemToolbarPosition: { left: toolbar.style.left, top: toolbar.style.top }
            });
        }
        dragging = false;
        header.style.cursor = "grab";
    });
}

// ── Market Stats (3rd column) ────────────────────────────────────────────────

const ROUTILITY_SVG = `<img src="${chrome.runtime.getURL('icon/routility.svg')}" width="32" height="32" style="vertical-align:-0.125em" alt="RoUtility">`;

const MCAP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="2em" height="2em" viewBox="0 0 24 24" fill="#7a8288"><path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/></svg>`;

const PREMIUM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="2em" height="2em" viewBox="0 0 24 24" fill="#7a8288"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8zm7 8h-7V5c1.9 0 3.6.9 4.9 2.1 1.3 1.2 2.1 3 2.1 4.9z"/></svg>`;

const HOARD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="2em" height="2em" viewBox="0 0 24 24" fill="#7a8288"><path d="M5 4h14a3 3 0 0 1 3 3v4h-7v-1H9v1H2V7a3 3 0 0 1 3-3zm6 7h2v2h-2v-2zm-9 1h7v1l2 2h2l2-2v-1h7v8H2v-8z"/></svg>`;

function injectMarketStats(itemId) {
    const wrapper = document.querySelector('.d-flex.justify-content-around');
    if (!wrapper) return;

    const col = document.createElement("div");
    col.id = "roliful-market-col";

    let rowIndex = 0;
    const makeRow = (svg, label, value, tooltip) => {
        const isFirst = rowIndex === 0;
        rowIndex++;
        const row = document.createElement("div");
        row.className = "d-flex";
        const iconDiv = document.createElement("div");
        iconDiv.className = isFirst
            ? "mt-3 mt-sm-2 mt-md-3 pt-sm-1 pt-md-1"
            : "mt-3 pt-md-1";
        if (tooltip) {
            iconDiv.setAttribute("data-toggle", "tooltip");
            iconDiv.setAttribute("title", tooltip);
        }
        iconDiv.innerHTML = svg;

        const textDiv = document.createElement("div");
        textDiv.className = isFirst
            ? "mx-2 mt-2 pt-0 pt-md-1"
            : "mx-2 mt-2 pt-1";
        textDiv.innerHTML = `
            <h6 class="card-subtitle mt-1 text-muted stat-header">${label}</h6>
            <h5 class="card-title mb-1 text-light text-truncate stat-data">${value}</h5>
        `;
        row.appendChild(iconDiv);
        row.appendChild(textDiv);
        return row;
    };

    const loading = '<span style="color:#aaa">Loading...</span>';
    const usdRow     = makeRow(ROUTILITY_SVG, "USD Value",      loading, "USD price from RoUtility");
    const availMcRow = makeRow(MCAP_SVG,      "Available Mcap", loading, "Available Copies × Value (or RAP)");
    const premMcRow  = makeRow(PREMIUM_SVG,   "Premium Mcap",   loading, "Premium Copies × Value (or RAP)");
    const hoardMcRow = makeRow(HOARD_SVG,     "Hoarded Mcap",   loading, "Hoarded Copies × Value (or RAP)");

    col.appendChild(usdRow);
    col.appendChild(availMcRow);
    col.appendChild(premMcRow);
    col.appendChild(hoardMcRow);
    wrapper.appendChild(col);

    const fmt = (n) => {
        if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
        if (n >= 1e9)  return (n / 1e9).toFixed(2) + "B";
        if (n >= 1e6)  return (n / 1e6).toFixed(2) + "M";
        if (n >= 1e3)  return n.toLocaleString();
        return String(n);
    };

    const setVal = (row, text) => {
        const h5 = row.querySelector(".stat-data");
        if (h5) h5.textContent = text;
    };

    const readPageStat = (label) => {
        const headers = wrapper.querySelectorAll(".stat-header");
        for (const h of headers) {
            if (h.textContent.trim() !== label) continue;
            const dataEl = h.parentElement?.querySelector(".stat-data");
            if (!dataEl) return null;

            if (label === "Hoarded") {
                const tip = dataEl.getAttribute("data-original-title") || dataEl.getAttribute("title") || "";
                const m = tip.match(/([\d,]+)\s*Cop/i);
                return m ? parseFloat(m[1].replace(/,/g, "")) : null;
            }

            const n = parseFloat(dataEl.textContent.replace(/,/g, "").trim());
            return isNaN(n) ? null : n;
        }
        return null;
    };

    const availCopies  = readPageStat("Available Copies");
    const premCopies   = readPageStat("Premium Copies");
    const hoardedCopies = readPageStat("Hoarded");

    // itemDetails API: assets[itemId] = [name, acronym, rap, value, ...]
    chrome.runtime.sendMessage({ type: "itemDetails" }, (result) => {
        if (chrome.runtime.lastError || !result?.success || !result.data) {
            setVal(availMcRow, "-");
            setVal(premMcRow, "-");
            setVal(hoardMcRow, "-");
            return;
        }

        const item = result.data[itemId];
        if (!item) {
            setVal(availMcRow, "-");
            setVal(premMcRow, "-");
            setVal(hoardMcRow, "-");
            return;
        }

        const value = item[3] > 0 ? item[3] : null;
        const rap   = item[2] > 0 ? item[2] : null;
        const basePrice = value || rap || 0;

        if (availCopies !== null && basePrice)  setVal(availMcRow, fmt(availCopies * basePrice));
        else setVal(availMcRow, "-");

        if (premCopies !== null && basePrice)   setVal(premMcRow, fmt(premCopies * basePrice));
        else setVal(premMcRow, "-");

        if (hoardedCopies !== null && basePrice) setVal(hoardMcRow, fmt(hoardedCopies * basePrice));
        else setVal(hoardMcRow, "-");
    });

    chrome.runtime.sendMessage({ type: "routilityItem", itemId }, (result) => {
        if (chrome.runtime.lastError || !result?.success || !result.data) {
            setVal(usdRow, "-");
            return;
        }
        const usd = result.data.item_usd;
        if (usd != null) {
            setVal(usdRow, "$" + usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        } else {
            setVal(usdRow, "-");
        }
    });
}

// ── Page Jumpers ──────────────────────────────────────────────────────────────
// One jumper <li> per table, inserted before each table's Prev button.
// Each is fully independent — page state is not shared between tables.
// A MutationObserver per table re-inserts the <li> after DataTables re-renders.

function injectPageJumpers() {
    const style = document.createElement("style");
    style.textContent = `
        .joyful-jumper-li {
            display: flex;
            align-items: center;
            margin-right: 4px;
        }

        .joyful-jumper-wrap {
            display: flex;
            align-items: center;
            gap: 3px;
        }

        .joyful-page-input {
            width: 52px;
            padding: 4px 6px;
            font-size: 13px;
            line-height: 1.5;
            color: inherit;
            background: transparent;
            border: 1px solid currentColor;
            border-radius: 4px;
            opacity: 0.55;
            text-align: center;
            transition: opacity .15s ease;
            -moz-appearance: textfield;
        }

        .joyful-page-input::-webkit-inner-spin-button,
        .joyful-page-input::-webkit-outer-spin-button {
            -webkit-appearance: none;
        }

        .joyful-page-input:focus {
            outline: none;
            opacity: 1;
        }

        .joyful-page-go.page-link {
            padding: 4px 8px;
            font-size: 13px;
            cursor: pointer;
            border-radius: 4px;
            line-height: 1.5;
        }

        .joyful-page-go.page-link:disabled {
            opacity: .45;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);

    JUMPER_TABLES.forEach(setupJumperForTable);
}

function setupJumperForTable(tableId) {
    const liId = `joyful-jumper-${tableId}`;

    function buildLi() {
        const li = document.createElement("li");
        li.id = liId;
        li.className = "paginate_button page-item joyful-jumper-li";
        li.innerHTML = `
            <div class="joyful-jumper-wrap">
                <input class="joyful-page-input" type="number" min="1" placeholder="pg" title="Jump to page" />
                <button class="joyful-page-go page-link">Go</button>
            </div>
        `;

        const inp = li.querySelector(".joyful-page-input");
        const btn = li.querySelector(".joyful-page-go");

        const trigger = () => {
            const val = parseInt(inp.value, 10);
            if (!val || val < 1) return;
            jumpToPage(val, tableId, btn);
        };

        btn.addEventListener("click", trigger);
        inp.addEventListener("keydown", e => { if (e.key === "Enter") trigger(); });

        // Prevent DataTables from swallowing clicks inside our element.
        li.addEventListener("click", e => e.stopPropagation());

        return li;
    }

    function insertJumper() {
        if (document.getElementById(liId)) return;
        const prevBtn = document.getElementById(`${tableId}_previous`);
        if (!prevBtn) return;
        prevBtn.parentElement.insertBefore(buildLi(), prevBtn);
    }

    const tryInsert = () => {
        insertJumper();
        if (!document.getElementById(liId)) setTimeout(tryInsert, 300);
    };
    setTimeout(tryInsert, 500);

    // Re-insert whenever DataTables replaces the pagination markup.
    const observer = new MutationObserver(() => {
        if (!document.getElementById(liId)) insertJumper();
    });

    const waitForPaginate = () => {
        const paginate = document.getElementById(`${tableId}_paginate`);
        if (paginate) {
            observer.observe(paginate, { childList: true, subtree: true });
        } else {
            setTimeout(waitForPaginate, 400);
        }
    };
    waitForPaginate();
}

// ── Jump logic ────────────────────────────────────────────────────────────────
// Scoped entirely to the given tableId — no state shared across tables.

async function jumpToPage(target, tableId, goBtn) {
    const paginate = document.getElementById(`${tableId}_paginate`);
    if (!paginate) return;

    const getActivePage = () => {
        const a = paginate.querySelector(".page-item.active a");
        return a ? parseInt(a.textContent.trim(), 10) : null;
    };

    const getMaxPage = () => {
        const nums = [...paginate.querySelectorAll(".paginate_button:not(.previous):not(.next) a")]
            .map(a => parseInt(a.textContent.trim(), 10))
            .filter(n => !isNaN(n));
        return nums.length ? Math.max(...nums) : null;
    };

    // Click a page button if it is directly visible; returns true if found.
    const clickVisible = (page) => {
        const btn = [...paginate.querySelectorAll(".paginate_button:not(.previous):not(.next) a")]
            .find(a => parseInt(a.textContent.trim(), 10) === page);
        if (btn) { btn.click(); return true; }
        return false;
    };

    const current = getActivePage();
    if (current === null || target === current) return;

    const maxPage = getMaxPage();
    if (maxPage !== null && target > maxPage) return;

    if (clickVisible(target)) return;

    if (goBtn) goBtn.disabled = true;

    const goForward = target > current;
    const navId     = goForward ? `${tableId}_next` : `${tableId}_previous`;
    const maxSteps  = Math.abs(target - current);

    for (let i = 0; i < maxSteps; i++) {
        const navBtn    = document.querySelector(`#${navId} a`);
        const navParent = document.getElementById(navId);
        if (!navBtn || navParent.classList.contains("disabled")) break;
        navBtn.click();
        await sleep(420);

        if (getActivePage() === target) break;
        if (clickVisible(target)) break;
    }

    if (goBtn) goBtn.disabled = false;
}
