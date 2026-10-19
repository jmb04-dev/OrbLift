"use strict";
OrbLift.installInput = function installInput(game) {
  const { environment, c, $, state } = game;
  const subscriptions = [];
  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    subscriptions.push(() =>
      target.removeEventListener(event, handler, options),
    );
  }
  function bind(id, handler) {
    $(id).onclick = handler;
    subscriptions.push(() => {
      $(id).onclick = null;
    });
  }
  listen(environment, "resize", () => {
    releasePointer({});
    game.resize();
  });
  let activePointer = null;
  const movementEvent =
    "onpointerrawupdate" in c ? "pointerrawupdate" : "pointermove";
  function trackPointer(event) {
    event.preventDefault?.();
    const rect = c.getBoundingClientRect?.();
    const samples = event.getCoalescedEvents?.() || [];
    for (const sample of [...samples, event]) {
      if (!["play", "countdown"].includes(state.mode)) break;
      const x = rect?.width
        ? ((sample.clientX - rect.left) * state.w) / rect.width
        : sample.clientX;
      game.steer(x);
    }
  }
  function releasePointer(event) {
    if (event.pointerId !== undefined && event.pointerId !== activePointer)
      return;
    const pointer = activePointer;
    activePointer = null;
    if (pointer !== null && c.hasPointerCapture?.(pointer))
      c.releasePointerCapture(pointer);
  }
  listen(
    c,
    "pointerdown",
    (event) => {
      if (!["play", "countdown"].includes(state.mode)) return;
      if (
        activePointer !== null ||
        event.isPrimary === false ||
        (event.button !== undefined && event.button !== 0)
      )
        return;
      activePointer = event.pointerId;
      c.setPointerCapture(event.pointerId);
      trackPointer(event);
    },
    { passive: false },
  );
  listen(
    c,
    movementEvent,
    (event) => {
      if (
        activePointer === null ||
        (event.pointerId !== undefined && event.pointerId !== activePointer)
      )
        return;
      if (event.pointerType === "mouse" && !event.buttons) {
        releasePointer(event);
        return;
      }
      if (["play", "countdown"].includes(state.mode)) trackPointer(event);
    },
    { passive: false },
  );
  listen(
    c,
    "pointerup",
    (event) => {
      if (
        event.pointerId === activePointer &&
        ["play", "countdown"].includes(state.mode)
      )
        trackPointer(event);
      releasePointer(event);
    },
    { passive: false },
  );
  listen(c, "pointercancel", releasePointer);
  listen(c, "lostpointercapture", releasePointer);
  listen(environment, "keydown", (event) => {
    if (
      ["shopSkinTab", "shopBackgroundTab"].includes(event.target?.id) &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    ) {
      event.preventDefault();
      const tab =
        event.key === "Home"
          ? "skins"
          : event.key === "End"
            ? "backgrounds"
            : state.shopTab === "skins"
              ? "backgrounds"
              : "skins";
      game.selectShopTab(tab);
      $(tab === "skins" ? "shopSkinTab" : "shopBackgroundTab").focus();
      return;
    }
    // Start/resume may leave focus on a now-hidden button. Steering still works.
    if (
      ["play", "countdown"].includes(state.mode) &&
      ["ArrowLeft", "ArrowRight"].includes(event.key)
    ) {
      event.preventDefault();
      game.steer(state.ball.target + (event.key === "ArrowLeft" ? -55 : 55));
      return;
    }
    if (event.target?.closest?.("button,input,select,textarea")) return;
    if (event.key === " ") {
      event.preventDefault();
      game.toggle();
    }
  });
  bind("pause", game.toggle);
  bind("start", () => (state.mode === "paused" ? game.toggle() : game.start()));
  bind("openStats", () => {
    game.openMenu("stats");
    game.renderStats();
    game.updateMenuBack();
  });
  bind("openShop", () => {
    game.openMenu("shop");
    game.renderShop();
    game.updateMenuBack();
  });
  function closeMenu() {
    game.showMain();
    game.renderRevive();
  }
  bind("shopSkinTab", () => game.selectShopTab("skins"));
  bind("shopBackgroundTab", () => game.selectShopTab("backgrounds"));
  bind("menuBack", () => {
    if (
      $("shopArea").style.display === "block" ||
      $("statsArea").style.display === "block"
    ) {
      closeMenu();
    } else if (state.mode === "paused") {
      game.toggle();
    } else if (state.mode === "over") {
      // This run was already settled; returning home never discards earned coins.
      state.mode = "menu";
      game.showMain();
      $("message").textContent =
        "Rise beyond the stars. Dodge cosmic barriers, collect coins, and climb farther with every run.";
      $("start").textContent = "START RUN →";
    }
  });
  bind("revive", () => {
    if (
      state.mode !== "over" ||
      state.revives >= 3 ||
      state.bank < game.reviveCost()
    )
      return;
    if (!game.spendCoins(game.reviveCost())) return;
    state.revives++;
    $("bank").textContent = state.bank;
    state.objects = state.objects.filter(
      (object) =>
        object.kind !== "barrier" || Math.abs(object.y - state.ball.y) > 210,
    );
    state.invincible = 3;
    state.shield = 0;
    state.reviveCountdown = OrbLift.balance.reviveCountdownSeconds;
    state.mode = "countdown";
    state.last = 0;
    game.updateReviveCountdown();
    $("panel").classList.add("hidden");
    $("pause").style.display = "block";
    $("pause").textContent = "Ⅱ";
  });
  listen(environment.document, "visibilitychange", () => {
    if (environment.document.hidden) releasePointer({});
    if (
      environment.document.hidden &&
      ["play", "launch", "countdown"].includes(state.mode)
    )
      game.toggle();
    state.last = 0;
  });
  listen(environment, "blur", () => {
    releasePointer({});
    if (["play", "launch", "countdown"].includes(state.mode)) game.toggle();
  });
  game.removeInput = () => {
    releasePointer({});
    subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
  };
};
