const ENDPOINT = "https://7tv.io/v4/gql";

const els = {
  pill: document.getElementById("pill"),
  pillText: document.getElementById("pillText"),
  chooseView: document.getElementById("chooseView"),
  openView: document.getElementById("openView"),
  openBtn: document.getElementById("openBtn"),
  backBtn: document.getElementById("backBtn"),
  reelShell: document.getElementById("reelShell"),
  reelTrack: document.getElementById("reelTrack"),
  invShell: document.querySelector(".invShell"),
  invList: document.getElementById("invList"),
  invCount: document.getElementById("invCount"),
  invFilter: document.getElementById("invFilter"),
  winModal: document.getElementById("winModal"),
  modalPaintName: document.getElementById("modalPaintName"),
  modalKv: document.getElementById("modalKv"),
  modalConfirmBtn: document.getElementById("modalConfirmBtn"),
  modalSellBtn: document.getElementById("modalSellBtn"),
  sellAllBtn: document.getElementById("sellAllBtn"),
  usernameInput: document.getElementById("usernameInput"),
  usernameToggle: document.getElementById("usernameToggle"),
  rarityFilter: document.getElementById("rarityFilter"),
  sortOrder: document.getElementById("sortOrder"),
  paintCaseTitle: document.getElementById("paintCaseTitle"),
  badgeCaseTitle: document.getElementById("badgeCaseTitle"),
  autospinToggle: document.getElementById("autospinToggle"),
};

const sounds = {
  tick: new Audio("https://raw.githubusercontent.com/msakarvadia/Clock/master/Tick.mp3"),
  win_blue: new Audio("https://github.com/sourcesounds/csgo/raw/refs/heads/master/sound/ui/panorama/case_awarded_0_common_01.wav"),
  win_purple: new Audio("https://github.com/sourcesounds/csgo/raw/refs/heads/master/sound/ui/panorama/case_awarded_1_uncommon_01.wav"),
  win_pink: new Audio("https://github.com/sourcesounds/csgo/raw/refs/heads/master/sound/ui/panorama/case_awarded_2_rare_01.wav"),
  win_red: new Audio("https://github.com/sourcesounds/csgo/raw/refs/heads/master/sound/ui/panorama/case_awarded_4_legendary_01.wav"),
  win_gold: new Audio("https://github.com/sourcesounds/csgo/raw/refs/heads/master/sound/ui/panorama/case_awarded_5_ancient_01.wav"),
  sell: new Audio("https://raw.githubusercontent.com/clairefro/blockify/master/cash_register.mp3"),
};

function playSound(name) {
  if (app.muted) return;
  const s = sounds[name];
  if (!s) return;
  s.currentTime = 0;
  s.volume = 0.5; // Reduce default volume slightly
  s.play().catch(() => {});
}

function loadCachedCosmetics() {
  try {
    renderInventory();
    const raw = localStorage.getItem("stv_cosmetics_cache_v1");
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.paints || !data.badges) return false;

    app.paints = data.paints;
    app.badges = data.badges;

    startCaseTitleCycling();
    setPill(`${app.paints.length} paints, ${app.badges.length} badges (cached)`, "ok");
    els.openBtn.disabled = false;
    return true;
  } catch {
    return false;
  }
}

/** @typedef {{ id?: string, name?: string, data?: any }} Paint */

const RARITY_WEIGHTS = /** @type {const} */ ({
  blue: 79,
  purple: 15,
  pink: 4,
  red: 1.5,
  gold: 0.5,
});

const FLOAT_WEIGHTS = /** @type {const} */ ({
  "Factory New": 1,
  "Minimal Wear": 0.75,
  "Field-Tested": 0.5,
  "Well-Worn": 0.3,
  "Battle-Scarred": 0.15,
});

const STATE_COLORS = {
  "Factory New": "#28d17c",
  "Minimal Wear": "#6aa7ff",
  "Field-Tested": "#efeff1",
  "Well-Worn": "#adadb8",
  "Battle-Scarred": "#ff4d6d",
};

const FLOAT_RANGES = [
  { name: "Factory New", min: 0.00, max: 0.07 },
  { name: "Minimal Wear", min: 0.07, max: 0.15 },
  { name: "Field-Tested", min: 0.15, max: 0.38 },
  { name: "Well-Worn", min: 0.38, max: 0.45 },
  { name: "Battle-Scarred", min: 0.45, max: 1.00 },
];

function getStateFromFloat(f) {
  for (const r of FLOAT_RANGES) {
    if (f >= r.min && f < r.max) return r.name;
  }
  return "Battle-Scarred";
}

const app = {
  paints: [],
  badges: [],
  inventory: { paints: [], badges: [] },
  wallet: 500.0, // Starting Balance
  selectedCase: "paints",
  selectedInventoryTab: "paints",
  rolling: false,
  autospin: false,
  username: "",
  customNameToggle: false,
  muted: localStorage.getItem("stv_case_muted_v1") === "true",
};

const RARITY_BASE_PRICE = {
  blue: 1.25,    // -$3.75 loss
  purple: 6.50,  // +$1.50 profit
  pink: 25.00,   // +$20.00 profit
  red: 120.00,   // +$115.00 profit
  gold: 650.00   // +$645.00 profit
};

