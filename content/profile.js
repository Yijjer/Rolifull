const DEBUG_PREFIX = "[Rolijoy]";

const profileMatch = location.pathname.match(/^\/player\/(\d+)/);
if (!profileMatch) throw new Error("Not a player page");

const userId = profileMatch[1];

chrome.storage.local.get([
    "socialCountsEnabled", "profileStatsEnabled", "displayNameEnabled",
    "descriptionEnabled", "tradeEligEnabled", "relationshipEnabled",
    "tradeCalcEnabled", "rareSerialEnabled", "wishlistEnabled"
], (prefs) => {
    if (prefs.displayNameEnabled    !== false) injectDisplayName(userId);
    if (prefs.socialCountsEnabled   !== false) injectSocialCounts(userId);
    if (prefs.profileStatsEnabled   !== false) injectProfileStats(userId);
    if (prefs.tradeEligEnabled      !== false) injectTradeButton(userId);
    if (prefs.descriptionEnabled    !== false) injectPlayerDescription(userId);
    if (prefs.wishlistEnabled       !== false) injectWishlistAddCard(userId);
    if (prefs.relationshipEnabled   !== false) injectRelationship(userId);
    if (prefs.tradeCalcEnabled      !== false) injectTradeCalcButton(userId);
    if (prefs.rareSerialEnabled     !== false) markRareSerials();
});

// ── Shared drag helper (Y-axis only, clamped inside imgWrapper) ───────────────

function makeVerticallyDraggable(box, imgWrapper, storageKey) {
    box.style.cursor = "grab";

    let dragging = false;
    let startY   = 0;
    let startTop = 0;

    // Restore saved position if available
    if (storageKey) {
        chrome.storage.local.get([storageKey], (result) => {
            if (result[storageKey] !== undefined) {
                box.style.top = result[storageKey] + "px";
            }
        });
    }

    box.addEventListener("mousedown", (e) => {
        // Only drag on left-click directly on the box (not on toggle children etc.)
        if (e.button !== 0) return;
        dragging = true;
        startY   = e.clientY;

        // Resolve current top — box may have been placed with `bottom`, so
        // switch to explicit top-based positioning on first drag.
        const wRect  = imgWrapper.getBoundingClientRect();
        const bRect  = box.getBoundingClientRect();
        startTop = bRect.top - wRect.top;

        box.style.top    = startTop + "px";
        box.style.bottom = "auto";

        box.style.cursor = "grabbing";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!dragging) return;

        const wRect     = imgWrapper.getBoundingClientRect();
        const boxHeight = box.offsetHeight;
        const delta     = e.clientY - startY;
        const rawTop    = startTop + delta;

        // Clamp so the box never leaves the wrapper
        const minTop = 0;
        const maxTop = wRect.height - boxHeight;
        const newTop = Math.max(minTop, Math.min(maxTop, rawTop));

        box.style.top = newTop + "px";
    });

    document.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        box.style.cursor = "grab";

        // Save position to storage
        if (storageKey) {
            chrome.storage.local.set({
                [storageKey]: box.style.top
            });
        }
    });
}

async function injectProfileStats(userId) {

    const imgWrapper = await waitFor(() =>
        document.querySelector(".position-relative img.mx-auto.d-block.w-100.h-100")
            ?.closest(".position-relative")
    );

    if (!imgWrapper) return;

    const box = document.createElement("div");
    box.className = "roli-profile-box";

    Object.assign(box.style, {
        position:       "absolute",
        top:            "8px",
        right:          "8px",

        background:     "rgba(20,22,28,0.82)",
        backdropFilter: "blur(6px)",

        border:         "1px solid #333",
        borderRadius:   "10px",

        padding:        "7px 10px",

        display:        "flex",
        flexDirection:  "column",
        gap:            "4px",

        fontSize:       "12px",
        color:          "white",

        fontFamily:     "sans-serif",
        lineHeight:     "1.4",

        zIndex:         "10",
        minWidth:       "140px",
        boxSizing:      "border-box",

        userSelect:     "none",
    });

    box.innerHTML = `
        <div id="roli-groups">👥 <span style="color:#aaa">Loading...</span></div>
        <div id="roli-ownedgroups">👑 <span style="color:#aaa">Loading...</span></div>
        <div id="roli-age">📅 <span style="color:#aaa">Loading...</span></div>
        <div id="roli-ropro">🔌 <span style="color:#aaa">Loading...</span></div>
    `;

    imgWrapper.style.position = "relative";
    imgWrapper.appendChild(box);

    makeVerticallyDraggable(box, imgWrapper, "profileStatsBoxPosition");

    chrome.runtime.sendMessage(
        { type: "robloxProfileStats", userId },
        (result) => {

            console.log("Profile stats response:", result);

            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                box.innerHTML = `<span style="color:#ff6b6b">Runtime error</span>`;
                return;
            }

            if (!result?.success) {
                console.error(result);
                box.innerHTML = `<span style="color:#ff6b6b">Failed to load</span>`;
                return;
            }

            const { groups, ownedGroups, accountAge } = result.data;

            document.getElementById("roli-groups").innerHTML =
                `👥 <strong>${groups}</strong> <span style="color:#888">groups</span>`;

            document.getElementById("roli-ownedgroups").innerHTML =
                `👑 <strong>${ownedGroups}</strong> <span style="color:#888">groups owned</span>`;

            document.getElementById("roli-age").innerHTML =
                `📅 <strong>${accountAge}</strong>`;

            // Store ownedGroups count on the element for visibility logic
            document.getElementById("roli-ownedgroups").dataset.count = ownedGroups;

            applyProfileStatsVisibility();
        }
    );

    chrome.runtime.sendMessage({ type: "roProInfo", userId }, (result) => {
        if (chrome.runtime.lastError || !result?.success) {
            document.getElementById("roli-ropro").innerHTML =
                `🔌 <strong style="color:#666">Unknown</strong>`;
            return;
        }

        const { tier } = result.data;

        const hasRoPro = tier !== "none";

        if (!hasRoPro) {
            document.getElementById("roli-ropro").innerHTML =
                `🔌 <strong style="color:#555">No</strong> <span style="color:#888">RoPro</span>`;
            return;
        }

        const tierDisplay = {
            none:  { label: "Free",  color: "#888" },
            plus:  { label: "Plus",  color: "#4fc3f7" },
            rex:   { label: "Rex",   color: "#ffd740" },
            ultra: { label: "Ultra", color: "#e040fb" },
            pro:   { label: "Pro",   color: "#69f0ae" },
        };

        const t = tierDisplay[tier] || tierDisplay.none;
        document.getElementById("roli-ropro").innerHTML =
            `🔌 <strong style="color:${t.color}">${t.label}</strong> <span style="color:#888">RoPro</span>`;
    });
}

