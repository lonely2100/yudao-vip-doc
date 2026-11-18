/* 右侧「目录」面板（原生 JS，无 jQuery）
 *
 * 为什么需要它：
 *   站点右侧那个带编号的锚点目录是 Vue 在浏览器里现算出来的（DOM 里是
 *   .right-menu-margin），SingleFile 存的是渲染完的静态快照。实测这 381 页里
 *   这一块全都没有，页面右侧只剩主题留出的 250px 空白
 *   （.theme-container.have-rightmenu .page{padding-right:250px}）。
 *   页面本身的 h2/h3 带 id，锚点齐全，于是这里用页面已有的标题把这栏重建出来。
 *
 * 判重（重要）：SingleFile 存的就是「保存那一刻的 DOM」，只要那时站点已经把
 *   原生目录挂上了，它也会被一起存下来。真出现这种情况时，这里绝不能再自建一套，
 *   页面上会并排出现两个「目录」。
 *
 *   现在按用户的要求：**一律以本地这份为准**。理由是存下来的原生那份的链接指向
 *   站点（点了会跳回线上，不是本地页内的锚点），而且它的滚动高亮／平滑跳转依赖
 *   站点脚本，SingleFile 已经把脚本摘掉了，那份只会是"看着能点、点了跑回网站"。
 *   所以：数到原生目录（≥2 条）就把它整个从 DOM 里删掉，再照常自建我们这份；
 *   自检里记 tocNativeRemoved=N 便于以后核对。
 *
 * 行为：
 *   · 取正文里 h2/h3（有 id 的），生成「目录」+ 条目，层级缩进；
 *   · 滚动时高亮当前章节（最后一个标题顶边越过 90px 的那条），点击可平滑跳转；
 *   · 标题少于 2 个、或窗口窄于 1200px 时整块隐藏（不占地方，也不会盖住正文）。
 */
