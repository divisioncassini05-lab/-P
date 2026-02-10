// ==UserScript==
// @name         哔哩哔哩合集视频自动跳到上次观看分P（收藏夹/稍后再看/视频页通用）
// @namespace    https://bilibili.com/
// @version      1.2
// @description  打开视频时根据历史记录自动跳到上次观看的分P
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/list/watchlater*
// @match        https://www.bilibili.com/medialist/*
// @run-at       document-start
// @grant        none
// @author       ID-Paths
// ==/UserScript==

(function () {
  'use strict';

  const url = new URL(location.href);

  // 防止无限重定向（用参数标记 + 只跳一次）
  if (url.searchParams.get('__resume_redirected') === '1') return;

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
  if (!bvid) return;

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
      if (!lastP) return;

      // 已经是正确分P就不跳
      if (lastP === currentP) return;

      // 统一设置 p，然后跳转（并标记避免循环）
      url.searchParams.set('p', String(lastP));
      url.searchParams.set('__resume_redirected', '1');
      location.replace(url.toString());
    } catch (e) {
      // 静默失败
      console.log('[resume-p] error:', e);
    }
  })();
})();