// ── Profile stats visibility logic ───────────────────────────────────────────

function applyProfileStatsVisibility() {
    chrome.storage.local.get(["profileStatsEnabled", "profileStatsPrefs"], (result) => {
        const box      = document.querySelector(".roli-profile-box");
        const masterOn = result.profileStatsEnabled !== false;
        const prefs    = result.profileStatsPrefs   || {};

        const groupsOn      = prefs.groups      !== false;
        const ownedGroupsOn = prefs.ownedGroups !== false;
        const accountAgeOn  = prefs.accountAge  !== false;
        const roProOn       = prefs.roPro       !== false;

        if (!box) return;

        if (!masterOn) {
            box.style.display = "none";
            return;
        }

        box.style.display = "flex";

        const setRow = (id, visible) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.display = visible ? "" : "none";
        };

        setRow("roli-groups", groupsOn);

        // Groups owned: only show when toggle is on AND count >= 1
        const ownedEl    = document.getElementById("roli-ownedgroups");
        const ownedCount = ownedEl ? parseInt(ownedEl.dataset.count ?? "0", 10) : 0;
        setRow("roli-ownedgroups", ownedGroupsOn && ownedCount >= 1);

        setRow("roli-age", accountAgeOn);
        setRow("roli-ropro", roProOn);

        const anyVisible = groupsOn || (ownedGroupsOn && ownedCount >= 1) || accountAgeOn || roProOn;
        box.style.padding = anyVisible ? "7px 10px" : "0";
        box.style.border  = anyVisible ? "1px solid #333" : "none";
    });
}

// ── Display name ──────────────────────────────────────────────────────────────

async function injectDisplayName(userId) {
    const h1 = await waitFor(() => document.querySelector("h1.page_title"));
    if (!h1) return;

    chrome.runtime.sendMessage({ type: "robloxUser", userId }, (result) => {
        if (!result?.success) return;

        const displayName = result.data.displayName;
        const username    = result.data.name;

        if (!displayName || displayName === username) return;
        if (document.querySelector(".roli-display-name")) return;

        const tag = document.createElement("span");
        tag.className = "roli-display-name";
        tag.textContent = `(${displayName})`;

        Object.assign(tag.style, {
            marginLeft:    "10px",
            fontWeight:    "400",
            color:         "#888",
            display:       "inline",
            verticalAlign: "baseline",
            whiteSpace:    "nowrap"
        });

        h1.appendChild(tag);
    });
}

// ── Social counts ─────────────────────────────────────────────────────────────

async function injectSocialCounts(userId) {
    const imgWrapper = await waitFor(() =>
        document.querySelector(".position-relative img.mx-auto.d-block.w-100.h-100")
            ?.closest(".position-relative")
    );
    if (!imgWrapper) return;

    const box = document.createElement("div");
    box.className = "roli-social-box";

    Object.assign(box.style, {
        position:       "absolute",
        top:            "8px",
        left:           "8px",

        background:     "rgba(20,22,28,0.82)",
        backdropFilter: "blur(6px)",
        border:         "1px solid #333",
        borderRadius:   "10px",
        padding:        "7px 10px",
        display:        "flex",
        flexDirection:  "column",
        gap:            "4px",
        fontSize:       "12px",
        color:          "white",
        fontFamily:     "sans-serif",
        lineHeight:     "1.4",
        zIndex:         "10",
        minWidth:       "120px",
        boxSizing:      "border-box",

        userSelect:     "none",
    });

    box.innerHTML = `
        <div class="roli-social-row" id="roli-friends">🫂 <span style="color:#aaa">Loading...</span></div>
        <div class="roli-social-row" id="roli-followers">👥 <span style="color:#aaa">Loading...</span></div>
        <div class="roli-social-row" id="roli-following">👤 <span style="color:#aaa">Loading...</span></div>
    `;

    imgWrapper.style.position = "relative";
    imgWrapper.appendChild(box);

    makeVerticallyDraggable(box, imgWrapper, "socialBoxPosition");

    chrome.runtime.sendMessage({ type: "robloxSocial", userId }, (result) => {
        if (!result?.success) {
            box.innerHTML = `<div style="color:#ff6b6b;font-size:11px;">Failed to load</div>`;
            return;
        }

        const { friends, followers, following } = result.data;

        document.getElementById("roli-friends").innerHTML =
            `🫂 <strong>${friends.toLocaleString()}</strong> <span style="color:#888">friends</span>`;
        document.getElementById("roli-followers").innerHTML =
            `👥 <strong>${followers.toLocaleString()}</strong> <span style="color:#888">followers</span>`;
        document.getElementById("roli-following").innerHTML =
            `👤 <strong>${following.toLocaleString()}</strong> <span style="color:#888">following</span>`;

        applySocialVisibility();
    });
}

// ── Social visibility logic ───────────────────────────────────────────────────

