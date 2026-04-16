import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// --- Firebase Initialization (Rule 1 & 3 Compliance) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-readwise-app';

export default function App() {
  const [user, setUser] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [activeTab, setActiveTab] = useState('review');
  const [loading, setLoading] = useState(true);

  // Auth Effect
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Chrome Extension Storage Bridge
  useEffect(() => {
    if (!user) return;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['pendingHighlights'], async (result) => {
        if (result.pendingHighlights && result.pendingHighlights.length > 0) {
          const highlightsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'highlights');
          for (const text of result.pendingHighlights) {
            await addDoc(highlightsRef, {
              text: text,
              sourceTitle: "Web Highlight",
              sourceUrl: "",
              createdAt: Date.now(),
              nextReviewDate: Date.now(),
              interval: 0,
              ease: 2.5,
              repetitions: 0
            });
          }
          chrome.storage.local.remove(['pendingHighlights']);
        }
      });
    }
  }, [user]);

  // Data Fetching Effect
  useEffect(() => {
    if (!user) return;

    const highlightsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'highlights');
    
    const unsubscribe = onSnapshot(highlightsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setHighlights(data);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Derived State
  const now = Date.now();
  const dueHighlights = highlights.filter(h => h.nextReviewDate <= now).sort((a, b) => a.nextReviewDate - b.nextReviewDate);

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-white text-gray-400 font-light tracking-widest text-base">載入中...</div>;
  }

  if (!user) {
    return <div className="flex items-center justify-center h-screen bg-white text-red-400 font-light tracking-widest text-base">驗證失敗</div>;
  }

  return (
    <>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap');
        `}
      </style>
      <div 
        className="min-h-screen bg-white flex flex-col text-gray-800 selection:bg-gray-100 selection:text-gray-900"
        style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
      >
        <div className="max-w-3xl w-full mx-auto px-6 md:px-12 flex-1 flex flex-col">
          
          {/* Header - Minimalist */}
          <header className="py-12 flex justify-between items-baseline">
            <div>
              <h1 className="text-3xl font-light tracking-wide text-gray-900">Note Reviewer</h1>
            </div>
            <div className="hidden md:block text-sm font-light tracking-wider text-gray-400">
              ID: {user.uid.slice(0, 6)}
            </div>
          </header>

          {/* Navigation Tabs - Light gray borders and spacing */}
          <div className="flex border-b border-gray-100 mb-8 overflow-x-auto gap-8">
            <TabButton active={activeTab === 'review'} onClick={() => setActiveTab('review')} label="Review" badge={dueHighlights.length} alert={dueHighlights.length > 0} />
            <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} label="Index" badge={highlights.length} />
            <TabButton active={activeTab === 'add'} onClick={() => setActiveTab('add')} label="Add" />
            <TabButton active={activeTab === 'simulate'} onClick={() => setActiveTab('simulate')} label="Test" />
          </div>

          {/* Tab Content */}
          <div className="flex-1 relative overflow-y-auto pb-12">
            {activeTab === 'review' && <Review highlights={dueHighlights} user={user} />}
            {activeTab === 'dashboard' && <Dashboard highlights={highlights} user={user} />}
            {activeTab === 'add' && <AddContentPage user={user} />}
            {activeTab === 'simulate' && <SimulatePage user={user} />}
          </div>

        </div>
      </div>
    </>
  );
}

// --- Tab: Add Content ---
function AddContentPage({ user }) {
  const [manualText, setManualText] = useState("");
  const [manualSource, setManualSource] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const createHighlightData = (text, sourceTitle) => ({
    text: text,
    sourceTitle: sourceTitle || "Manual Input",
    sourceUrl: "",
    createdAt: Date.now(),
    nextReviewDate: Date.now(),
    interval: 0,
    ease: 2.5,
    repetitions: 0
  });

  const handleManualSubmit = async () => {
    if (!manualText.trim()) return;
    try {
      const highlightsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'highlights');
      await addDoc(highlightsRef, createHighlightData(manualText.trim(), manualSource.trim()));
      setManualText("");
      setManualSource("");
      setStatusMsg("筆記已新增。");
    } catch (error) {
      console.error("Error adding doc:", error);
    }
    setTimeout(() => setStatusMsg(""), 3000);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
      if (lines.length === 0) return;

      const highlightsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'highlights');
      const promises = lines.map(line => addDoc(highlightsRef, createHighlightData(line, file.name)));
      await Promise.all(promises);

      setStatusMsg(`已匯入 ${lines.length} 筆資料。`);
    } catch (error) {
      console.error("Error importing file:", error);
    }
    e.target.value = null;
    setTimeout(() => setStatusMsg(""), 4000);
  };

  return (
    <div className="space-y-16 animate-fade-in">
      <div className="flex justify-between items-center text-base text-gray-500 font-light">
        <span>新增筆記或例句</span>
        <span className="text-green-500 transition-opacity duration-300">{statusMsg}</span>
      </div>

      <div className="space-y-12">
        {/* Manual Input Block */}
        <div>
          <h3 className="text-sm tracking-widest text-gray-400 uppercase mb-4">Manual Entry</h3>
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="在此輸入內容..."
            className="w-full text-xl text-gray-800 font-light bg-transparent border-b border-gray-200 outline-none focus:border-gray-400 transition-colors resize-none h-32 placeholder-gray-300 leading-relaxed"
          />
          <div className="flex flex-col md:flex-row gap-6 mt-4">
            <input
              type="text"
              value={manualSource}
              onChange={(e) => setManualSource(e.target.value)}
              placeholder="來源或標題 (選填)"
              className="flex-1 text-base font-light bg-transparent border-b border-gray-200 outline-none focus:border-gray-400 text-gray-600 placeholder-gray-300"
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualText.trim()}
              className="text-base tracking-wide text-gray-500 hover:text-gray-900 disabled:opacity-30 transition-colors"
            >
              儲存
            </button>
          </div>
        </div>

        {/* File Upload Block */}
        <div>
          <h3 className="text-sm tracking-widest text-gray-400 uppercase mb-4">Batch Import</h3>
          <label className="flex flex-col items-center justify-center py-12 border border-gray-100 rounded-sm cursor-pointer hover:bg-gray-50 transition-colors group">
            <span className="text-lg text-gray-600 font-light mb-1">上傳 .txt 或 .md 檔案</span>
            <span className="text-sm text-gray-400 font-light">按行分割匯入</span>
            <input type="file" accept=".txt,.md" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>
    </div>
  );
}

// --- Tab: Dashboard (Index) ---
function Dashboard({ highlights, user }) {
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'highlights', id));
    } catch (error) {
      console.error("Error deleting:", error);
    }
  };

  if (highlights.length === 0) {
    return <div className="py-20 text-center text-gray-400 font-light text-lg">目前沒有任何紀錄。</div>;
  }

  return (
    <div className="divide-y divide-gray-100">
      {highlights.sort((a,b) => b.createdAt - a.createdAt).map(h => (
        <div key={h.id} className="py-8 flex flex-col md:flex-row justify-between items-start gap-6 group hover:bg-gray-50/50 transition-colors -mx-4 px-4 rounded-sm">
          <div className="flex-1">
            <p className="text-xl font-light text-gray-800 leading-relaxed break-words">
              {h.text}
            </p>
            <div className="mt-4 flex gap-4 text-sm font-light text-gray-400 tracking-wide">
              <span>{h.sourceTitle}</span>
              <span className="text-gray-300">|</span>
              <span>下次複習: {new Date(h.nextReviewDate).toLocaleDateString()}</span>
            </div>
          </div>
          <button 
            onClick={() => handleDelete(h.id)}
            className="md:opacity-0 group-hover:opacity-100 text-sm font-light tracking-wide text-gray-400 hover:text-red-400 transition-all"
          >
            移除
          </button>
        </div>
      ))}
    </div>
  );
}

// --- Tab: Review (Typography Style) ---
function Review({ highlights, user }) {
  const [customDays, setCustomDays] = useState("");

  if (highlights.length === 0) {
    return (
      <div className="h-full flex items-center justify-center py-32">
        <h3 className="text-3xl font-light text-gray-400 tracking-wide">今日複習已完成。</h3>
      </div>
    );
  }

  const currentHighlight = highlights[0];

  const getProjectedInterval = (quality) => {
    let { interval, ease, repetitions } = currentHighlight;
    if (quality === 0) return 1;
    if (quality === 3) return Math.max(1, Math.round(interval * 1.2));
    if (quality === 4) return repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval * ease);
    if (quality === 5) return repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval * ease * 1.3);
    return 1;
  };

  const handleReview = async (quality) => {
    let { interval, ease, repetitions } = currentHighlight;

    if (quality === 0) {
      repetitions = 0;
      interval = 1;
    } else {
      interval = getProjectedInterval(quality);
      if (quality === 3) ease = Math.max(1.3, ease - 0.15);
      if (quality === 5) ease += 0.15;
      repetitions += 1;
    }

    const nextReviewDate = Date.now() + (interval * 24 * 60 * 60 * 1000);
    updateHighlightRecord(interval, ease, repetitions, nextReviewDate);
  };

  const handleCustomReview = async () => {
    const days = parseInt(customDays, 10);
    if (isNaN(days) || days <= 0) return;
    let { ease, repetitions } = currentHighlight;
    const nextReviewDate = Date.now() + (days * 24 * 60 * 60 * 1000);
    updateHighlightRecord(days, ease, repetitions + 1, nextReviewDate);
    setCustomDays("");
  };

  const updateHighlightRecord = async (interval, ease, repetitions, nextReviewDate) => {
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'highlights', currentHighlight.id);
      await updateDoc(docRef, { interval, ease, repetitions, nextReviewDate });
    } catch (error) {
      console.error("Error updating review:", error);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Meta Text */}
      <div className="flex justify-between items-center text-sm font-light text-gray-400 tracking-wide mb-12">
        <span>剩餘 {highlights.length} 則</span>
        <span>{currentHighlight.sourceTitle}</span>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center py-16 min-h-[300px]">
        <p className="text-3xl md:text-4xl lg:text-5xl font-light text-gray-800 leading-relaxed tracking-wide text-center max-w-2xl">
          {currentHighlight.text}
        </p>
      </div>

      {/* Action Area: Minimalist Buttons */}
      <div className="mt-12 flex flex-col items-center">
        <div className="flex gap-8 md:gap-16 border-t border-gray-100 pt-8 w-full justify-center">
          <ReviewButton label="忘記" subtext="< 1 天" textColor="text-red-400 hover:text-red-500" onClick={() => handleReview(0)} />
          <ReviewButton label="困難" subtext={`${getProjectedInterval(3)} 天後`} textColor="text-orange-400 hover:text-orange-500" onClick={() => handleReview(3)} />
          <ReviewButton label="良好" subtext={`${getProjectedInterval(4)} 天後`} textColor="text-green-500 hover:text-green-600" onClick={() => handleReview(4)} />
          <ReviewButton label="簡單" subtext={`${getProjectedInterval(5)} 天後`} textColor="text-blue-400 hover:text-blue-500" onClick={() => handleReview(5)} />
        </div>

        {/* Custom Delay */}
        <div className="flex items-center gap-4 mt-12 text-sm font-light text-gray-400">
          <span>手動延遲：</span>
          <input 
            type="number" 
            min="1"
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            placeholder="天數" 
            className="w-16 text-center bg-transparent border-b border-gray-200 outline-none focus:border-gray-500 text-gray-700"
          />
          <button 
            onClick={handleCustomReview}
            disabled={!customDays || parseInt(customDays) <= 0}
            className="text-gray-400 hover:text-gray-800 disabled:opacity-30 transition-colors"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Tab: Simulate Webpage (For Canvas Demo only) ---
function SimulatePage() {
  const [selectionRect, setSelectionRect] = useState(null);
  const [selectedText, setSelectedText] = useState("");
  const contentRef = useRef(null);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (text && contentRef.current && contentRef.current.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = contentRef.current.getBoundingClientRect();
        
        setSelectionRect({
          top: rect.top - containerRect.top - 40,
          left: rect.left - containerRect.left + (rect.width / 2) - 30
        });
        setSelectedText(text);
      } else {
        setSelectionRect(null);
        setSelectedText("");
      }
    };

    document.addEventListener('selectionchange', handleSelection);
    return () => document.removeEventListener('selectionchange', handleSelection);
  }, []);

  const handleSaveHighlight = () => {
    if (!selectedText) return;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['pendingHighlights'], (result) => {
        const current = result.pendingHighlights || [];
        chrome.storage.local.set({ pendingHighlights: [...current, selectedText] });
      });
    } else {
      alert("儲存成功！\n擷取內容：" + selectedText);
    }
    window.getSelection().removeAllRanges();
    setSelectionRect(null);
    setSelectedText("");
  };

  return (
    <div className="py-8 text-gray-600 text-xl leading-loose relative" ref={contentRef}>
      <h2 className="text-2xl font-light text-gray-800 mb-8 tracking-wide">網頁劃線測試區</h2>
      <p className="mb-6">
        請在此區塊測試反白文字。這將模擬你在瀏覽器上閱讀文章的體驗。
      </p>
      <p className="mb-6">
        在這個極簡排版的設計中，我們移除了所有封閉的框線與沉重的色塊。空間本身成為了劃分資訊層級的元素。淺灰色的細線與文字本身的重量，引導著視覺的流動。
      </p>
      <p className="mb-6">
        當你開發擴充功能時，反白選取後出現的浮動按鈕也將遵從同樣的極簡邏輯。它不會干擾閱讀，而是安靜地等待你的指令。
      </p>

      {selectionRect && (
        <button 
          style={{ top: selectionRect.top, left: selectionRect.left }}
          className="absolute z-50 bg-white text-gray-800 px-4 py-1.5 text-sm font-light tracking-widest border border-gray-200 shadow-sm rounded-sm hover:border-gray-400 transition-colors cursor-pointer"
          onMouseDown={(e) => { e.preventDefault(); handleSaveHighlight(); }}
        >
          儲存
        </button>
      )}
    </div>
  );
}

// --- UI Utility Components ---
function TabButton({ active, label, badge, alert, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 text-base font-light tracking-wide transition-colors relative
        ${active ? 'text-gray-900 border-b border-gray-900' : 'text-gray-400 hover:text-gray-600 border-b border-transparent'}
      `}
    >
      {label}
      {badge !== undefined && badge > 0 && <span className="ml-2 text-sm text-gray-300">{badge}</span>}
      {alert && <span className="absolute top-1 -right-2 w-1.5 h-1.5 bg-red-400 rounded-full"></span>}
    </button>
  );
}

function ReviewButton({ label, subtext, textColor, onClick }) {
  return (
    <button 
      onClick={onClick}
      className="group flex flex-col items-center justify-center transition-opacity hover:opacity-80"
    >
      <span className={`text-xl font-light tracking-widest mb-2 ${textColor} transition-colors`}>{label}</span>
      <span className="text-sm font-light text-gray-300 tracking-wide">
        {subtext}
      </span>
    </button>
  );
}