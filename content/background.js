console.log("[Rolijoy] Background loaded");

const CACHE_TIME = 12 * 60 * 60 * 1000; // 12 hours
const MAX_ACTIVE_REQUESTS = 5;

// ── Rate limit state ─────────────────────────────────────────────────────────

const BASE_DELAY    = 1000;  // ms between jobs normally
const MAX_DELAY     = 8000;  // ms ceiling when throttling
const JITTER_RANGE  = 250;   // ± ms of random jitter added to every delay

let currentDelay  = BASE_DELAY;  // dynamic, increases on 429, recovers on success
let activeRequests = 0;
let requestQueue   = [];
let pendingUsers   = new Map();

// ── Item details cache ────────────────────────────────────────────────────────

let itemDetailsCache     = null;
let itemDetailsFetchedAt = 0;
const ITEM_CACHE_TIME    = 60 * 60 * 1000; // 1 hour

// ── Collectible ID cache (permanent, never changes per asset) ────────────────

const collectibleIdMap = new Map();

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "playerInfo") {
        getPlayerInfo(request.userId, request.priority ?? 0)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, status: error.status ?? null }));
        return true;
    }

    if (request.type === "inventoryInfo") {
        getInventoryInfo(request.userId)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, status: error.status ?? null }));
        return true;
    }

    if (request.type === "thumbnailInfo") {
        fetchThumbnail(request.assetId)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, status: error.status ?? null }));
        return true;
    }

    if (request.type === "thumbnailBatch") {
        fetchThumbnailBatch(request.assetIds)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, status: error.status ?? null }));
        return true;
    }

    if (request.type === "itemDetails") {
        getItemDetails()
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, status: error.status ?? null }));
        return true;
    }

    if (request.type === "robloxUser") {
        fetchRobloxUser(request.userId)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, status: error.status ?? null }));
        return true;
    }

    if (request.type === "robloxSocial") {
        fetchRobloxSocial(request.userId)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, status: error.status ?? null }));
        return true;
    }

    if (request.type === "robloxProfileStats") {
        fetchRobloxProfileStats(request.userId)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, status: error.status ?? null }));
        return true;
    }

    if (request.type === "canTradeWith") {
        fetchCanTradeWith(request.userId)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({
                success: false,
                status: error.status ?? null,
                error: error.message
            }));
        return true;
    }
    if (request.type === "catalogItemSearch") {
        catalogItemSearch(request.keyword)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, status: error.status ?? null }));
        return true;
    }

    if (request.type === "routilityItem") {
        fetch(`https://routility.io/item/${request.itemId}/details`)
            .then(r => r.ok ? r.json() : Promise.reject({ status: r.status }))
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, status: error.status ?? null }));
        return true;
    }

    if (request.type === "roProInfo") {
        fetch(`https://api.ropro.io/getUserInfoTest.php?userid=${request.userId}&myid=1`)
            .then(r => r.ok ? r.json() : Promise.reject({ status: r.status }))
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, status: error.status ?? null }));
        return true;
    }

    if (request.type === "robloxRelationship") {
        (async () => {
            try {
                const authResp = await fetch("https://users.roblox.com/v1/users/authenticated", { credentials: "include" });
                if (!authResp.ok) return sendResponse({ success: true, data: null });
                const authData = await authResp.json();
                const myId = authData.id;
                if (!myId || String(myId) === String(request.userId)) {
                    return sendResponse({ success: true, data: null });
                }

                const targetId = request.userId;

                const [friendResp, followingResp, followerResp] = await Promise.all([
                    fetch(`https://friends.roblox.com/v1/users/${myId}/friends/statuses?userIds=${targetId}`, { credentials: "include" }),
                    fetch(`https://friends.roblox.com/v1/user/following-exists`, {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ targetUserIds: [Number(targetId)] })
                    }),
                    fetch(`https://friends.roblox.com/v1/user/following-exists`, {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ subjectUserIds: [Number(targetId)] })
                    })
                ]);

                let isFriend = false;
                if (friendResp.ok) {
                    const friendData = await friendResp.json();
                    const entry = friendData.data?.[0];
                    if (entry && entry.status === "Friends") isFriend = true;
                }

                let isFollowing = false;
                if (followingResp.ok) {
                    const followData = await followingResp.json();
                    const entry = followData.followings?.[0];
                    if (entry && entry.isFollowing) isFollowing = true;
                }

                let isFollower = false;
                if (followerResp.ok) {
                    const followerData = await followerResp.json();
                    const entry = followerData.followings?.[0];
                    if (entry && entry.isFollowing) isFollower = true;
                }

                let relationship = null;
                if (isFriend) relationship = "Your Friend";
                else if (isFollowing && isFollower) relationship = "Mutual Follower";
                else if (isFollower) relationship = "Your Follower";
                else if (isFollowing) relationship = "You're Following";

                sendResponse({ success: true, data: relationship });
            } catch (error) {
                sendResponse({ success: false, status: error.status ?? null });
            }
        })();
        return true;
    }

    if (request.type === "dealSerial") {
        (async () => {
            try {
                const cacheKey = `${request.itemType}_${request.id}`;

                let collectibleId = collectibleIdMap.get(cacheKey);
                if (!collectibleId) {
                    console.log(`[Rolijoy] Fetching collectible info for ${cacheKey}`);
                    const info = await fetchCollectibleInfo(request.itemType, request.id);
                    if (!info || !info.collectibleItemId) {
                        console.log(`[Rolijoy] No collectibleItemId for ${cacheKey}`);
                        return sendResponse({ success: true, data: null });
                    }
                    collectibleId = info.collectibleItemId;
                    collectibleIdMap.set(cacheKey, collectibleId);
                    console.log(`[Rolijoy] Cached collectibleId for ${cacheKey}: ${collectibleId}`);
                } else {
                    console.log(`[Rolijoy] Using cached collectibleId for ${cacheKey}`);
                }

                const resellers = await fetchResellers(collectibleId);
                if (!resellers.length) {
                    console.log(`[Rolijoy] No resellers for ${cacheKey}`);
                    return sendResponse({ success: true, data: null });
                }
                console.log(`[Rolijoy] Serial for ${cacheKey}: #${resellers[0].serialNumber}`);
                sendResponse({ success: true, data: resellers[0] });
            } catch (error) {
                console.log(`[Rolijoy] dealSerial error for ${request.itemType}_${request.id}:`, error.message);
                sendResponse({ success: false, status: error.status ?? null });
            }
        })();
        return true;
    }
});