function applySocialVisibility() {
    chrome.storage.local.get(["socialCountsEnabled", "socialCountsPrefs"], (result) => {
        const box      = document.querySelector(".roli-social-box");
        const masterOn = result.socialCountsEnabled !== false;
        const prefs    = result.socialCountsPrefs   || {};

        const friendsOn   = prefs.friends   !== false;
        const followersOn = prefs.followers !== false;
        const followingOn = prefs.following !== false;

        if (!box) return;

        if (!masterOn) {
            box.style.display = "none";
            return;
        }

        box.style.display = "flex";

        const setRow = (id, visible) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.display = visible ? "" : "none";
        };

        setRow("roli-friends",   friendsOn);
        setRow("roli-followers", followersOn);
        setRow("roli-following", followingOn);

        const anyVisible = friendsOn || followersOn || followingOn;
        box.style.padding = anyVisible ? "7px 10px" : "0";
        box.style.border  = anyVisible ? "1px solid #333" : "none";
    });
}

async function injectTradeButton(userId) {

    const tradeButton = await waitFor(() =>
        document.querySelector('a[href*="/users/"][href*="/trade"]')
    );

    if (!tradeButton) return;

    chrome.runtime.sendMessage(
    {
        type: "canTradeWith",
        userId
    },
    (result) => {

            if (chrome.runtime.lastError || !result?.success) return;

            if (result.data.canTrade) return;

            const tradeButton = document.querySelector(
                'a[href*="roblox.com/users/"][href*="/trade"]'
            );
            if (!tradeButton) return;

            const reasons = {
                CannotTradeWithSelf:  "You can't trade with yourself.",
                TargetCannotTrade:    "This user has trading disabled.",
                TargetUserIneligible: "This user is not eligible to trade.",
                PremiumRequired:      "One or both users need Roblox Premium.",
                SenderCannotTrade:    "Your account cannot send trades.",
                PrivacySettings:      "This user's privacy settings block trades."
            };

            tradeButton.style.opacity       = "0.45";
            tradeButton.style.filter        = "grayscale(100%)";
            tradeButton.style.cursor        = "not-allowed";
            tradeButton.style.pointerEvents = "auto";

            const tooltip = document.createElement("div");

            const reason =
                reasons[result.data.mutualTradeEligibility] ??
                result.data.mutualTradeEligibility;

            tooltip.innerHTML = `
                <div style="font-weight:600;margin-bottom:4px;">
                    This user cannot receive trades.
                </div>
                <div style="color:#b8b8b8;font-size:11px;">
                    Reason: ${reason}
                </div>
            `;

            Object.assign(tooltip.style, {
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
                pointerEvents: "none"
            });

            document.body.appendChild(tooltip);

            tradeButton.addEventListener("mouseenter", () => {
                const rect = tradeButton.getBoundingClientRect();
                tooltip.style.left      = `${rect.left + rect.width / 2}px`;
                tooltip.style.top       = `${rect.top - 8}px`;
                tooltip.style.transform = "translate(-50%, -100%)";
                tooltip.style.opacity   = "1";
            });

            tradeButton.addEventListener("mouseleave", () => {
                tooltip.style.opacity = "0";
            });

            tradeButton.addEventListener("click", e => {
                e.preventDefault();
            });
        });
}

// ── Player Description ────────────────────────────────────────────────────────