function calculatePrice(rarity, floatValue, layersCount = 0, shadowsCount = 0, shadowColorsCount = 0) {
  const base = RARITY_BASE_PRICE[rarity] || 0.25;

  const mult = 1.0 + (1.0 - floatValue) * 2.0; 
  
  const complexityBonus = (layersCount * 0.05) + (shadowsCount * 0.1) + (shadowColorsCount * 0.08);
  
  return (base * mult) + complexityBonus;
}

function updateWalletDisplay() {
  const el = document.getElementById("balanceText");
  if (el) el.textContent = `$${app.wallet.toFixed(2)}`;
}

function loadInventory() {
  try {
    const raw = localStorage.getItem("stv_case_inventory_v1");
    const data = raw ? JSON.parse(raw) : { paints: [], badges: [] };
    
    if (Array.isArray(data)) {
      // Migration from old single array
      app.inventory.paints = data;
      app.inventory.badges = [];
    } else {
      app.inventory.paints = Array.isArray(data.paints) ? data.paints : [];
      app.inventory.badges = Array.isArray(data.badges) ? data.badges : [];
    }

    const walletRaw = localStorage.getItem("stv_case_wallet_v1");
    if (walletRaw !== null) app.wallet = parseFloat(walletRaw);
  } catch {
    app.inventory = { paints: [], badges: [] };
  }
  updateWalletDisplay();
  renderInventory();
}

function saveInventory() {
  try {
    const toSave = {
      paints: app.inventory.paints.slice(-500),
      badges: app.inventory.badges.slice(-500)
    };
    localStorage.setItem("stv_case_inventory_v1", JSON.stringify(toSave));
    localStorage.setItem("stv_case_wallet_v1", app.wallet.toString());
    localStorage.setItem("stv_case_muted_v1", app.muted.toString());
  } catch {
    // ignore
  }
  updateWalletDisplay();
  renderInventory();
}

function sellItem(obtainedAt) {
  // Search both inventory arrays for the item
  let type = "paints";
  let idx = app.inventory.paints.findIndex(it => it.obtainedAt === obtainedAt);
  
  if (idx === -1) {
    type = "badges";
    idx = app.inventory.badges.findIndex(it => it.obtainedAt === obtainedAt);
  }

  if (idx === -1) return;

  const inv = app.inventory[type];
  const item = inv[idx];
  app.wallet += item.valuation || 0;
  inv.splice(idx, 1);
  playSound("sell");
  saveInventory();
}

function rarityVar(r) {
  switch (r) {
    case "blue":
      return "var(--rarity-blue)";
    case "purple":
      return "var(--rarity-purple)";
    case "pink":
      return "var(--rarity-pink)";
    case "red":
      return "var(--rarity-red)";
    case "gold":
      return "var(--rarity-gold)";
    default:
      return "var(--rarity-blue)";
  }
}

function cryptoRand() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

function weightedPick(weights) {
  const entries = Object.entries(weights).filter(([, w]) => typeof w === "number" && w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!total) return entries[0]?.[0];
  let roll = cryptoRand() * total;
  for (const [k, w] of entries) {
    roll -= w;
    if (roll <= 0) return k;
  }
  return entries[entries.length - 1]?.[0];
}

function ensureRaritiesAssigned(items, type = "paints") {
  const byRarity = { blue: [], purple: [], pink: [], red: [], gold: [] };
  for (const p of items) {
    if (!p || !p.id) continue;
    let r = p.__rarity;
    if (!r) {
      r = weightedPick(RARITY_WEIGHTS) || "blue";
      p.__rarity = r;
    }
    if (byRarity[r]) byRarity[r].push(p);
  }
  if (type === "paints") app.paintsByRarity = byRarity;
  else app.badgesByRarity = byRarity;
}

function rollFloat() {
  const name = weightedPick(FLOAT_WEIGHTS) || "Factory New";
  const value = FLOAT_WEIGHTS[name] ?? 1;
  return { name, value };
}

function switchView(which) {
  const isChoose = which === "choose";
  if (els.chooseView) els.chooseView.style.display = isChoose ? "grid" : "none";
  if (els.openView) els.openView.style.display = isChoose ? "none" : "block";
  window.scrollTo(0, 0);
}

