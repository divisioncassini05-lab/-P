// ==UserScript==
// @name         B站合集视频自动跳转上次观看分P（收藏夹/稍后再看/视频页通用）
// @name:zh-CN   B站合集视频自动跳转上次观看分P（收藏夹/稍后再看/视频页通用）
// @namespace    https://bilibili.com/
// @version      1.4
// @description  打开视频时根据历史记录自动跳转到上次观看的分P
// @description:zh-CN  打开视频时根据历史记录自动跳转到上次观看的分P
// @author       ID-Paths
// @icon         https://www.bilibili.com/favicon.ico
// @homepageURL  https://github.com/divisioncassini05-lab/-P
// @supportURL   https://github.com/divisioncassini05-lab/-P/issues
// @license      MIT
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/watchlater*
// @match        https://www.bilibili.com/medialist/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/divisioncassini05-lab/-P/main/bili-resume-p.user.js
// @updateURL    https://raw.githubusercontent.com/divisioncassini05-lab/-P/main/bili-resume-p.user.js
// ==/UserScript==

(function () {
  'use strict';

  const url = new URL(location.href);

  // —— 1) 先隐藏页面，避免跳转前闪烁 ——
  const style = document.createElement('style');
  style.id = '__resume_hide';
  style.textContent = 'html{visibility:hidden !important;}';
  // document-start 时 documentElement 可能还没就绪，做个容错
  (document.documentElement || document).appendChild(style);

  function showPage() {
    const s = document.getElementById('__resume_hide');
    if (s) s.remove();
  }

  // 防止无限重定向（用参数标记 + 只跳一次）
  if (url.searchParams.get('__resume_redirected') === '1') {
    showPage();
    return;
  }

  // 从不同页面提取 bvid
  function getBvid() {
    // 1) 普通视频页：/video/BVxxxx
    const m = location.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/);
    if (m) return m[1];

    // 2) watchlater / medialist 等：query 里可能带 bvid
    const qb = url.searchParams.get('bvid');
    if (qb && qb.startsWith('BV')) return qb;

    return null;
  }

  const bvid = getBvid();
  if (!bvid) {
    showPage();
    return;
  }

  // 当前 p（没有就当 1）
  const currentP = parseInt(url.searchParams.get('p') || '1', 10) || 1;

  async function fetchLastP(pagesToTry = 6) {
    let max = 0, view_at = 0, business = '';

    for (let i = 0; i < pagesToTry; i++) {
      const api = new URL('https://api.bilibili.com/x/web-interface/history/cursor');
      api.searchParams.set('ps', '30');

      if (i > 0) {
        api.searchParams.set('max', String(max));
        api.searchParams.set('view_at', String(view_at));
        if (business) api.searchParams.set('business', business);
      }

      const res = await fetch(api.toString(), { credentials: 'include' });
      const json = await res.json();

      // 未登录/失败：直接停止
      if (!json || json.code !== 0 || !json.data) return null;

      const list = json.data.list || [];
      for (const item of list) {
        const hbvid = item?.history?.bvid;
        if (hbvid === bvid) {
          const p = parseInt(item?.history?.page || '1', 10) || 1;
          return p > 0 ? p : 1;
        }
      }

      const cursor = json.data.cursor || {};
      max = cursor.max ?? 0;
      view_at = cursor.view_at ?? 0;
      business = cursor.business ?? '';

      if (!max && !view_at) break;
    }
    return null;
  }

  (async () => {
    try {
      const lastP = await fetchLastP(6);

      // 找不到进度：显示页面，正常打开当前页
      if (!lastP) {
        showPage();
        return;
      }

      // 已经是正确分P：显示页面
      if (lastP === currentP) {
        showPage();
        return;
      }

      // 需要跳转：不恢复显示，直接 replace（用户基本看不到闪）
      url.searchParams.set('p', String(lastP));
      url.searchParams.set('__resume_redirected', '1');
      location.replace(url.toString());
    } catch (e) {
      // 出错：恢复显示，避免白屏
      showPage();
      console.log('[resume-p] error:', e);
    }
  })();
})();