async function injectPlayerDescription(userId) {
    const h1 = await waitFor(() => document.querySelector("h1.page_title"));

    if (!h1) return;

    // Check if already injected
    if (document.querySelector(".roli-description-container")) return;

    // Create container for the description box
    const container = document.createElement("div");
    container.className = "roli-description-container";
    Object.assign(container.style, {
        position: "absolute",
        bottom: "0",
        right: "12px",
        marginTop: "0px",
        marginBottom: "0px"
    });

    // Create description box
    const descBox = document.createElement("div");
    descBox.className = "roli-description-box";

    Object.assign(descBox.style, {
        position: "relative",
        background: "rgba(20,22,28,0.82)",
        backdropFilter: "blur(6px)",
        border: "1px solid #333",
        borderRadius: "10px",
        padding: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        fontSize: "12px",
        color: "white",
        fontFamily: "sans-serif",
        lineHeight: "1.4",
        minWidth: "200px",
        maxWidth: "300px",
        boxSizing: "border-box",
        userSelect: "text",
        zIndex: "10000"
    });

    // Create header with minimize button
    const header = document.createElement("div");
    Object.assign(header.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: "4px",
        borderBottom: "1px solid #444"
    });

    const label = document.createElement("span");
    label.textContent = "About";
    label.style.fontSize = "11px";
    label.style.color = "#aaa";
    label.style.fontWeight = "600";

    const minimizeBtn = document.createElement("button");
    minimizeBtn.innerHTML = "−";
    Object.assign(minimizeBtn.style, {
        background: "none",
        border: "none",
        color: "#666",
        cursor: "pointer",
        fontSize: "16px",
        padding: "0 4px",
        lineHeight: "1",
        transition: "color 0.2s",
        marginLeft: "8px"
    });

    minimizeBtn.onmouseover = () => minimizeBtn.style.color = "#aaa";
    minimizeBtn.onmouseout = () => minimizeBtn.style.color = "#666";

    const lockBtn = document.createElement("button");
    lockBtn.innerHTML = "🔓";
    Object.assign(lockBtn.style, {
        background: "none",
        border: "none",
        color: "#666",
        cursor: "pointer",
        fontSize: "14px",
        padding: "0 4px",
        lineHeight: "1",
        transition: "color 0.2s",
        marginLeft: "4px"
    });

    lockBtn.onmouseover = () => lockBtn.style.color = "#aaa";
    lockBtn.onmouseout = () => lockBtn.style.color = "#666";

    header.appendChild(label);
    header.appendChild(lockBtn);
    header.appendChild(minimizeBtn);

    // Make header draggable
    header.style.cursor = "grab";

    // Create content area
    const content = document.createElement("div");
    Object.assign(content.style, {
        wordWrap: "break-word",
        whiteSpace: "pre-wrap",
        paddingRight: "4px",
        color: "#ccc",
        overflowX: "hidden"
    });

    descBox.appendChild(header);
    descBox.appendChild(content);

    // Add description box to container
    container.appendChild(descBox);

    // Find the flex wrapper and insert the description
    const flexWrapper = h1.closest(".d-flex");
    if (flexWrapper) {
        // Make flex wrapper position relative for absolute positioning
        flexWrapper.style.position = "relative";

        flexWrapper.appendChild(container);
    } else {
        h1.parentNode.insertBefore(container, h1.nextSibling);
    }

    // Load description data
    function loadDescription() {
        if (content.textContent && content.textContent !== "Loading...") return;

        content.textContent = "Loading...";
        content.style.color = "#aaa";

        chrome.runtime.sendMessage({ type: "robloxUser", userId }, (result) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                content.textContent = "Failed to load description";
                content.style.color = "#ff6b6b";
                return;
            }

            if (!result?.success) {
                content.textContent = "No description available";
                content.style.color = "#888";
                return;
            }

            const description = result.data?.description;
            if (!description || description.trim() === "") {
                content.textContent = "No description available";
                content.style.color = "#888";
                return;
            }

            content.textContent = description;
            content.style.color = "#ccc";
        });
    }

    // Restore minimized state from storage
    chrome.storage.local.get(["descriptionMinimized"], (result) => {
        const isMinimized = result.descriptionMinimized || false;

        if (isMinimized) {
            content.style.display = "none";
            minimizeBtn.textContent = "+";
        } else {
            content.style.display = "block";
            minimizeBtn.textContent = "−";
            // Load data on init if not minimized
            loadDescription();
        }
    });

    // Toggle minimize
    minimizeBtn.onclick = (e) => {
        e.stopPropagation();
        const isCurrentlyMinimized = content.style.display === "none";
        const willBeMinimized = !isCurrentlyMinimized;

        chrome.storage.local.set({ descriptionMinimized: willBeMinimized });

        if (willBeMinimized) {
            content.style.display = "none";
            minimizeBtn.textContent = "+";
        } else {
            content.style.display = "block";
            minimizeBtn.textContent = "−";
            // Load data when unminimized
            loadDescription();
        }
    };

    // ── Lock state ──────────────────────────────────────────────────────────

    let isLocked = false;

    lockBtn.onclick = (e) => {
        e.stopPropagation();
        isLocked = !isLocked;
        lockBtn.innerHTML = isLocked ? "🔒" : "🔓";
        header.style.cursor = isLocked ? "default" : "grab";
        chrome.storage.local.set({ descriptionLocked: isLocked });
    };

    // Restore locked state
    chrome.storage.local.get(["descriptionLocked"], (result) => {
        isLocked = result.descriptionLocked || false;
        lockBtn.innerHTML = isLocked ? "🔒" : "🔓";
        header.style.cursor = isLocked ? "default" : "grab";
    });

    // ── Dragging logic ──────────────────────────────────────────────────────

    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    header.addEventListener("mousedown", (e) => {
        if (isLocked) return;
        if (e.target === minimizeBtn || minimizeBtn.contains(e.target)) return;
        if (e.target === lockBtn || lockBtn.contains(e.target)) return;
        isDragging = true;
        dragOffsetX = e.clientX - container.getBoundingClientRect().left;
        dragOffsetY = e.clientY - container.getBoundingClientRect().top;
        header.style.cursor = "grabbing";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;

        const flexWrapper = h1.closest(".d-flex");
        if (!flexWrapper || !flexWrapper.parentNode) return;

        const parentRect = flexWrapper.parentNode.getBoundingClientRect();
        let newLeft = e.clientX - parentRect.left - dragOffsetX;
        let newBottom = parentRect.height - (e.clientY - parentRect.top + dragOffsetY);

        // Check collision with modal and navbar
        const tempBox = {
            left: newLeft,
            top: parentRect.height - newBottom - container.offsetHeight,
            right: newLeft + container.offsetWidth,
            bottom: parentRect.height - newBottom
        };

        // Get modal and navbar
        const modal = document.querySelector(".modal-content");
        const navbar = document.querySelector("nav.navbar");

        let hasCollision = false;

        // Check collision with modal
        if (modal) {
            const modalRect = modal.getBoundingClientRect();
            if (!(tempBox.right < modalRect.left ||
                  tempBox.left > modalRect.right ||
                  tempBox.bottom < modalRect.top - parentRect.top ||
                  tempBox.top > modalRect.bottom - parentRect.top)) {
                hasCollision = true;
            }
        }

        // Check collision with navbar
        if (!hasCollision && navbar) {
            const navRect = navbar.getBoundingClientRect();
            if (!(tempBox.right < navRect.left ||
                  tempBox.left > navRect.right ||
                  tempBox.bottom < navRect.top - parentRect.top ||
                  tempBox.top > navRect.bottom - parentRect.top)) {
                hasCollision = true;
            }
        }

        if (!hasCollision) {
            container.style.position = "absolute";
            container.style.right = "auto";
            container.style.top = "auto";
            container.style.left = newLeft + "px";
            container.style.bottom = newBottom + "px";
        }
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            header.style.cursor = isLocked ? "default" : "grab";
            isDragging = false;

            // Save position
            const flexWrapper = h1.closest(".d-flex");
            if (flexWrapper && flexWrapper.parentNode) {
                const parentRect = flexWrapper.parentNode.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const bottom = parentRect.height - (containerRect.bottom - parentRect.top);
                chrome.storage.local.set({
                    descriptionPosition: {
                        left: containerRect.left - parentRect.left,
                        bottom: bottom
                    }
                });
            }
        }
    });

    // Restore saved position
    chrome.storage.local.get(["descriptionPosition"], (result) => {
        if (result.descriptionPosition) {
            container.style.position = "absolute";
            container.style.right = "auto";
            container.style.top = "auto";
            container.style.left = result.descriptionPosition.left + "px";
            container.style.bottom = result.descriptionPosition.bottom + "px";
        }
    });

    // Hide when modal is visible
    setInterval(() => {
        const modal = document.querySelector(".modal-content");
        const modalVisible = modal && modal.offsetParent !== null;

        if (modalVisible) {
            container.style.display = "none";
        } else {
            container.style.display = "flex";
        }
    }, 100);
}

