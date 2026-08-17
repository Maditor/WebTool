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
    inputModeNote: $('inputModeNote'),
    outputType: $('outputType'),
    quality: $('quality'),
    cutModeSwitch: $('cutModeSwitch'),
    heightModeLabel: $('heightModeLabel'),
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

  // ---- Dữ liệu đầu vào theo NHÓM (mỗi nhóm = 1 thư mục ảnh sẽ xử lý & xuất riêng) ----
  // group: { name, files: [{name, file, path}], path? } — path chỉ có khi Tauri.
  let inputGroups = [];
  let inputDirHandle = null;       // web FS API: handle thư mục gốc đã chọn
  let inputDirPath = null;         // chuỗi hiển thị / lưu cài đặt (Tauri: path đầu tiên hoặc danh sách)
  let inputRootPaths = [];         // Tauri: danh sách (các) thư mục gốc đã chọn, để tự nạp lại khi khởi động
  let outputDirHandle = null;
  let outputDirPath = null;          // Tauri: tuyệt đối
  let outputMode = isTauri ? null : (supportsFS ? null : 'zip');
  let logoFile = null;
  let cutHeightMode = 'auto'; // 'auto' = dò điểm cắt an toàn, 'manual' = chiều cao cố định, 'divide' = chia đều

  // ==================== LƯU / KHÔI PHỤC CÀI ĐẶT ====================
  // Tauri (đóng gói app) -> lưu vào file JSON trong thư mục dữ liệu ứng dụng.
  // Web (chạy trên trình duyệt) -> lưu vào localStorage.
  const SETTINGS_KEY = 'webtool_settings_v1';
  const SETTINGS_FILE_NAME = 'webtool-settings.json';

  function collectSettings() {
    return {
      currentModule,
      inputDirPath,
      inputRootPaths,
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
    if (data.inputRootPaths && data.inputRootPaths.length) {
      inputRootPaths = data.inputRootPaths;
    }
    if (data.inputDirPath) {
      inputDirPath = data.inputDirPath;
      if (isTauri) {
        els.inputPathDisplay.value = inputRootPaths.length > 1
          ? `${inputRootPaths.length} thư mục đã chọn`
          : inputDirPath.split(/[/\\]/).pop();
      } else {
        els.inputPathDisplay.value = inputDirPath;
      }
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
    els.inputModeNote.textContent = 'Có thể chọn nhiều thư mục ảnh cùng lúc — mỗi thư mục sẽ được xử lý và xuất riêng theo tên của nó. Chọn 1 thư mục cha (chứa nhiều thư mục con) cũng được.';
  } else {
    els.outputModeNote.textContent = supportsFS
      ? 'Trình duyệt hỗ trợ ghi trực tiếp vào thư mục.'
      : 'Trình duyệt không hỗ trợ ghi trực tiếp — ảnh sẽ được tải về dạng .zip.';
    els.inputModeNote.textContent = 'Chọn 1 thư mục — nếu bên trong có nhiều thư mục con chứa ảnh, mỗi thư mục con sẽ được xử lý và xuất riêng theo tên của nó.';
  }

  els.advToggle.addEventListener('click', () => {
    els.advToggle.classList.toggle('open');
    els.advBody.classList.toggle('show');
  });

  // ---- Chế độ cắt: Tự Động / Cố Định / Chia Đều ----
  function setCutHeightMode(mode, skipSave) {
    const prevMode = cutHeightMode;
    cutHeightMode = mode;
    els.cutModeSwitch.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    if (mode === 'manual') {
      els.heightModeLabel.firstChild.textContent = 'Chiều Cao Xuất ';
      els.heightModeHint.style.display = '';
      els.heightModeHint.textContent = '(cố định, px)';
      els.roughHeight.min = 500;
      els.roughHeight.step = 100;
      if (prevMode === 'divide') els.roughHeight.value = 13000;
      els.advToggle.style.display = 'none';
      els.advBody.classList.remove('show');
      els.advBody.style.display = 'none';
      els.advToggle.classList.remove('open');
    } else if (mode === 'divide') {
      els.heightModeLabel.firstChild.textContent = 'Nhập Số Ảnh ';
      els.heightModeHint.style.display = 'none';
      els.roughHeight.min = 2;
      els.roughHeight.step = 1;
      if (prevMode !== 'divide') els.roughHeight.value = 2;
      els.advToggle.style.display = 'none';
      els.advBody.classList.remove('show');
      els.advBody.style.display = 'none';
      els.advToggle.classList.remove('open');
    } else {
      els.heightModeLabel.firstChild.textContent = 'Chiều Cao Xuất ';
      els.heightModeHint.style.display = '';
      els.heightModeHint.textContent = '(gần đúng, px)';
      els.roughHeight.min = 500;
      els.roughHeight.step = 100;
      if (prevMode === 'divide') els.roughHeight.value = 13000;
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

  // ==================== NHẬN THƯ MỤC ẢNH THEO NHÓM ====================
  // Mỗi "nhóm" tương ứng với 1 thư mục ảnh sẽ được xử lý & xuất RIÊNG,
  // tên nhóm = tên thư mục đó (dùng để đặt tên khi xuất).

  // ---- Tauri: đọc danh sách ảnh (không đệ quy) trong 1 thư mục ----
  async function readTauriImageDirFlat(dirPath) {
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

  // ---- Tauri: dựng danh sách nhóm từ 1 hoặc nhiều thư mục gốc đã chọn ----
  // Nếu 1 thư mục gốc chứa các thư mục con -> mỗi thư mục con là 1 nhóm riêng.
  // Nếu 1 thư mục gốc chỉ chứa ảnh trực tiếp -> bản thân nó là 1 nhóm.
  async function buildTauriGroupsFromRoots(rootPaths) {
    const groups = [];
    for (const root of rootPaths) {
      const rootName = root.split(/[/\\]/).pop();
      let entries;
      try {
        entries = await window.__TAURI__.fs.readDir(root);
      } catch (e) {
        log(`Không đọc được thư mục: ${root}`, 'l-err');
        continue;
      }
      const hasRootImages = entries.some(en => en.kind === 'file' && IMG_RE.test(en.name));
      const subDirs = entries.filter(en => en.kind === 'directory');

      if (subDirs.length > 0) {
        for (const sd of subDirs) {
          const subPath = await window.__TAURI__.path.join(root, sd.name);
          const files = await readTauriImageDirFlat(subPath);
          if (files.length > 0) groups.push({ name: sd.name, files, path: subPath });
        }
        if (hasRootImages) {
          const files = await readTauriImageDirFlat(root);
          groups.push({ name: rootName, files, path: root });
        }
      } else if (hasRootImages) {
        const files = await readTauriImageDirFlat(root);
        groups.push({ name: rootName, files, path: root });
      }
    }
    return groups;
  }

  // ---- Web (File System Access API) ----
  async function readDirHandleImagesFlat(dirHandle) {
    const items = [];
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'file' && IMG_RE.test(name)) {
        items.push({ name, file: await handle.getFile(), path: null });
      }
    }
    items.sort((a, b) => naturalCompare(a.name, b.name));
    return items;
  }

  async function buildFsApiGroupsFromRoot(rootHandle) {
    const groups = [];
    let hasRootImages = false;
    const subDirs = [];
    for await (const [name, handle] of rootHandle.entries()) {
      if (handle.kind === 'file' && IMG_RE.test(name)) hasRootImages = true;
      else if (handle.kind === 'directory') subDirs.push([name, handle]);
    }
    if (subDirs.length > 0) {
      for (const [name, handle] of subDirs) {
        const files = await readDirHandleImagesFlat(handle);
        if (files.length > 0) groups.push({ name, files });
      }
      if (hasRootImages) {
        const files = await readDirHandleImagesFlat(rootHandle);
        groups.push({ name: rootHandle.name, files });
      }
    } else {
      const files = await readDirHandleImagesFlat(rootHandle);
      if (files.length > 0) groups.push({ name: rootHandle.name, files });
    }
    return groups;
  }

  // ---- Trình duyệt không hỗ trợ FS Access API (input webkitdirectory) ----
  function buildFallbackGroups(files) {
    const rootName = files[0] && files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : 'thư mục đã chọn';
    const groupsMap = new Map();
    for (const f of files) {
      const relPath = f.webkitRelativePath || f.name;
      const parts = relPath.split('/');
      // Root/Sub/anh.jpg -> nhóm "Sub". Root/anh.jpg (không có thư mục con) -> nhóm = Root.
      const groupName = parts.length >= 3 ? parts[1] : rootName;
      if (!groupsMap.has(groupName)) groupsMap.set(groupName, []);
      groupsMap.get(groupName).push({ name: f.name, file: f, path: null });
    }
    const groupNames = Array.from(groupsMap.keys()).sort(naturalCompare);
    return groupNames.map(name => {
      const arr = groupsMap.get(name);
      arr.sort((a, b) => naturalCompare(a.name, b.name));
      return { name, files: arr };
    });
  }

  els.btnBrowseInput.addEventListener('click', async () => {
    if (isTauri) {
      if (!window.__TAURI__.dialog || !window.__TAURI__.fs || !window.__TAURI__.path) {
        log('Thiếu plugin Tauri.', 'l-err');
        return;
      }
      try {
        const dir = await window.__TAURI__.dialog.open({ directory: true, multiple: true, title: 'Chọn (các) thư mục ảnh' });
        if (dir) {
          const dirs = Array.isArray(dir) ? dir : [dir];
          setStatus('Đang quét thư mục…', 'busy');
          inputGroups = await buildTauriGroupsFromRoots(dirs);
          inputRootPaths = dirs;
          inputDirPath = dirs[0];
          els.inputPathDisplay.value = dirs.length === 1
            ? dirs[0].split(/[/\\]/).pop()
            : `${dirs.length} thư mục đã chọn`;
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
        setStatus('Đang quét thư mục…', 'busy');
        inputGroups = await buildFsApiGroupsFromRoot(inputDirHandle);
        els.inputPathDisplay.value = inputGroups.length > 1
          ? `${inputDirHandle.name} (${inputGroups.length} thư mục con)`
          : inputDirHandle.name;
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
    if (files.length === 0) {
      inputGroups = [];
      afterInputLoaded();
      return;
    }
    inputGroups = buildFallbackGroups(files);
    const folder = files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : 'thư mục đã chọn';
    inputDirPath = folder;
    els.inputPathDisplay.value = inputGroups.length > 1 ? `${folder} (${inputGroups.length} thư mục con)` : folder;
    afterInputLoaded();
    saveSettings();
  });

  function afterInputLoaded() {
    const totalImages = inputGroups.reduce((s, g) => s + g.files.length, 0);
    if (inputGroups.length === 0) {
      log('Không tìm thấy ảnh nào trong thư mục đã chọn.', 'l-warn');
    } else if (inputGroups.length === 1) {
      log(`Đã nạp ${totalImages} ảnh.`, 'l-ok');
    } else {
      log(`Đã nạp ${inputGroups.length} thư mục (${totalImages} ảnh) — sẽ xuất thành ${inputGroups.length} kết quả riêng.`, 'l-ok');
    }
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
    const hasIn = inputGroups.length > 0 && inputGroups.some(g => g.files.length > 0);
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
          : 'Sẽ đổi tên trực tiếp trong (các) thư mục nguồn.';
      } else {
        els.outputModeNote.textContent = outputDirPath
          ? `Sẽ tạo thư mục con (theo tên từng thư mục ảnh) và lưu tại: ${outputDirPath}`
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

  // ==================== GHI FILE ĐẦU RA THEO TỪNG NHÓM ====================
  // Trả về { write(fname, blob) } — tự động ghi vào đúng thư mục con / mục zip
  // ứng với tên của nhóm (thư mục ảnh gốc) khi có từ 2 nhóm trở lên.
  // tauriSuffix: hậu tố thêm vào tên thư mục con khi CHỈ CÓ 1 nhóm (giữ hành vi cũ),
  // khi có nhiều nhóm thì dùng đúng tên thư mục, không thêm hậu tố.
  async function makeGroupSink(mode, group, isMultiGroup, zipRoot, tauriSuffix) {
    if (mode === 'tauri') {
      let dir = outputDirPath;
      if (isMultiGroup) {
        dir = await window.__TAURI__.path.join(outputDirPath, group.name);
      } else if (tauriSuffix) {
        dir = await window.__TAURI__.path.join(outputDirPath, `${group.name}${tauriSuffix}`);
      }
      if (dir && dir !== outputDirPath) {
        await window.__TAURI__.fs.createDir(dir, { recursive: true });
        log(`Đã tạo thư mục: ${dir}`, 'l-ok');
      }
      return {
        write: async (fname, blob) => {
          const fullPath = await window.__TAURI__.path.join(dir, fname);
          const buf = new Uint8Array(await blob.arrayBuffer());
          await window.__TAURI__.fs.writeFile(fullPath, buf);
        },
      };
    }
    if (mode === 'fsapi') {
      const dirHandle = isMultiGroup
        ? await outputDirHandle.getDirectoryHandle(group.name, { create: true })
        : outputDirHandle;
      return {
        write: async (fname, blob) => {
          const fh = await dirHandle.getFileHandle(fname, { create: true });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
        },
      };
    }
    // zip
    const folder = isMultiGroup ? zipRoot.folder(group.name) : zipRoot;
    return {
      write: async (fname, blob) => { folder.file(fname, blob); },
    };
  }

  // ==================== CUT MODULE ====================
  async function runCut() {
    els.btnStart.disabled = true;
    const outputType = els.outputType.value;
    const quality = Math.min(100, Math.max(1, parseInt(els.quality.value, 10) || 100)) / 100;
    const roughHeight = cutHeightMode === 'divide'
      ? 0
      : Math.max(500, parseInt(els.roughHeight.value, 10) || 13000);
    const numSlices = cutHeightMode === 'divide'
      ? Math.max(2, parseInt(els.roughHeight.value, 10) || 2)
      : 0;
    const widthMode = els.widthMode.value;
    const searchWindow = Math.max(30, parseInt(els.searchWindow.value, 10) || 1000);
    const sensitivity = Math.max(0, parseInt(els.sensitivity.value, 10) || 5);
    const ext = outputType === 'image/jpeg' ? 'jpg' : outputType === 'image/webp' ? 'webp' : 'png';

    try {
      const mode = isTauri ? 'tauri' : (outputMode || 'zip');
      const isMultiGroup = inputGroups.length > 1;
      let zip = null;
      if (mode === 'zip') {
        await ensureJSZip();
        zip = new JSZip();
      }

      let totalSlicesAll = 0;

      for (let gi = 0; gi < inputGroups.length; gi++) {
        const group = inputGroups[gi];
        const groupFiles = group.files;
        const groupPrefix = isMultiGroup ? `[${group.name}] ` : '';

        setStatus(`${groupPrefix}Đang tải ảnh… (thư mục ${gi + 1}/${inputGroups.length})`, 'busy');
        setProgress(0, `0 / ${groupFiles.length}`);
        const layout = [];
        let firstWidth = 0, maxWidth = 0;

        for (let i = 0; i < groupFiles.length; i++) {
          const bmp = await createImageBitmap(groupFiles[i].file);
          if (i === 0) firstWidth = bmp.width;
          maxWidth = Math.max(maxWidth, bmp.width);
          layout.push({ name: groupFiles[i].name, bmp, srcW: bmp.width, srcH: bmp.height });
          setProgress((i + 1) / groupFiles.length * 25, `${i + 1} / ${groupFiles.length} ảnh đã tải`);
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
            it.offsetX = Math.floor((canvasWidth - it.srcW) / 2);
          }
          it.start = cursor;
          it.end = cursor + it.drawH;
          cursor = it.end;
        }
        const totalHeight = cursor;
        log(`${groupPrefix}Đã ghép ${layout.length} ảnh, tổng chiều cao ${totalHeight}px, rộng ${canvasWidth}px.`);

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
              log(`${groupPrefix}Không tìm thấy dòng cắt an toàn tuyệt đối, dùng dòng tốt nhất.`, 'l-warn');
              return bestAnyRow;
            }
            radius *= 2;
          }
        }

        const boundaries = [0];
        if (cutHeightMode === 'manual') {
          setStatus(`${groupPrefix}Đang cắt theo chiều cao cố định…`, 'busy');
          let pos = 0;
          while (totalHeight - pos > roughHeight) {
            pos += roughHeight;
            boundaries.push(pos);
            setProgress(25 + (pos / totalHeight) * 25, `${Math.round(pos)}/${totalHeight}px`);
          }
        } else if (cutHeightMode === 'divide') {
          setStatus(`${groupPrefix}Đang chia đều ảnh…`, 'busy');
          for (let i = 1; i < numSlices; i++) {
            const pos = Math.round((totalHeight * i) / numSlices);
            boundaries.push(pos);
            setProgress(25 + (i / numSlices) * 25, `${i}/${numSlices} phần`);
          }
        } else {
          setStatus(`${groupPrefix}Đang dò điểm cắt an toàn…`, 'busy');
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
        log(`${groupPrefix}Sẽ xuất ${sliceCount} ảnh.`, 'l-ok');

        const sink = await makeGroupSink(mode, group, isMultiGroup, zip, ' (đã ghép)');
        const padWidth = Math.max(3, String(sliceCount).length);

        setStatus(`${groupPrefix}Đang xuất ảnh…`, 'busy');
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

          await sink.write(fname, blob);

          setProgress(50 + ((i + 1) / sliceCount) * 50, `${i + 1} / ${sliceCount} ảnh`);
          log(`${groupPrefix}Xuất ${fname} (cao ${h}px)`, 'l-ok');
        }

        totalSlicesAll += sliceCount;

        // Giải phóng bitmap để tránh tốn bộ nhớ khi xử lý nhiều thư mục liên tiếp
        layout.forEach(it => { if (it.bmp && it.bmp.close) it.bmp.close(); });
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

      setProgress(100, `${totalSlicesAll} ảnh`);
      setStatus(`Hoàn tất — ${totalSlicesAll} ảnh đã xuất từ ${inputGroups.length} thư mục.`, 'done');
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
      const mode = isTauri ? 'tauri' : (outputMode || 'zip');
      const isMultiGroup = inputGroups.length > 1;
      const doRenameInPlace = isTauri && !outputDirPath;
      let zip = null;
      if (mode === 'zip') {
        await ensureJSZip();
        zip = new JSZip();
      }

      const totalFiles = inputGroups.reduce((s, g) => s + g.files.length, 0);
      let doneCount = 0;

      for (let gi = 0; gi < inputGroups.length; gi++) {
        const group = inputGroups[gi];
        const groupPrefix = isMultiGroup ? `[${group.name}] ` : '';
        setStatus(`${groupPrefix}Đang đổi tên… (thư mục ${gi + 1}/${inputGroups.length})`, 'busy');

        let sink = null;
        if (!doRenameInPlace) {
          sink = await makeGroupSink(mode, group, isMultiGroup, zip);
        }

        for (let i = 0; i < group.files.length; i++) {
          const item = group.files[i];
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

          if (doRenameInPlace) {
            const newPath = await window.__TAURI__.path.join(group.path, fname);
            await window.__TAURI__.fs.rename(item.path, newPath);
            log(`${groupPrefix}Đã đổi tên: ${originalName} → ${fname}`, 'l-ok');
          } else {
            await sink.write(fname, item.file);
            log(`${groupPrefix}Đã xuất: ${originalName} → ${fname}`, 'l-ok');
          }

          doneCount++;
          setProgress((doneCount / totalFiles) * 100, `${doneCount} / ${totalFiles}`);
        }
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

      setProgress(100, `${totalFiles} / ${totalFiles}`);
      setStatus(`Hoàn tất — ${totalFiles} file đã được đổi tên trong ${inputGroups.length} thư mục.`, 'done');
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

      const mode = isTauri ? 'tauri' : (outputMode || 'zip');
      const isMultiGroup = inputGroups.length > 1;
      let zip = null;
      if (mode === 'zip') {
        await ensureJSZip();
        zip = new JSZip();
      }

      const totalFiles = inputGroups.reduce((s, g) => s + g.files.length, 0);
      let doneCount = 0;

      for (let gi = 0; gi < inputGroups.length; gi++) {
        const group = inputGroups[gi];
        const groupPrefix = isMultiGroup ? `[${group.name}] ` : '';
        setStatus(`${groupPrefix}Đang gắn logo… (thư mục ${gi + 1}/${inputGroups.length})`, 'busy');

        const sink = await makeGroupSink(mode, group, isMultiGroup, zip, ' (đã gắn logo)');
        const padWidth = Math.max(3, String(group.files.length).length);

        for (let i = 0; i < group.files.length; i++) {
          const item = group.files[i];
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

          await sink.write(fname, blob);

          doneCount++;
          setProgress((doneCount / totalFiles) * 100, `${doneCount} / ${totalFiles}`);
          log(`${groupPrefix}Đã gắn logo: ${item.name} → ${fname}`, 'l-ok');

          if (bmp.close) bmp.close();
        }
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

      setProgress(100, `${totalFiles} / ${totalFiles}`);
      setStatus(`Hoàn tất — đã gắn logo vào ${totalFiles} ảnh (${inputGroups.length} thư mục).`, 'done');
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
    if (isTauri && inputRootPaths.length && window.__TAURI__.fs && window.__TAURI__.path) {
      try {
        inputGroups = await buildTauriGroupsFromRoots(inputRootPaths);
        afterInputLoaded();
      } catch (e) {
        log(`Không tự nạp lại được (các) thư mục cũ: ${e.message}`, 'l-warn');
      }
    } else if (!isTauri && inputDirPath) {
      log(`Đã khôi phục cài đặt trước đó. Vui lòng bấm "Duyệt" để chọn lại thư mục ảnh: ${inputDirPath}`, 'l-warn');
    }

    updateStartEnabled();
  }
  init();
})();