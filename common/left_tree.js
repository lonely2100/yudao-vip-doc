/*
 * left_tree.js —— 离线文档的左侧目录重建脚本（无 jQuery 版本）
 *
 * 作用：SingleFile 存出来的页面里，左侧目录是「当时那一页的刷新结果」，
 *       离线时点不了。这个脚本把 common/menu_json.js 里的菜单树重新渲染成
 *       真正的 <a href="../菜单/页面.html"> 链接，并高亮当前页、把侧栏滚到当前项。
 *
 * 和旧版（jQuery 版）的区别：
 *   1) 不再依赖 jQuery：DOM 用 createElement/textContent 建，标题里有 & < > 也不会破坏结构；
 *   2) href 优先用 menu_json 里的 file 字段（真实文件名），
 *      没有才回退拼「名称 + ' ｜ ruoyi-vue-pro 开发指南.html'」——拼错就 404 的问题从根上消掉；
 *   3) idx 参数用 URLSearchParams 解析，不再用废弃的 unescape()；
 *   4) 没有 idx 时按当前文件名自动高亮，直接双击某个 html 也能看到自己在哪；
 *   5) 侧栏不存在或找不到当前项时安静退出，不再抛异常（旧版 $(...).offset() 会炸）。
 */
(function () {
  'use strict';

  // 站点页面标题统一的后缀。仅当 menu_json 里没有 file 字段时才用它拼名字。
  var PAGE_SUFFIX = ' ｜ ruoyi-vue-pro 开发指南.html';

  // menu_json.js 用 `let menu_json = ...` 注入，这里做一次兼容取值
  function getMenuData() {
    try {
      if (typeof menu_json !== 'undefined' && menu_json && menu_json.root) {
        return menu_json;
      }
    } catch (e) { /* 取不到就走下面的兜底 */ }
    return (window.menu_json && window.menu_json.root) ? window.menu_json : { root: [] };
  }

  // 取 URL 上的 ?idx=N（点击左侧任意一项时由 href 带上）
  function getIdx() {
    try {
      return new URLSearchParams(window.location.search).get('idx');
    } catch (e) {
      return null;
    }
  }

  // 当前打开的是哪个文件（用于没有 idx 时的自动高亮）
  function currentFileName() {
    try {
      var seg = window.location.pathname.split('/').pop() || '';
      return decodeURIComponent(seg);
    } catch (e) {
      return '';
    }
  }

  // 找到真正用来放菜单的那个 .sidebar-links（最外层的那个，不是分组内部的）
  function pickContainer() {
    var all = document.querySelectorAll('.sidebar-links');
    for (var i = 0; i < all.length; i++) {
      if (all[i].className.indexOf('sidebar-group-items') === -1) {
        return all[i];
      }
    }
    return all.length ? all[0] : null;
  }

  // 生成一个页面链接的地址：优先用 menu_json 里记录的真实文件名
  function buildHref(menuName, item) {
    var fileName = item.file || (item.name + PAGE_SUFFIX);
    // encodeURI 保留中文与全角竖线，只转义会把 URL 截断的字符（# ? 空格等）
    return encodeURI('../' + menuName + '/' + fileName);
  }

  // 只清空「菜单容器」里的旧内容，不动外层结构
  function clearContainers() {
    var all = document.querySelectorAll('.sidebar-links');
    for (var i = 0; i < all.length; i++) {
      while (all[i].firstChild) {
        all[i].removeChild(all[i].firstChild);
      }
    }
  }

  // 按 menu_json 重建整棵左侧目录树
  function render(container, root) {
    var frag = document.createDocumentFragment();
    var idx = 0;

    root.forEach(function (category) {
      var li = document.createElement('li');
      var section = document.createElement('section');
      section.className = 'sidebar-group depth-0';

      var heading = document.createElement('p');
      heading.className = 'sidebar-heading';
      var span = document.createElement('span');
      span.textContent = category.name || '';      // textContent：标题里有 & < > 也不会破坏结构
      heading.appendChild(span);
      section.appendChild(heading);

      var ul = document.createElement('ul');
      ul.className = 'sidebar-links sidebar-group-items';

      (category.children || []).forEach(function (item) {
        var subLi = document.createElement('li');
        var a = document.createElement('a');
        a.className = 'sidebar-link';
        a.href = buildHref(category.name || '', item);
        a.setAttribute('data-menu', category.name || '');
        a.setAttribute('data-file', item.file || (item.name + PAGE_SUFFIX));
        a.setAttribute('idx', String(idx));
        a.textContent = item.name || '';
        subLi.appendChild(a);
        ul.appendChild(subLi);
        idx += 1;
      });

      section.appendChild(ul);
      li.appendChild(section);
      frag.appendChild(li);
    });

    container.appendChild(frag);
    return idx;                                    // 返回一共生成了多少个链接
  }

  // 高亮当前项并把侧栏滚到它上方约 100px 的位置
  function highlight(idxParam) {
    var links = document.querySelectorAll('.sidebar-links a');
    if (!links.length) {
      return null;
    }

    var target = null;
    if (idxParam !== null && idxParam !== '') {
      target = document.querySelector('.sidebar-links a[idx="' + idxParam + '"]');
    }
    if (!target) {                                 // 没有 idx → 按当前文件名找
      var cur = currentFileName();
      for (var i = 0; i < links.length; i++) {
        if (links[i].getAttribute('data-file') === cur) {
          target = links[i];
          break;
        }
      }
    }
    if (!target) {
      return null;
    }

    for (var j = 0; j < links.length; j++) {
      links[j].classList.remove('active');
      links[j].removeAttribute('aria-current');
    }
    target.classList.add('active');
    target.setAttribute('aria-current', 'page');

    var aside = document.querySelector('aside');
    if (!aside) {
      return target;
    }
    var top = target.getBoundingClientRect().top - aside.getBoundingClientRect().top
      + aside.scrollTop - 100;                     // 留在视口上方 100px，别贴边
    aside.scrollTop = top < 0 ? 0 : top;
    return target;
  }

  function init() {
    var data = getMenuData();
    if (!data || !data.root || !data.root.length) {
      return;                                      // menu_json 没加载成功就不动页面
    }
    var container = pickContainer();
    if (!container) {
      return;                                      // 这页本来就没有侧栏（比如 index.html）
    }

    clearContainers();
    var count = render(container, data.root);
    var active = highlight(getIdx());

    // 给自动验证留个探针：页面里能取到 链接条数/命中项，便于程序化检查
    window.__navDebug = {
      menus: data.root.length,
      links: count,
      activeIdx: active ? active.getAttribute('idx') : null
    };
  }

  // 脚本是插在 <head> 里的（CSP meta 之后），所以要等 DOM 就绪再干活
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
