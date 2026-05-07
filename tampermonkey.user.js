// ==UserScript==
// @name         Seamless Tool 数据抓取器
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  拦截 Seamless Tool API 回应并汇出数据到结算分析器
// @author       resettletool
// @match        https://seamless-global.bti.tools/*
// @grant        GM_setClipboard
// @grant        GM_notification
// @run-at       document-start
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
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('/api/reserves') || url.includes('/api/')) {
        const clone = response.clone();
        clone.json().then(data => {
          if (Array.isArray(data)) {
            data.forEach(item => capturedRequests.push(item));
          } else if (data && typeof data === 'object') {
            capturedRequests.push(data);
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
        if (capturedUrl.includes('/api/reserves') || capturedUrl.includes('/api/')) {
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

  // ── UI ──────────────────────────────────────────────────────────────────────
  function waitForBody() {
    if (document.body) {
      insertUI();
    } else {
      document.addEventListener('DOMContentLoaded', insertUI, { once: true });
    }
  }

  let badge, panel;

  function insertUI() {
    // 浮动按钮
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: '999999',
      background: '#3B82F6', color: 'white', border: 'none',
      borderRadius: '50px', padding: '10px 18px', fontSize: '14px',
      fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 15px rgba(59,130,246,0.5)',
      display: 'flex', alignItems: 'center', gap: '8px'
    });
    btn.innerHTML = '📊 结算分析 <span id="stc-badge" style="background:#EF4444;color:white;border-radius:50%;padding:0 6px;font-size:12px;display:none">0</span>';
    badge = btn.querySelector('#stc-badge');
    btn.onclick = togglePanel;
    document.body.appendChild(btn);

    // 面板
    panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', bottom: '70px', right: '20px', zIndex: '999998',
      background: 'white', borderRadius: '12px', padding: '16px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.2)', width: '300px',
      display: 'none', flexDirection: 'column', gap: '10px'
    });
    panel.innerHTML = `
      <div style="font-weight:700;font-size:15px;color:#1F2937">📊 Seamless 数据抓取器</div>
      <div id="stc-count" style="font-size:13px;color:#6B7280">已捕获：0 笔 API 记录</div>
      <button id="stc-copy" style="background:#3B82F6;color:white;border:none;border-radius:8px;padding:8px;cursor:pointer;font-size:13px;font-weight:600">
        📋 复制 JSON（贴到分析器）
      </button>
      <button id="stc-open" style="background:#10B981;color:white;border:none;border-radius:8px;padding:8px;cursor:pointer;font-size:13px;font-weight:600">
        🔗 开启结算分析器
      </button>
      <button id="stc-clear" style="background:#EF4444;color:white;border:none;border-radius:8px;padding:8px;cursor:pointer;font-size:13px">
        🗑️ 清空已捕获数据
      </button>
      <div id="stc-status" style="font-size:12px;color:#10B981;min-height:16px;text-align:center"></div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#stc-copy').onclick = copyData;
    panel.querySelector('#stc-open').onclick = () => window.open(RESETTLETOOL_URL, '_blank');
    panel.querySelector('#stc-clear').onclick = clearData;
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
      showStatus('尚未捕获任何数据，请先在页面上执行查询', '#EF4444');
      return;
    }

    const json = JSON.stringify(capturedRequests, null, 2);

    // 优先使用 GM_setClipboard（Tampermonkey 原生，最可靠）
    try {
      GM_setClipboard(json, 'text');
      showStatus(`✅ 已复制 ${capturedRequests.length} 笔数据！`, '#10B981');
      return;
    } catch (_) {}

    // 后备：navigator.clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json)
        .then(() => showStatus(`✅ 已复制 ${capturedRequests.length} 笔数据！`, '#10B981'))
        .catch(() => fallbackCopy(json));
      return;
    }

    fallbackCopy(json);
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    showStatus(ok ? `✅ 已复制 ${capturedRequests.length} 笔数据！` : '❌ 复制失败，请手动复制', ok ? '#10B981' : '#EF4444');
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
    setTimeout(() => { el.textContent = ''; }, 3000);
  }

  waitForBody();
})();
