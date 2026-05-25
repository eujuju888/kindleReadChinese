// Background service worker - handles screenshot + Claude Vision API

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'getApiKey') {
    chrome.storage.sync.get(['apiKey'], (result) => {
      sendResponse({ apiKey: result.apiKey || '' });
    });
    return true;
  }

  if (request.action === 'captureAndTranslate') {
    handleCaptureAndTranslate(sender.tab.id, request.apiKey)
      .then(result => sendResponse({ success: true, translation: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

});

async function handleCaptureAndTranslate(tabId, apiKey) {
  if (!apiKey) throw new Error('請先設定 Claude API Key');

  // 1. Capture screenshot of the tab
  const dataUrl = await chrome.tabs.captureVisibleTab(null, {
    format: 'jpeg',
    quality: 85
  });

  // 2. Crop to just the book area (remove our panel on the right)
  const croppedBase64 = await cropImage(dataUrl);

  // 3. Send to Claude Vision
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: croppedBase64
              }
            },
            {
              type: 'text',
              text: `請閱讀這張 Kindle 書本截圖裡的所有英文文字，然後翻譯成繁體中文。

規則：
- 只輸出繁體中文翻譯，不要加任何說明
- 保持原文的段落結構
- 忽略頁碼、書名、UI 元素，只翻譯書本正文
- 使用自然流暢的繁體中文`
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `API 錯誤: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Crop right 360px (our panel) from the screenshot
async function cropImage(dataUrl) {
  // We'll do cropping in the content script instead
  // Here just strip the data URL prefix
  return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
}
