chrome.storage.local.get(["pendingEnableHideUnowned"], (result) => {
    if (!result.pendingEnableHideUnowned) return;

    chrome.storage.local.remove("pendingEnableHideUnowned");

    const tryEnable = () => {
        const sw = document.getElementById("hide-unowned-items-switch");
        if (!sw) { setTimeout(tryEnable, 250); return; }
        if (!sw.checked) sw.click();
    };
    setTimeout(tryEnable, 600);
});
