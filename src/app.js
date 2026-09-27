/* ==========================================================================
   一周学习时间安排表 — 交互逻辑
   --------------------------------------------------------------------------
   数据模型：
     Task = { id, name, color, day (1-7), start (小时，可含小数，如 8.25), duration (分钟) }
     day = 0 表示「待安排」（还在托盘里）

   渲染模型：
     时间轴 06:00 → 23:00，每格 = 1 小时，格子高度 = CSS 变量 --hour-height
     滑块 top = (start - START_HOUR) * hourHeight
     滑块 height = duration / 60 * hourHeight
     → 因此滑块长度天然与左侧时间轴对齐，且时长改变时自动压缩/伸展
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------ 常量 ------------------------------ */

  var DAYS = ["第一天", "第二天", "第三天", "第四天", "第五天", "第六天", "第七天"];
  var DAY_SUBS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  var COLORS = [
    { name: "竹青", bg: "#cfe6d4", line: "#7fb995" },
    { name: "云蓝", bg: "#d2e2f2", line: "#83aed6" },
    { name: "藕粉", bg: "#f6dcdf", line: "#dd9aa5" },
    { name: "杏黄", bg: "#faecc8", line: "#dcbd6e" },
    { name: "雾紫", bg: "#e3dcf2", line: "#a795d6" },
    { name: "苔绿", bg: "#e0e8cc", line: "#a6bc74" },
    { name: "陶土", bg: "#f8dfd2", line: "#dda385" },
    { name: "天青", bg: "#d5ecec", line: "#85c3c3" }
  ];

  var MIN_DURATION = 15;
  var MAX_DURATION = 360;

  /* ------------------------ 运行时配置（读 CSS 变量） ------------------------ */

  var cfg = {
    startHour: 6,
    endHour: 23,
    hourHeight: 60
  };
  var hours = [];

  /* ------------------------------ 状态 ------------------------------ */

  var tasks = [];
  var seq = 1;
  var dayWidth = 0; // 单列「天」的像素宽度，滑块定位基准

  var drag = null; // 当前拖动会话
  var editingId = null;
  var pickedColor = COLORS[0].bg;
  var editingColor = COLORS[0].bg;

  /* ------------------------------ DOM ------------------------------ */

  var $ = function (id) {
    return document.getElementById(id);
  };

  var el = {
    gridTimes: $("gridTimes"),
    gridDays: $("gridDays"),
    blocksLayer: $("blocksLayer"),
    boardInner: $("boardInner"),
    trayList: $("trayList"),
    trayEmpty: $("trayEmpty"),
    trayCount: $("trayCount"),
    tray: $("tray"),
    creator: $("creator"),
    inputTask: $("inputTask"),
    inputDuration: $("inputDuration"),
    colorRow: $("colorRow"),
    modalMask: $("modalMask"),
    editTask: $("editTask"),
    editDuration: $("editDuration"),
    editColorRow: $("editColorRow"),
    toast: $("toast")
  };

  /* --------------------------- 工具函数 --------------------------- */

  function readCssConfig() {
    var cs = getComputedStyle(document.documentElement);
    var sh = parseFloat(cs.getPropertyValue("--start-hour"));
    var eh = parseFloat(cs.getPropertyValue("--end-hour"));
    var hh = parseFloat(cs.getPropertyValue("--hour-height"));
    cfg.startHour = isNaN(sh) ? 6 : sh;
    cfg.endHour = isNaN(eh) ? 23 : eh;
    cfg.hourHeight = isNaN(hh) ? 60 : hh;

    hours = [];
    for (var h = cfg.startHour; h < cfg.endHour; h++) {
      hours.push(h);
    }
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /** 小时数（可含小数）→ "HH:MM" */
  function fmtTime(value) {
    var total = Math.round(value * 60);
    var h = Math.floor(total / 60);
    var m = total % 60;
    return pad2(h) + ":" + pad2(m);
  }

  /** 分钟 → 可读时长 */
  function fmtDuration(min) {
    if (min < 60) return min + " 分钟";
    var h = Math.floor(min / 60);
    var m = min % 60;
    return m === 0 ? h + " 小时" : h + " 小时 " + m + " 分";
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /** 吸附：精确到 15 分钟（0.25 小时） */
  function snapHour(v) {
    return Math.round(v * 4) / 4;
  }

  function taskById(id) {
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) return tasks[i];
    }
    return null;
  }

  function findColor(bg) {
    for (var i = 0; i < COLORS.length; i++) {
      if (COLORS[i].bg === bg) return COLORS[i];
    }
    return COLORS[0];
  }

  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.hidden = true;
    }, 1900);
  }

  /* --------------------------- 静态结构渲染 --------------------------- */

  function renderHead() {
    var head = document.querySelector(".grid-head");
    // 天单元格容器只建一次
    var box = head.querySelector(".head-days");
    if (!box) {
      box = document.createElement("div");
      box.className = "head-days";
      head.appendChild(box);
    }
    box.innerHTML = "";

    for (var i = 0; i < DAYS.length; i++) {
      var cell = document.createElement("div");
      cell.className = "head-day";
      if (i === 5) cell.classList.add("is-today"); // 以周六作为「今天」的高亮示例

      var name = document.createElement("span");
      name.className = "head-day-name";
      name.textContent = DAYS[i];

      var sub = document.createElement("span");
      sub.className = "head-day-sub";
      sub.textContent = DAY_SUBS[i];

      cell.appendChild(name);
      cell.appendChild(sub);
      box.appendChild(cell);
    }
  }

  function renderTimes() {
    el.gridTimes.innerHTML = "";
    var inner = document.createElement("div");
    inner.className = "times-inner";
    inner.style.height = hours.length * cfg.hourHeight + "px";

    for (var i = 0; i < hours.length; i++) {
      var slot = document.createElement("div");
      slot.className = "time-slot-label";
      slot.style.height = cfg.hourHeight + "px";

      var span = document.createElement("span");
      span.textContent = pad2(hours[i]) + ":00";
      slot.appendChild(span);
      inner.appendChild(slot);
    }
    el.gridTimes.appendChild(inner);
  }

  function renderGrid() {
    el.gridDays.innerHTML = "";
    var colHeight = hours.length * cfg.hourHeight;

    for (var d = 0; d < DAYS.length; d++) {
      var col = document.createElement("div");
      col.className = "day-col";
      col.dataset.day = String(d + 1);
      col.style.height = colHeight + "px";

      for (var h = 0; h < hours.length; h++) {
        var cell = document.createElement("div");
        cell.className = "hour-cell";
        if (hours[h] % 2 === 0) cell.classList.add("is-major");
        cell.style.height = cfg.hourHeight + "px";
        cell.dataset.day = String(d + 1);
        cell.dataset.hour = String(hours[h]);
        col.appendChild(cell);
      }
      el.gridDays.appendChild(col);
    }

    // 滑块层重建（会被上面的 innerHTML 清空），尺寸铺满整个 7 天区域
    el.blocksLayer = document.createElement("div");
    el.blocksLayer.className = "blocks-layer";
    el.blocksLayer.id = "blocksLayer";
    el.gridDays.appendChild(el.blocksLayer);
    el.blocksLayer.style.width = "100%";
    el.blocksLayer.style.height = colHeight + "px";

    // 天列宽度（滑块宽度/横向偏移都基于它计算）
    dayWidth = el.gridDays.clientWidth / DAYS.length;

    // 托盘为空时的占位提示移回托盘
    if (el.trayEmpty.parentNode !== el.trayList) {
      el.trayList.appendChild(el.trayEmpty);
    }
  }

  /* ----------------------------- 滑块渲染 ----------------------------- */

  function buildBlockNode(task) {
    var color = findColor(task.color);
    var node = document.createElement("div");
    node.className = "block";
    node.dataset.id = task.id;
    node.style.background = "linear-gradient(180deg," + color.bg + " 0%, " + color.bg + " 100%)";
    node.style.borderColor = color.line;
    node.style.borderLeft = "4px solid " + color.line;
    node.title = task.name + " · " + fmtTime(task.start) + "–" +
      fmtTime(task.start + task.duration / 60) + " · " + fmtDuration(task.duration);

    var name = document.createElement("div");
    name.className = "block-name";
    name.textContent = task.name;

    var meta = document.createElement("div");
    meta.className = "block-meta";
    meta.textContent = fmtTime(task.start) + "–" +
      fmtTime(task.start + task.duration / 60) + " · " + fmtDuration(task.duration);

    node.appendChild(name);
    node.appendChild(meta);
    return node;
  }

  /** 按数据定位一个已挂载的滑块：纵向对齐时间轴、横向锁定在所属列内 */
  function positionBlock(node, task) {
    var h = (task.duration / 60) * cfg.hourHeight;
    var w = dayWidth || node.parentNode.clientWidth / DAYS.length || 100;
    var dayIdx = clamp(task.day - 1, 0, DAYS.length - 1);

    node.style.top = (task.start - cfg.startHour) * cfg.hourHeight + "px";
    node.style.height = h + "px";
    node.style.left = dayIdx * w + 4 + "px";
    node.style.width = Math.max(24, w - 8) + "px";

    if (task.duration <= 30) {
      node.classList.add("is-tiny");
    } else {
      node.classList.remove("is-tiny");
    }
    node.title = task.name + " · " + fmtTime(task.start) + "–" +
      fmtTime(task.start + task.duration / 60) + " · " + fmtDuration(task.duration);
    var meta = node.querySelector(".block-meta");
    if (meta) {
      meta.textContent = fmtTime(task.start) + "–" +
        fmtTime(task.start + task.duration / 60) + " · " + fmtDuration(task.duration);
    }
  }

  /** 全量重绘表格内的滑块 + 托盘 */
  function render() {
    el.blocksLayer.innerHTML = "";
    el.trayList.innerHTML = "";
    el.trayList.appendChild(el.trayEmpty);

    // 宽度基准：优先用天列实际宽度，保证与表头/时间轴严格对齐
    var cw = el.gridDays.clientWidth;
    if (cw > 0) dayWidth = cw / DAYS.length;

    var placed = 0;

    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      var node = buildBlockNode(t);

      if (t.day === 0) {
        el.trayList.appendChild(node);
      } else {
        el.blocksLayer.appendChild(node);
        positionBlock(node, t);
        placed++;
      }
    }

    var pending = tasks.length - placed;
    el.trayCount.textContent = String(pending);
    el.trayEmpty.hidden = pending > 0;

    // 表格内与托盘内的滑块都要能拖动
    var all = el.blocksLayer.querySelectorAll(".block");
    for (var k = 0; k < all.length; k++) bindBlockEvents(all[k]);
    var trayBlocks = el.trayList.querySelectorAll(".block");
    for (var m = 0; m < trayBlocks.length; m++) bindBlockEvents(trayBlocks[m]);
  }

  /* ----------------------------- 数据操作 ----------------------------- */

  function addTask(name, duration, color, day, start) {
    var t = {
      id: "t" + seq++,
      name: name,
      color: color,
      duration: clamp(Math.round(duration), MIN_DURATION, MAX_DURATION),
      day: typeof day === "number" ? day : 0,
      start: typeof start === "number" ? snapHour(start) : cfg.startHour
    };
    tasks.push(t);
    return t;
  }

  function removeTask(id) {
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) {
        tasks.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /** 把一个滑块放到某天的某时刻；若与已占用区间重叠，则向下顺延到最近空档 */
  function placeTask(task, day, start) {
    var dur = task.duration / 60;
    var maxStart = cfg.endHour - dur;
    var s = clamp(snapHour(start), cfg.startHour, Math.max(cfg.startHour, maxStart));

    var guard = 0;
    while (guard++ < 200) {
      var conflict = null;
      for (var i = 0; i < tasks.length; i++) {
        var o = tasks[i];
        if (o.id === task.id) continue;
        if (o.day !== day) continue;
        var oStart = o.start;
        var oEnd = o.start + o.duration / 60;
        if (s < oEnd && s + dur > oStart) {
          // 有交叠 → 排到该任务的下方
          if (conflict === null || oEnd > conflict) conflict = oEnd;
        }
      }
      if (conflict === null) break;
      s = snapHour(conflict);
      if (s + dur > cfg.endHour) {
        s = clamp(snapHour(cfg.endHour - dur), cfg.startHour, Math.max(cfg.startHour, maxStart));
        break;
      }
    }

    task.day = day;
    task.start = s;
  }

  /* --------------------------- 拖动系统 --------------------------- */

  function bindBlockEvents(node) {
    node.addEventListener("pointerdown", onBlockPointerDown);
  }

  function onBlockPointerDown(e) {
    if (e.button !== 0) return;
    var id = e.currentTarget.dataset.id;
    var task = taskById(id);
    if (!task) return;

    e.preventDefault();
    e.stopPropagation();

    var rect = e.currentTarget.getBoundingClientRect();
    var color = findColor(task.color);

    drag = {
      id: id,
      task: task,
      fromDay: task.day,
      fromStart: task.start,
      // 抓取点在滑块内的偏移比例（0~1），让拖动时相对位置自然
      grabRatio: clamp((e.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
      grabClientY: e.clientY,
      grabClientX: e.clientX,
      moved: false,
      ghost: null,
      pointerId: e.pointerId,
      node: e.currentTarget
    };

    e.currentTarget.classList.add("is-dragging");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function ensureGhost() {
    if (drag.ghost) return drag.ghost;
    var g = document.createElement("div");
    g.className = "drag-ghost";
    var color = findColor(drag.task.color);
    g.style.background = color.bg;
    g.style.borderColor = color.line;
    g.textContent = drag.task.name + " · " + fmtDuration(drag.task.duration);
    document.body.appendChild(g);
    drag.ghost = g;
    return g;
  }

  function onPointerMove(e) {
    if (!drag) return;

    var dx = e.clientX - drag.grabClientX;
    var dy = e.clientY - drag.grabClientY;
    if (!drag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    drag.moved = true;

    var ghost = ensureGhost();
    ghost.style.left = e.clientX + "px";
    ghost.style.top = e.clientY + "px";

    var hit = resolveTarget(e.clientX, e.clientY);
    applyHoverHint(hit);
  }

  /** 依据坐标解析出落点 { day, start } —— day = 0 表示托盘 */
  function resolveTarget(clientX, clientY) {
    // 托盘
    var trayRect = el.tray.getBoundingClientRect();
    if (
      clientX >= trayRect.left &&
      clientX <= trayRect.right &&
      clientY >= trayRect.top &&
      clientY <= trayRect.bottom
    ) {
      return { day: 0, start: drag.task.start };
    }

    // 表格
    var daysRect = el.gridDays.getBoundingClientRect();
    if (
      clientX >= daysRect.left &&
      clientX <= daysRect.right &&
      clientY >= daysRect.top &&
      clientY <= daysRect.bottom
    ) {
      var colW = daysRect.width / DAYS.length;
      var dayIdx = clamp(Math.floor((clientX - daysRect.left) / colW), 0, DAYS.length - 1);

      // 用抓取比例反推「滑块顶部」应在的位置，拖动时手感更自然
      var blockH = (drag.task.duration / 60) * cfg.hourHeight;
      var ghostTopY = clientY - drag.grabRatio * blockH;
      // daysRect.top 是滚动容器视口的上边，需叠加 scrollTop 才是内容坐标
      var rawStart =
        cfg.startHour + (ghostTopY - daysRect.top + el.gridDays.scrollTop) / cfg.hourHeight;
      var dur = drag.task.duration / 60;
      var start = clamp(
        snapHour(rawStart),
        cfg.startHour,
        Math.max(cfg.startHour, cfg.endHour - dur)
      );

      return { day: dayIdx + 1, start: start, daysRect: daysRect };
    }

    return null;
  }

  function applyHoverHint(hit) {
    // 清掉旧的 hover 态
    var hovers = el.gridDays.querySelectorAll(".hour-cell.is-hover");
    for (var i = 0; i < hovers.length; i++) hovers[i].classList.remove("is-hover");

    el.tray.classList.remove("is-drop-target");

    if (!hit) return;

    if (hit.day === 0) {
      el.tray.classList.add("is-drop-target");
      return;
    }

    // 高亮即将占用的时段
    var dur = drag.task.duration / 60;
    var col = el.gridDays.querySelector('.day-col[data-day="' + hit.day + '"]');
    if (!col) return;

    var cells = col.querySelectorAll(".hour-cell");
    for (var c = 0; c < cells.length; c++) {
      var cellStart = cfg.startHour + c;
      var cellEnd = cellStart + 1;
      if (hit.start < cellEnd && hit.start + dur > cellStart) {
        cells[c].classList.add("is-hover");
      }
    }
  }

  function onPointerUp(e) {
    if (!drag) return;

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);

    var session = drag;
    drag = null;

    if (session.node) session.node.classList.remove("is-dragging");
    if (session.ghost && session.ghost.parentNode) session.ghost.parentNode.removeChild(session.ghost);

    var hovers = el.gridDays.querySelectorAll(".hour-cell.is-hover");
    for (var i = 0; i < hovers.length; i++) hovers[i].classList.remove("is-hover");
    el.tray.classList.remove("is-drop-target");

    if (!session.moved) {
      openEditModal(session.id);
      return;
    }

    var hit = resolveTarget(e.clientX, e.clientY);
    var task = taskById(session.id);
    if (!task) return;

    if (!hit) {
      // 落在表格与托盘之外 —— 保持原安排不变
      render();
      return;
    }

    if (hit.day === 0) {
      task.day = 0;
      toast("已移回待安排区");
    } else {
      placeTask(task, hit.day, hit.start);
      toast("已安排到" + DAYS[hit.day - 1] + " " + fmtTime(task.start));
    }
    render();
  }

  /* --------------------------- 新建滑块 --------------------------- */

  function renderColorRow(container, picked, onPick) {
    container.innerHTML = "";
    for (var i = 0; i < COLORS.length; i++) {
      (function (color) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "color-dot";
        if (color.bg === picked) b.classList.add("is-active");
        b.style.background = color.bg;
        b.style.borderColor = color.line;
        b.style.borderWidth = "2px";
        b.title = color.name;
        b.setAttribute("aria-label", color.name);
        b.addEventListener("click", function () {
          onPick(color.bg);
        });
        container.appendChild(b);
      })(COLORS[i]);
    }
  }

  function openCreator() {
    el.creator.hidden = false;
    el.inputTask.focus();
  }

  function closeCreator() {
    el.creator.hidden = true;
  }

  function confirmCreate() {
    var name = (el.inputTask.value || "").trim();
    var dur = parseInt(el.inputDuration.value, 10);

    if (!name) {
      toast("请先给任务起个名字");
      el.inputTask.focus();
      return;
    }
    if (isNaN(dur) || dur < MIN_DURATION) {
      toast("时长至少 " + MIN_DURATION + " 分钟");
      el.inputDuration.focus();
      return;
    }
    if (dur > MAX_DURATION) dur = MAX_DURATION;

    // 试图直接放在第一天最早的空档，方便立刻看到效果
    var t = addTask(name, dur, pickedColor, 0, cfg.startHour);
    render();
    el.inputTask.value = "";
    el.inputDuration.value = "60";
    toast("已创建「" + name + "」，拖到表格里安排时间");
    el.inputTask.focus();

    // 高亮新滑块
    var node = el.trayList.querySelector('.block[data-id="' + t.id + '"]');
    if (node) {
      node.style.transition = "box-shadow .3s ease";
      node.style.boxShadow = "0 0 0 3px rgba(76,140,109,.45)";
      setTimeout(function () {
        node.style.boxShadow = "";
      }, 1200);
    }
  }

  /* --------------------------- 编辑弹窗 --------------------------- */

  function openEditModal(id) {
    var t = taskById(id);
    if (!t) return;
    editingId = id;
    editingColor = t.color;
    el.editTask.value = t.name;
    el.editDuration.value = String(t.duration);

    function pickEdit(bg) {
      editingColor = bg;
      renderColorRow(el.editColorRow, editingColor, pickEdit);
    }
    renderColorRow(el.editColorRow, editingColor, pickEdit);

    el.modalMask.hidden = false;
    el.editTask.focus();
    el.editTask.select();
  }

  function closeEditModal() {
    el.modalMask.hidden = true;
    editingId = null;
  }

  function saveEdit() {
    var t = taskById(editingId);
    if (!t) return;

    var name = (el.editTask.value || "").trim();
    var dur = parseInt(el.editDuration.value, 10);

    if (!name) {
      toast("任务名称不能为空");
      return;
    }
    if (isNaN(dur) || dur < MIN_DURATION) {
      toast("时长至少 " + MIN_DURATION + " 分钟");
      return;
    }
    dur = clamp(dur, MIN_DURATION, MAX_DURATION);

    t.name = name;
    t.duration = dur;
    t.color = editingColor;

    // 时长变长后若超出当日时间轴末端，向上回推
    if (t.day !== 0) {
      var maxStart = cfg.endHour - dur / 60;
      if (t.start > maxStart) t.start = Math.max(cfg.startHour, snapHour(maxStart));
    }

    closeEditModal();
    render();
    toast("已更新「" + name + "」");
  }

  function deleteEditing() {
    var t = taskById(editingId);
    if (!t) return;
    removeTask(editingId);
    closeEditModal();
    render();
    toast("已删除「" + t.name + "」");
  }

  /* --------------------------- 示例 / 清空 --------------------------- */

  function loadDemo() {
    var demo = [
      ["晨读英语", 45, COLORS[1].bg, 1, 7],
      ["高等数学", 120, COLORS[0].bg, 1, 9],
      ["午休", 60, COLORS[5].bg, 1, 13],
      ["专业课预习", 90, COLORS[3].bg, 2, 9],
      ["线性代数", 90, COLORS[4].bg, 3, 10],
      ["实验报告", 120, COLORS[7].bg, 4, 14],
      ["英语听力", 60, COLORS[1].bg, 5, 8],
      ["编程练习", 150, COLORS[6].bg, 6, 10],
      ["周总结", 60, COLORS[2].bg, 7, 16],
      ["背单词", 30, COLORS[5].bg, 0, 6]
    ];

    for (var i = 0; i < demo.length; i++) {
      var d = demo[i];
      var t = addTask(d[0], d[1], d[2], 0, cfg.startHour);
      if (d[3] !== 0) placeTask(t, d[3], d[4]);
    }
    render();
    toast("已载入示例安排");
  }

  function clearAll() {
    if (!tasks.length) {
      toast("当前没有任务");
      return;
    }
    tasks = [];
    render();
    toast("已清空全部安排");
  }

  /* --------------------------- 事件绑定 --------------------------- */

  function bindEvents() {
    $("btnCreate").addEventListener("click", function () {
      if (el.creator.hidden) {
        openCreator();
      } else {
        closeCreator();
      }
    });
    $("btnCloseCreator").addEventListener("click", closeCreator);
    $("btnCreateConfirm").addEventListener("click", confirmCreate);
    $("btnDemo").addEventListener("click", loadDemo);
    $("btnClear").addEventListener("click", clearAll);

    el.inputTask.addEventListener("keydown", function (e) {
      if (e.key === "Enter") confirmCreate();
    });
    el.inputDuration.addEventListener("keydown", function (e) {
      if (e.key === "Enter") confirmCreate();
    });

    $("btnCloseModal").addEventListener("click", closeEditModal);
    $("btnCancelEdit").addEventListener("click", closeEditModal);
    $("btnSaveEdit").addEventListener("click", saveEdit);
    $("btnDelete").addEventListener("click", deleteEditing);

    el.modalMask.addEventListener("click", function (e) {
      if (e.target === el.modalMask) closeEditModal();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!el.modalMask.hidden) closeEditModal();
        else if (!el.creator.hidden) closeCreator();
      }
    });

    // 托盘本身就是一个放置目标
    el.tray.addEventListener("pointerenter", function () {
      if (drag && drag.moved) el.tray.classList.add("is-drop-target");
    });
    el.tray.addEventListener("pointerleave", function () {
      el.tray.classList.remove("is-drop-target");
    });

    // 时间轴与天列双列同步滚动（滑块层在天列内部，天然跟随）
    var syncing = false;
    function linkScroll(a, b) {
      a.addEventListener("scroll", function () {
        if (syncing) return;
        syncing = true;
        b.scrollTop = a.scrollTop;
        requestAnimationFrame(function () {
          syncing = false;
        });
      });
    }
    linkScroll(el.gridTimes, el.gridDays);
    linkScroll(el.gridDays, el.gridTimes);

    window.addEventListener("resize", debounce(function () {
      readCssConfig();
      renderTimes();
      renderGrid();
      render();
    }, 160));

    // 天列宽度会随窗口/字体变化，用 ResizeObserver 兜底重算
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(debounce(function () {
        var cw = el.gridDays.clientWidth;
        if (cw > 0 && Math.abs(cw - dayWidth * DAYS.length) > 1) {
          dayWidth = cw / DAYS.length;
          var nodes = el.blocksLayer.querySelectorAll(".block");
          for (var i = 0; i < nodes.length; i++) {
            var t = taskById(nodes[i].dataset.id);
            if (t) positionBlock(nodes[i], t);
          }
        }
      }, 120));
      ro.observe(el.gridDays);
    }
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  /* --------------------------- 启动 --------------------------- */

  function init() {
    readCssConfig();

    // 表格区域竖向滚动：时间轴与天列各自滚动并保持同步
    el.gridTimes.style.overflowY = "auto";
    el.gridDays.style.overflowY = "auto";
    el.gridTimes.style.overflowX = "hidden";
    el.gridDays.style.overflowX = "hidden";

    renderHead();
    renderTimes();
    renderGrid();

    pickedColor = COLORS[0].bg;
    function pickNew(bg) {
      pickedColor = bg;
      renderColorRow(el.colorRow, pickedColor, pickNew);
    }
    renderColorRow(el.colorRow, pickedColor, pickNew);

    bindEvents();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
