async page => {
  // __PUBLISH_CONFIG__ 执行前由 Node 注入 JSON；模板中为空对象占位
  const C = /*__PUBLISH_CONFIG__*/{};/*__PUBLISH_CONFIG_END__*/
  const f = page.mainFrame();
  const steps = {};
  const warnings = [];
  const log = (k, v) => { steps[k] = v === undefined ? 'ok' : v; };
  const sleep = ms => page.waitForTimeout(ms);

  try {
    // ---------- 1. login ----------
    if (page.url().includes('login.html')) {
      await page.screenshot({ path: C.qrScreenshot });
      log('login', 'WAIT_SCAN');
      const deadline = Date.now() + (C.scanTimeoutSec || 300) * 1000;
      let ok = false;
      while (Date.now() < deadline) {
        await sleep(3000);
        if (!page.url().includes('login.html')) { ok = true; break; }
        try { await page.screenshot({ path: C.qrScreenshot }); } catch (e) {}
      }
      if (!ok) return JSON.stringify({ ok: false, fatal: 'scan timeout', steps });
      log('login', 'scanned');
    } else {
      log('login', 'cached');
    }

    // ---------- 2. reach create form ----------
    // 直接访问 /post/create 可能被 SPA 弹回主页，需从主页点「发表视频」
    if (!page.url().includes('/post/create')) {
      await page.goto('https://channels.weixin.qq.com/platform/post/create', { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    const fileInput = f.locator('input[type=file]').first();
    const deadline2 = Date.now() + 60000;
    while (Date.now() < deadline2) {
      try { if (await fileInput.count()) break; } catch (e) {}
      // 任何页面出现「发表视频」按钮就点它
      const pub = f.locator(':text("发表视频")').first();
      try { if (await pub.isVisible()) { await pub.click(); await sleep(2000); continue; } } catch (e) {}
      // 卡在空白的 /post/create 页就回主页重来
      if (page.url().includes('/post/create')) {
        await page.goto('https://channels.weixin.qq.com/platform', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(2500);
      }
      await sleep(1500);
    }
    if (!(await fileInput.count())) {
      return JSON.stringify({ ok: false, fatal: 'create form not reachable', url: page.url(), steps });
    }
    log('openForm');

    // ---------- 3. upload video ----------
    // run-code 沙箱拿不到 filechooser 事件（CLI 会拦截成模态），只能直接对隐藏 input 写文件。
    // 表单刚打开时 input 可能正在重挂载导致首次失败，纯重试即可，严禁点击上传区（会弹原生选择器卡死）。
    const inputs = f.locator('input[type=file]');
    let uploaded = false;
    let lastErr = null;
    for (let i = 0; i < 8 && !uploaded; i++) {
      try {
        const n3 = await inputs.count();
        if (!n3) { await sleep(1500); continue; }
        await inputs.first().setInputFiles(C.videoPath);
        uploaded = true;
      } catch (e) { lastErr = e; await sleep(2000); }
    }
    if (!uploaded) {
      return JSON.stringify({ ok: false, fatal: 'video setInputFiles failed: ' + String(lastErr && lastErr.message).slice(0, 100), steps });
    }
    const coverPreview = f.locator(':text("封面预览")').first();
    await coverPreview.waitFor({ state: 'visible', timeout: (C.uploadTimeoutSec || 600) * 1000 });
    log('uploadVideo');
    await sleep(2000);

    // ---------- 4. short title ----------
    const titleBox = f.locator('[placeholder*="填写短标题"]').first();
    const rawTitle = C.title || '';
    const cleanTitle = rawTitle.replace(/[，,、]/g, ' ').trim();
    if (cleanTitle !== rawTitle.trim()) warnings.push('标题含逗号已替换为空格');
    if (cleanTitle.length > 16) warnings.push('标题超过16字，发表前需人工改短');
    if (cleanTitle.length < 6) warnings.push('标题少于6字会发布失败');
    await titleBox.fill(cleanTitle);
    log('title', cleanTitle);

    // ---------- 5. description ----------
    const ed = f.locator('div.input-editor').first();
    await ed.click();
    await ed.fill(C.description || '');
    const filled = await ed.innerText();
    log('description', filled.length + ' chars');
    if (filled.length < 10) warnings.push('描述疑似未写入，请人工检查');

    // ---------- 6. covers ----------
    async function setCover(label, imgPath) {
      await f.locator(':text("' + label + '")').first().locator('..').click();
      await sleep(1500);
      // 可能弹「使用此素材作为封面？」气泡，选「直接编辑」
      const direct = f.getByRole('button', { name: '直接编辑' });
      try { if (await direct.isVisible()) { await direct.click(); await sleep(1500); } } catch (e) {}
      await f.locator(':text("上传封面")').first().waitFor({ state: 'visible', timeout: 15000 });
      // 弹窗内 file input 为隐藏元素但可直接 setInputFiles；取打开弹窗后最后一个 input
      const inputs = f.locator('input[type=file]');
      const n = await inputs.count();
      if (!n) throw new Error('dialog has no file input');
      await inputs.nth(n - 1).setInputFiles(imgPath);
      await sleep(3000);
      await f.getByRole('button', { name: '确认' }).first().click();
      await sleep(2000);
    }
    try { await setCover('个人主页卡片', C.cover34); log('cover34'); }
    catch (e) { warnings.push('3:4封面失败: ' + String(e.message).slice(0, 80)); log('cover34', 'FAIL'); }
    try { await setCover('分享卡片', C.cover43); log('cover43'); }
    catch (e) { warnings.push('4:3封面失败: ' + String(e.message).slice(0, 80)); log('cover43', 'FAIL'); }

    // ---------- 7. original declaration ----------
    const boxes = f.locator('[role=checkbox]');
    const nb = await boxes.count();
    for (let i = 0; i < nb; i++) {
      const b = boxes.nth(i);
      try {
        const name = (await b.getAttribute('aria-label')) || '';
        if (name.includes('声明后') && !(await b.isChecked())) { await b.click(); break; }
      } catch (e) {}
    }
    await sleep(1500);
    const agreeBtn = f.getByRole('button', { name: '声明原创' });
    if (await agreeBtn.count()) {
      const nb2 = await boxes.count();
      for (let i = 0; i < nb2; i++) {
        const b = boxes.nth(i);
        try { if (!(await b.isChecked()) && (await b.isVisible())) { await b.click(); break; } } catch (e) {}
      }
      await agreeBtn.first().click();
      await sleep(1500);
    }
    log('originalFlag');

    // ---------- done, stop before publish ----------
    return JSON.stringify({ ok: true, readyForReview: true, steps, warnings });
  } catch (e) {
    return JSON.stringify({ ok: false, fatal: String(e.message).slice(0, 200), steps, warnings });
  }
}
