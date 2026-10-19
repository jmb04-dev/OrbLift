"use strict";
// Install ui behavior on a single game instance.
OrbLift.installUi = function (game) {
  const { document } = game.environment;
  const state = game.state;
  const { $ } = game;
  const { safeStorage } = game.storage;
  const { tiers, skins, backgrounds } = OrbLift.content;
  // Avoid relayout, accessible live-region churn and DOM mutations when a HUD
  // label has not actually changed. Nodes themselves are cached by core.
  game.setText = (id, value) => {
    const node = $(id),
      text = String(value);
    if (node.textContent !== text) node.textContent = text;
  };
  const styles = new WeakMap();
  game.setStyle = (id, property, value) => {
    const node = $(id);
    if (!styles.has(node)) styles.set(node, new Map());
    const cache = styles.get(node),
      key = String(value);
    // Browsers normalize CSS colors/numbers on readback; cache requested values.
    if (cache.get(property) !== key) {
      node.style[property] = value;
      cache.set(property, key);
    }
  };
  game.setAttribute = (id, name, value) => {
    const node = $(id),
      text = String(value);
    if (node.getAttribute(name) !== text) node.setAttribute(name, text);
  };
  game.selectShopTab = function selectShopTab(tab) {
    if (!["skins", "backgrounds"].includes(tab)) return;
    state.shopTab = tab;
    for (const [name, button, panel] of [
      ["skins", "shopSkinTab", "skinsPanel"],
      ["backgrounds", "shopBackgroundTab", "backgroundsPanel"],
    ]) {
      const active = tab === name;
      $(button).setAttribute("aria-selected", String(active));
      $(button).tabIndex = active ? 0 : -1;
      $(panel).style.display = active ? "block" : "none";
    }
  };
  game.updateMagnetHUD = function updateMagnetHUD() {
    game.setStyle(
      "magnetHUD",
      "display",
      state.mode === "play" && state.magnet > 0 ? "flex" : "none",
    );
    game.setText("magnetTimer", Math.ceil(state.magnet) + "s");
  };
  game.updateShieldHUD = () =>
    game.setText(
      "shield",
      state.mode === "play" && state.shield > 0
        ? "SHIELD " + Math.ceil(state.shield) + "s"
        : "",
    );
  game.updateReviveCountdown = function updateReviveCountdown() {
    game.setStyle(
      "reviveCountdown",
      "display",
      state.mode === "countdown" ? "flex" : "none",
    );
    const label = String(Math.ceil(state.reviveCountdown));
    if ($("reviveCountdownValue").textContent !== label) {
      $("reviveCountdownValue").textContent = label;
    }
  };
  game.updateMenuBack = function updateMenuBack() {
    $("menuCard").scrollTop = 0;
    const submenu =
      $("shopArea").style.display === "block" ||
      $("statsArea").style.display === "block";
    $("menuNav").style.display =
      submenu || state.mode === "paused" || state.mode === "over"
        ? "flex"
        : "none";
    $("menuBack").textContent = submenu
      ? "← BACK"
      : state.mode === "paused"
        ? "← RESUME RUN"
        : "← MAIN MENU";
    game.updateWallet();
  };
  game.updateWallet = () => {
    game.setText("bank",state.bank);
    game.setText("menuWallet","● " + state.bank.toLocaleString());
  };
  game.openMenu = function openMenu(menu) {
    $("homeArea").style.display = "none";
    $("mainActions").style.display = "none";
    $("menuFooter").style.display = "none";
    $("reviveArea").style.display = "none";
    $("shopArea").style.display = menu === "shop" ? "block" : "none";
    $("statsArea").style.display = menu === "stats" ? "block" : "none";
  };
  // Refresh the entire offer after shopping, so the affordability copy stays current.
  game.renderRevive = function renderRevive() {
    $("reviveArea").style.display = state.mode === "over" ? "block" : "none";
    if (state.mode !== "over") return;
    const price = game.reviveCost();
    $("revive").textContent = "REVIVE · ● " + price;
    $("revive").disabled = state.bank < price || state.revives >= 3;
    $("reviveText").textContent =
      state.revives >= 3
        ? "Maximum 3 revives per run."
        : state.bank < price
          ? "Need " + (price - state.bank) + " more coins to revive."
          : "Continue from " +
            Math.floor(state.distance).toLocaleString() +
            " m after a 3-second countdown, with a 3-second safety shield?";
  };
  game.updateRank = function updateRank() {
    const r = game.rank(),
      b = $("rankBadge");
    b.innerHTML =
      '<img class="rank-mini" src="badges/' +
      r.name.toLowerCase() +
      '.png" alt="">' +
      r.name.toUpperCase();
    b.style.color = r.color;
    b.style.borderColor = r.color;
    b.style.backgroundColor = r.color + "22";
  };
  game.renderStats = function renderStats() {
    const r = game.rank(),
      i = tiers.indexOf(r),
      next = tiers[i + 1],
      fmt = (n) => Math.floor(n).toLocaleString();
    $("statsRank").innerHTML =
      '<div style="--rank:' +
      r.color +
      '"><div class="rank-emblem">' +
      '<img src="badges/' +
      r.name.toLowerCase() +
      '.png" alt="Rank badge" style="width:70px;height:70px;object-fit:contain">' +
      '</div><div class="rank-name">' +
      r.name.toUpperCase() +
      '</div><div class="rank-sub">TIER ' +
      String(i + 1).padStart(2, "0") +
      " / 10 · LIFETIME RANK</div></div>";
    $("rankGallery").innerHTML = tiers
      .map(
        (t, j) =>
          '<div class="rank-gallery-item" style="border-color:' +
          t.color +
          "66;opacity:" +
          (state.career.totalDistance >= t.min ? "1" : ".52") +
          '"><img src="badges/' +
          t.name.toLowerCase() +
          '.png" alt="' +
          t.name +
          '"><strong style="color:' +
          t.color +
          '">' +
          t.name +
          "</strong><small>" +
          t.min.toLocaleString() +
          " m " +
          (state.career.totalDistance >= t.min ? "· UNLOCKED" : "· LOCKED") +
          "</small></div>",
      )
      .join("");
    $("statsFill").style.width = next
      ? Math.min(
          100,
          (100 * (state.career.totalDistance - r.min)) / (next.min - r.min),
        ) + "%"
      : "100%";
    $("statsNext").innerHTML = next
      ? "<span>" +
        fmt(state.career.totalDistance) +
        " / " +
        fmt(next.min) +
        " m</span><span>" +
        fmt(Math.max(0, next.min - state.career.totalDistance)) +
        " m to " +
        next.name +
        "</span>"
      : "<span>MAXIMUM RANK UNLOCKED</span><span>∞</span>";
    const stats = [
      [
        "Total distance",
        fmt(state.career.totalDistance) + " m",
        "↗",
        "#ff73c8",
      ],
      [
        "Average distance",
        fmt(
          state.career.gamesPlayed
            ? state.career.totalDistance / state.career.gamesPlayed
            : 0,
        ) + " m",
        "≈",
        "#78e7ff",
      ],
      ["Games played", fmt(state.career.gamesPlayed), "◈", "#b19bff"],
      ["Best distance", fmt(state.best) + " m", "★", "#ffd96d"],
      [
        "Total coins earned",
        fmt(state.career.totalCoinsEarned),
        "◉",
        "#ffda69",
      ],
      ["Coins spent", fmt(state.career.totalCoinsSpent), "✧", "#f4a0ff"],
      ["Current balance", fmt(state.bank), "●", "#ffda69"],
      [
        "Skins owned",
        state.owned.length + " / " + skins.length,
        "✦",
        "#ff70b6",
      ],
      [
        "Backgrounds owned",
        state.ownedBackgrounds.length + " / " + backgrounds.length,
        "☄",
        "#7aeaff",
      ],
    ];
    $("statsGrid").innerHTML = stats
      .map(
        ([label, value, icon, color], i) =>
          '<div class="statbox' +
          (i === 8 ? " wide" : "") +
          '" style="--tile:' +
          color +
          '"><span class="stat-icon">' +
          icon +
          "</span><strong>" +
          value +
          "</strong><span>" +
          label +
          "</span></div>",
      )
      .join("");
  };
  game.updateMultiplierHUD = function updateMultiplierHUD(
    includeCosmic = true,
  ) {
    if (includeCosmic) game.updateCosmicHUD?.();
    game.updateMagnetHUD();
    game.updateShieldHUD();
    const active =
      state.mode === "play" && state.coinBoost > 0 && state.coinMultiplier > 1;
    game.setText(
      "coinRate",
      (state.coinBoost > 0 ? state.coinMultiplier : 1).toLocaleString() + "×",
    );
    game.setStyle("multiplierBanner", "display", active ? "block" : "none");
    if (active) {
      game.setText(
        "multiplierValue",
        state.coinMultiplier.toLocaleString() + "×",
      );
      game.setText("multiplierTimer", Math.ceil(state.coinBoost) + "s LEFT");
    }
  };
  game.showMain = function showMain() {
    $("homeArea").style.display = "block";
    $("menuFooter").style.display = "block";
    $("summary").textContent = "● " + state.bank + " total coins saved";
    $("statsArea").style.display = "none";
    $("shopArea").style.display = "none";
    $("mainActions").style.display = "block";
    $("reviveArea").style.display = "none";
    game.updateMenuBack();
  };
  game.renderShop = function renderShop() {
    game.updateWallet();
    game.selectShopTab(state.shopTab);
    $("bank").textContent = state.bank;
    $("summary").textContent = "● " + state.bank + " total coins saved";
    $("shopGrid").innerHTML = "";
    for (const item of skins) {
      const b = document.createElement("button");
      b.className = "shopitem";
      const has = state.owned.includes(item.id);
      b.innerHTML =
        '<span style="color:' +
        item.color +
        ";font-size:26px;text-shadow:0 0 14px " +
        item.color +
        '">●</span><br>' +
        item.name +
        '<span class="price">' +
        (state.skin === item.id
          ? "EQUIPPED"
          : has
            ? "EQUIP"
            : "● " + item.cost) +
        "</span>";
      b.disabled = state.skin === item.id || (!has && state.bank < item.cost);
      b.onclick = () => {
        if (!state.owned.includes(item.id)) {
          if (!game.spendCoins(item.cost)) return;
          state.owned.push(item.id);
          safeStorage.setItem("neonRushBank", state.bank);
          safeStorage.setItem("neonRushOwned", JSON.stringify(state.owned));
        }
        state.skin = item.id;
        safeStorage.setItem("neonRushSkin", state.skin);
        game.renderShop();
      };
      $("shopGrid").appendChild(b);
    }
    $("backgroundGrid").innerHTML = "";
    for (const item of backgrounds) {
      const b = document.createElement("button");
      b.className = "shopitem";
      const has = state.ownedBackgrounds.includes(item.id);
      b.innerHTML =
        '<span class="background-swatch" data-scene="' +
        item.id +
        '" style="display:block;margin:0 auto 7px;width:75%;height:32px;border:1px solid ' +
        item.accent +
        ";border-radius:6px;background:linear-gradient(135deg," +
        item.base +
        " 40%," +
        item.accent +
        " 180%);box-shadow:inset 0 0 16px " +
        item.accent +
        '44"></span>' +
        item.name +
        '<small class="shop-description">' +
        game.backgroundDescriptions[item.id] +
        "</small>" +
        '<span class="price">' +
        (state.background === item.id
          ? "EQUIPPED"
          : has
            ? "EQUIP"
            : "● " + item.cost) +
        "</span>";
      b.disabled =
        state.background === item.id || (!has && state.bank < item.cost);
      b.onclick = () => {
        if (!state.ownedBackgrounds.includes(item.id)) {
          if (!game.spendCoins(item.cost)) return;
          state.ownedBackgrounds.push(item.id);
          safeStorage.setItem("neonRushBank", state.bank);
          safeStorage.setItem(
            "neonRushOwnedBackgrounds",
            JSON.stringify(state.ownedBackgrounds),
          );
        }
        state.background = item.id;
        safeStorage.setItem("neonRushBackground", state.background);
        game.renderShop();
      };
      $("backgroundGrid").appendChild(b);
    }
  };
};
