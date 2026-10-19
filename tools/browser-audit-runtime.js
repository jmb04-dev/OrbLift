// Runs only inside the generated, sandboxed browser QA document.
addEventListener("message", async (event) => {
  if (event.data !== "run-audit") return;
  const report = {
    environment: navigator.userAgent,
    viewport: [innerWidth, innerHeight, devicePixelRatio],
    passed: [],
    errors: [],
  };
  const check = (condition, label) => {
    if (!condition) throw Error(label);
    report.passed.push(label);
  };
  try {
    const game = qaGame;
    game.start();
    game.drawLaunch(1);
    game.state.invincible = 1000;
    check(game.state.mode === "play", "Launch completes");
    const capture = game.c.setPointerCapture;
    game.c.setPointerCapture = () => {}; // Synthetic PointerEvents cannot request native capture.
    for (const pointerType of ["mouse", "touch"]) {
      game.c.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 77,
          pointerType,
          button: 0,
          buttons: 1,
          clientX: 40,
        }),
      );
      game.c.dispatchEvent(
        new PointerEvent(
          "onpointerrawupdate" in game.c ? "pointerrawupdate" : "pointermove",
          { pointerId: 77, pointerType, buttons: 1, clientX: 280 },
        ),
      );
      check(
        game.state.ball.x === 280,
        pointerType + " tracks directly in browser",
      );
      game.c.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: 77,
          pointerType,
          clientX: 280,
        }),
      );
    }
    game.c.setPointerCapture = capture;
    game.toggle();
    document.getElementById("openShop").click();
    check(
      document.getElementById("shopArea").style.display === "block",
      "Shop opens",
    );
    for (const [items, id] of [
      [OrbLift.content.skins, "shopGrid"],
      [OrbLift.content.backgrounds, "backgroundGrid"],
    ]) {
      for (let index = 0; index < items.length; index++)
        document.getElementById(id).children[index].click();
    }
    check(
      game.state.owned.length === 14 &&
        game.state.ownedBackgrounds.length === 12,
      "All purchases/equipment persist",
    );
    document.getElementById("shopBackgroundTab").click();
    check(
      document.getElementById("backgroundsPanel").style.display === "block",
      "Background tab opens",
    );
    document.getElementById("menuCard").scrollTop = 500;
    check(
      document.getElementById("menuNav").getBoundingClientRect().top >= 0,
      "Back navigation remains accessible",
    );
    document.getElementById("menuBack").click();
    document.getElementById("openStats").click();
    check(
      document.querySelectorAll("#rankGallery img").length === 10,
      "All rank badges render",
    );
    document.getElementById("menuBack").click();
    game.toggle();
    game.state.distance = 110000;
    game.syncZoneMilestones();
    const reward = game.totalMilestoneRewards(game.zoneAt().index);
    check(game.state.runCoins === reward, "110,000m zone rewards are correct");
    game.syncZoneMilestones();
    check(game.state.runCoins === reward, "Milestones cannot pay twice");
    const collect = (kind, value) => {
      game.state.objects = [
        {
          kind,
          value,
          x: game.state.ball.x,
          y: game.state.ball.y,
          r: 12,
          angle: 0,
          spin: 0,
        },
      ];
      game.update(0);
    };
    for (let index = 0; index < 5; index++) collect("multiplier");
    collect("magnet");
    const before = game.state.runCoins;
    collect("coin", 2);
    check(
      game.state.coinMultiplier === 32 &&
        game.state.magnet === 10 &&
        game.state.runCoins === before + 64,
      "Stacked multipliers, magnet and gold coin payout",
    );
    game.end();
    const bank = game.state.bank;
    for (const price of [100, 250, 600]) {
      document.getElementById("revive").click();
      check(game.state.mode === "countdown", "Revive countdown " + price);
      game.update(3);
      check(
        game.state.mode === "play" && game.state.invincible === 3,
        "Revive protection " + price,
      );
      collect("coin", 2);
      game.end();
    }
    check(
      game.state.bank === bank - 950 + 6 && game.state.career.gamesPlayed === 1,
      "Repeated revives settle only new earnings",
    );
    const savedBank = game.state.bank;
    game.destroy();
    globalThis.qaGame = OrbLift.createGame(globalThis);
    check(
      qaGame.state.bank === savedBank &&
        qaGame.state.owned.length === 14 &&
        qaGame.state.ownedBackgrounds.length === 12,
      "Reload retains wallet and all cosmetics",
    );
    const live = qaGame;
    live.start();
    live.drawLaunch(1);
    live.state.invincible = 10000;
    live.state.magnet = 10000;
    live.state.coinBoost = 10000;
    live.state.coinMultiplier = 32;
    const intervals = [],
      drawTimes = [];
    const draw = live.draw;
    live.draw = function (dt) {
      const start = performance.now();
      draw(dt);
      drawTimes.push(performance.now() - start);
    };
    const heapBefore = performance.memory?.usedJSHeapSize;
    let previous = 0,
      visible = true;
    for (let frame = 0; frame < 120; frame++) {
      const time = await new Promise(requestAnimationFrame);
      if (previous) intervals.push(time - previous);
      previous = time;
      visible &&= !document.hidden;
    }
    intervals.sort((a, b) => a - b);
    drawTimes.sort((a, b) => a - b);
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    report.benchmark = {
      frames: intervals.length,
      visibleThroughout: visible,
      meanFrameMs: mean,
      p95FrameMs: intervals[Math.floor(intervals.length * 0.95)],
      observedFps: 1000 / mean,
      p95DrawCpuMs: drawTimes[Math.floor(drawTimes.length * 0.95)],
      heapBefore,
      heapAfter: performance.memory?.usedJSHeapSize,
    };
    live.toggle();
    // Opaque sandbox frames cannot read sibling file URLs. Decode the exact
    // repository PNG bytes embedded by the generator instead.
    await Promise.all(
      [...document.querySelectorAll("img")].map((img) => {
        const source = img.getAttribute("src");
        if (qaBadges[source]) img.src = qaBadges[source];
        return img.decode().catch(() => {
          throw Error("Image failed: " + source);
        });
      }),
    );
    check(true, "Loaded badge images decode successfully");
  } catch (error) {
    report.errors.push(error.stack || String(error));
  }
  parent.postMessage({ type: "orblift-audit", report }, "*");
});