(function () {
  "use strict";
  if (window.__ydTocInit) { return; }
  window.__ydTocInit = true;

  var MIN_WIDTH = 1200;          // 窄了就不显示，免得压住正文
  var TOP_OFFSET = 90;           // 判定「当前章节」的基准线
  var STYLE_ID = "yd-toc-style";
  var PANEL_ID = "yd-toc";

  var CSS = [
    "#yd-toc{position:fixed;top:84px;right:18px;width:210px;max-height:calc(100vh - 150px);",
    "overflow-y:auto;padding:0 6px 8px 14px;z-index:8;",
    'font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;',
    "color:#4a5058;}",
    "#yd-toc::-webkit-scrollbar{width:6px}#yd-toc::-webkit-scrollbar-thumb{background:#dcdfe4;border-radius:3px}",
    "#yd-toc .yd-toc-title{font-size:15px;font-weight:600;color:#25282e;padding:0 0 10px 2px;",
    "border-bottom:1px solid #e6e8eb;margin-bottom:8px;}",
    "#yd-toc a{display:block;text-decoration:none;color:#4a5058;padding:3px 8px;border-left:2px solid transparent;",
    "border-radius:0 4px 4px 0;word-break:break-word;}",
    "#yd-toc a:hover{color:#11a8cd;background:#f6f9fb;}",
    "#yd-toc a.lv3{padding-left:20px;font-size:12.5px;color:#5f6672;}",
    "#yd-toc a.lv4{padding-left:34px;font-size:12.5px;color:#777e89;}",
    "#yd-toc a.yd-active{color:#11a8cd;font-weight:600;border-left-color:#11a8cd;background:#f3fbfd;}",
    "#yd-toc a.yd-active.lv3,#yd-toc a.yd-active.lv4{font-weight:600;}",
    "@media (max-width:1199px){#yd-toc{display:none}}",
    "@media print{#yd-toc{display:none}}"
  ].join("");

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) { return; }
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* 标题文字：去掉前面那个「#」锚点符号，去掉多余空白 */
  function titleOf(h) {
    var t = "";
    for (var i = 0; i < h.childNodes.length; i++) {
      var n = h.childNodes[i];
      if (n.nodeType === 1 && n.className && String(n.className).indexOf("header-anchor") >= 0) {
        continue;                       // 跳过 <a class="header-anchor">#</a>
      }
      t += n.textContent || "";
    }
    return t.replace(/\s+/g, " ").trim();
  }

  /* 找标题最多的那块正文，避开导航/页脚里的标题 */
  function contentRoot() {
    var cands = document.querySelectorAll(".theme-vdoing-content, .content__default, main .page, #app");
    var best = null, bestN = 0;
    for (var i = 0; i < cands.length; i++) {
      var n = cands[i].querySelectorAll("h2[id],h3[id]").length;
      if (n > bestN) { bestN = n; best = cands[i]; }
    }
    return best || document.body;
  }

  function collect() {
    var root = contentRoot();
    var heads = root.querySelectorAll("h2[id],h3[id]");   // 和站点一致：只收 h2 / h3
    var items = [];
    for (var i = 0; i < heads.length; i++) {
      var h = heads[i];
      if (!h.id) { continue; }
      var lv = parseInt(h.tagName.charAt(1), 10);       // 2 / 3
      var txt = titleOf(h);
      if (!txt) { continue; }
      items.push({ id: h.id, text: txt, level: lv, node: h });
    }
    return items;
  }

  function build(items) {
    var old = document.getElementById(PANEL_ID);
    if (old) { old.parentNode.removeChild(old); }

    var panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "本页目录");

    var title = document.createElement("div");
    title.className = "yd-toc-title";
    title.textContent = "目录";
    panel.appendChild(title);

    var frag = document.createDocumentFragment();
    for (var i = 0; i < items.length; i++) {
      var a = document.createElement("a");
      a.href = "#" + items[i].id;
      a.className = "lv" + items[i].level;
      a.textContent = items[i].text;
      a.setAttribute("data-target", items[i].id);
      frag.appendChild(a);
    }
    panel.appendChild(frag);
    document.body.appendChild(panel);

    panel.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a") : null;
      if (!a) { return; }
      var id = a.getAttribute("data-target");
      var h = id && document.getElementById(id);
      if (!h) { return; }
      e.preventDefault();
      h.scrollIntoView({ behavior: "smooth", block: "start" });
      if (history.replaceState) { history.replaceState(null, "", "#" + id); }
      setActive(id);
    });

    return panel;
  }

  var panel = null;
  var itemsRef = [];

  function setActive(id) {
    if (!panel) { return; }
    var links = panel.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) {
      var on = links[i].getAttribute("data-target") === id;
      links[i].className = links[i].className.replace(/\s*yd-active/, "") + (on ? " yd-active" : "");
    }
  }

  function onScroll() {
    if (!panel || !itemsRef.length || panel.style.display === "none") { return; }
    var current = itemsRef[0].id;
    for (var i = 0; i < itemsRef.length; i++) {
      var top = itemsRef[i].node.getBoundingClientRect().top;
      if (top - TOP_OFFSET <= 0) { current = itemsRef[i].id; } else { break; }
    }
    setActive(current);
  }

  function applyVisibility() {
    if (!panel) { return; }
    var show = itemsRef.length >= 2 && window.innerWidth >= MIN_WIDTH;
    panel.style.display = show ? "" : "none";
  }

  /* 原生目录里有几条锚点？数的是站点自己那栏（.right-menu-item 或一列 # 链接）。 */
  function nativeTocCount() {
    var box = document.querySelector(".right-menu-margin");
    if (!box) { return 0; }
    var items = box.querySelectorAll(".right-menu-item");
    if (items.length) { return items.length; }
    return box.querySelectorAll('a[href^="#"]').length;
  }

  /* 把站点存下来的那份直接删掉：它的链接指向线上站点，点了会跳回网站，
     而且滚动高亮要靠站点脚本（已被 SingleFile 摘掉）。一律以本地这份为准。 */
  function removeNativeToc() {
    var boxes = document.querySelectorAll(".right-menu-margin");
    var n = 0;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.parentNode) { b.parentNode.removeChild(b); }   // 直接移除，不留隐藏节点
      n++;
    }
    return n;
  }

  function init() {
    var nativeN = nativeTocCount();
    if (window.__navDebug) {
      window.__navDebug.tocNative = nativeN;
    } else {
      window.__navDebug = { tocNative: nativeN };
    }
    if (nativeN >= 2) {
      window.__navDebug.tocNativeRemoved = removeNativeToc();  // 删掉站点那份，下面照常自建
    }

    itemsRef = collect();
    if (!itemsRef.length) { return; }
    injectStyle();
    panel = build(itemsRef);
    applyVisibility();
    onScroll();

    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) { return; }
      ticking = true;
      requestAnimationFrame(function () { onScroll(); ticking = false; });
    }, { passive: true });

    window.addEventListener("resize", function () { applyVisibility(); onScroll(); });

    if (window.__navDebug) { window.__navDebug.tocItems = itemsRef.length; }
    else { window.__navDebug = { tocItems: itemsRef.length }; }
    window.__navDebug.tocMode = "built";  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
