(() => {
  const state = {
    img: null, imgW: 0, imgH: 0,
    imgSrc: null,
    zoom: 1, panX: 0, panY: 0,
    picked: null,
    history: [],
    dragging: false, mouseDown: false,
    dragStart: null, lastPan: null,
    hoverImgCoords: null,
    // Bot target resolution (the Linux cloud instance)
    botW: 1920, botH: 1080,
    // Chrome bar height in bot-screen pixels (1920x1080 space).
    // Subtracted from Y after scaling.
    chromeHeight: 148,
    chainMode: false,
    chainedLines: [],
    chainedPicks: [],
  };

  const $ = s => document.querySelector(s);
  const canvasArea   = $('#canvas-area');
  const imgContainer = $('#img-container');
  const displayImg   = $('#display-img');
  const emptyState   = $('#empty-state');
  const fileInput    = $('#file-input');
  const zoomLens     = $('#zoom-lens');
  const zoomCanvas   = $('#zoom-canvas');
  const zoomCtx      = zoomCanvas.getContext('2d');
  const srcCanvas    = $('#src-canvas');
  const srcCtx       = srcCanvas.getContext('2d');
  const cursorLabel  = $('#cursor-label');

  // ── Chrome Bar Height: auto-subtract browser toolbar from Y ──
  const chromeInput = $('#chrome-height');

  // Load saved value from localStorage
  const savedChromeH = localStorage.getItem('coord-picker-chrome-height');
  if (savedChromeH !== null) {
    state.chromeHeight = parseInt(savedChromeH, 10) || 0;
    chromeInput.value = state.chromeHeight;
  }

  chromeInput.addEventListener('input', () => {
    state.chromeHeight = parseInt(chromeInput.value, 10) || 0;
    localStorage.setItem('coord-picker-chrome-height', state.chromeHeight);
    render();
    if (state.picked) updatePickUI();
  });

  function renderChromeLine() {
    imgContainer.querySelectorAll('.chrome-line').forEach(el => el.remove());
    if (!state.img || !state.chromeHeight) return;
    // Chrome height is in bot-screen pixels; convert to image pixels then apply zoom
    const chromeInImgPx = state.chromeHeight * (state.imgH / state.botH);
    const y = chromeInImgPx * state.zoom;
    const w = state.imgW * state.zoom;
    const el = document.createElement('div');
    el.className = 'chrome-line';
    el.style.cssText = `position:absolute;left:0;top:${y}px;width:${w}px;height:0;border-top:3px solid rgba(255,50,50,0.8);pointer-events:none;z-index:9;`;
    imgContainer.appendChild(el);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1500);
  }

  /**
   * Convert mouse event to image pixel coordinates.
   *
   * Uses clientX/Y - getBoundingClientRect() to get position within the
   * element in viewport coordinate space, then maps to image pixels.
   * This avoids offsetX/Y which can be shifted by parent transforms.
   */
  function getImgCoordsFromEvent(e) {
    const nw = displayImg.naturalWidth  || state.imgW;
    const nh = displayImg.naturalHeight || state.imgH;
    const rect = displayImg.getBoundingClientRect();

    // Primary method: clientX/Y minus rect position, both in viewport space
    const fracX = (e.clientX - rect.left) / rect.width;
    const fracY = (e.clientY - rect.top) / rect.height;
    const x = Math.round(fracX * nw);
    const y = Math.round(fracY * nh);

    return { x: Math.max(0, Math.min(nw - 1, x)), y: Math.max(0, Math.min(nh - 1, y)) };
  }

  // ── Resolution UI ──
  function updateResUI() {
    if (!state.img) {
      $('#img-res').textContent = '—';
      $('#res-status').className = 'res-badge match';
      $('#res-status').innerHTML = '<span class="dot"></span> No image';
      return;
    }
    $('#img-res').textContent = `${state.imgW}×${state.imgH}`;
    const badge = $('#res-status');
    const isExact = state.imgW === state.botW && state.imgH === state.botH;
    if (isExact) {
      badge.className = 'res-badge match';
      badge.innerHTML = '<span class="dot"></span> 1:1';
    } else {
      const scale = (state.imgW / state.botW).toFixed(2).replace(/\.?0+$/, '');
      badge.className = 'res-badge scaled';
      badge.innerHTML = `<span class="dot"></span> ${scale}x → ${state.botW}×${state.botH}`;
    }
  }

  // ── Image Loading ──
  function loadImage(src) {
    const img = new Image();
    img.onload = () => {
      state.img = img;
      state.imgW = img.naturalWidth;
      state.imgH = img.naturalHeight;
      state.imgSrc = src;
      state.picked = null;
      state.hoverImgCoords = null;

      displayImg.src = src;
      emptyState.style.display = 'none';
      imgContainer.style.display = 'block';

      // Prepare hidden canvas for zoom lens
      srcCanvas.width = state.imgW;
      srcCanvas.height = state.imgH;
      srcCtx.drawImage(img, 0, 0);

      fitToView(); render(); updateResUI(); updatePickUI();
      $('#status-img').textContent = `${state.imgW}×${state.imgH}`;
    };
    img.src = src;
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = e => loadImage(e.target.result);
    r.readAsDataURL(file);
  }

  $('#btn-load').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

  $('#btn-paste').addEventListener('click', async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items)
        for (const type of item.types)
          if (type.startsWith('image/')) { loadFile(await item.getType(type)); return; }
      toast('No image in clipboard');
    } catch { toast('Clipboard access denied'); }
  });
  document.addEventListener('paste', e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items)
      if (item.type.startsWith('image/')) { loadFile(item.getAsFile()); return; }
  });

  canvasArea.addEventListener('dragover', e => { e.preventDefault(); canvasArea.classList.add('drag-over'); });
  canvasArea.addEventListener('dragleave', () => canvasArea.classList.remove('drag-over'));
  canvasArea.addEventListener('drop', e => {
    e.preventDefault(); canvasArea.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  // ── Zoom / Pan ──
  function fitToView() {
    const aW = canvasArea.clientWidth, aH = canvasArea.clientHeight;
    state.zoom = Math.min(aW / state.imgW, aH / state.imgH, 1) * 0.95;
    state.panX = (aW - state.imgW * state.zoom) / 2;
    state.panY = (aH - state.imgH * state.zoom) / 2;
    updateZoomLabel();
  }

  function updateZoomLabel() { $('#zoom-level').textContent = Math.round(state.zoom * 100) + '%'; }

  function render() {
    if (!state.img) return;
    const w = state.imgW * state.zoom;
    const h = state.imgH * state.zoom;
    displayImg.style.width = w + 'px';
    displayImg.style.height = h + 'px';
    imgContainer.style.transform = `translate(${state.panX}px, ${state.panY}px)`;
    renderMarker();
    renderChromeLine();
  }

  function renderMarker() {
    imgContainer.querySelectorAll('.point-marker,.chain-marker,.crosshair-h,.crosshair-v').forEach(el => el.remove());

    // Render chained picks (previous clicks that stay on the image)
    state.chainedPicks.forEach((pick, i) => {
      const cx = pick.x * state.zoom;
      const cy = pick.y * state.zoom;
      const m = document.createElement('div');
      m.className = 'chain-marker';
      m.style.left = cx + 'px'; m.style.top = cy + 'px';
      const bc = toBotCoords(pick.x, pick.y);
      m.innerHTML = `<span class="chain-number">${i + 1}</span><span class="chain-label">${bc.x}, ${bc.y}</span>`;
      imgContainer.appendChild(m);
    });

    if (!state.picked) return;

    const px = state.picked.x * state.zoom;
    const py = state.picked.y * state.zoom;

    const ch = document.createElement('div');
    ch.className = 'crosshair-h'; ch.style.top = py + 'px';
    imgContainer.appendChild(ch);
    const cv = document.createElement('div');
    cv.className = 'crosshair-v'; cv.style.left = px + 'px';
    imgContainer.appendChild(cv);

    const num = state.chainMode ? state.chainedPicks.length + 1 : '';
    const el = document.createElement('div');
    el.className = 'point-marker';
    el.style.left = px + 'px'; el.style.top = py + 'px';
    const bot = toBotCoords(state.picked.x, state.picked.y);
    el.innerHTML = `${num ? `<span class="chain-number current">${num}</span>` : ''}<span class="point-label">${bot.x}, ${bot.y}</span>`;
    imgContainer.appendChild(el);
  }

  $('#btn-zoom-in').addEventListener('click', () => changeZoom(1.25));
  $('#btn-zoom-out').addEventListener('click', () => changeZoom(0.8));
  $('#btn-zoom-fit').addEventListener('click', () => { fitToView(); render(); });

  function changeZoom(f) {
    const r = canvasArea.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, f);
  }

  function zoomAt(cx, cy, factor) {
    const oldZ = state.zoom;
    const newZ = Math.max(0.05, Math.min(20, oldZ * factor));
    const ix = (cx - state.panX) / oldZ;
    const iy = (cy - state.panY) / oldZ;
    state.panX = cx - ix * newZ;
    state.panY = cy - iy * newZ;
    state.zoom = newZ;
    updateZoomLabel(); render();
  }

  canvasArea.addEventListener('wheel', e => {
    if (!state.img) return;
    e.preventDefault();
    const r = canvasArea.getBoundingClientRect();
    let d = -e.deltaY;
    if (e.deltaMode === 1) d *= 40;
    if (e.deltaMode === 2) d *= 800;
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.pow(1.002, d));
  }, { passive: false });

  // ── Pan + Click ──
  const DRAG_THRESHOLD = 4;

  canvasArea.addEventListener('mousedown', e => {
    if (!state.img || e.button !== 0) return;
    e.preventDefault();
    state.dragStart = { x: e.clientX, y: e.clientY };
    state.lastPan = { x: state.panX, y: state.panY };
    state.dragging = false;
    state.mouseDown = true;
    canvasArea.classList.add('dragging');
  });

  window.addEventListener('mousemove', e => {
    if (!state.mouseDown) return;
    const dx = e.clientX - state.dragStart.x;
    const dy = e.clientY - state.dragStart.y;
    if (!state.dragging && Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) state.dragging = true;
    if (state.dragging) {
      state.panX = state.lastPan.x + dx;
      state.panY = state.lastPan.y + dy;
      render();
    }
  });

  window.addEventListener('mouseup', e => {
    if (!state.mouseDown) return;
    const wasDrag = state.dragging;
    state.mouseDown = false;
    state.dragging = false;
    canvasArea.classList.remove('dragging');

    if (!wasDrag && state.hoverImgCoords) {
      if (state.chainMode && state.picked) {
        const r = getCode();
        if (r) {
          state.chainedLines.push(r.code);
          state.chainedPicks.push({ x: state.picked.x, y: state.picked.y });
          navigator.clipboard.writeText(state.chainedLines.join('\n'));
          addHistory(r.coords);
          toast(`Chained ${state.chainedLines.length} clicks`);
        }
      }
      state.picked = { x: state.hoverImgCoords.x, y: state.hoverImgCoords.y };
      render(); updatePickUI();
    }
  });

  // ── Hover: coords + zoom lens + cursor label ──
  const LENS = 140, LENS_Z = 4;

  displayImg.addEventListener('mousemove', e => {
    if (state.dragging || state.mouseDown) {
      zoomLens.style.display = 'none'; cursorLabel.style.display = 'none'; return;
    }

    const imgCoords = getImgCoordsFromEvent(e);
    state.hoverImgCoords = imgCoords;

    // Scale to bot coords for display
    const coords = toBotCoords(imgCoords.x, imgCoords.y);
    $('#status-cursor').textContent = `${coords.x}, ${coords.y}`;

    // Cursor label
    cursorLabel.style.display = 'block';
    cursorLabel.textContent = `${coords.x}, ${coords.y}`;
    let lbX = e.clientX + 16, lbY = e.clientY + 20;
    const lbW = cursorLabel.offsetWidth, lbH = cursorLabel.offsetHeight;
    if (lbX + lbW > window.innerWidth - 4) lbX = e.clientX - lbW - 12;
    if (lbY + lbH > window.innerHeight - 4) lbY = e.clientY - lbH - 12;
    cursorLabel.style.left = lbX + 'px';
    cursorLabel.style.top = lbY + 'px';

    // Zoom lens
    zoomLens.style.display = 'block';
    let lx = e.clientX + 20, ly = e.clientY - LENS - 10;
    if (ly < 0) ly = e.clientY + 20;
    if (lx + LENS > window.innerWidth) lx = e.clientX - LENS - 20;
    if (ly > lbY - LENS - 8 && ly < lbY + lbH + 8 && lx < lbX + lbW + 8 && lx + LENS > lbX - 8) {
      ly = e.clientY - LENS - 30;
      if (ly < 0) ly = e.clientY + lbH + 28;
    }
    zoomLens.style.left = lx + 'px';
    zoomLens.style.top = ly + 'px';

    const src = LENS / LENS_Z;
    zoomCtx.imageSmoothingEnabled = false;
    zoomCtx.clearRect(0, 0, LENS, LENS);
    zoomCtx.drawImage(srcCanvas, imgCoords.x - src/2, imgCoords.y - src/2, src, src, 0, 0, LENS, LENS);
  });

  function hideOverlays() {
    zoomLens.style.display = 'none';
    cursorLabel.style.display = 'none';
    state.hoverImgCoords = null;
    $('#status-cursor').textContent = '—';
  }
  displayImg.addEventListener('mouseleave', () => { if (!state.dragging) hideOverlays(); });
  canvasArea.addEventListener('mouseleave', hideOverlays);

  // ── Coordinate scaling ──
  // Scale image pixels to bot-screen pixels (1920x1080), then subtract chrome bar.
  function toBotCoords(imgX, imgY) {
    const sx = state.botW / state.imgW;
    const sy = state.botH / state.imgH;
    return {
      x: Math.round(imgX * sx),
      y: Math.round(imgY * sy) - state.chromeHeight,
    };
  }

  function getBotCoords() {
    if (!state.picked) return null;
    return toBotCoords(state.picked.x, state.picked.y);
  }

  function updatePickUI() {
    const cd = $('#coord-display'), cr = $('#coord-raw'), co = $('#code-output');
    const bot = getBotCoords();
    if (!bot) {
      cd.className = 'coord-big empty'; cd.textContent = 'Click on image';
      cr.textContent = '';
      co.innerHTML = `<span class="cmt">// Click on the screenshot to\n// generate the code snippet.</span>`;
      return;
    }
    cd.className = 'coord-big'; cd.textContent = `${bot.x}, ${bot.y}`;
    const isScaled = state.imgW !== state.botW || state.imgH !== state.botH;
    const parts = [];
    if (isScaled) parts.push(`img: ${state.picked.x},${state.picked.y}`);
    if (state.chromeHeight) parts.push(`chrome: −${state.chromeHeight}`);
    cr.textContent = parts.join(' | ');

    const currentLine = `<span class="fn">b.web.clickInCoordinates</span>({ <span class="str">x</span>: <span class="fn">b.Number</span>(<span class="num">${bot.x}</span>), <span class="str">y</span>: <span class="fn">b.Number</span>(<span class="num">${bot.y}</span>) }, { <span class="str">systemEvents</span>: <span class="kw">true</span> }),`;
    if (state.chainMode && state.chainedLines.length) {
      const prev = state.chainedLines.map(line =>
        line.replace(/b\.web\.clickInCoordinates/g, '<span class="fn">b.web.clickInCoordinates</span>')
            .replace(/b\.Number/g, '<span class="fn">b.Number</span>')
            .replace(/systemEvents/g, '<span class="str">systemEvents</span>')
            .replace(/true/g, '<span class="kw">true</span>')
            .replace(/\d+/g, m => `<span class="num">${m}</span>`)
      ).join('\n');
      co.innerHTML = prev + '\n' + currentLine;
    } else {
      co.innerHTML = currentLine;
    }
  }

  // ── Copy ──
  function getCode() {
    const bot = getBotCoords();
    if (!bot) return null;
    return {
      coords: bot,
      code: `b.web.clickInCoordinates({ x: b.Number(${bot.x}), y: b.Number(${bot.y}) }, { systemEvents: true }),`
    };
  }

  $('#btn-copy-coords').addEventListener('click', () => {
    const r = getCode();
    if (!r) { toast('Click on image first'); return; }
    navigator.clipboard.writeText(`${r.coords.x}, ${r.coords.y}`);
    toast('Coordinates copied!'); addHistory(r.coords);
  });

  $('#btn-copy-code').addEventListener('click', () => {
    const r = getCode();
    if (!r) { toast('Click on image first'); return; }
    const allCode = state.chainMode && state.chainedLines.length
      ? [...state.chainedLines, r.code].join('\n')
      : r.code;
    navigator.clipboard.writeText(allCode);
    toast('Code copied!'); addHistory(r.coords);
  });

  // ── History ──
  function addHistory(coords) {
    if (state.history.length && state.history[0].x === coords.x && state.history[0].y === coords.y) return;
    state.history.unshift({ x: coords.x, y: coords.y, time: new Date().toLocaleTimeString() });
    if (state.history.length > 15) state.history.pop();
    renderHistory();
  }

  function renderHistory() {
    const list = $('#history-list');
    if (!state.history.length) { list.innerHTML = '<div class="history-empty">No picks yet</div>'; return; }
    list.innerHTML = state.history.map((h, i) =>
      `<div class="history-item" data-idx="${i}"><span>${h.time}</span><span class="h-coords">${h.x}, ${h.y}</span></div>`
    ).join('');
    list.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        const h = state.history[el.dataset.idx];
        navigator.clipboard.writeText(`b.web.clickInCoordinates({ x: b.Number(${h.x}), y: b.Number(${h.y}) }, { systemEvents: true }),`);
        toast(`Copied ${h.x}, ${h.y}`);
      });
    });
  }

  // ── Chain Mode ──
  $('#btn-chain').addEventListener('click', () => {
    state.chainMode = !state.chainMode;
    if (!state.chainMode) { state.chainedLines = []; state.chainedPicks = []; }
    $('#btn-chain').classList.toggle('btn-active', state.chainMode);
    toast(state.chainMode ? 'Chain mode ON — clicks build code' : 'Chain mode OFF');
    if (state.picked) updatePickUI();
  });

  // ── Clear ──
  $('#btn-clear').addEventListener('click', () => {
    state.picked = null; render(); updatePickUI();
  });

  // ── Keyboard ──
  document.addEventListener('keydown', e => {
    if (document.activeElement.tagName === 'INPUT') return;
    if (e.key === '+' || e.key === '=') changeZoom(1.25);
    if (e.key === '-') changeZoom(0.8);
    if (e.key === '0') { fitToView(); render(); }
    if (e.key === 'Escape') { state.picked = null; render(); updatePickUI(); }
  });
})();
