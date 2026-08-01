chrome.storage.local.get(["tradeCalcUsername"], (result) => {
    if (!result.tradeCalcUsername) return;

    const username = result.tradeCalcUsername;
    chrome.storage.local.remove("tradeCalcUsername");

    const tryFill = () => {
        const select = document.getElementById("inventory-source-select");
        if (!select) return setTimeout(tryFill, 300);

        select.value = "other";
        select.dispatchEvent(new Event("change", { bubbles: true }));

        setTimeout(() => {
            const input = document.getElementById("hide-player-items-username");
            if (!input) return;

            input.value = username;
            input.dispatchEvent(new Event("input", { bubbles: true }));

            const scanBtn = document.getElementById("hide-player-items-scan");
            if (scanBtn) scanBtn.click();
        }, 300);
    };

    setTimeout(tryFill, 500);
});