// ── Player info ──────────────────────────────────────────────────────────────

async function getPlayerInfo(userId, priority = 0) {
    const cached = await getCache("player_" + userId);
    if (cached) return cached;

    if (pendingUsers.has(userId)) {
        return pendingUsers.get(userId);
    }

    const promise = new Promise((resolve, reject) => {
        const job = { userId, priority, resolve, reject };
        const index = requestQueue.findIndex(j => j.priority < priority);
        if (index === -1) {
            requestQueue.push(job);
        } else {
            requestQueue.splice(index, 0, job);
        }
        processQueue();
    });

    pendingUsers.set(userId, promise);

    try {
        const result = await promise;
        pendingUsers.delete(userId);
        return result;
    } catch (error) {
        pendingUsers.delete(userId);
        throw error;
    }
}

// ── Queue processor ──────────────────────────────────────────────────────────

async function processQueue() {
    while (activeRequests < MAX_ACTIVE_REQUESTS && requestQueue.length > 0) {
        const job = requestQueue.shift();
        activeRequests++;

        fetchPlayerWithRetry(job.userId)
            .then(async data => {
                await saveCache("player_" + job.userId, data);
                currentDelay = Math.max(BASE_DELAY, currentDelay - 200);
                job.resolve(data);
            })
            .catch(error => {
                job.reject(error);
            })
            .finally(() => {
                activeRequests--;
                const jitter = Math.random() * JITTER_RANGE - JITTER_RANGE / 2;
                setTimeout(processQueue, currentDelay + jitter);
            });
    }
}

// ── Fetch player with single retry on 429 ────────────────────────────────────

async function fetchPlayerWithRetry(userId) {
    try {
        return await fetchPlayer(userId);
    } catch (err) {
        if (err.status === 429) {
            currentDelay = Math.min(MAX_DELAY, currentDelay * 2);
            console.log(`[RoliCalc] 429 hit — backing off to ${currentDelay}ms, retrying ${userId} once`);
            await sleep(currentDelay);
            return await fetchPlayer(userId);
        }
        throw err;
    }
}

