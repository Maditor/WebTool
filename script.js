(() => {
  const $ = id => document.getElementById(id);
  const supportsFS = 'showDirectoryPicker' in window;
  const isTauri = typeof window !== 'undefined' && !!window.__TAURI__;

  // Elements
  const els = {
    inputPathDisplay: $('inputPathDisplay'),
    outputPathDisplay: $('outputPathDisplay'),
    btnBrowseInput: $('btnBrowseInput'),
    btnBrowseOutput: $('btnBrowseOutput'),
    inputFolderFallback: $('inputFolderFallback'),
    outputType: $('outputType'),
    quality: $('quality'),
    cutModeSwitch: $('cutModeSwitch'),
    heightModeHint: $('heightModeHint'),
    roughHeight: $('roughHeight'),
    widthMode: $('widthMode'),
    searchWindow: $('searchWindow'),
    sensitivity: $('sensitivity'),
    statusBox: $('statusBox'),
    btnStart: $('btnStart'),
    outputModeNote: $('outputModeNote'),
    advToggle: $('advToggle'),
    advBody: $('advBody'),
    cutSettingsCard: $('cutSettingsCard'),
    renameSettingsCard: $('renameSettingsCard'),
    logoSettingsCard: $('logoSettingsCard'),
    renameSeqEnabled: $('renameSeqEnabled'),
    renamePadLength: $('renamePadLength'),
    renameExtMode: $('renameExtMode'),
    renameCustomExtField: $('renameCustomExtField'),
    renameCustomExt: $('renameCustomExt'),
    logoPathDisplay: $('logoPathDisplay'),
    btnBrowseLogo: $('btnBrowseLogo'),
    logoFileInput: $('logoFileInput'),
    logoHeight: $('logoHeight'),
    logoOpacity: $('logoOpacity'),
    logoAlignH: $('logoAlignH'),
    logoAlignV: $('logoAlignV'),
    logoPadX: $('logoPadX'),
    logoPadY: $('logoPadY'),
  };

  let currentModule = 'cut';
  let inputFiles = [];               // {name, file, path} path chỉ có khi Tauri
  let inputDirHandle = null;
  let inputDirPath = null;           // Tauri: tuyệt đối, web: tên thư mục
  let outputDirHandle = null;
  let outputDirPath = null;          // Tauri: tuyệt đối
  let outputMode = isTauri ? null : (supportsFS ? null : 'zip');
  let logoFile = null;
  let cutHeightMode = 'auto'; // 'auto' = dò điểm cắt an toàn, 'manual' = chiều cao cố định

  // ==================== LƯU / KHÔI PHỤC CÀI ĐẶT ====================
  // Tauri (đóng gói app) -> lưu vào file JSON trong thư mục dữ liệu ứng dụng.
  // Web (chạy trên trình duyệt) -> lưu vào localStorage.
  const SETTINGS_KEY = 'webtool_settings_v1';
  const SETTINGS_FILE_NAME = 'webtool-settings.json';

  function collectSettings() {
    return {
      currentModule,
      inputDirPath,
      outputDirPath,
      cut: {
        outputType: els.outputType.value,
        quality: els.quality.value,
        heightMode: cutHeightMode,
        roughHeight: els.roughHeight.value,
        widthMode: els.widthMode.value,
        searchWindow: els.searchWindow.value,
        sensitivity: els.sensitivity.value,
      },
      rename: {
        seqEnabled: els.renameSeqEnabled.checked,
        padLength: els.renamePadLength.value,
        extMode: els.renameExtMode.value,
        customExt: els.renameCustomExt.value,
      },
      logo: {
        height: els.logoHeight.value,
        opacity: els.logoOpacity.value,
        alignH: els.logoAlignH.value,
        alignV: els.logoAlignV.value,
        padX: els.logoPadX.value,
        padY: els.logoPadY.value,
      },
    };
  }

  function applySettings(data) {
    if (!data) return;
    if (data.cut) {
      if (data.cut.outputType) els.outputType.value = data.cut.outputType;
      if (data.cut.quality != null) els.quality.value = data.cut.quality;
      if (data.cut.heightMode) setCutHeightMode(data.cut.heightMode, true);
      if (data.cut.roughHeight != null) els.roughHeight.value = data.cut.roughHeight;
      if (data.cut.widthMode) els.widthMode.value = data.cut.widthMode;
      if (data.cut.searchWindow != null) els.searchWindow.value = data.cut.searchWindow;
      if (data.cut.sensitivity != null) els.sensitivity.value = data.cut.sensitivity;
    }
    if (data.rename) {
      if (data.rename.seqEnabled != null) els.renameSeqEnabled.checked = data.rename.seqEnabled;
      if (data.rename.padLength != null) els.renamePadLength.value = data.rename.padLength;
      if (data.rename.extMode) {
        els.renameExtMode.value = data.rename.extMode;
        els.renameCustomExtField.style.display = data.rename.extMode === 'custom' ? '' : 'none';
      }
      if (data.rename.customExt != null) els.renameCustomExt.value = data.rename.customExt;
    }
    if (data.logo) {
      if (data.logo.height != null) els.logoHeight.value = data.logo.height;
      if (data.logo.opacity != null) els.logoOpacity.value = data.logo.opacity;
      if (data.logo.alignH) els.logoAlignH.value = data.logo.alignH;
      if (data.logo.alignV) els.logoAlignV.value = data.logo.alignV;
      if (data.logo.padX != null) els.logoPadX.value = data.logo.padX;
      if (data.logo.padY != null) els.logoPadY.value = data.logo.padY;
    }
    // Đường dẫn ra: khôi phục được ngay vì Tauri lưu path tuyệt đối.
    if (data.outputDirPath) {
      outputDirPath = data.outputDirPath;
      els.outputPathDisplay.value = outputDirPath;
      if (isTauri) outputMode = 'tauri';
    }
    // Đường dẫn vào: hiển thị lại cho người dùng biết, việc nạp ảnh thật
    // sẽ do init() xử lý riêng (chỉ tự nạp lại được khi chạy Tauri).
    if (data.inputDirPath) {
      inputDirPath = data.inputDirPath;
      els.inputPathDisplay.value = isTauri ? inputDirPath.split(/[/\\]/).pop() : inputDirPath;
    }
  }

  async function getTauriSettingsFilePath() {
    const dir = await window.__TAURI__.path.appDataDir();
    await window.__TAURI__.fs.createDir(dir, { recursive: true });
    return await window.__TAURI__.path.join(dir, SETTINGS_FILE_NAME);
  }

  async function saveSettings() {
    const data = collectSettings();
    if (isTauri) {
      try {
        if (!window.__TAURI__.fs || !window.__TAURI__.path) return;
        const filePath = await getTauriSettingsFilePath();
        const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
        await window.__TAURI__.fs.writeFile(filePath, bytes);
      } catch (e) {
        console.warn('Không lưu được cài đặt (Tauri):', e);
      }
    } else {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn('Không lưu được cài đặt (localStorage):', e);
      }
    }
  }

  async function loadSettings() {
    if (isTauri) {
      try {
        if (!window.__TAURI__.fs || !window.__TAURI__.path) return null;
        const filePath = await getTauriSettingsFilePath();
        const bytes = await window.__TAURI__.fs.readFile(filePath);
        const text = new TextDecoder().decode(bytes);
        return JSON.parse(text);
      } catch (e) {
        return null; // chưa có file cài đặt trước đó
      }
    } else {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }
  }

  // Tự lưu mỗi khi người dùng đổi 1 thông số cài đặt
  [
    els.outputType, els.quality, els.roughHeight, els.widthMode, els.searchWindow, els.sensitivity,
    els.renameSeqEnabled, els.renamePadLength, els.renameExtMode, els.renameCustomExt,
    els.logoHeight, els.logoOpacity, els.logoAlignH, els.logoAlignV, els.logoPadX, els.logoPadY,
  ].forEach(el => el.addEventListener('change', saveSettings));

  // ---- UI MODE ----
  if (isTauri) {
    els.outputModeNote.textContent = 'Đang chạy dưới dạng ứng dụng Tauri.';
  } else {
    els.outputModeNote.textContent = supportsFS
      ? 'Trình duyệt hỗ trợ ghi trực tiếp vào thư mục.'
      : 'Trình duyệt không hỗ trợ ghi trực tiếp — ảnh sẽ được tải về dạng .zip.';
  }

  els.advToggle.addEventListener('click', () => {
    els.advToggle.classList.toggle('open');
    els.advBody.classList.toggle('show');
  });

  // ---- Chế độ cắt: Tự Động (dò điểm cắt an toàn) / Cố Định (chiều cao cố định) ----
  function setCutHeightMode(mode, skipSave) {
    cutHeightMode = mode;
    els.cutModeSwitch.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    if (mode === 'manual') {
      els.heightModeHint.textContent = '(cố định, px)';
      els.advToggle.style.display = 'none';
      els.advBody.classList.remove('show');
      els.advBody.style.display = 'none';
      els.advToggle.classList.remove('open');
    } else {
      els.heightModeHint.textContent = '(gần đúng, px)';
      els.advToggle.style.display = '';
      els.advBody.style.display = '';
    }
    if (!skipSave) saveSettings();
  }
  els.cutModeSwitch.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setCutHeightMode(btn.dataset.mode));
  });

  // ---- Tab switching ----
  const tabs = document.querySelectorAll('.tool-tab:not(.disabled)');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const module = tab.dataset.module;
      if (!module) return;
      switchModule(module);
    });
  });

  function switchModule(module) {
    currentModule = module;
    tabs.forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.tool-tab[data-module="${module}"]`);
    if (activeTab) activeTab.classList.add('active');

    els.cutSettingsCard.style.display = module === 'cut' ? '' : 'none';
    els.renameSettingsCard.style.display = module === 'rename' ? '' : 'none';
    els.logoSettingsCard.style.display = module === 'logo' ? '' : 'none';

    setStatus('Chờ lệnh…');
    updateStartEnabled();
    saveSettings();
  }

  // Logo file selection
  els.btnBrowseLogo.addEventListener('click', () => els.logoFileInput.click());
  els.logoFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      logoFile = e.target.files[0];
      els.logoPathDisplay.value = logoFile.name;
      updateStartEnabled();
    }
  });

  // Auto padding logo
  function updateLogoPadding() {
    const h = els.logoAlignH.value;
    const v = els.logoAlignV.value;
    els.logoPadX.value = (h === 'center') ? 0 : 10;
    els.logoPadY.value = (v === 'center') ? 0 : 10;
  }
  els.logoAlignH.addEventListener('change', updateLogoPadding);
  els.logoAlignV.addEventListener('change', updateLogoPadding);

  // ---- Helpers ----
  // Không còn ô log/tiến trình riêng — mọi thông báo hiển thị ngay trong thanh trạng thái.
  let statusPhaseText = '';

  function setStatus(text, kind) {
    statusPhaseText = text;
    els.statusBox.textContent = text;
    els.statusBox.className = 'status-box' + (kind ? ' ' + kind : '');
  }

  function log(msg, cls) {
    const kind = cls === 'l-err' ? 'err' : (cls === 'l-warn' ? 'busy' : undefined);
    setStatus(msg, kind);
  }

  function setProgress(pct, countText) {
    if (!countText) return;
    els.statusBox.textContent = `${statusPhaseText} (${countText})`;
  }

  function naturalCompare(a, b) {
    const re = /(\d+)|(\D+)/g;
    const ax = a.match(re) || [], bx = b.match(re) || [];
    const len = Math.max(ax.length, bx.length);
    for (let i = 0; i < len; i++) {
      const av = ax[i] || '', bv = bx[i] || '';
      const an = parseInt(av, 10), bn = parseInt(bv, 10);
      if (!isNaN(an) && !isNaN(bn)) {
        if (an !== bn) return an - bn;
      } else if (av !== bv) {
        return av < bv ? -1 : 1;
      }
    }
    return 0;
  }

  const IMG_RE = /\.(png|jpe?g|webp)$/i;

  // ---- INPUT SELECTION ----
  async function readTauriImageDir(dirPath) {
    const entries = await window.__TAURI__.fs.readDir(dirPath);
    const items = [];
    for (const entry of entries) {
      if (entry.kind === 'file' && IMG_RE.test(entry.name)) {
        const fullPath = await window.__TAURI__.path.join(dirPath, entry.name);
        const data = await window.__TAURI__.fs.readFile(fullPath);
        const ext = entry.name.split('.').pop().toLowerCase();
        const mime = ext === 'jpg' ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'image/png');
        const blob = new Blob([data], { type: mime });
        const file = new File([blob], entry.name);
        items.push({ name: entry.name, file, path: fullPath });
      }
    }
    items.sort((a, b) => naturalCompare(a.name, b.name));
    return items;
  }

  els.btnBrowseInput.addEventListener('click', async () => {
    if (isTauri) {
      if (!window.__TAURI__.dialog || !window.__TAURI__.fs || !window.__TAURI__.path) {
        log('Thiếu plugin Tauri.', 'l-err');
        return;
      }
      try {
        const dir = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: 'Chọn thư mục ảnh' });
        if (dir) {
          inputDirPath = Array.isArray(dir) ? dir[0] : dir;
          els.inputPathDisplay.value = inputDirPath.split(/[/\\]/).pop();
          inputFiles = await readTauriImageDir(inputDirPath);
          afterInputLoaded();
          saveSettings();
        }
      } catch (e) {
        log('Không chọn được thư mục: ' + e.message, 'l-err');
      }
    } else if (supportsFS) {
      try {
        inputDirHandle = await window.showDirectoryPicker();
        inputDirPath = inputDirHandle.name; // tên thư mục
        els.inputPathDisplay.value = inputDirHandle.name;
        const items = [];
        for await (const [name, handle] of inputDirHandle.entries()) {
          if (handle.kind === 'file' && IMG_RE.test(name)) {
            items.push({ name, file: await handle.getFile(), path: null });
          }
        }
        items.sort((a, b) => naturalCompare(a.name, b.name));
        inputFiles = items;
        afterInputLoaded();
        saveSettings();
      } catch (e) {
        if (e.name !== 'AbortError') log('Không mở được thư mục: ' + e.message, 'l-err');
      }
    } else {
      els.inputFolderFallback.click();
    }
  });

  els.inputFolderFallback.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(f => IMG_RE.test(f.name));
    files.sort((a, b) => naturalCompare(a.webkitRelativePath || a.name, b.webkitRelativePath || b.name));
    inputFiles = files.map(f => ({ name: f.name, file: f, path: null }));
    const folder = files[0] && files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : 'thư mục đã chọn';
    inputDirPath = folder;
    els.inputPathDisplay.value = folder;
    afterInputLoaded();
    saveSettings();
  });

  function afterInputLoaded() {
    log(`Đã nạp ${inputFiles.length} ảnh.`, 'l-ok');
    updateStartEnabled();
  }

  // ---- OUTPUT SELECTION ----
  els.btnBrowseOutput.addEventListener('click', async () => {
    if (isTauri) {
      try {
        const dir = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: 'Chọn thư mục xuất' });
        if (dir) {
          outputDirPath = Array.isArray(dir) ? dir[0] : dir;
          els.outputPathDisplay.value = outputDirPath;
          outputMode = 'tauri';
        }
      } catch (e) {
        log('Không chọn được thư mục xuất: ' + e.message, 'l-err');
      }
    } else if (supportsFS) {
      try {
        outputDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        els.outputPathDisplay.value = outputDirHandle.name;
        outputMode = 'fsapi';
      } catch (e) {
        if (e.name !== 'AbortError') log('Không chọn được thư mục xuất: ' + e.message, 'l-err');
      }
    } else {
      els.outputPathDisplay.value = '(sẽ tải về .zip)';
      outputMode = 'zip';
    }
    updateStartEnabled();
    saveSettings();
  });

  function updateStartEnabled() {
    const hasIn = inputFiles.length > 0;
    let hasOut = true;
    if (isTauri) {
      if (currentModule === 'rename') {
        // Cho phép không cần chọn output, sẽ đổi tên tại chỗ
        hasOut = true;
      } else {
        hasOut = !!outputDirPath;
      }
    }
    if (currentModule === 'logo' && !logoFile) {
      els.btnStart.disabled = true;
      return;
    }
    els.btnStart.disabled = !(hasIn && hasOut);

    if (isTauri) {
      if (currentModule === 'rename') {
        els.outputModeNote.textContent = outputDirPath
          ? `Sẽ lưu file đã đổi tên vào: ${outputDirPath}`
          : 'Sẽ đổi tên trực tiếp trong thư mục nguồn.';
      } else {
        els.outputModeNote.textContent = outputDirPath
          ? `Sẽ tạo thư mục con và lưu tại: ${outputDirPath}`
          : 'Vui lòng chọn thư mục xuất.';
      }
    } else if (hasIn && supportsFS && !outputDirHandle) {
      els.outputModeNote.textContent = 'Chưa chọn thư mục xuất — ảnh sẽ được tải về .zip.';
    }
  }

  // ---- MAIN RUN ----
  els.btnStart.addEventListener('click', async () => {
    if (currentModule === 'cut') await runCut();
    else if (currentModule === 'rename') await runRename();
    else if (currentModule === 'logo') await runLogo();
  });

  // ==================== CUT MODULE ====================
  async function runCut() {
    els.btnStart.disabled = true;
    const outputType = els.outputType.value;
    const quality = Math.min(100, Math.max(1, parseInt(els.quality.value, 10) || 100)) / 100;
    const roughHeight = Math.max(500, parseInt(els.roughHeight.value, 10) || 13000);
    const widthMode = els.widthMode.value;
    const searchWindow = Math.max(30, parseInt(els.searchWindow.value, 10) || 1000);
    const sensitivity = Math.max(0, parseInt(els.sensitivity.value, 10) || 5);
    const ext = outputType === 'image/jpeg' ? 'jpg' : outputType === 'image/webp' ? 'webp' : 'png';

    try {
      setStatus('Đang tải ảnh…', 'busy');
      setProgress(0, `0 / ${inputFiles.length}`);
      const layout = [];
      let firstWidth = 0, maxWidth = 0;

      for (let i = 0; i < inputFiles.length; i++) {
        const bmp = await createImageBitmap(inputFiles[i].file);
        if (i === 0) firstWidth = bmp.width;
        maxWidth = Math.max(maxWidth, bmp.width);
        layout.push({ name: inputFiles[i].name, bmp, srcW: bmp.width, srcH: bmp.height });
        setProgress((i + 1) / inputFiles.length * 25, `${i + 1} / ${inputFiles.length} ảnh đã tải`);
      }

      const canvasWidth = widthMode === 'scale' ? firstWidth : maxWidth;

      let cursor = 0;
      for (const it of layout) {
        if (widthMode === 'scale') {
          it.drawW = canvasWidth;
          it.drawH = Math.round(it.srcH * (canvasWidth / it.srcW));
          it.offsetX = 0;
        } else if (widthMode === 'pad') {
          it.drawW = it.srcW;
          it.drawH = it.srcH;
          it.offsetX = Math.floor((canvasWidth - it.srcW) / 2);
        } else {
          it.drawW = it.srcW;
          it.drawH = it.srcH;
          it.offsetX = 0;
        }
        it.start = cursor;
        it.end = cursor + it.drawH;
        cursor = it.end;
      }
      const totalHeight = cursor;
      log(`Đã ghép ${layout.length} ảnh, tổng chiều cao ${totalHeight}px, rộng ${canvasWidth}px.`);

      function drawRegion(ctx, destY, y0, h) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, destY, canvasWidth, h);
        const y1 = y0 + h;
        for (const it of layout) {
          if (it.end <= y0 || it.start >= y1) continue;
          const overlapStart = Math.max(it.start, y0);
          const overlapEnd = Math.min(it.end, y1);
          const localStart = overlapStart - it.start;
          const localH = overlapEnd - overlapStart;
          const scaleY = it.srcH / it.drawH;
          const srcY = localStart * scaleY;
          const srcH = localH * scaleY;
          const destYPix = destY + (overlapStart - y0);
          ctx.drawImage(it.bmp, 0, srcY, it.srcW, srcH, it.offsetX, destYPix, it.drawW, localH);
        }
      }

      function rowScore(data, width, row, channels) {
        let score = 0;
        const step = Math.max(1, Math.floor(width / 220));
        let prevR = null, prevG = null, prevB = null;
        let count = 0;
        for (let x = 0; x < width; x += step) {
          const idx = (row * width + x) * channels;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          if (prevR !== null) score += Math.abs(r - prevR) + Math.abs(g - prevG) + Math.abs(b - prevB);
          prevR = r; prevG = g; prevB = b;
          count++;
        }
        return count > 1 ? score / (count - 1) : 999;
      }

      async function findSafeCut(idealY) {
        let radius = searchWindow;
        let scannedStart = null, scannedEnd = null;
        let bestSafeRow = null, bestSafeDist = Infinity;
        let bestAnyRow = Math.round(idealY), bestAnyScore = Infinity;

        while (true) {
          const winStart = Math.max(1, Math.floor(idealY - radius));
          const winEnd = Math.min(totalHeight - 1, Math.ceil(idealY + radius));
          const segments = [];
          if (scannedStart === null) {
            segments.push([winStart, winEnd]);
          } else {
            if (winStart < scannedStart) segments.push([winStart, scannedStart]);
            if (winEnd > scannedEnd) segments.push([scannedEnd, winEnd]);
          }

          for (const [segStart, segEnd] of segments) {
            const segH = segEnd - segStart;
            if (segH < 1) continue;
            const cvs = document.createElement('canvas');
            cvs.width = canvasWidth;
            cvs.height = segH;
            const actx = cvs.getContext('2d', { willReadFrequently: true });
            drawRegion(actx, 0, segStart, segH);
            const imgData = actx.getImageData(0, 0, canvasWidth, segH).data;

            for (let row = 0; row < segH; row++) {
              const absY = segStart + row;
              const s = rowScore(imgData, canvasWidth, row, 4);
              const dist = Math.abs(absY - idealY);
              if (s <= sensitivity && dist < bestSafeDist) {
                bestSafeDist = dist;
                bestSafeRow = absY;
              }
              const total = s + dist * 0.01;
              if (total < bestAnyScore) {
                bestAnyScore = total;
                bestAnyRow = absY;
              }
            }
          }

          scannedStart = winStart;
          scannedEnd = winEnd;
          if (bestSafeRow !== null) return bestSafeRow;

          if (winStart <= 1 && winEnd >= totalHeight - 1) {
            log(`Không tìm thấy dòng cắt an toàn tuyệt đối, dùng dòng tốt nhất.`, 'l-warn');
            return bestAnyRow;
          }
          radius *= 2;
        }
      }

      const boundaries = [0];
      if (cutHeightMode === 'manual') {
        setStatus('Đang cắt theo chiều cao cố định…', 'busy');
        let pos = 0;
        while (totalHeight - pos > roughHeight) {
          pos += roughHeight;
          boundaries.push(pos);
          setProgress(25 + (pos / totalHeight) * 25, `${Math.round(pos)}/${totalHeight}px`);
        }
      } else {
        setStatus('Đang dò điểm cắt an toàn…', 'busy');
        let pos = 0;
        let guard = 0;
        while (totalHeight - pos > roughHeight * 1.5 && guard < 5000) {
          guard++;
          const ideal = pos + roughHeight;
          const cut = await findSafeCut(ideal);
          boundaries.push(cut);
          pos = cut;
          setProgress(25 + (pos / totalHeight) * 25, `dò: ${Math.round(pos)}/${totalHeight}px`);
        }
      }
      boundaries.push(totalHeight);
      const sliceCount = boundaries.length - 1;
      log(`Sẽ xuất ${sliceCount} ảnh.`, 'l-ok');

      // Tạo thư mục con nếu Tauri
      let finalOutputDir = outputDirPath;
      if (isTauri && outputDirPath) {
        const srcName = inputDirPath ? inputDirPath.split(/[/\\]/).pop() : 'images';
        const subDir = `${srcName} (đã ghép)`;
        finalOutputDir = await window.__TAURI__.path.join(outputDirPath, subDir);
        await window.__TAURI__.fs.createDir(finalOutputDir, { recursive: true });
        log(`Đã tạo thư mục: ${finalOutputDir}`, 'l-ok');
      }

      const mode = isTauri ? 'tauri' : (outputMode || 'zip');
      const padWidth = Math.max(3, String(sliceCount).length);
      let zip = null;
      if (mode === 'zip') {
        await ensureJSZip();
        zip = new JSZip();
      }

      setStatus('Đang xuất ảnh…', 'busy');
      for (let i = 0; i < sliceCount; i++) {
        const y0 = boundaries[i], y1 = boundaries[i + 1];
        const h = y1 - y0;
        const c = document.createElement('canvas');
        c.width = canvasWidth;
        c.height = h;
        const ctx = c.getContext('2d');
        drawRegion(ctx, 0, y0, h);

        const blob = await new Promise(res => c.toBlob(res, outputType, quality));
        const fname = `${String(i + 1).padStart(padWidth, '0')}.${ext}`;

        if (mode === 'tauri') {
          const fullPath = await window.__TAURI__.path.join(finalOutputDir, fname);
          const buf = new Uint8Array(await blob.arrayBuffer());
          await window.__TAURI__.fs.writeFile(fullPath, buf);
        } else if (mode === 'fsapi') {
          const fh = await outputDirHandle.getFileHandle(fname, { create: true });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
        } else {
          zip.file(fname, blob);
        }

        setProgress(50 + ((i + 1) / sliceCount) * 50, `${i + 1} / ${sliceCount} ảnh`);
        log(`Xuất ${fname} (cao ${h}px)`, 'l-ok');
      }

      if (mode === 'zip') {
        setStatus('Đang đóng gói .zip…', 'busy');
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'webtoon_output.zip';
        a.click();
        log('Đã tải file webtoon_output.zip', 'l-ok');
      }

      setProgress(100, `${sliceCount} / ${sliceCount} ảnh`);
      setStatus(`Hoàn tất — ${sliceCount} ảnh đã xuất.`, 'done');
    } catch (err) {
      console.error(err);
      setStatus('Lỗi: ' + err.message, 'err');
      log('Lỗi: ' + err.message, 'l-err');
    } finally {
      els.btnStart.disabled = false;
    }
  }

  // ==================== RENAME MODULE ====================
  async function runRename() {
    els.btnStart.disabled = true;
    const seqEnabled = els.renameSeqEnabled.checked;
    let padLength = parseInt(els.renamePadLength.value, 10);
    if (isNaN(padLength) || padLength < 1) padLength = 1;
    if (padLength > 10) padLength = 10;

    const extMode = els.renameExtMode.value;
    let customExt = '';
    if (extMode === 'custom') {
      customExt = els.renameCustomExt.value.trim().replace(/^\.+/, '');
      if (!customExt) {
        setStatus('Vui lòng nhập đuôi mở rộng.', 'err');
        els.btnStart.disabled = false;
        return;
      }
    }

    try {
      setStatus('Đang đổi tên…', 'busy');
      setProgress(0, `0 / ${inputFiles.length}`);

      const mode = isTauri ? 'tauri' : (outputMode || 'zip');
      let zip = null;
      if (mode === 'zip') {
        await ensureJSZip();
        zip = new JSZip();
      }

      let targetDir = outputDirPath;
      let doRenameInPlace = false;
      if (isTauri && !targetDir) {
        targetDir = inputDirPath;
        doRenameInPlace = true;
      }

      for (let i = 0; i < inputFiles.length; i++) {
        const item = inputFiles[i];
        const originalName = item.name;
        const lastDot = originalName.lastIndexOf('.');
        let origBase = originalName;
        let origExt = '';
        if (lastDot >= 0) {
          origBase = originalName.substring(0, lastDot);
          origExt = originalName.substring(lastDot + 1);
        }

        let newName = seqEnabled ? (i + 1).toString().padStart(padLength, '0') : origBase;
        let newExt = extMode === 'keep' ? origExt : customExt;
        const fname = newExt ? `${newName}.${newExt}` : newName;

        if (isTauri) {
          const oldPath = item.path;
          const newPath = await window.__TAURI__.path.join(targetDir, fname);
          if (doRenameInPlace) {
            await window.__TAURI__.fs.rename(oldPath, newPath);
            log(`Đã đổi tên: ${originalName} → ${fname}`, 'l-ok');
          } else {
            const data = await window.__TAURI__.fs.readFile(oldPath);
            await window.__TAURI__.fs.writeFile(newPath, data);
            log(`Đã copy và đổi tên: ${originalName} → ${fname}`, 'l-ok');
          }
        } else if (mode === 'fsapi') {
          const fh = await outputDirHandle.getFileHandle(fname, { create: true });
          const w = await fh.createWritable();
          await w.write(item.file);
          await w.close();
        } else {
          zip.file(fname, item.file);
        }

        setProgress(((i + 1) / inputFiles.length) * 100, `${i + 1} / ${inputFiles.length}`);
      }

      if (mode === 'zip') {
        setStatus('Đang đóng gói .zip…', 'busy');
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'renamed_files.zip';
        a.click();
        log('Đã tải file renamed_files.zip', 'l-ok');
      }

      setProgress(100, `${inputFiles.length} / ${inputFiles.length}`);
      setStatus(`Hoàn tất — ${inputFiles.length} file đã được đổi tên.`, 'done');
    } catch (err) {
      console.error(err);
      setStatus('Lỗi: ' + err.message, 'err');
      log('Lỗi: ' + err.message, 'l-err');
    } finally {
      els.btnStart.disabled = false;
    }
  }

  // ==================== LOGO MODULE ====================
  async function runLogo() {
    els.btnStart.disabled = true;
    if (!logoFile) {
      setStatus('Chưa chọn file logo.', 'err');
      els.btnStart.disabled = false;
      return;
    }

    const logoHeightTarget = Math.max(10, parseInt(els.logoHeight.value, 10) || 50);
    const opacity = Math.min(100, Math.max(0, parseInt(els.logoOpacity.value, 10) || 100)) / 100;
    const alignH = els.logoAlignH.value;
    const alignV = els.logoAlignV.value;
    const padX = Math.max(0, parseInt(els.logoPadX.value, 10) || 0);
    const padY = Math.max(0, parseInt(els.logoPadY.value, 10) || 0);
    const quality = 1.0; // Luôn xuất chất lượng 100%

    try {
      setStatus('Đang tải logo…', 'busy');
      const logoBmp = await createImageBitmap(logoFile);
      const logoRatio = logoBmp.width / logoBmp.height;
      const drawLogoH = logoHeightTarget;
      const drawLogoW = Math.round(drawLogoH * logoRatio);

      // Tạo thư mục con nếu Tauri
      let finalOutputDir = outputDirPath;
      if (isTauri && outputDirPath) {
        const srcName = inputDirPath ? inputDirPath.split(/[/\\]/).pop() : 'images';
        const subDir = `${srcName} (đã gắn logo)`;
        finalOutputDir = await window.__TAURI__.path.join(outputDirPath, subDir);
        await window.__TAURI__.fs.createDir(finalOutputDir, { recursive: true });
        log(`Đã tạo thư mục: ${finalOutputDir}`, 'l-ok');
      }

      const mode = isTauri ? 'tauri' : (outputMode || 'zip');
      let zip = null;
      if (mode === 'zip') {
        await ensureJSZip();
        zip = new JSZip();
      }

      const padWidth = Math.max(3, String(inputFiles.length).length);

      for (let i = 0; i < inputFiles.length; i++) {
        const item = inputFiles[i];
        const bmp = await createImageBitmap(item.file);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);

        let logoX, logoY;
        if (alignH === 'left') logoX = padX;
        else if (alignH === 'center') logoX = (canvas.width - drawLogoW) / 2;
        else logoX = canvas.width - drawLogoW - padX;

        if (alignV === 'top') logoY = padY;
        else if (alignV === 'center') logoY = (canvas.height - drawLogoH) / 2;
        else logoY = canvas.height - drawLogoH - padY;

        ctx.globalAlpha = opacity;
        ctx.drawImage(logoBmp, logoX, logoY, drawLogoW, drawLogoH);
        ctx.globalAlpha = 1.0;

        const origExt = item.name.split('.').pop().toLowerCase();
        const mime = origExt === 'jpg' ? 'image/jpeg' : (origExt === 'webp' ? 'image/webp' : 'image/png');
        const blob = await new Promise(res => canvas.toBlob(res, mime, quality));
        const fname = `${String(i + 1).padStart(padWidth, '0')}.${origExt}`;

        if (mode === 'tauri') {
          const fullPath = await window.__TAURI__.path.join(finalOutputDir, fname);
          const buf = new Uint8Array(await blob.arrayBuffer());
          await window.__TAURI__.fs.writeFile(fullPath, buf);
        } else if (mode === 'fsapi') {
          const fh = await outputDirHandle.getFileHandle(fname, { create: true });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
        } else {
          zip.file(fname, blob);
        }

        setProgress(((i + 1) / inputFiles.length) * 100, `${i + 1} / ${inputFiles.length}`);
        log(`Đã gắn logo: ${item.name} → ${fname}`, 'l-ok');
      }

      if (mode === 'zip') {
        setStatus('Đang đóng gói .zip…', 'busy');
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'logo_output.zip';
        a.click();
        log('Đã tải file logo_output.zip', 'l-ok');
      }

      setProgress(100, `${inputFiles.length} / ${inputFiles.length}`);
      setStatus(`Hoàn tất — đã gắn logo vào ${inputFiles.length} ảnh.`, 'done');
    } catch (err) {
      console.error(err);
      setStatus('Lỗi: ' + err.message, 'err');
      log('Lỗi: ' + err.message, 'l-err');
    } finally {
      els.btnStart.disabled = false;
    }
  }

  // JSZip loader
  let jszipLoading = null;
  function ensureJSZip() {
    if (window.JSZip) return Promise.resolve();
    if (jszipLoading) return jszipLoading;
    jszipLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Không tải được thư viện nén zip.'));
      document.head.appendChild(s);
    });
    return jszipLoading;
  }

  // Khởi động: nạp cài đặt đã lưu trước (nếu có) rồi mới bật giao diện
  async function init() {
    const saved = await loadSettings();
    applySettings(saved);

    const startModule = (saved && saved.currentModule) || 'cut';
    switchModule(startModule);

    // Chỉ Tauri mới có đường dẫn tuyệt đối nên có thể tự nạp lại ảnh.
    // Trên web, trình duyệt không cho lưu quyền truy cập thư mục qua
    // localStorage vì lý do bảo mật — người dùng cần bấm "Duyệt" lại.
    if (isTauri && inputDirPath && window.__TAURI__.fs && window.__TAURI__.path) {
      try {
        inputFiles = await readTauriImageDir(inputDirPath);
        afterInputLoaded();
      } catch (e) {
        log(`Không tự nạp lại được thư mục cũ (${inputDirPath}): ${e.message}`, 'l-warn');
      }
    } else if (!isTauri && inputDirPath) {
      log(`Đã khôi phục cài đặt trước đó. Vui lòng bấm "Duyệt" để chọn lại thư mục ảnh: ${inputDirPath}`, 'l-warn');
    }

    updateStartEnabled();
  }
  init();
})();
