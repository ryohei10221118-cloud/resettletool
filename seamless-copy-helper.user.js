// ==UserScript==
// @name         Seamless Tool - Copy apiRequests
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  在 Seamless Management Tool 页面添加一键复制 apiRequests 按钮
// @match        https://seamless-global.bti.tools/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // 创建浮动按钮
  const btn = document.createElement('button');
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
  `;
  btn.addEventListener('mouseenter', () => btn.style.background = '#4F46E5');
  btn.addEventListener('mouseleave', () => btn.style.background = '#6366F1');

  btn.addEventListener('click', () => {
    // 从当前页面 URL 取得 id
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
      btn.textContent = '⚠ URL 中没有 id 参数';
      btn.style.background = '#DC2626';
      setTimeout(() => {
        btn.textContent = '📋 Copy apiRequests';
        btn.style.background = '#6366F1';
      }, 2000);
      return;
    }

    btn.textContent = '⏳ 抓取中...';
    btn.style.background = '#9CA3AF';

    // 用同域 fetch 直接打 API（自动带 cookie）
    fetch('/api/reserves?id=' + id)
      .then(r => r.json())
      .then(data => {
        if (!data || !data.apiRequests || data.apiRequests.length === 0) {
          btn.textContent = '⚠ 没有 apiRequests 数据';
          btn.style.background = '#DC2626';
          setTimeout(() => {
            btn.textContent = '📋 Copy apiRequests';
            btn.style.background = '#6366F1';
          }, 2000);
          return;
        }

        const text = JSON.stringify(data.apiRequests);
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = '✓ 已复制 ' + data.apiRequests.length + ' 笔！';
          btn.style.background = '#16A34A';
          setTimeout(() => {
            btn.textContent = '📋 Copy apiRequests';
            btn.style.background = '#6366F1';
          }, 2000);
        }).catch(() => {
          // clipboard fallback
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          btn.textContent = '✓ 已复制 ' + data.apiRequests.length + ' 笔！';
          btn.style.background = '#16A34A';
          setTimeout(() => {
            btn.textContent = '📋 Copy apiRequests';
            btn.style.background = '#6366F1';
          }, 2000);
        });
      })
      .catch(err => {
        btn.textContent = '⚠ 请求失败';
        btn.style.background = '#DC2626';
        setTimeout(() => {
          btn.textContent = '📋 Copy apiRequests';
          btn.style.background = '#6366F1';
        }, 2000);
      });
  });

  document.body.appendChild(btn);
})();
