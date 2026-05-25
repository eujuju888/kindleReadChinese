document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const translateBtn = document.getElementById('translateBtn');
  const toggleBtn = document.getElementById('toggleBtn');
  const statusMsg = document.getElementById('statusMsg');

  // Load saved API key
  chrome.storage.sync.get(['apiKey'], (result) => {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
  });

  // Save API key
  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) { showStatus('請輸入 API Key', 'error'); return; }
    if (!key.startsWith('sk-ant-')) { showStatus('API Key 格式不正確', 'error'); return; }
    chrome.storage.sync.set({ apiKey: key }, () => {
      showStatus('✓ 設定已儲存', 'success');
    });
  });

  // Trigger translation - inject script directly if content script not loaded
  translateBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      const tabId = tabs[0].id;

      // Try sending message first
      chrome.tabs.sendMessage(tabId, { action: 'triggerTranslate' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not loaded, inject it manually
          chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
          }).then(() => {
            chrome.scripting.insertCSS({
              target: { tabId },
              files: ['styles.css']
            }).then(() => {
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { action: 'triggerTranslate' });
              }, 500);
            });
          }).catch(err => console.error('Inject error:', err));
        }
      });
      window.close();
    });
  });

  // Toggle panel
  toggleBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'togglePanel' });
    });
    window.close();
  });

  function showStatus(msg, type) {
    statusMsg.textContent = msg;
    statusMsg.className = `status-msg ${type}`;
    setTimeout(() => { statusMsg.className = 'status-msg'; }, 3000);
  }
});