function showItemModal(invItem) {
  const isBadge = !!invItem.badgeId;
  const itemsById = isBadge 
    ? new Map(app.badges.map((b) => [b.id, b]))
    : new Map(app.paints.map((p) => [p.id, p]));
    
  const item = itemsById.get(isBadge ? invItem.badgeId : invItem.paintId);
  const winRarity = invItem.rarity;
  
  const rawName = invItem.badgeName || invItem.paintName || item?.name || "(Unnamed Item)";
  const displayName = getDisplayName(rawName, isBadge);
  
  els.modalPaintName.textContent = isBadge ? "" : displayName;
  els.modalPaintName.title = isBadge ? rawName : "";
  els.modalPaintName.style.cssText = "";
  els.modalPaintName.className = "modalPaintName"; // Reset classes

  if (!isBadge && item) {
    const winStyle = paintToStyle(item);
    els.modalPaintName.classList.add("paint-apply");
    Object.assign(els.modalPaintName.style, winStyle);
  } else if (isBadge && item) {
    const imgUrl = item.images?.find(img => img.url.endsWith("4x.webp"))?.url || item.images?.[0]?.url;
    if (imgUrl) {
      els.modalPaintName.classList.add("badge-modal");
      els.modalPaintName.style.backgroundImage = `url("${imgUrl}")`;
    } else {
       els.modalPaintName.style.color = rarityVar(winRarity);
    }
  } else {
    els.modalPaintName.classList.add("fallback");
  }

  const layersCount = !isBadge && Array.isArray(item?.data?.layers) ? item.data.layers.length : 0;
  const shadowsCount = !isBadge && Array.isArray(item?.data?.shadows) ? item.data.shadows.length : 0;
  const shadowColors = !isBadge && (Array.isArray(item?.data?.shadows) ? item.data.shadows : [])
    .map((s) => s?.color?.hex)
    .filter(Boolean)
    .slice(0, 6);

  const dt = new Date(invItem.obtainedAt);
  const unboxed = `${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;

  const kv = [
    ["Value", `$${(invItem.valuation || 0).toFixed(2)}`],
    ["Rarity", String(winRarity).toUpperCase()],
    ["State", invItem.floatName],
    ["Float", String(invItem.floatValue)],
    ["Unboxed", unboxed],
  ];

  if (!isBadge) {
    kv.splice(4, 0, ["Layers", String(layersCount)]);
    kv.splice(5, 0, ["Shadows", String(shadowsCount)]);
    kv.splice(6, 0, ["Shadow Colors", (shadowColors && shadowColors.length) ? "" : "—"]);
  }

  const cardEl = els.winModal.querySelector(".modalCard");
  if (cardEl) {
    cardEl.classList.remove("glow-blue", "glow-purple", "glow-pink", "glow-red", "glow-gold");
    cardEl.classList.add(`glow-${winRarity}`);
    cardEl.style.borderColor = rarityVar(winRarity);
  }

  els.modalKv.innerHTML = kv
    .map(([k, v]) => {
      let style = "";
      let valHtml = escapeHtml(v);
      
      if (k === "Value") {
        style = "color:var(--success)";
      } else if (k === "Rarity") {
        style = `color:${rarityVar(winRarity)}`;
      } else if (k === "State") {
        style = `color:${STATE_COLORS[v] || rarityVar(winRarity)}`;
      } else if (k === "Shadow Colors" && shadowColors && shadowColors.length) {
        valHtml = shadowColors.map(c => 
          `<span style="color:${c}; background:rgba(255,255,255,0.05); padding:2px 4px; border-radius:4px; margin-right:4px; font-family:monospace">${escapeHtml(c)}</span>`
        ).join("");
      }

      return `<div class="kvItem"><div class="k">${escapeHtml(k)}</div><div class="v" style="${style}">${valHtml}</div></div>`;
    })
    .join("");

  els.winModal.classList.add("show");
  els.winModal.setAttribute("aria-hidden", "false");
}

function renderInventory() {
  const q = (els.invFilter?.value ?? "").trim().toLowerCase();
  const rarityFilter = els.rarityFilter?.value ?? "all";
  const sortOrder = els.sortOrder?.value ?? "newest";
  const activeTab = app.selectedInventoryTab;
  const inv = app.inventory[activeTab] || [];
  
  const rarityOrder = { blue: 1, purple: 2, pink: 3, red: 4, gold: 5 };

  const list = inv
    .filter((it) => {
      if (rarityFilter !== "all" && it.rarity !== rarityFilter) return false;
      const rawName = String((activeTab === "badges" ? it.badgeName : it.paintName) ?? "").toLowerCase();
      const displayName = getDisplayName(rawName, activeTab === "badges").toLowerCase();
      if (!q) return true;
      const rarityStr = String(it.rarity ?? "").toLowerCase();
      const fl = String(it.floatName ?? "").toLowerCase();
      return displayName.includes(q) || rarityStr.includes(q) || fl.includes(q);
    })
    .sort((a, b) => {
      switch (sortOrder) {
        case "oldest": return a.obtainedAt - b.obtainedAt;
        case "value-high": return (b.valuation || 0) - (a.valuation || 0);
        case "value-low": return (a.valuation || 0) - (b.valuation || 0);
        case "rarity-high": return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
        case "newest":
        default: return b.obtainedAt - a.obtainedAt;
      }
    });

  const count = list.length;
  if (els.invCount) els.invCount.textContent = String(count);
  if (!els.invList) return;

  document.querySelectorAll(".invTab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === activeTab);
  });

  if (!count) {
    els.invList.innerHTML = `<div class="invItem"><div class="muted">No items match your filters.</div></div>`;
    return;
  }

  const itemsById = activeTab === "badges" 
    ? new Map(app.badges.map((b) => [b.id, b]))
    : new Map(app.paints.map((p) => [p.id, p]));

  const PAGE = 60;
  let rendered = 0;
  let token = (renderInventory._token = (renderInventory._token ?? 0) + 1);

  const renderMore = () => {
    if (token !== renderInventory._token) return;
    const frag = document.createDocumentFragment();
    const slice = list.slice(rendered, rendered + PAGE);

    for (const item of slice) {
      const wrap = document.createElement("div");
      wrap.className = "invItem";
      wrap.onclick = (e) => {
        if (e.target.tagName === "BUTTON") return;
        showItemModal(item);
      };

      const nameEl = document.createElement("div");
      nameEl.className = "invName"; 
      const dataObj = itemsById.get(activeTab === "badges" ? item.badgeId : item.paintId);
      const rawName = (activeTab === "badges" ? item.badgeName : item.paintName) ?? dataObj?.name ?? "(Unknown)";
      const displayName = getDisplayName(rawName, activeTab === "badges");
      
      nameEl.textContent = activeTab === "badges" ? "" : displayName;

      if (activeTab === "paints" && dataObj) {
        nameEl.textContent = ""; // Clear any old text
        const textSpan = document.createElement("span");
        textSpan.textContent = displayName;
        
        // Apply the 7TV style to the SPAN, not the DIV
        const style = paintToStyle(dataObj);
        Object.assign(textSpan.style, style);
        textSpan.classList.add("paint-apply");
        
        nameEl.appendChild(textSpan);
      } else if (activeTab === "badges" && dataObj) {
        nameEl.textContent = ""; // Clear any old text
        const imgUrl = dataObj.images?.find(img => img.url.endsWith("4x.webp"))?.url || dataObj.images?.[0]?.url;
        if (imgUrl) {
          const badgeImg = document.createElement("div");
          badgeImg.className = "badge-item";
          badgeImg.style.backgroundImage = `url("${imgUrl}")`;
          badgeImg.title = rawName;
          nameEl.appendChild(badgeImg);
        } else {
          nameEl.textContent = displayName;
        }
      }

      const meta = document.createElement("div");
      meta.className = "invMeta";
      meta.innerHTML = `
        <div class="small" style="color:${rarityVar(item.rarity)}">${String(item.rarity).toUpperCase()}</div>
        <div class="small" style="color:var(--success)">$${(item.valuation || 0).toFixed(2)}</div>
      `;

      const sellBtn = document.createElement("button");
      sellBtn.className = "btn";
      sellBtn.textContent = "SELL";
      sellBtn.onclick = (e) => { e.stopPropagation(); sellItem(item.obtainedAt); };

      meta.appendChild(sellBtn);
      wrap.appendChild(nameEl);
      wrap.appendChild(meta);
      frag.appendChild(wrap);
    }
    
    els.invList.appendChild(frag);
    rendered += slice.length;
  };

  els.invList.innerHTML = "";
  renderMore();

  els.invList.onscroll = () => {
    if (token !== renderInventory._token || rendered >= list.length) return;
    const { scrollTop, clientHeight, scrollHeight } = els.invList; 
    if (scrollTop + clientHeight >= scrollHeight - 200) renderMore();
  };
}

function setPill(text, tone = "muted") {
  if (!els.pill || !els.pillText) return;
  els.pillText.textContent = text;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp01(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toHexColor(c) {
  if (!c) return null;
  if (typeof c === "string") {
    const s = c.trim();
    if (s.startsWith("#")) return s;
    if (/^0x[0-9a-fA-F]+$/.test(s)) {
      const n = parseInt(s, 16);
      return "#" + n.toString(16).padStart(6, "0").slice(-6);
    }
    return s;
  }
  if (typeof c === "number" && Number.isFinite(c)) {
    const n = Math.max(0, Math.min(0xffffff, Math.floor(c)));
    return "#" + n.toString(16).padStart(6, "0");
  }
  return null;
}

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function buildShadowFilter(shadows) {
  if (!Array.isArray(shadows) || shadows.length === 0) return "";
  const parts = [];
  for (const sh of shadows) {
    if (!sh) continue;
    const x = pick(sh, ["x", "offset_x", "dx"]) ?? 0;
    const y = pick(sh, ["y", "offset_y", "dy"]) ?? 0;
    const r = pick(sh, ["radius", "blur", "spread"]) ?? 0;
    const col = toHexColor(pick(sh, ["color", "colour"])) ?? "rgba(0,0,0,.6)";
    parts.push(`drop-shadow(${x}px ${y}px ${r}px ${col})`);
  }
  return parts.join(" ");
}

function buildGradientCss(gradLike) {
  const g = gradLike?.gradient ?? gradLike ?? null;
  if (!g) return null;

  const tRaw = String(pick(g, ["type", "kind", "__typename"]) ?? "").toLowerCase();
  const isRadial = tRaw.includes("radial");
  const isLinear = tRaw.includes("linear") || !isRadial;

  const stopsRaw = pick(g, ["stops", "stop", "colors"]) ?? [];
  const stops = Array.isArray(stopsRaw) ? stopsRaw.slice() : [];
  stops.sort((a, b) => clamp01(pick(a, ["at", "pos", "position", "offset"]) ?? 0) - clamp01(pick(b, ["at", "pos", "position", "offset"]) ?? 0));

  const stopCss = stops
    .map((st) => {
      const col = toHexColor(pick(st, ["color", "colour", "hex"])) ?? "#ffffff";
      const at = clamp01(pick(st, ["at", "pos", "position", "offset"]) ?? 0);
      return `${col} ${Math.round(at * 10000) / 100}%`;
    })
    .join(", ");

  if (!stopCss) return null;

  if (isLinear) {
    const angle = pick(g, ["angle", "rotation", "deg"]);
    const deg =
      typeof angle === "number" && Number.isFinite(angle) ? angle : 0;
    return `linear-gradient(${deg}deg, ${stopCss})`;
  }

  const shape = String(pick(g, ["shape"]) ?? "ellipse").toLowerCase();
  const at = pick(g, ["at", "position"]);
  const atStr =
    typeof at === "string" && at.trim() ? ` at ${at.trim()}` : "";
  return `radial-gradient(${shape}${atStr}, ${stopCss})`;
}

function layerToBackgroundImage(layer) {
  if (!layer) return null;
  const tn = String(layer.__typename ?? layer.type ?? "").toLowerCase();

  const maybeUrlObj = pick(layer, ["image", "url", "urls", "host"]);
  const url2x =
    typeof maybeUrlObj === "object"
      ? pick(maybeUrlObj, ["x2", "2x", "scale_2x", "webp_2x", "url_2x", "url2x"])
      : undefined;

  const url =
    (typeof url2x === "string" && url2x) ||
    (typeof maybeUrlObj === "string" && maybeUrlObj) ||
    (typeof maybeUrlObj === "object"
      ? pick(maybeUrlObj, ["x1", "1x", "webp", "webp_1x", "url"])
      : undefined);

  if (tn.includes("image") || url) {
    if (typeof url === "string" && url) return `url("${url}")`;
    return null;
  }

  if (tn.includes("gradient") || layer.gradient || layer.stops) {
    return buildGradientCss(layer);
  }

  const guessGradient = buildGradientCss(layer);
  if (guessGradient) return guessGradient;

  return null;
}

function paintToStyle(paint) {
  const data = paint?.data;
  if (!data) return {};

  const rawLayers = Array.isArray(data.layers) ? data.layers : [];
  const layerEffects = rawLayers
    .map((layer) => {
      if (!layer) return null;
      const ty = layer.ty ?? layer;
      const opacity = typeof layer.opacity === "number" ? layer.opacity : 1;
      const tn = String(ty?.__typename ?? "").toLowerCase();

      // Helper to apply opacity to hex color
      const applyOpacity = (hex) => {
        if (!hex) return "transparent";
        if (opacity >= 1) return hex;
        // Hex to RGBA
        let h = hex.replace("#", "");
        if (h.length === 3) h = h.split("").map(c => c + c).join("");
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      };

      if (tn === "paintlayertypelineargradient") {
        const sortedStops = [...(ty.stops ?? [])].sort(
          (a, b) => clamp01(a?.at ?? 0) - clamp01(b?.at ?? 0),
        );
        if (!sortedStops.length) return null;
        const stopsCss = sortedStops
          .map((st) => `${applyOpacity(st.color?.hex ?? "#ffffff")} ${Math.round(clamp01(st.at ?? 0) * 10000) / 100}%`)
          .join(", ");
        return `${ty.repeating ? "repeating-" : ""}linear-gradient(${ty.angle ?? 0}deg, ${stopsCss})`;
      }

      if (tn === "paintlayertyperadialgradient") {
        const sortedStops = [...(ty.stops ?? [])].sort(
          (a, b) => clamp01(a?.at ?? 0) - clamp01(b?.at ?? 0),
        );
        if (!sortedStops.length) return null;
        const shape = ty.shape === "CIRCLE" ? "circle" : "ellipse";
        const stopsCss = sortedStops
          .map((st) => `${applyOpacity(st.color?.hex ?? "#ffffff")} ${Math.round(clamp01(st.at ?? 0) * 10000) / 100}%`)
          .join(", ");
        return `${ty.repeating ? "repeating-" : ""}radial-gradient(${shape}, ${stopsCss})`;
      }

      if (tn === "paintlayertypeimage") {
        const images = Array.isArray(ty.images) ? ty.images : [];
        if (!images.length) return null;
        const animated = images.some((im) => im.frameCount > 1);
        const best =
          images.find((im) => im.scale === 2 && (!animated || im.frameCount > 1)) ??
          images.find((im) => im.scale === 1 && (!animated || im.frameCount > 1)) ??
          images[0];
        if (!best?.url) return null;
        return `url("${best.url}")`;
      }

      if (tn === "paintlayertypesinglecolor") {
        const col = ty.color?.hex;
        if (!col) return null;
        const finalCol = applyOpacity(col);
        return `linear-gradient(${finalCol}, ${finalCol})`;
      }

      return null;
    })
    .filter(Boolean);

  const style = {};

  if (layerEffects.length) {
    style.backgroundImage = layerEffects.join(", ");
    style.backgroundSize = layerEffects.map(() => "cover").join(", ");
    style.backgroundPosition = layerEffects.map(() => "center").join(", ");
    style.backgroundRepeat = layerEffects.map(() => "no-repeat").join(", ");
  }

  const shadows = Array.isArray(data.shadows) ? data.shadows : [];
  const filter = buildShadowFilter(
    shadows.map((sh) => ({
      x: sh.offsetX,
      y: sh.offsetY,
      radius: sh.blur,
      color: sh.color?.hex,
    })),
  );
  if (filter) style.filter = filter;

  return style;
}

async function gql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 180)}`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 240)}`);
  }
  if (json?.errors?.length) {
    throw new Error(json.errors.map((e) => e?.message ?? "GraphQL error").join(" | "));
  }
  return json?.data;
}

function updateCaseTitles() {
  if (app.paints.length > 0 && els.paintCaseTitle) {
    const paint = app.paints[Math.floor(cryptoRand() * app.paints.length)];
    els.paintCaseTitle.textContent = paint.name || "Unnamed Paint";
    const style = paintToStyle(paint);
    els.paintCaseTitle.style.cssText = "";
    Object.assign(els.paintCaseTitle.style, style);
    els.paintCaseTitle.classList.add("paint-apply");
  }
  if (app.badges.length > 0 && els.badgeCaseTitle) {
    const badge = app.badges[Math.floor(cryptoRand() * app.badges.length)];
    const imgUrl = badge.images?.find(img => img.url.endsWith("4x.webp"))?.url || badge.images?.[0]?.url;
    if (imgUrl) {
      els.badgeCaseTitle.textContent = "";
      els.badgeCaseTitle.style.backgroundImage = `url("${imgUrl}")`;
      els.badgeCaseTitle.title = badge.name;
      els.badgeCaseTitle.classList.add("badge-item");
    } else {
      els.badgeCaseTitle.textContent = badge.name || "Unnamed Badge";
      els.badgeCaseTitle.style.backgroundImage = "none";
      els.badgeCaseTitle.classList.remove("badge-item");
    }
  }
}

function startCaseTitleCycling() {
  updateCaseTitles();
  setInterval(updateCaseTitles, 3000);
}

function saveCosmeticsToCache() {
  try {
    const data = {
      paints: app.paints,
      badges: app.badges,
      timestamp: Date.now()
    };
    localStorage.setItem("stv_cosmetics_cache_v1", JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to cache cosmetics:", e);
  }
}

async function load() {
  const hasCache = loadCachedCosmetics();
  if (!hasCache) setPill("Loading…");
  else setPill("Updating…", "ok");

  const PAINT_FIELDS_FRAGMENT = /* GraphQL */ `
    fragment PaintFields on Paint {
      id
      name
      description
      data {
        layers {
          id
          opacity
          ty {
            __typename
            ... on PaintLayerTypeImage {
              images { 
                url mime size scale width height frameCount 
                __typename 
              }
            }
            ... on PaintLayerTypeRadialGradient {
              repeating shape
              stops { 
                at 
                color { hex r g b a __typename } 
              }
              __typename
            }
            ... on PaintLayerTypeLinearGradient {
              angle repeating
              stops { 
                at 
                color { hex r g b a __typename } 
                __typename
              }
              __typename
            }
            ... on PaintLayerTypeSingleColor {
              color { hex r g b a __typename }
              __typename
            }
          }
        }
        shadows {
          offsetX offsetY blur
          color { hex r g b a __typename }
          __typename
        }
      }
    }
  `;

  const ALL_COSMETICS_QUERY = /* GraphQL */ `
    query AllCosmetics {
      users {
        userByConnection(platform: TWITCH, platformId: "913105917") {
          inventory(includeInaccessible: true) {
            paints {
              to {
                paint {
                  ...PaintFields
                }
              }
            }
            badges {
              to {
                badge {
                  id
                  name
                  description
                  images {
                    url
                  }
                }
              }
            }
          }
        }
      }
    }
    ${PAINT_FIELDS_FRAGMENT}
  `;

  try {
    const data = await gql(ALL_COSMETICS_QUERY, undefined);
    const inv = data?.users?.userByConnection?.inventory || 
                data?.users?.[0]?.userByConnection?.inventory;

    if (!inv) throw new Error("Could not find inventory.");

    const paintsRaw = inv.paints ?? [];
    const paintsById = new Map();
    for (const entry of paintsRaw) {
      const p = entry?.to?.paint;
      if (p?.id && !paintsById.has(p.id)) paintsById.set(p.id, p);
    }
    app.paints = Array.from(paintsById.values());

    const badgesRaw = inv.badges ?? [];
    const badgesById = new Map();
    for (const entry of badgesRaw) {
      const b = entry?.to?.badge;
      if (b?.id && !badgesById.has(b.id)) badgesById.set(b.id, b);
    }
    app.badges = Array.from(badgesById.values());
    
    saveCosmeticsToCache();
    loadInventory();
    setPill(`${app.paints.length} paints, ${app.badges.length} badges`, "ok");
    if (!hasCache) startCaseTitleCycling();
  } catch (e) {
    if (!hasCache) {
      setPill("Error", "danger");
      console.error("Failed to fetch cosmetics:", e);
    }
  } finally {
    els.openBtn.disabled = false;
  }
}

function getDisplayName(originalName, isBadge = false) {
  if (!isBadge && app.customNameToggle && app.username.trim()) {
    return app.username.trim();
  }
  return originalName;
}

function buildSlot(item, floatValue, forceRarity, type = "paints") {
  const rarity = forceRarity || "blue";
  const isBadge = type === "badges";
  
  const slot = document.createElement("div");
  slot.className = "slot";
  if (isBadge) slot.classList.add("badge");
  slot.dataset.id = item?.id ?? "";
  slot.dataset.rarity = rarity;
  const rawName = item?.name ?? "(Unnamed)";
  const displayName = getDisplayName(rawName, isBadge);
  
  if (isBadge && item?.name) slot.title = rawName;

  const stripe = document.createElement("div");
  stripe.className = "stripe";
  const rCol = rarityVar(rarity);
  stripe.style.background = rCol;
  stripe.style.color = rCol; // For currentColor glow in CSS

  const content = document.createElement("div");
  content.className = "content";

  const name = document.createElement("div");
  name.className = "slotName fallback";
  name.textContent = isBadge ? "" : displayName;
  
  if (!isBadge && item) {
    const style = paintToStyle(item);
    if (style.backgroundImage) {
      name.classList.remove("fallback");
      Object.assign(name.style, style);
      name.classList.add("paint-apply");
    } else if (style.filter) {
      name.style.filter = style.filter;
    }
  } else if (isBadge && item) {
    const imgUrl = item.images?.find(img => img.url.endsWith("4x.webp"))?.url || item.images?.[0]?.url;
    if (imgUrl) {
      name.classList.remove("fallback");
      name.style.backgroundImage = `url("${imgUrl}")`;
    }
  }

  content.appendChild(name);
  slot.appendChild(stripe);
  slot.appendChild(content);
  return slot;
}

function chooseWinner(type = "paints") {
  const rarity = weightedPick(RARITY_WEIGHTS) || "blue";
  const source = type === "paints" ? app.paints : app.badges;
  const item = source[Math.floor(cryptoRand() * source.length)];
  return { item, rarity };
}

function animateReelTo(winIndex, durationMs = 11000) {
  const first = els.reelTrack.querySelector(".slot");
  if (!first) return Promise.resolve();

  const slotW = first.getBoundingClientRect().width;
  const gap = 8;
  const step = slotW + gap;

  const D = -((winIndex * step) + (slotW / 2));
  
  if (durationMs <= 0) {
    if (els.reelTrack._currentAnim) els.reelTrack._currentAnim.cancel();
    els.reelTrack.style.transform = `translate3d(${D}px, 0px, 0px)`;
    return Promise.resolve();
  }

  const delay = 500;   
  const t1 = 100;     
  const t2 = 500;     
  const t3 = 8000;     
  
  const total = delay + t1 + t2 + t3;

  const Tramp = t1 / 1000;
  const Tconst = t2 / 1000;
  const Tslow = t3 / 1000;
  const V = D / (Tramp / 2 + Tconst + Tslow / 2);
  
  const d1 = (V * Tramp) / 2;
  const d2 = V * Tconst;

  if (els.reelTrack._currentAnim) els.reelTrack._currentAnim.cancel();
  els.reelTrack.style.transform = "translate3d(0px, 0px, 0px)";

  const keyframes = [
    { transform: "translate3d(0px, 0px, 0px)", offset: 0 },
    { transform: "translate3d(0px, 0px, 0px)", offset: delay / total, easing: "ease-in" },
    { transform: `translate3d(${d1}px, 0px, 0px)`, offset: (delay + t1) / total, easing: "linear" },
    { transform: `translate3d(${d1 + d2}px, 0px, 0px)`, offset: (delay + t1 + t2) / total, easing: "ease-out" },
    { transform: `translate3d(${D}px, 0px, 0px)`, offset: 1 }
  ];

  const anim = els.reelTrack.animate(keyframes, {
    duration: total,
    fill: "forwards"
  });
  els.reelTrack._currentAnim = anim;

  // Sound ticking logic
  let lastTickIndex = -1;
  const tickLoop = () => {
    if (anim.playState !== "running") return;
    const style = window.getComputedStyle(els.reelTrack);
    const matrix = new WebKitCSSMatrix(style.transform);
    const currentX = matrix.m41;
    // Tick exactly when the center pointer enters a new square
    const currentTickIndex = Math.floor(Math.abs(currentX) / step);
    
    if (currentTickIndex !== lastTickIndex) {
      playSound("tick");
      lastTickIndex = currentTickIndex;
    }
    requestAnimationFrame(tickLoop);
  };
  requestAnimationFrame(tickLoop);

  return new Promise((resolve) => {
    anim.onfinish = () => {
      els.reelTrack.style.transform = `translate3d(${D}px, 0px, 0px)`;
      resolve();
    };
  });
}

async function openCase() {
  if (app.rolling) return;
  const selectedType = app.selectedCase;
  const source = selectedType === "paints" ? app.paints : app.badges;

  if (!source.length) {
    alert("Items are not loaded yet. Please wait for the initialization to complete or check your connection.");
    return;
  }

  if (app.wallet < 5.0) {
    alert("Insufficient funds! Sell some items or reload.");
    return;
  }

  app.wallet -= 5.0;
  saveInventory();

  app.rolling = true;
  els.openBtn.disabled = true;
  els.reelShell.style.display = "block";

  const floatValue = cryptoRand();
  const floatName = getStateFromFloat(floatValue);
  const { item: winItem, rarity: winRarity } = chooseWinner(selectedType);
  
  let val = 0;
  if (selectedType === "paints") {
    const layersCount = Array.isArray(winItem?.data?.layers) ? winItem.data.layers.length : 0;
    const shadowsCount = Array.isArray(winItem?.data?.shadows) ? winItem.data.shadows.length : 0;
    const shadowColorsCount = (Array.isArray(winItem?.data?.shadows) ? winItem.data.shadows : [])
      .map((s) => s?.color?.hex)
      .filter(Boolean).length;
    val = calculatePrice(winRarity, floatValue, layersCount, shadowsCount, shadowColorsCount);
  } else {
    val = calculatePrice(winRarity, floatValue);
  }

  const totalSlots = 60;
  const winIndex = 55;
  app._lastWinIndex = winIndex;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < totalSlots; i++) {
    let item = source[Math.floor(cryptoRand() * source.length)];

    let r = weightedPick(RARITY_WEIGHTS) || "blue";
    if (i === winIndex) {
      item = winItem;
      r = winRarity;
    }
    frag.appendChild(buildSlot(item, cryptoRand(), r, selectedType));
  }

  els.reelTrack.innerHTML = "";
  els.reelTrack.appendChild(frag);

  await animateReelTo(winIndex);

  const invItem = {
    rarity: winRarity,
    floatName: floatName,
    floatValue: floatValue.toFixed(4),
    valuation: val,
    obtainedAt: Date.now(),
  };
  if (selectedType === "paints") {
    invItem.paintId = winItem?.id ?? "";
    invItem.paintName = winItem?.name ?? "";
    app.inventory.paints.push(invItem);
  } else {
    invItem.badgeId = winItem?.id ?? "";
    invItem.badgeName = winItem?.name ?? "";
    app.inventory.badges.push(invItem);
  }
  
  saveInventory();
  playSound(`win_${winRarity}`);
  showItemModal(invItem);

  els.openBtn.disabled = false;
  app.rolling = false;

  if (app.autospin && app.wallet >= 5.0) {
    app._autospinTimeout = setTimeout(() => {
      if (app.autospin && !app.rolling && els.openView.style.display !== "none") {
        els.winModal.classList.remove("show");
        els.winModal.setAttribute("aria-hidden", "true");
        openCase();
      }
    }, 1500);
  }
}

window.addEventListener("resize", () => {
  if (app._lastWinIndex !== undefined && !app.rolling && els.openView.style.display !== "none") {
    animateReelTo(app._lastWinIndex, 0);
  }
});

els.openBtn.addEventListener("click", openCase);
els.autospinToggle.addEventListener("change", (e) => {
  app.autospin = e.target.checked;
  if (app.autospin && !app.rolling && els.openView.style.display !== "none") {
    openCase();
  } else if (!app.autospin) {
    clearTimeout(app._autospinTimeout);
  }
});

els.invFilter?.addEventListener("input", () => renderInventory());
els.modalConfirmBtn.addEventListener("click", () => {
  els.winModal.classList.remove("show");
  els.winModal.setAttribute("aria-hidden", "true");
});
els.winModal.addEventListener("click", (e) => {
  if (e.target === els.winModal) {
    els.winModal.classList.remove("show");
    els.winModal.setAttribute("aria-hidden", "true");
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.winModal.classList.contains("show")) {
    els.winModal.classList.remove("show");
    els.winModal.setAttribute("aria-hidden", "true");
  }
});

els.backBtn.addEventListener("click", () => {
  if (app.rolling) return;
  app.autospin = false;
  if (els.autospinToggle) els.autospinToggle.checked = false;
  clearTimeout(app._autospinTimeout);
  switchView("choose");
  document.querySelector(".caseHeaderText").textContent = "CHOOSE A CASE";
});

document.querySelectorAll(".caseCard").forEach((card) => {
    card.addEventListener("click", () => {
      const key = card.getAttribute("data-case");
      app.selectedCase = key;
      const label = key.toUpperCase();
  
      const headerEl = document.querySelector(".caseHeaderText");
      if (headerEl) {
        headerEl.textContent = `${label} CASE`; // Updates "CHOOSE A CASE" to "PAINTS CASE"
      }
  
      switchView("open");
    });
  });

document.querySelectorAll(".invTab").forEach((tab) => {
  tab.addEventListener("click", () => {
    app.selectedInventoryTab = tab.dataset.tab;
    renderInventory();
  });
});

els.modalSellBtn.onclick = () => {
  const modalItem = app.inventory[app.selectedInventoryTab].find(it => it.obtainedAt === app._currentModalItemObtainedAt);
  if (modalItem) {
    sellItem(modalItem.obtainedAt);
    els.winModal.classList.remove("show");
    els.winModal.setAttribute("aria-hidden", "true");
  }
};

els.usernameInput.addEventListener("input", (e) => {
  app.username = e.target.value;
  if (app.customNameToggle) renderInventory();
});

els.usernameToggle.addEventListener("change", (e) => {
  app.customNameToggle = e.target.checked;
  renderInventory();
});

els.rarityFilter.addEventListener("change", () => renderInventory());
els.sortOrder.addEventListener("change", () => renderInventory());

function sellAllVisible() {
  const activeTab = app.selectedInventoryTab;
  const inv = app.inventory[activeTab] || [];
  const q = (els.invFilter?.value ?? "").trim().toLowerCase();
  const rarityFilter = els.rarityFilter?.value ?? "all";
  
  // Get currently visible items based on filters
  const toSell = inv.filter((it) => {
    if (rarityFilter !== "all" && it.rarity !== rarityFilter) return false;
    const rawName = String((activeTab === "badges" ? it.badgeName : it.paintName) ?? "").toLowerCase();
    const displayName = getDisplayName(rawName, activeTab === "badges").toLowerCase();
    if (!q) return true;
    const rarityStr = String(it.rarity ?? "").toLowerCase();
    const fl = String(it.floatName ?? "").toLowerCase();
    return displayName.includes(q) || rarityStr.includes(q) || fl.includes(q);
  });

  if (toSell.length === 0) return;
  
  const totalGain = toSell.reduce((s, i) => s + (i.valuation || 0), 0);
  if (!confirm(`Sell all ${toSell.length} items for $${totalGain.toFixed(2)}?`)) return;

  // Update wallet and inventory
  app.wallet += totalGain;
  app.inventory[activeTab] = inv.filter(item => !toSell.includes(item));

  playSound("sell");
  saveInventory();
}

els.sellAllBtn.addEventListener("click", sellAllVisible);

// Need to track current modal item for sell button
const originalShowItemModal = showItemModal;
showItemModal = (invItem) => {
  app._currentModalItemObtainedAt = invItem.obtainedAt;
  app._currentModalItemType = !!invItem.badgeId ? "badges" : "paints";
  originalShowItemModal(invItem);
};

els.modalSellBtn.onclick = () => {
  const type = app._currentModalItemType || app.selectedInventoryTab;
  const inv = app.inventory[type];
  const modalItem = inv?.find(it => it.obtainedAt === app._currentModalItemObtainedAt);
  if (modalItem) {
    sellItem(modalItem.obtainedAt);
    els.winModal.classList.remove("show");
    els.winModal.setAttribute("aria-hidden", "true");
  }
};

load();
