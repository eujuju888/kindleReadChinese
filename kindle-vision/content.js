// Kindle Vision Translator - Content Script
// Takes screenshot of Kindle page and translates via Claude Vision

(function () {
  'use strict';

  let isTranslating = false;
  let autoTranslate = false;
  let lastScreenshot = '';

  function init() {
    createTranslationPanel();
    loadSettings();
    console.log('[Kindle翻譯] Vision v2.0 已啟動');
  }

  function loadSettings() {
    chrome.storage.sync.get(['autoTranslate'], (result) => {
      autoTranslate = result.autoTranslate || false;
      const t = document.getElementById('kt-auto-toggle');
      if (t) t.checked = autoTranslate;
    });
  }

  function createTranslationPanel() {
    if (document.getElementById('kindle-translator-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'kindle-translator-panel';
    panel.innerHTML = `
      <div id="kt-header">
        <div id="kt-title"><span id="kt-icon">📖</span><span>繁體中文翻譯</span></div>
        <div id="kt-controls">
          <button id="kt-translate-btn">翻譯此頁</button>
          <button id="kt-clear-btn">清除</button>
          <button id="kt-close-btn">⟨</button>
        </div>
      </div>
      <div id="kt-status"></div>
      <div id="kt-content">
        <div id="kt-placeholder">
          <div class="kt-placeholder-icon">本</div>
          <p>點擊「翻譯此頁」開始翻譯</p>
          <p style="font-size:11px;color:#4a4a6a;margin-top:8px;">使用 AI 視覺辨識</p>
        </div>
      </div>
      <div id="kt-footer">
        <label id="kt-auto-label">
          <input type="checkbox" id="kt-auto-toggle"> 自動翻譯每頁
        </label>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('kt-translate-btn').addEventListener('click', captureAndTranslate);
    document.getElementById('kt-clear-btn').addEventListener('click', clearTranslation);
    document.getElementById('kt-close-btn').addEventListener('click', togglePanel);
    document.getElementById('kt-auto-toggle').addEventListener('change', (e) => {
      autoTranslate = e.target.checked;
      chrome.storage.sync.set({ autoTranslate });
    });
  }

  function togglePanel() {
    const panel = document.getElementById('kindle-translator-panel');
    const btn = document.getElementById('kt-close-btn');
    if (!panel) return;
    panel.classList.toggle('kt-collapsed');
    btn.textContent = panel.classList.contains('kt-collapsed') ? '⟩' : '⟨';
  }

  function setStatus(msg, type = 'info') {
    const s = document.getElementById('kt-status');
    if (!s) return;
    s.textContent = msg;
    s.className = `kt-status-${type}`;
    s.style.display = msg ? 'block' : 'none';
  }

  function clearTranslation() {
    const c = document.getElementById('kt-content');
    if (c) c.innerHTML = `
      <div id="kt-placeholder">
        <div class="kt-placeholder-icon">本</div>
        <p>點擊「翻譯此頁」開始翻譯</p>
        <p style="font-size:11px;color:#4a4a6a;margin-top:8px;">使用 AI 視覺辨識</p>
      </div>`;
    setStatus('', '');
    lastScreenshot = '';
  }

  async function captureAndTranslate() {
    if (isTranslating) return;
    isTranslating = true;

    const btn = document.getElementById('kt-translate-btn');
    if (btn) { btn.disabled = true; btn.textContent = '截圖中...'; }
    setStatus('📸 正在截取畫面...', 'info');

    // Temporarily hide our panel so it doesn't appear in screenshot
    const panel = document.getElementById('kindle-translator-panel');
    if (panel) panel.style.visibility = 'hidden';

    // Small delay to let panel hide
    await new Promise(r => setTimeout(r, 150));

    chrome.runtime.sendMessage({ action: 'getApiKey' }, async (response) => {
      const apiKey = response?.apiKey;

      // Restore panel
      if (panel) panel.style.visibility = 'visible';

      if (!apiKey) {
        setStatus('❌ 請先設定 API Key', 'error');
        resetBtn(); return;
      }

      if (btn) btn.textContent = '辨識中...';
      setStatus('🔍 AI 正在辨識文字並翻譯...', 'info');

      try {
        const result = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { action: 'captureAndTranslate', apiKey },
            (response) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (response?.success) resolve(response.translation);
              else reject(new Error(response?.error || '翻譯失敗'));
            }
          );
        });

        displayTranslation(result);
        setStatus('✓ 翻譯完成', 'success');
      } catch (err) {
        setStatus(`❌ ${err.message}`, 'error');
      }

      resetBtn();
    });
  }

  function resetBtn() {
    isTranslating = false;
    const btn = document.getElementById('kt-translate-btn');
    if (btn) { btn.disabled = false; btn.textContent = '翻譯此頁'; }
  }

  function displayTranslation(translation) {
    const content = document.getElementById('kt-content');
    if (!content) return;

    const paragraphs = translation.split(/\n+/).filter(p => p.trim());
    let html = '<div class="kt-translation-body">';
    for (const para of paragraphs) {
      html += `<div class="kt-paragraph-pair">
        <p class="kt-translated">${escapeHtml(para)}</p>
      </div>`;
    }
    html += '</div>';
    content.innerHTML = html;
  }

  function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Auto-translate on page turn detection
  function setupPageObserver() {
    let debounce = null;
    new MutationObserver(() => {
      if (!autoTranslate) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!isTranslating) captureAndTranslate();
      }, 2000);
    }).observe(document.body, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'triggerTranslate') captureAndTranslate();
    if (request.action === 'togglePanel') togglePanel();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); setupPageObserver(); });
  } else {
    setTimeout(() => { init(); setupPageObserver(); }, 500);
  }

})();