// ── Player Toolbar ────────────────────────────────────────────────────────────

injectPlayerToolbar();

function injectPlayerToolbar() {

    const style = document.createElement("style");
    style.textContent = `
        #joyful-player-toolbar {
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

        #joyful-player-toolbar-body {
            max-height: calc(100vh - 180px);
            overflow-y: auto;
            overflow-x: hidden;
            scrollbar-width: thin;
            scrollbar-color: #444 transparent;
            opacity: 1;
            transition: opacity .2s ease, max-height .25s ease;
        }

        #joyful-player-toolbar-body::-webkit-scrollbar {
            width: 4px;
        }
        #joyful-player-toolbar-body::-webkit-scrollbar-track {
            background: transparent;
        }
        #joyful-player-toolbar-body::-webkit-scrollbar-thumb {
            background: #444;
            border-radius: 4px;
        }

        #joyful-player-toolbar.collapsed #joyful-player-toolbar-body {
            opacity: 0;
            max-height: 0;
            pointer-events: none;
            overflow: hidden;
        }

        #joyful-player-toolbar.collapsed {
            height: 48px;
        }

        #joyful-player-toolbar h3 {
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

        #joyful-player-toolbar h3:active {
            cursor: grabbing;
        }

        #joyful-player-collapse-icon {
            font-size: 12px;
            color: #aaa;
            transition: transform .2s ease;
            cursor: pointer;
        }

        #joyful-player-toolbar.collapsed #joyful-player-collapse-icon {
            transform: rotate(180deg);
        }

        .joyful-player-section-title {
            margin-top: 12px;
            margin-bottom: 8px;
            color: #888;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: .08em;
        }

        .joyful-player-setting {
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

        #joyful-profilestats-setting {
            display: flex;
            flex-direction: column;
            align-items: stretch;
        }

        .joyful-player-setting-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .joyful-player-setting:hover {
            transform: translateY(-1px);
            background: #2b2e38;
            border-color: #555;
        }

        .joyful-player-setting-text {
            display: flex;
            flex-direction: column;
            gap: 3px;
            font-size: 13px;
        }

        .joyful-player-setting-sub {
            color: #aaa;
            font-size: 11px;
        }

        .joyful-player-action {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            background: #22252d;
            color: white;
            border: 1px solid #333;
            border-radius: 10px;
            padding: 9px 10px;
            font-size: 13px;
            cursor: pointer;
            transition: transform .15s ease, background .15s ease, border-color .15s ease;
        }

        .joyful-player-action:hover:not(:disabled) {
            transform: translateY(-1px);
            background: #2b2e38;
            border-color: #555;
        }

        .joyful-player-action:disabled {
            opacity: .45;
            cursor: not-allowed;
        }

        .joyful-player-switch {
            position: relative;
            width: 38px;
            height: 20px;
            flex-shrink: 0;
        }

        .joyful-player-switch input {
            display: none;
        }

        .joyful-player-slider {
            position: absolute;
            inset: 0;
            background: #444;
            border-radius: 20px;
            cursor: pointer;
            transition: .2s;
        }

        .joyful-player-slider:before {
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

        .joyful-player-switch input:checked + .joyful-player-slider {
            background: #600606;
        }

        .joyful-player-switch input:checked + .joyful-player-slider:before {
            transform: translateX(18px);
        }

        .joyful-expand-btn {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            background: transparent;
            color: #888;
            border: 1px dashed #333;
            border-radius: 8px;
            padding: 6px 10px;
            font-size: 11px;
            cursor: pointer;
            margin-top: 8px;
            margin-bottom: 0;
            transition: background .15s ease, border-color .15s ease, color .15s ease;
            box-sizing: border-box;
        }

        .joyful-expand-btn:hover {
            background: #1e2028;
            border-color: #555;
            color: #ccc;
        }

        .joyful-expand-btn .expand-arrow {
            transition: transform .2s ease;
            font-size: 10px;
        }

        .joyful-expand-btn.open .expand-arrow {
            transform: rotate(180deg);
        }

        .joyful-subpanel {
            overflow: hidden;
            max-height: 0;
            opacity: 0;
            margin-top: 8px;
            transition: max-height .25s ease, opacity .2s ease;
            background: #13151a;
            border: 1px solid #2a2d35;
            border-radius: 8px;
        }

        .joyful-subpanel.open {
            max-height: 400px;
            opacity: 1;
        }

        .joyful-social-sub-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 7px 10px;
            font-size: 12px;
            border-bottom: 1px solid #1e2028;
        }

        .joyful-social-sub-row:last-child {
            border-bottom: none;
        }

        .joyful-social-sub-row span {
            color: #ccc;
        }

        .joyful-subpanel.master-off .joyful-social-sub-row {
            opacity: 0.35;
            pointer-events: none;
        }

        .roli-trade-disabled {
            position: relative;
        }

        .roli-trade-disabled::after {
            content: attr(data-tooltip);
            position: absolute;
            left: 50%;
            bottom: calc(100% + 8px);
            transform: translateX(-50%);
            background: #1c1e23;
            color: white;
            border: 1px solid #444;
            border-radius: 8px;
            padding: 7px 10px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            transition: opacity .15s ease;
            pointer-events: none;
            z-index: 999999;
        }

        .roli-trade-disabled:hover::after {
            opacity: 1;
        }

        .joyful-player-footer {
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px solid #2a2d35;
            color: #666;
            font-size: 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        /* Drag hint on the overlay boxes */
        .roli-social-box,
        .roli-profile-box {
            cursor: grab;
        }
        .roli-social-box:active,
        .roli-profile-box:active {
            cursor: grabbing;
        }
    `;
    document.head.appendChild(style);

    const toolbar = document.createElement("div");
    toolbar.id = "joyful-player-toolbar";

    toolbar.innerHTML = `
        <h3 id="joyful-player-toolbar-header">
            <span>Rolijoy Tools</span>
            <span id="joyful-player-collapse-icon">▲</span>
        </h3>

        <div id="joyful-player-toolbar-body">

            <!-- Profile Stats (merged with Social Counts) -->
            <div class="joyful-player-setting" id="joyful-profilestats-setting">
                <div class="joyful-player-setting-top">
                    <div class="joyful-player-setting-text">
                        <span>Profile Stats</span>
                        <span class="joyful-player-setting-sub">Social, groups, age &amp; more</span>
                    </div>
                    <label class="joyful-player-switch">
                        <input type="checkbox" id="joyful-profilestats-master-toggle" checked>
                        <span class="joyful-player-slider"></span>
                    </label>
                </div>

                <button id="joyful-profilestats-expand-btn" class="joyful-expand-btn">
                    <span>Customise</span>
                    <span class="expand-arrow">▼</span>
                </button>

                <div id="joyful-profilestats-subpanel" class="joyful-subpanel">
                    <div class="joyful-social-sub-row">
                        <span>🫂 Friends</span>
                        <label class="joyful-player-switch">
                            <input type="checkbox" id="joyful-social-friends-toggle" checked>
                            <span class="joyful-player-slider"></span>
                        </label>
                    </div>
                    <div class="joyful-social-sub-row">
                        <span>👥 Followers</span>
                        <label class="joyful-player-switch">
                            <input type="checkbox" id="joyful-social-followers-toggle" checked>
                            <span class="joyful-player-slider"></span>
                        </label>
                    </div>
                    <div class="joyful-social-sub-row">
                        <span>👤 Following</span>
                        <label class="joyful-player-switch">
                            <input type="checkbox" id="joyful-social-following-toggle" checked>
                            <span class="joyful-player-slider"></span>
                        </label>
                    </div>
                    <div class="joyful-social-sub-row" style="border-top:1px solid #2a2d35">
                        <span>👥 Groups</span>
                        <label class="joyful-player-switch">
                            <input type="checkbox" id="joyful-profilestats-groups-toggle" checked>
                            <span class="joyful-player-slider"></span>
                        </label>
                    </div>
                    <div class="joyful-social-sub-row">
                        <span>👑 Groups Owned</span>
                        <label class="joyful-player-switch">
                            <input type="checkbox" id="joyful-profilestats-ownedgroups-toggle" checked>
                            <span class="joyful-player-slider"></span>
                        </label>
                    </div>
                    <div class="joyful-social-sub-row">
                        <span>📅 Account Age</span>
                        <label class="joyful-player-switch">
                            <input type="checkbox" id="joyful-profilestats-accountage-toggle" checked>
                            <span class="joyful-player-slider"></span>
                        </label>
                    </div>
                    <div class="joyful-social-sub-row">
                        <span>🔌 RoPro Tier</span>
                        <label class="joyful-player-switch">
                            <input type="checkbox" id="joyful-profilestats-ropro-toggle" checked>
                            <span class="joyful-player-slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- Description (About Me) -->
            <div class="joyful-player-setting">
                <div class="joyful-player-setting-top">
                    <div class="joyful-player-setting-text">
                        <span>About Me Box</span>
                        <span class="joyful-player-setting-sub">About box overlay</span>
                    </div>
                    <label class="joyful-player-switch">
                        <input type="checkbox" id="joyful-description-toggle" checked>
                        <span class="joyful-player-slider"></span>
                    </label>
                </div>
            </div>

            <div class="joyful-player-footer">
                <span>v1.0.0</span>
            </div>

        </div>
    `;

    document.body.appendChild(toolbar);

    // ── Restore saved position ────────────────────────────────────────────────

    chrome.storage.local.get(["playerToolbarPosition"], (result) => {
        if (result.playerToolbarPosition) {
            toolbar.style.left  = result.playerToolbarPosition.left;
            toolbar.style.top   = result.playerToolbarPosition.top;
            toolbar.style.right = "auto";
        }
    });

    // ── Collapse ──────────────────────────────────────────────────────────────

    const header       = document.getElementById("joyful-player-toolbar-header");
    const collapseIcon = document.getElementById("joyful-player-collapse-icon");

    collapseIcon.onclick = (e) => {
        e.stopPropagation();
        toolbar.classList.toggle("collapsed");
        const isCollapsed = toolbar.classList.contains("collapsed");
        collapseIcon.textContent = isCollapsed ? "▼" : "▲";
        chrome.storage.local.set({ toolbarCollapsed: isCollapsed });
    };

    // Restore toolbar collapse state
    chrome.storage.local.get(["toolbarCollapsed"], (result) => {
        if (result.toolbarCollapsed) {
            toolbar.classList.add("collapsed");
            collapseIcon.textContent = "▼";
        }
    });

    // ── Toolbar drag ──────────────────────────────────────────────────────────

    let dragging = false, offsetX = 0, offsetY = 0;

    header.onmousedown = (e) => {
        if (e.target.id === "joyful-player-collapse-icon") return;
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
                playerToolbarPosition: {
                    left: toolbar.style.left,
                    top:  toolbar.style.top
                }
            });
        }
        dragging = false;
        header.style.cursor = "grab";
    });

    // ── Profile Stats toggle logic (merged with Social Counts) ──────────────

    const profileMasterToggle     = document.getElementById("joyful-profilestats-master-toggle");
    const friendsToggle           = document.getElementById("joyful-social-friends-toggle");
    const followersToggle         = document.getElementById("joyful-social-followers-toggle");
    const followingToggle         = document.getElementById("joyful-social-following-toggle");
    const profileGroupsToggle     = document.getElementById("joyful-profilestats-groups-toggle");
    const profileOwnedGroupToggle = document.getElementById("joyful-profilestats-ownedgroups-toggle");
    const profileAgeToggle        = document.getElementById("joyful-profilestats-accountage-toggle");
    const profileRoProToggle      = document.getElementById("joyful-profilestats-ropro-toggle");
    const profileExpandBtn        = document.getElementById("joyful-profilestats-expand-btn");
    const profileSubPanel         = document.getElementById("joyful-profilestats-subpanel");

    chrome.storage.local.get([
        "profileStatsEnabled", "profileStatsPrefs",
        "socialCountsEnabled", "socialCountsPrefs"
    ], (result) => {
        const statsOn  = result.profileStatsEnabled !== false;
        const socialOn = result.socialCountsEnabled  !== false;
        const masterOn = statsOn && socialOn;
        const sPrefs   = result.socialCountsPrefs  || {};
        const pPrefs   = result.profileStatsPrefs  || {};

        profileMasterToggle.checked     = masterOn;
        friendsToggle.checked           = sPrefs.friends   !== false;
        followersToggle.checked         = sPrefs.followers !== false;
        followingToggle.checked         = sPrefs.following !== false;
        profileGroupsToggle.checked     = pPrefs.groups      !== false;
        profileOwnedGroupToggle.checked = pPrefs.ownedGroups !== false;
        profileAgeToggle.checked        = pPrefs.accountAge  !== false;
        profileRoProToggle.checked      = pPrefs.roPro       !== false;

        profileSubPanel.classList.toggle("master-off", !masterOn);
    });

    profileMasterToggle.onchange = function () {
        const on = this.checked;
        chrome.storage.local.set({ profileStatsEnabled: on, socialCountsEnabled: on });
        profileSubPanel.classList.toggle("master-off", !on);
        applyProfileStatsVisibility();
        applySocialVisibility();
    };

    function saveSocialPrefsAndApply() {
        chrome.storage.local.set({
            socialCountsPrefs: {
                friends:   friendsToggle.checked,
                followers: followersToggle.checked,
                following: followingToggle.checked,
            }
        });
        applySocialVisibility();
    }

    function saveProfilePrefsAndApply() {
        chrome.storage.local.set({
            profileStatsPrefs: {
                groups:      profileGroupsToggle.checked,
                ownedGroups: profileOwnedGroupToggle.checked,
                accountAge:  profileAgeToggle.checked,
                roPro:       profileRoProToggle.checked,
            }
        });
        applyProfileStatsVisibility();
    }

    friendsToggle.onchange           = saveSocialPrefsAndApply;
    followersToggle.onchange         = saveSocialPrefsAndApply;
    followingToggle.onchange         = saveSocialPrefsAndApply;
    profileGroupsToggle.onchange     = saveProfilePrefsAndApply;
    profileOwnedGroupToggle.onchange = saveProfilePrefsAndApply;
    profileAgeToggle.onchange        = saveProfilePrefsAndApply;
    profileRoProToggle.onchange      = saveProfilePrefsAndApply;

    profileExpandBtn.onclick = () => {
        const isOpen = profileSubPanel.classList.toggle("open");
        profileExpandBtn.classList.toggle("open", isOpen);
    };

    // ── Simple feature toggles (save preference, apply on next page load) ────

    const featureToggles = [
        { id: "joyful-description-toggle", key: "descriptionEnabled" },
    ];

    const allKeys = featureToggles.map(t => t.key);
    chrome.storage.local.get(allKeys, (result) => {
        for (const { id, key } of featureToggles) {
            const toggle = document.getElementById(id);
            if (!toggle) continue;
            toggle.checked = result[key] !== false;
            toggle.onchange = function () {
                chrome.storage.local.set({ [key]: this.checked });
            };
        }
    });
}

