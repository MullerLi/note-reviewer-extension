// content.js - 負責在任何網頁上抓取選取文字，並傳送至 Chrome Storage
document.addEventListener('mouseup', (e) => {
  const selection = window.getSelection();
  const text = selection.toString().trim();

  // 移除既有的按鈕
  const existingBtn = document.getElementById('recallweb-save-btn');
  if (existingBtn) existingBtn.remove();

  if (text.length > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // 建立 Brutalist 風格的浮動按鈕
    const btn = document.createElement('button');
    btn.id = 'recallweb-save-btn';
    btn.innerText = 'SAVE_TEXT';
    
    // 強烈的排版設計樣式
    Object.assign(btn.style, {
      position: 'absolute',
      top: `${window.scrollY + rect.top - 50}px`,
      left: `${window.scrollX + rect.left + (rect.width / 2) - 60}px`,
      zIndex: '999999',
      backgroundColor: '#000',
      color: '#fff',
      border: '2px solid #000',
      padding: '8px 16px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      fontSize: '12px',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)',
      cursor: 'pointer'
    });

    // 懸停特效
    btn.onmouseover = () => {
      btn.style.backgroundColor = '#fff';
      btn.style.color = '#000';
    };
    btn.onmouseout = () => {
      btn.style.backgroundColor = '#000';
      btn.style.color = '#fff';
    };

    // 點擊儲存事件
    btn.addEventListener('mousedown', (evt) => {
      evt.preventDefault(); // 避免點擊按鈕時取消選取
      
      // 讀取既有儲存列並加入新字串
      chrome.storage.local.get(['pendingHighlights'], (result) => {
        const current = result.pendingHighlights || [];
        chrome.storage.local.set({ pendingHighlights: [...current, text] }, () => {
          btn.innerText = 'SAVED!';
          setTimeout(() => {
            btn.remove();
            window.getSelection().removeAllRanges();
          }, 1000);
        });
      });
    });

    document.body.appendChild(btn);
  }
});
