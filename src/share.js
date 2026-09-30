/* ==========================================================================
   分享链接编解码 —— 把一份「一周安排」压进 URL 的 # 片段，不经过任何服务器。
   --------------------------------------------------------------------------
   链接形如： https://站点/#s=z<base64url>
     s = <标记><base64url>
     标记 z = deflate-raw 压缩后的 JSON；标记 j = 未压缩的 JSON（兜底）

   任务名会明文躺在链接里：谁拿到链接，谁就能看到这份安排，别往表里写隐私内容。
   编码/解码都返回 Promise —— 浏览器里 CompressionStream 是流式 API。
   ========================================================================== */

(function (global) {
  "use strict";

  var HASH_KEY = "s";
  var FMT_DEFLATE = "z";
  var FMT_PLAIN = "j";
  var VERSION = 1;

  /* ------------------------------ base64url ------------------------------ */

  function bytesToB64Url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64UrlToBytes(str) {
    var b64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* --------------------------- deflate / inflate --------------------------- */

  function canDeflate() {
    return (
      typeof global.CompressionStream === "function" &&
      typeof global.DecompressionStream === "function" &&
      typeof global.Blob === "function" &&
      typeof global.Response === "function"
    );
  }

  // 用 Blob 造源流再 pipeThrough：坏数据时错误规规矩矩从 readable 一侧抛出。
  // 手工 writer.write()+new Response(readable) 的写法会漏一条 unhandled rejection（Node 24 实测）。
  function pipeThrough(stream, bytes) {
    var src = new global.Blob([bytes]).stream();
    return new global.Response(src.pipeThrough(stream)).arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  function deflateBytes(bytes) {
    return pipeThrough(new global.CompressionStream("deflate-raw"), bytes);
  }

  function inflateBytes(bytes) {
    return pipeThrough(new global.DecompressionStream("deflate-raw"), bytes);
  }

  /* ------------------------------ 结构压缩 ------------------------------ */
  /* 相同颜色只存一次下标，任务行用短数组，链接能短一大截。 */

  function slim(state) {
    var tasks = (state && state.tasks) || [];
    var colors = [];
    var rows = [];
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i] || {};
      var color = typeof t.color === "string" ? t.color : "";
      var ci = colors.indexOf(color);
      if (ci < 0) {
        colors.push(color);
        ci = colors.length - 1;
      }
      rows.push([t.name, ci, t.duration, t.day, t.start]);
    }
    var seq = parseInt(state && state.seq, 10);
    if (!isFinite(seq) || seq < 1) seq = rows.length + 1;
    return { v: VERSION, s: seq, c: colors, t: rows };
  }

  function expand(data) {
    if (!data || typeof data !== "object") throw new Error("payload 不是对象");
    if (data.v !== VERSION) throw new Error("不支持的链接版本: " + data.v);
    if (!Array.isArray(data.t)) throw new Error("payload 缺少任务列表");
    var colors = Array.isArray(data.c) ? data.c : [];
    var tasks = [];
    for (var i = 0; i < data.t.length; i++) {
      var row = data.t[i];
      if (!Array.isArray(row)) continue;
      if (typeof row[0] !== "string" || !row[0].trim()) continue;
      var color = colors[row[1]];
      tasks.push({
        name: row[0],
        color: typeof color === "string" ? color : "",
        duration: row[2],
        day: row[3],
        start: row[4]
      });
    }
    return { v: VERSION, seq: data.s, tasks: tasks };
  }

  /* ------------------------------ 对外接口 ------------------------------ */

  /** 把 {seq, tasks} 编成 URL 片段里的那一串字符 */
  function encode(state) {
    var bytes = new TextEncoder().encode(JSON.stringify(slim(state)));
    if (!canDeflate()) return Promise.resolve(FMT_PLAIN + bytesToB64Url(bytes));
    return deflateBytes(bytes).then(
      function (packed) {
        return FMT_DEFLATE + bytesToB64Url(packed);
      },
      function () {
        // 压缩这条路坏了也不能让分享整个失效，退回未压缩
        return FMT_PLAIN + bytesToB64Url(bytes);
      }
    );
  }

  /** 解码；链接坏了就 reject，调用方自己决定怎么兜底 */
  function decode(payload) {
    if (typeof payload !== "string" || payload.length < 2) {
      return Promise.reject(new Error("链接内容为空"));
    }
    var fmt = payload.charAt(0);
    var body = payload.slice(1);
    var bytes;
    try {
      bytes = b64UrlToBytes(body);
    } catch (e) {
      return Promise.reject(new Error("链接内容不是合法的 base64"));
    }

    if (fmt === FMT_PLAIN) {
      try {
        return Promise.resolve(expand(JSON.parse(new TextDecoder().decode(bytes))));
      } catch (e) {
        return Promise.reject(e);
      }
    }
    if (fmt !== FMT_DEFLATE) return Promise.reject(new Error("未知的链接标记: " + fmt));
    if (!canDeflate()) return Promise.reject(new Error("当前环境不支持解压分享链接"));

    return inflateBytes(bytes).then(function (raw) {
      return expand(JSON.parse(new TextDecoder().decode(raw)));
    });
  }

  /** 从 "#s=xxx&y=1" 这类片段里挑出 s 参数；没有就返回 null */
  function parseHash(hashText) {
    var h = typeof hashText === "string" ? hashText : "";
    if (h.charAt(0) === "#") h = h.slice(1);
    if (!h) return null;
    var parts = h.split("&");
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf(HASH_KEY + "=") !== 0) continue;
      var raw = parts[i].slice(HASH_KEY.length + 1);
      try {
        return decodeURIComponent(raw);
      } catch (e) {
        return raw;
      }
    }
    return null;
  }

  function readHash() {
    return parseHash(global.location && global.location.hash);
  }

  /** 把 payload 拼成一条可以直接发出去的完整链接 */
  function buildUrl(payload, loc) {
    var l = loc || global.location;
    var base = l.origin && l.origin !== "null"
      ? l.origin
      : l.protocol + "//" + l.host;
    return base + l.pathname + l.search + "#" + HASH_KEY + "=" + payload;
  }

  /** 用完就把片段抹掉，免得刷新时又回到分享态 */
  function clearHash(loc) {
    var l = loc || global.location;
    if (!l || !l.hash) return;
    if (global.history && global.history.replaceState) {
      global.history.replaceState(null, "", l.pathname + l.search);
    } else {
      l.hash = "";
    }
  }

  global.SWGShare = {
    encode: encode,
    decode: decode,
    parseHash: parseHash,
    readHash: readHash,
    buildUrl: buildUrl,
    clearHash: clearHash,
    version: VERSION
  };
})(typeof window !== "undefined" ? window : this);