// ── Wishlist "+" add card ─────────────────────────────────────────────────────
// Only shown when viewing your own profile (CannotTradeWithSelf).
// Clicking it enables "Only Show My Inventory" on the Trade Settings page.

async function injectWishlistAddCard(userId) {
    chrome.runtime.sendMessage({ type: "canTradeWith", userId }, async (result) => {
        if (chrome.runtime.lastError || !result?.success) return;
        if (result.data.mutualTradeEligibility !== "CannotTradeWithSelf") return;

        const wrapper = await waitFor(() => document.querySelector(".swiper-wrapper"), 8000);
        if (!wrapper) return;

        const style = document.createElement("style");
        style.textContent = `
            .joyful-wishlist-add .wishlist_slider_card_container {
                display: flex !important;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 158px;
                border: 2px dashed #3a3a3a !important;
                border-radius: 8px;
                color: #666;
                cursor: pointer;
                transition: border-color .15s ease, color .15s ease, background .15s ease;
                background: transparent;
                padding: 12px 6px;
                box-sizing: border-box;
                text-align: center;
            }
            .joyful-wishlist-add:hover .wishlist_slider_card_container {
                border-color: #5b5fff !important;
                color: #bbb;
                background: rgba(91,95,255,0.05);
            }
            .joyful-wishlist-add-icon {
                font-size: 26px;
                line-height: 1;
                margin-bottom: 8px;
            }
            .joyful-wishlist-add-label {
                font-size: 10px;
                line-height: 1.35;
                color: inherit;
            }
        `;
        document.head.appendChild(style);

        const card = document.createElement("div");
        card.className = "wishlist_slider_card swiper-slide shift_up_sm joyful-wishlist-add";
        card.style.cssText = "width: 112.222px; margin-right: 12px;";

        card.innerHTML = `
            <div class="wishlist_slider_card_container shadow_sm_25">
                <div class="joyful-wishlist-add-icon">+</div>
                <div class="joyful-wishlist-add-label">Only show<br>my inventory</div>
            </div>
        `;

        card.addEventListener("click", () => {
            chrome.storage.local.set({ pendingEnableHideUnowned: true }, () => {
                location.href = "https://www.rolimons.com/tradesettings";
            });
        });

        wrapper.appendChild(card);
    });
}