async function fetchPlayer(userId) {
    const response = await fetch(
        `https://api.rolimons.com/players/v1/playerinfo/${userId}`
    );
    const text = await response.text();
    if (!response.ok) {
        const err = new Error(text);
        err.status = response.status;
        throw err;
    }
    const json = JSON.parse(text);
    if (!json.success) {
        const err = new Error("API returned false");
        err.status = 200;
        throw err;
    }
    return json;
}

// ── Inventory info ────────────────────────────────────────────────────────────

async function getInventoryInfo(userId) {
    const cacheKey = "inventory_" + userId;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    const data = await fetchInventory(userId);
    await saveCache(cacheKey, data);
    return data;
}

async function fetchInventory(userId) {
    let cursor = "";
    let allItems = [];
    const limit = 100;

    do {
        const url =
            `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles` +
            `?limit=${limit}&sortOrder=Desc` +
            (cursor ? `&cursor=${cursor}` : "");

        const response = await fetch(url);

        if (!response.ok) {
            const err = new Error("Inventory fetch failed");
            err.status = response.status;
            throw err;
        }

        const json = await response.json();
        allItems = allItems.concat(json.data || []);
        cursor = json.nextPageCursor || "";

        if (allItems.length >= 1000) break;

    } while (cursor);

    const grouped = new Map();
    for (const item of allItems) {
        const id = item.assetId;
        if (!grouped.has(id)) {
            grouped.set(id, {
                assetId:      id,
                name:         item.name,
                rap:          item.recentAveragePrice ?? 0,
                copies:       0,
                onHold:       0,
                userAssetIds: [],
                serials:      []
            });
        }
        const entry = grouped.get(id);
        entry.copies++;
        entry.userAssetIds.push(item.userAssetId);
        if (item.serialNumber != null) entry.serials.push(item.serialNumber);
        if (item.isOnHold) entry.onHold++;
        if ((item.recentAveragePrice ?? 0) > entry.rap) {
            entry.rap = item.recentAveragePrice;
        }
    }

    const sorted = [...grouped.values()].sort((a, b) => b.rap - a.rap);

    return {
        total: allItems.length,
        items: sorted
    };
}

// ── Thumbnail info ────────────────────────────────────────────────────────────

async function fetchThumbnail(assetId) {
    const url =
        `https://thumbnails.roblox.com/v1/assets` +
        `?assetIds=${assetId}&size=110x110&format=Png&isCircular=false`;

    const response = await fetch(url);

    if (!response.ok) {
        const err = new Error("Thumbnail fetch failed");
        err.status = response.status;
        throw err;
    }

    return await response.json();
}

// ── Thumbnail batch (up to 100 IDs in one request) ───────────────────────────

async function fetchThumbnailBatch(assetIds) {
    if (!assetIds || !assetIds.length) return [];

    // Roblox thumbnail API accepts up to 100 IDs per call
    const ids = assetIds.slice(0, 100).join(',');
    const url =
        `https://thumbnails.roblox.com/v1/assets` +
        `?assetIds=${ids}&size=110x110&format=Png&isCircular=false`;

    const response = await fetch(url);

    if (!response.ok) {
        const err = new Error("Thumbnail batch fetch failed");
        err.status = response.status;
        throw err;
    }

    const json = await response.json();
    return json.data || [];
}

// ── Item details ──────────────────────────────────────────────────────────────

async function getItemDetails() {
    if (itemDetailsCache && Date.now() - itemDetailsFetchedAt < ITEM_CACHE_TIME) {
        return itemDetailsCache;
    }

    const response = await fetch("https://api.rolimons.com/items/v3/itemdetails");

    if (!response.ok) {
        const err = new Error("Item details fetch failed");
        err.status = response.status;
        throw err;
    }

    const json = await response.json();
    itemDetailsCache     = json.assets; // { "itemId": [name, acronym, rap, value, default_value, demand, trend, projected, rare] }
    itemDetailsFetchedAt = Date.now();
    return itemDetailsCache;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

async function getCache(key) {
    const result = await chrome.storage.local.get(key);
    if (!result[key]) return null;
    const entry = result[key];
    if (Date.now() - entry.time > CACHE_TIME) {
        await chrome.storage.local.remove(key);
        return null;
    }
    return entry.data;
}

async function saveCache(key, data) {
    await chrome.storage.local.set({
        [key]: { time: Date.now(), data }
    });
}

// ── Roblox user info ──────────────────────────────────────────────────────────

async function fetchRobloxUser(userId) {
    const cacheKey = "robloxuser_" + userId;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);

    if (!response.ok) {
        const err = new Error("Roblox user fetch failed");
        err.status = response.status;
        throw err;
    }

    const json = await response.json();
    await saveCache(cacheKey, json);
    return json;
}

