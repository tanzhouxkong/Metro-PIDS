(function () {
  const $ = (id) => document.getElementById(id);
  const panel = $('panel');
  const errBox = $('err');
  const verEl = $('ver');
  const backBtn = $('backBtn');
  const nextBtn = $('nextBtn');

  const steps = ['welcome', 'line', 'display', 'done'];
  let stepIdx = 0;
  let mode = 'first';

  let appVersion = '';
  let bundledLines = [];
  let selectedBundled = '';
  let displayPreset = 'single';

  function setError(msg) {
    if (!msg) {
      errBox.style.display = 'none';
      errBox.textContent = '';
      return;
    }
    errBox.style.display = 'block';
    errBox.textContent = String(msg);
  }

  function setActiveStep() {
    const cur = steps[stepIdx];
    document.querySelectorAll('.step').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-step') === cur);
    });
    backBtn.disabled = stepIdx === 0;

    if (mode === 'whatsnew') {
      backBtn.style.display = 'none';
      nextBtn.textContent = '知道了';
      nextBtn.disabled = false;
      return;
    }

    if (stepIdx === steps.length - 1) {
      nextBtn.textContent = '完成';
    } else {
      nextBtn.textContent = '下一步';
    }
  }

  async function render() {
    setError('');
    setActiveStep();

    if (mode === 'whatsnew') {
      const res = await window.electronAPI?.onboarding?.getPendingGuide?.();
      const guide = res && res.ok ? res.guide : null;
      const title = (guide && guide.title) ? guide.title : '新功能引导';
      const body = (guide && guide.body) ? guide.body : '（没有可显示的引导内容）';
      panel.innerHTML = `
        <h1 class="title">${escapeHtml(title)}</h1>
        <p class="desc">下面内容来自“新功能引导”。若不想再提示，点击“知道了”。</p>
        <div class="row">
          <div class="card" style="background: rgba(255,255,255,0.03); border-radius: 12px;">
            <div class="desc" style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(body)}</div>
          </div>
        </div>
      `;
      return;
    }

    const step = steps[stepIdx];

    if (step === 'welcome') {
      panel.innerHTML = `
        <h1 class="title">欢迎使用 Metro-PIDS</h1>
        <p class="desc">这个向导只会在首次安装后第一次启动时出现，用来帮你完成：导入/选择线路配置，以及初始化显示端布局。</p>
        <div class="row">
          <div class="card" style="background: rgba(255,255,255,0.03); border-radius: 12px;">
            <div class="desc">你可以随时在主界面通过“线路管理器”切换线路；显示端也可在设置中调整。</div>
          </div>
        </div>
      `;
      return;
    }

    if (step === 'line') {
      const options = bundledLines.map((f) => {
        const name = f && f.name ? f.name : '';
        const sel = name === selectedBundled ? 'selected' : '';
        return `<option value="${escapeAttr(name)}" ${sel}>${escapeHtml(name)}</option>`;
      }).join('');

      panel.innerHTML = `
        <h1 class="title">选择默认线路</h1>
        <p class="desc">从应用自带的预设线路中选择一个导入到本地线路目录，然后立即应用为当前线路。</p>

        <div class="row">
          <div>
            <label>预设线路（来自安装包内 default 目录）</label>
            <select id="bundledSel">${options || '<option value="">（未找到预设线路）</option>'}</select>
            <div class="hint">导入后会保存到你的本地线路目录（userData/lines），以后可在“线路管理器”中继续管理。</div>
          </div>

          <div style="display:flex; gap:10px; justify-content:flex-end;">
            <button id="importBtn">导入并应用</button>
          </div>
        </div>
      `;

      const bundledSel = $('bundledSel');
      const importBtn = $('importBtn');
      if (bundledSel) {
        bundledSel.addEventListener('change', () => {
          selectedBundled = bundledSel.value || '';
        });
      }
      if (importBtn) {
        importBtn.addEventListener('click', async () => {
          try {
            setError('');
            const name = (selectedBundled || (bundledSel && bundledSel.value) || '').trim();
            if (!name) {
              setError('请先选择一个预设线路。');
              return;
            }
            const imp = await window.electronAPI?.onboarding?.importBundledLine?.(name);
            if (!imp || !imp.ok) {
              setError('导入失败：' + (imp && imp.error ? imp.error : '未知错误'));
              return;
            }

            const folderPath = imp.folderPath || null;
            const switchRes = await window.electronAPI?.switchLine?.(imp.importedName || name, { folderPath });
            if (!switchRes || switchRes.ok !== true) {
              setError('已导入，但切换线路失败：' + (switchRes && switchRes.error ? switchRes.error : '未知错误'));
              return;
            }

            nextBtn.focus();
          } catch (e) {
            setError('导入/应用失败：' + (e && e.message ? e.message : String(e)));
          }
        });
      }

      return;
    }

    if (step === 'display') {
      panel.innerHTML = `
        <h1 class="title">初始化显示端布局</h1>
        <p class="desc">选择你希望默认启用的显示端数量。该设置会写入配置并在主界面生效。</p>
        <div class="row">
          <div>
            <label>显示端预设</label>
            <select id="dispPreset">
              <option value="single">单屏（仅 display-1）</option>
              <option value="dual">双屏（display-1 + display-2）</option>
              <option value="triple">三屏（display-1 + display-2 + display-3）</option>
            </select>
            <div class="hint">后续可在“设置 → 显示端”里再细调每个显示端的尺寸与开关。</div>
          </div>
          <div>
            <label>当前系统显示器（仅供参考）</label>
            <select id="monitors" disabled><option>正在读取...</option></select>
          </div>
        </div>
      `;

      const presetSel = $('dispPreset');
      if (presetSel) {
        presetSel.value = displayPreset;
        presetSel.addEventListener('change', () => {
          displayPreset = presetSel.value || 'single';
        });
      }

      try {
        const monRes = await window.electronAPI?.onboarding?.listMonitors?.();
        const monitorsEl = $('monitors');
        if (monitorsEl) {
          const displays = (monRes && monRes.ok && Array.isArray(monRes.displays)) ? monRes.displays : [];
          if (!displays.length) {
            monitorsEl.innerHTML = '<option>（未获取到系统显示器信息）</option>';
          } else {
            monitorsEl.innerHTML = displays.map((d, idx) => {
              const label = `显示器 ${idx + 1}: ${d.size && d.size.width ? d.size.width : '?'}x${d.size && d.size.height ? d.size.height : '?'}${d.primary ? '（主）' : ''}`;
              return `<option>${escapeHtml(label)}</option>`;
            }).join('');
          }
        }
      } catch (_) {}

      return;
    }

    if (step === 'done') {
      panel.innerHTML = `
        <h1 class="title">完成</h1>
        <p class="desc">点击“完成”将保存设置并关闭向导。</p>
        <div class="row">
          <div class="card" style="background: rgba(255,255,255,0.03); border-radius: 12px;">
            <div class="desc">提示：如果你要在升级后显示“新功能引导”，可以配置远程引导地址（由服务器下发）。</div>
          </div>
        </div>
      `;
      return;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/\n/g, ' ');
  }

  async function init() {
    try {
      const u = new URL(window.location.href);
      mode = (u.searchParams.get('mode') || 'first').toLowerCase();

      const st = await window.electronAPI?.onboarding?.getState?.();
      if (st && st.ok) {
        appVersion = st.appVersion || '';
        verEl.textContent = appVersion || '-';
      }

      if (mode === 'whatsnew') {
        // 直接渲染
        stepIdx = 0;
        await render();
        return;
      }

      const res = await window.electronAPI?.onboarding?.listBundledLines?.();
      bundledLines = (res && res.ok && Array.isArray(res.files)) ? res.files : [];
      selectedBundled = bundledLines[0] && bundledLines[0].name ? bundledLines[0].name : '';

      await render();
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
      await render();
    }
  }

  backBtn.addEventListener('click', async () => {
    if (mode === 'whatsnew') return;
    if (stepIdx <= 0) return;
    stepIdx -= 1;
    await render();
  });

  nextBtn.addEventListener('click', async () => {
    try {
      setError('');

      if (mode === 'whatsnew') {
        const res = await window.electronAPI?.onboarding?.getPendingGuide?.();
        const guide = res && res.ok ? res.guide : null;
        const guideId = guide && guide.id ? guide.id : null;
        await window.electronAPI?.onboarding?.dismissGuide?.(guideId);
        window.close();
        return;
      }

      const step = steps[stepIdx];
      if (step === 'display') {
        const ap = await window.electronAPI?.onboarding?.applyDisplayPreset?.({ preset: displayPreset });
        if (!ap || !ap.ok) {
          setError('应用显示端预设失败：' + (ap && ap.error ? ap.error : '未知错误'));
          return;
        }
      }

      if (step === 'done') {
        const c = await window.electronAPI?.onboarding?.complete?.();
        if (!c || !c.ok) {
          setError('保存引导状态失败：' + (c && c.error ? c.error : '未知错误'));
          return;
        }
        window.close();
        return;
      }

      if (stepIdx < steps.length - 1) {
        stepIdx += 1;
        await render();
      }
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    }
  });

  init();
})();