// ── Relationship indicator ────────────────────────────────────────────────────

async function injectRelationship(userId) {
    const statsBar = await waitFor(() =>
        document.querySelector('.px-3.py-2.d-flex.justify-content-around.shadow.text-truncate')
    );
    if (!statsBar) return;

    chrome.runtime.sendMessage({ type: "robloxRelationship", userId }, (result) => {
        if (chrome.runtime.lastError || !result?.success || !result.data) return;

        const relationship = result.data;

        const colors = {
            "Your Friend":      "#4fc3f7",
            "Mutual Follower":  "#ab47bc",
            "Your Follower":    "#66bb6a",
            "You're Following": "#ffa726"
        };

        const container = document.createElement("div");
        container.className = "my-auto text-center roli-relationship-container";

        container.innerHTML = `
            <h6 class="card-subtitle mt-0 text-muted text-nowrap stat-header">Your Relation</h6>
            <span class="card-title position-relative mb-1 stat-data text-nowrap"
                  style="color: ${colors[relationship] || "#dee2e6"}">${relationship}</span>
        `;

        const locationDiv = statsBar.querySelector('.last-location-container');
        if (locationDiv) {
            statsBar.insertBefore(container, locationDiv);
        } else {
            statsBar.appendChild(container);
        }
    });
}