// ── Roblox social counts ──────────────────────────────────────────────────────

async function fetchRobloxSocial(userId) {
    const cacheKey = "robloxsocial_" + userId;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    const [friends, followers, followings] = await Promise.all([
        fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`).then(r => r.json()),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`).then(r => r.json()),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`).then(r => r.json()),
    ]);

    const data = {
        friends:   friends.count   ?? 0,
        followers: followers.count ?? 0,
        following: followings.count ?? 0,
    };

    await saveCache(cacheKey, data);
    return data;
}

// ── Roblox profile stats ──────────────────────────────────────────────────────

async function fetchRobloxProfileStats(userId) {

    const cacheKey = "robloxprofilestats_" + userId;
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    const [groupsJson, userJson] = await Promise.all([
        fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`).then(r => r.json()),
        fetch(`https://users.roblox.com/v1/users/${userId}`).then(r => r.json())
    ]);

    const groups = groupsJson.data ?? [];

    const ownedGroups = groups.filter(g =>
        g.group.owner &&
        String(g.group.owner.userId ?? g.group.owner.id) === String(userId)
    ).length;

    const totalDays = Math.floor(
        (Date.now() - new Date(userJson.created)) / 86400000
    );

    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    const days = (totalDays % 365) % 30;

    const accountAge = `${years}y ${months}m ${days}d`;

    const data = {
        groups: groups.length,
        ownedGroups,
        accountAge
    };

    await saveCache(cacheKey, data);

    return data;
}

// ── Roblox trade availability ──────────────────────────────────────────────────────

async function fetchCanTradeWith(userId) {
    console.log("fetchCanTradeWith called for", userId);
    const response = await fetch(
        `https://trades.roblox.com/v2/users/${userId}/can-trade-with`,
        {
            credentials: "include"
        }
    );

    console.log("Status:", response.status);

    const text = await response.text();
    console.log("Body:", text);

    if (!response.ok) {
        const err = new Error(text);
        err.status = response.status;
        throw err;
    }

    return JSON.parse(text);
}


async function catalogItemSearch(keyword) {
    const url = `https://catalog.roblox.com/v2/search/items/details` +
                `?Keyword=${encodeURIComponent(keyword)}&limit=30`;
    const res = await fetch(url);
    if (!res.ok) {
        const err = new Error("Catalog search failed");
        err.status = res.status;
        throw err;
    }
    const json = await res.json();
    return json.data || [];
}

// ── Resellers (via collectibleItemId) ─────────────────────────────────────────

async function fetchResellers(collectibleItemId) {
    const url =
        `https://apis.roblox.com/marketplace-sales/v1/item/${collectibleItemId}/resellers?limit=1`;

    const response = await fetch(url);

    if (!response.ok) {
        const err = new Error("Resellers fetch failed");
        err.status = response.status;
        throw err;
    }

    const json = await response.json();
    return json.data || [];
}

// ── Collectible item info lookup ─────────────────────────────────────────────

async function fetchCollectibleInfo(type, id) {
    if (type === "catalog") {
        const url = `https://economy.roblox.com/v2/assets/${id}/details`;
        const response = await fetch(url);
        if (!response.ok) {
            const err = new Error("Asset details fetch failed");
            err.status = response.status;
            throw err;
        }
        const json = await response.json();
        return {
            collectibleItemId: json.CollectibleItemId || null,
            isLimitedUnique: json.IsLimitedUnique === true
        };
    } else {
        const url = `https://catalog.roblox.com/v1/bundles/${id}/details`;
        const response = await fetch(url);
        if (!response.ok) {
            const err = new Error("Bundle details fetch failed");
            err.status = response.status;
            throw err;
        }
        const json = await response.json();
        // Bundles with collectibleItemId are always serialized
        const cid = json.collectibleItemId || null;
        return {
            collectibleItemId: cid,
            isLimitedUnique: cid !== null
        };
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}