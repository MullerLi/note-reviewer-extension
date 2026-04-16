// background.js - 處理右鍵選單與圖示點擊事件

// 1. 安裝時建立右鍵選單
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-reviewer",
    title: "Save to Note Reviewer",
    contexts: ["selection"]
  });
});

// 2. 監聽右鍵點擊事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-to-reviewer" && info.selectionText) {
    const text = info.selectionText.trim();
    
    // 儲存至 chrome.storage.local
    chrome.storage.local.get(['pendingHighlights'], (result) => {
      const current = result.pendingHighlights || [];
      chrome.storage.local.set({ pendingHighlights: [...current, text] }, () => {
        console.log('Successfully saved text from context menu:', text);
      });
    });
  }
});

// 3. 監聽工具列圖示點擊事件 (現在會直接開啟分頁而不是彈出小視窗)
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: "index.html"
  });
});
