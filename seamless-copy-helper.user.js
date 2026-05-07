// ==UserScript==
// @name         Seamless Tool - Copy apiRequests
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  在 Seamless Management Tool 页面添加一键复制 apiRequests 按钮
// @match        https://seamless-global.bti.tools/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  let capturedData = null;

  // 在页面最早期拦截 XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      if (this._url && this._url.includes('reserve')) {
        try {
          const data = JSON.parse(this.responseText);
          if (data && data.apiRequests) {
            capturedData = data.apiRequests;
            updateButton();
          }
        } catch (e) {}
      }
    });
    return originalSend.apply(this, arguments);
  };

  // 同时拦截 fetch
  const originalFetch = window.fetch;
  window.fetch = function() {
    const url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0]?.url || '');
    return originalFetch.apply(this, arguments).then(response => {
      if (url.includes('reserve')) {
        response.clone().json().then(data => {
          if (data && data.apiRequests) {
            capturedData = data.apiRequests;
            updateButton();
          }
        }).catch(() => {});
      }
      return response;
    });
  };

  // 等 DOM 准备好再创建按钮
  function initButton() {
    const btn = document.createElement('button');
    btn.id = 'seamless-copy-btn';
    btn.textContent = '📋 Copy apiRequests';
    btn.style.cssText = `
      position: fixed;
      bottom: 30px;
      right: 30px;
      z-index: 99999;
      padding: 12px 20px;
      background: #6366F1;
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(99,102,241,0.4);
      transition: all 0.2s ease;
      opacity: 0.4;
      pointer-events: none;
    `;

    btn.addEventListener('mouseenter', () => {
      if (capturedData) btn.style.background = '#4F46E5';
    });
    btn.addEventListener('mouseleave', () => {
      if (capturedData) btn.style.background = '#6366F1';
    });

    btn.addEventListener('click', () => {
      if (!capturedData) return;
      const text = JSON.stringify(capturedData);
      navigator.clipboard.writeText(text).then(() => {
        showCopied(btn);
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showCopied(btn);
      });
    });

    document.body.appendChild(btn);

    // 如果拦截已经捕获到数据（按钮还没建好时），立即更新
    if (capturedData && capturedData.length > 0) {
      btn.textContent = '📋 Copy apiRequests (' + capturedData.length + ')';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }
  }

  function showCopied(btn) {
    btn.textContent = '✓ 已复制！';
    btn.style.background = '#16A34A';
    setTimeout(() => {
      btn.textContent = '📋 Copy apiRequests (' + capturedData.length + ')';
      btn.style.background = '#6366F1';
    }, 1500);
  }

  function updateButton() {
    const btn = document.getElementById('seamless-copy-btn');
    if (btn && capturedData && capturedData.length > 0) {
      btn.textContent = '📋 Copy apiRequests (' + capturedData.length + ')';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }
  }

  // DOM 准备好后初始化按钮
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initButton);
  } else {
    initButton();
  }
})();
