// ==UserScript==
// @name         Seamless Tool 数据抓取器
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  拦截 Seamless Tool API 回应并汇出数据到结算分析器
// @author       resettletool
// @match        *://seamless-global.bti.tools*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const RESETTLETOOL_URL = 'https://ryohei10221118-cloud.github.io/resettletool/';
  const capturedRequests = [];

  // ── 拦截 fetch ──────────────────────────────────────────────────────────────
  const origFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const response = await origFetch(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      if (url.includes('reserves') || url.includes('/api/')) {
        const clone = response.clone();
        clone.json().then(data => {
          if (Array.isArray(data)) {
            data.forEach(item => capturedRequests.push(item));
          } else if (data && typeof data === 'object') {
            if (data.apiRequests) {
              data.apiRequests.forEach(item => capturedRequests.push(item));
            } else {
              capturedRequests.push(data);
            }
          }
          updateBadge();
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  // ── 拦截 XMLHttpRequest ──────────────────────────────────────────────────────
  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXHR();
    const origOpen = xhr.open.bind(xhr);
    let capturedUrl = '';
    xhr.open = function (method, url, ...rest) {
      capturedUrl = url;
      return origOpen(method, url, ...rest);
    };
    xhr.addEventListener('load', function () {
      try {
        if (capturedUrl.includes('reserves') || capturedUrl.includes('/api/')) {
          const data = JSON.parse(xhr.responseText);
          if (Array.isArray(data)) {
            data.forEach(item => capturedRequests.push(item));
          } else if (data && typeof data === 'object') {
            capturedRequests.push(data);
          }
          updateBadge();
        }
      } catch (_) {}
    });
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  // ── UI 注入 ─────────────────────────────────────────────────────────────────
  let badge = null;
  let panel = null;

  function insertUI() {
    if (document.getElementById('stc-main-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'stc-main-btn';
    btn.innerHTML = '📊 结算分析 <span id="stc-badge" style="background:#EF4444;color:white;border-radius:50%;padding:2px 6px;font-size:11px;margin-left:4px;display:none">0</span>';
    btn.setAttribute('style', [
      'position:fixed',
      'bottom:20px',
      'right:20px',
      'z-index:2147483647',
      'background:#3B82F6',
      'color:white',
      'border:none',
      'border-radius:50px',
      'padding:10px 18px',
      'font-size:14px',
      'font-weight:700',
      'cursor:pointer',
      'box-shadow:0 4px 15px rgba(59,130,246,0.5)',
      'font-family:sans-serif',
      'line-height:1.4'
    ].join(';'));
    btn.onclick = togglePanel;
    document.body.appendChild(btn);
    badge = document.getElementById('stc-badge');

    panel = document.createElement('div');
    panel.id = 'stc-panel';
    panel.setAttribute('style', [
      'position:fixed',
      'bottom:70px',
      'right:20px',
      'z-index:2147483646',
      'background:white',
      'border-radius:12px',
      'padding:16px',
      'box-shadow:0 10px 40px rgba(0,0,0,0.25)',
      'width:300px',
      'display:none',
      'flex-direction:column',
      'gap:10px',
      'font-family:sans-serif'
    ].join(';'));

    panel.innerHTML = `
      <div style="font-weight:700;font-size:15px;color:#1F2937">📊 Seamless 数据抓取器</div>
      <div id="stc-count" style="font-size:13px;color:#6B7280">已捕获：0 笔 API 记录</div>
      <button id="stc-copy-btn" style="background:#3B82F6;color:white;border:none;border-radius:8px;padding:9px;cursor:pointer;font-size:13px;font-weight:600;width:100%">
        📋 复制 JSON（贴到分析器）
      </button>
      <button id="stc-open-btn" style="background:#10B981;color:white;border:none;border-radius:8px;padding:9px;cursor:pointer;font-size:13px;font-weight:600;width:100%">
        🔗 开启结算分析器
      </button>
      <button id="stc-clear-btn" style="background:#EF4444;color:white;border:none;border-radius:8px;padding:9px;cursor:pointer;font-size:13px;width:100%">
        🗑️ 清空已捕获数据
      </button>
      <div id="stc-status" style="font-size:12px;color:#10B981;min-height:16px;text-align:center"></div>
    `;
    document.body.appendChild(panel);

    document.getElementById('stc-copy-btn').onclick = copyData;
    document.getElementById('stc-open-btn').onclick = () => window.open(RESETTLETOOL_URL, '_blank');
    document.getElementById('stc-clear-btn').onclick = clearData;
  }

  function togglePanel() {
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  }

  function updateBadge() {
    if (!badge) return;
    const count = capturedRequests.length;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline' : 'none';
    const el = document.getElementById('stc-count');
    if (el) el.textContent = `已捕获：${count} 笔 API 记录`;
  }

  function copyData() {
    if (capturedRequests.length === 0) {
      showStatus('尚未捕获数据，请先搜索注单', '#EF4444');
      return;
    }
    const json = JSON.stringify(capturedRequests, null, 2);
    try {
      GM_setClipboard(json, 'text');
      showStatus(`✅ 已复制 ${capturedRequests.length} 笔！贴到分析器即可`, '#10B981');
      return;
    } catch (_) {}
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json)
        .then(() => showStatus(`✅ 已复制 ${capturedRequests.length} 笔！`, '#10B981'))
        .catch(() => fallbackCopy(json));
      return;
    }
    fallbackCopy(json);
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('style', 'position:fixed;left:-9999px;top:-9999px;opacity:0');
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    showStatus(ok ? `✅ 已复制 ${capturedRequests.length} 笔！` : '❌ 复制失败，请手动复制', ok ? '#10B981' : '#EF4444');
  }

  function clearData() {
    capturedRequests.length = 0;
    updateBadge();
    showStatus('已清空', '#6B7280');
  }

  function showStatus(msg, color) {
    const el = document.getElementById('stc-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color;
    setTimeout(() => { if (el) el.textContent = ''; }, 3500);
  }

  // document-idle 保证 body 已存在，直接插入
  insertUI();

})();