// ── Trade Calc button ────────────────────────────────────────────────────────

async function injectTradeCalcButton(userId) {
    const btnWrap = await waitFor(() => {
        const links = document.querySelectorAll('a.btn[href*="/playertrades/"]');
        for (const link of links) {
            const parent = link.parentElement;
            if (parent && parent.classList.contains("flex-wrap")) return parent;
        }
        return null;
    });
    if (!btnWrap) return;

    const username = document.querySelector("h1.page_title")?.childNodes[0]?.textContent?.trim();
    if (!username) return;

    const calcBtn = document.createElement("a");
    calcBtn.className = "btn btn-flat-light-blue-sm rounded-pill mt-2 mt-sm-1 mr-2 d-flex roli-tradecalc-btn";
    calcBtn.role = "button";
    calcBtn.style.maxHeight = "32px";
    calcBtn.style.cursor = "pointer";
    calcBtn.innerHTML = `
        <div class="button_icon_svg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-6 14H8v-2h5v2zm3-4H8v-2h8v2zm0-4H8V7h8v2z"/>
            </svg>
        </div>
        <div>Trade Calc</div>
    `;

    calcBtn.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.storage.local.set({ tradeCalcUsername: username }, () => {
            location.href = "https://www.rolimons.com/tradecalculator";
        });
    });

    btnWrap.insertBefore(calcBtn, btnWrap.firstChild);
}

// ── Rare serial stars ────────────────────────────────────────────────────────

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

function markRareSerials() {
    const style = document.createElement("style");
    style.textContent = `
        .item_card_img_container {
            position: relative;
        }
        .rolijoy-rare-star {
            position: absolute;
            top: 4px;
            left: 4px;
            width: 16px;
            height: 16px;
            font-size: 16px;
            line-height: 1;
            z-index: 5;
            filter: drop-shadow(0 0 3px rgba(255, 215, 0, 0.7));
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);

    function scanCards(root) {
        const cards = (root || document).querySelectorAll(".mix_item");
        for (const card of cards) {
            const imgContainer = card.querySelector(".item_card_img_container");
            if (!imgContainer) continue;

            const existingStar = imgContainer.querySelector(".rolijoy-rare-star");
            if (existingStar) continue;

            const serialSpan = card.querySelector(".text-warning.text-truncate");
            if (!serialSpan) continue;

            const m = serialSpan.textContent.match(/#(\d+)/);
            if (!m) continue;

            if (!RARE_SERIALS.isRare(parseInt(m[1], 10))) continue;

            const star = document.createElement("span");
            star.className = "rolijoy-rare-star";
            star.setAttribute("aria-hidden", "true");
            star.textContent = "⭐";
            imgContainer.appendChild(star);
        }
    }

    let scanning = false;
    let pendingScan = false;

    function rescanAll() {
        if (scanning) { pendingScan = true; return; }
        scanning = true;
        observer.disconnect();
        scanCards(document);
        setTimeout(() => {
            attachObserver();
            scanning = false;
            if (pendingScan) { pendingScan = false; rescanAll(); }
        }, 0);
    }

    setTimeout(rescanAll, 1500);

    const observer = new MutationObserver((mutations) => {
        for (const mut of mutations) {
            for (const node of mut.addedNodes) {
                if (node.nodeType === 1 && !node.classList?.contains("rolijoy-rare-star")) {
                    rescanAll();
                    return;
                }
            }
        }
    });

    function attachObserver() {
        const container = document.getElementById("inventory_items_container")
            || document.querySelector(".inventory_items_container");
        if (container) {
            observer.observe(container, { childList: true, subtree: true });
        }
        return !!container;
    }

    if (!attachObserver()) {
        setTimeout(attachObserver, 3000);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function waitFor(fn, timeout = 5000, interval = 100) {
    return new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
            const result = fn();
            if (result) return resolve(result);
            if (Date.now() - start > timeout) return resolve(null);
            setTimeout(check, interval);
        };
        check();
    });
}