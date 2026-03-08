// ==UserScript==
// @name         CPA AuthFiles Non-Active Cleaner
// @namespace    openai_registor
// @version      1.0.0
// @description  右侧悬浮栏：获取 status!=active 文件并确认删除
// @author       local
// @match        *://*/management.html
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const BASE_ORIGIN = window.location.origin;
  const AUTH_FILES_URL = `${BASE_ORIGIN}/v0/management/auth-files`;
  const API_CALL_URL = `${BASE_ORIGIN}/v0/management/api-call`;
  const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
  const DEFAULT_UA = "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal";
  const QUERY_CACHE_KEY = "tm_usage_query_cache_v1";
  const QUERY_CACHE_MAX_ENTRIES = 5000;

  let pendingFiles = [];
  let usageQueryCache = loadUsageQueryCache();

  function getCachedToken() {
    return "";
  }

  function extractFileName(item) {
    for (const key of ["name", "id", "filename", "file_name"]) {
      const value = item?.[key];
      if (value) return String(value);
    }
    return null;
  }

  function extractAuthIndex(item) {
    for (const key of ["authIndex", "auth_index", "authindex"]) {
      const value = item?.[key];
      if (value) return String(value);
    }
    return null;
  }

  function extractChatgptAccountId(item) {
    for (const key of ["chatgpt_account_id", "chatgptAccountId", "account_id", "accountId"]) {
      const value = item?.[key];
      if (value) return String(value);
    }
    return null;
  }

  function getHeaders(token) {
    return {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9",
      authorization: `Bearer ${token}`,
      Referer: `${BASE_ORIGIN}/management.html`,
    };
  }

  function getCacheKey(item) {
    const auth = item?.authIndex ? String(item.authIndex) : "";
    if (auth) return `auth:${auth}`;
    const name = item?.name ? String(item.name) : "";
    if (name) return `name:${name}`;
    return "";
  }

  function loadUsageQueryCache() {
    try {
      const raw = localStorage.getItem(QUERY_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
      return {};
    } catch (_) {
      return {};
    }
  }

  function saveUsageQueryCache() {
    try {
      const entries = Object.entries(usageQueryCache);
      if (entries.length > QUERY_CACHE_MAX_ENTRIES) {
        entries.sort((a, b) => {
          const ta = Number(a?.[1]?.queriedAt || 0);
          const tb = Number(b?.[1]?.queriedAt || 0);
          return tb - ta;
        });
        usageQueryCache = Object.fromEntries(entries.slice(0, QUERY_CACHE_MAX_ENTRIES));
      }
      localStorage.setItem(QUERY_CACHE_KEY, JSON.stringify(usageQueryCache));
    } catch (_) {
      // ignore cache write errors
    }
  }

  function getCachedUsageForItem(item) {
    const key = getCacheKey(item);
    if (!key) return null;
    const cached = usageQueryCache[key];
    return cached && typeof cached === "object" ? cached : null;
  }

  function applyCachedUsageToItem(item, cachedEntry) {
    const cached = cachedEntry || getCachedUsageForItem(item);
    if (!cached) return false;

    item.usedPercent =
      cached.usedPercent === null || cached.usedPercent === undefined
        ? null
        : Number(cached.usedPercent);
    item.resetText = cached.resetText || "-";
    item.lastStatusCode =
      cached.statusCode === null || cached.statusCode === undefined
        ? null
        : cached.statusCode;
    item.lastBalancePayload = {
      title: `余额查询结果 - ${item.name}`,
      statusCode: cached.statusCode ?? null,
      bodyObj:
        cached.bodyObj && typeof cached.bodyObj === "object"
          ? cached.bodyObj
          : null,
      bodyText: cached.bodyText || "",
      bodyParsed: Boolean(cached.bodyParsed),
    };
    return true;
  }

  function updateUsageCacheForItem(item, result, snapshot) {
    const key = getCacheKey(item);
    if (!key) return;
    usageQueryCache[key] = {
      statusCode: result?.statusCode ?? null,
      usedPercent:
        snapshot?.usedPercent === null || snapshot?.usedPercent === undefined
          ? null
          : Number(snapshot.usedPercent),
      resetText: snapshot?.resetText || "-",
      bodyObj:
        result?.bodyObj && typeof result.bodyObj === "object"
          ? result.bodyObj
          : null,
      bodyText: result?.bodyText || "",
      bodyParsed: Boolean(result?.bodyParsed),
      queriedAt: Date.now(),
    };
    saveUsageQueryCache();
  }

  function normalizeFilesPayload(data) {
    const files = Array.isArray(data?.files)
      ? data.files.filter((x) => x && typeof x === "object")
      : Array.isArray(data)
      ? data.filter((x) => x && typeof x === "object")
      : [];

    const items = [];
    for (const item of files) {
      const name = extractFileName(item);
      const authIndex = extractAuthIndex(item);
      const chatgptAccountId = extractChatgptAccountId(item);
      if (!name && !authIndex) continue;
      items.push({
        name: name || "(no-name)",
        authIndex: authIndex || "",
        status: String(item?.status ?? ""),
        chatgptAccountId: chatgptAccountId || "",
        usedPercent: null,
        resetText: "-",
        lastStatusCode: null,
        lastBalancePayload: null,
      });
    }
    items.forEach((x) => {
      applyCachedUsageToItem(x);
    });
    return items;
  }

  async function fetchAllFiles(token) {
    const resp = await fetch(AUTH_FILES_URL, {
      method: "GET",
      headers: getHeaders(token),
      credentials: "include",
    });
    if (!resp.ok) {
      throw new Error(`GET 失败: HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return normalizeFilesPayload(data);
  }

  async function fetchNonActive(token) {
    const all = await fetchAllFiles(token);
    return all.filter((x) => String(x.status ?? "").toLowerCase() !== "active");
  }

  async function deleteByName(token, name) {
    const url = `${AUTH_FILES_URL}?name=${encodeURIComponent(name)}`;
    const resp = await fetch(url, {
      method: "DELETE",
      headers: getHeaders(token),
      credentials: "include",
    });

    let json = null;
    try {
      json = await resp.json();
    } catch (_) {
      json = null;
    }

    const ok = resp.status === 200 && (!json || json.status === "ok");
    return {
      name,
      ok,
      status: resp.status,
      message: ok ? "ok" : JSON.stringify(json || {}),
    };
  }

  function safeJson(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function parseApiCallBody(data) {
    const statusCode = data?.status_code ?? data?.statusCode ?? null;
    const rawBody = data?.body;

    if (typeof rawBody === "string") {
      const parsed = safeJson(rawBody);
      if (parsed && typeof parsed === "object") {
        return {
          statusCode,
          bodyObj: parsed,
          bodyText: JSON.stringify(parsed, null, 2),
          bodyParsed: true,
        };
      }
      return {
        statusCode,
        bodyObj: null,
        bodyText: rawBody,
        bodyParsed: false,
      };
    }

    if (rawBody && typeof rawBody === "object") {
      return {
        statusCode,
        bodyObj: rawBody,
        bodyText: JSON.stringify(rawBody, null, 2),
        bodyParsed: true,
      };
    }

    if (rawBody === null || rawBody === undefined) {
      return {
        statusCode,
        bodyObj: null,
        bodyText: "",
        bodyParsed: true,
      };
    }

    return {
      statusCode,
      bodyObj: null,
      bodyText: String(rawBody),
      bodyParsed: false,
    };
  }

  async function queryUsageByAuthIndex(token, fileItem) {
    if (!fileItem?.authIndex) {
      return {
        ok: false,
        name: fileItem?.name || "",
        authIndex: "",
        message: "missing authIndex",
      };
    }

    const header = {
      Authorization: "Bearer $TOKEN$",
      "Content-Type": "application/json",
      "User-Agent": DEFAULT_UA,
    };
    if (fileItem.chatgptAccountId) {
      header["Chatgpt-Account-Id"] = fileItem.chatgptAccountId;
    }

    const body = {
      authIndex: fileItem.authIndex,
      method: "GET",
      url: USAGE_URL,
      header,
    };

    const resp = await fetch(API_CALL_URL, {
      method: "POST",
      headers: {
        ...getHeaders(token),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      credentials: "include",
    });

    const text = await resp.text();
    const data = safeJson(text);
    const parsed = data
      ? parseApiCallBody(data)
      : { statusCode: null, bodyObj: null, bodyText: text, bodyParsed: false };
    return {
      ok: resp.ok && parsed.statusCode === 200,
      name: fileItem.name,
      authIndex: fileItem.authIndex,
      http: resp.status,
      statusCode: parsed.statusCode,
      bodyObj: parsed.bodyObj,
      bodyText: parsed.bodyText,
      bodyParsed: parsed.bodyParsed,
      raw: data || null,
    };
  }

  function createSidebar() {
    const PANEL_WIDTH = 380;
    const TOGGLE_WIDTH = 44;
    const HIDDEN_X = PANEL_WIDTH;
    let isOpen = false;
    let queryAllRunning = false;
    let stopQueryAllRequested = false;

    const bar = document.createElement("div");
    bar.style.position = "fixed";
    bar.style.right = "0";
    bar.style.top = "50%";
    bar.style.transform = `translate(${HIDDEN_X}px, -50%)`;
    bar.style.width = `${PANEL_WIDTH}px`;
    bar.style.maxHeight = "80vh";
    bar.style.zIndex = "99999";
    bar.style.background = "#111827";
    bar.style.color = "#f9fafb";
    bar.style.border = "1px solid #374151";
    bar.style.borderRadius = "12px";
    bar.style.padding = "12px";
    bar.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    bar.style.fontFamily =
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    bar.style.transition = "transform 0.2s ease";
    bar.style.overflow = "visible";

    let balanceModal = null;

    function ensureBalanceModal() {
      if (balanceModal) return balanceModal;

      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.background = "rgba(0, 0, 0, 0.45)";
      overlay.style.zIndex = "100001";
      overlay.style.display = "none";

      const panel = document.createElement("div");
      panel.style.position = "absolute";
      panel.style.left = "50%";
      panel.style.top = "50%";
      panel.style.transform = "translate(-50%, -50%)";
      panel.style.width = "min(1100px, 90vw)";
      panel.style.height = "min(82vh, 920px)";
      panel.style.background =
        "linear-gradient(180deg, #0b1220 0%, #111827 100%)";
      panel.style.color = "#f8fafc";
      panel.style.border = "1px solid #334155";
      panel.style.borderRadius = "16px";
      panel.style.boxShadow = "0 20px 50px rgba(0, 0, 0, 0.5)";
      panel.style.display = "flex";
      panel.style.flexDirection = "column";
      panel.style.padding = "16px";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.marginBottom = "8px";

      const title = document.createElement("div");
      title.textContent = "余额查询结果";
      title.style.fontSize = "16px";
      title.style.fontWeight = "700";
      header.appendChild(title);

      const statusBadge = document.createElement("div");
      statusBadge.textContent = "状态码: -";
      statusBadge.style.fontSize = "12px";
      statusBadge.style.fontWeight = "700";
      statusBadge.style.padding = "4px 8px";
      statusBadge.style.borderRadius = "999px";
      statusBadge.style.background = "#1f2937";
      statusBadge.style.color = "#cbd5e1";

      const rightBox = document.createElement("div");
      rightBox.style.display = "flex";
      rightBox.style.alignItems = "center";
      rightBox.style.gap = "8px";
      rightBox.appendChild(statusBadge);

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "关闭";
      closeBtn.style.border = "0";
      closeBtn.style.borderRadius = "8px";
      closeBtn.style.padding = "6px 10px";
      closeBtn.style.cursor = "pointer";
      closeBtn.style.background = "#334155";
      closeBtn.style.color = "#fff";
      rightBox.appendChild(closeBtn);
      header.appendChild(rightBox);

      const contentRoot = document.createElement("div");
      contentRoot.style.flex = "1";
      contentRoot.style.width = "100%";
      contentRoot.style.overflow = "auto";
      contentRoot.style.boxSizing = "border-box";
      contentRoot.style.border = "1px solid #334155";
      contentRoot.style.borderRadius = "12px";
      contentRoot.style.padding = "12px";
      contentRoot.style.background = "#020617";
      contentRoot.style.color = "#f8fafc";
      contentRoot.style.fontFamily =
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

      function textOrDash(value) {
        if (value === undefined || value === null || value === "") return "-";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
      }

      function formatUnix(value) {
        if (value === undefined || value === null || value === "") return "-";
        const n = Number(value);
        if (!Number.isFinite(n)) return String(value);
        try {
          return `${n} (${new Date(n * 1000).toLocaleString()})`;
        } catch (_) {
          return String(value);
        }
      }

      function formatSeconds(value) {
        if (value === undefined || value === null || value === "") return "-";
        const n = Number(value);
        if (!Number.isFinite(n)) return String(value);
        const d = Math.floor(n / 86400);
        const h = Math.floor((n % 86400) / 3600);
        const m = Math.floor((n % 3600) / 60);
        return `${n}s (${d}d ${h}h ${m}m)`;
      }

      function createSection(titleText, fields) {
        const card = document.createElement("div");
        card.style.background = "#0b1220";
        card.style.border = "1px solid #233044";
        card.style.borderRadius = "10px";
        card.style.padding = "10px";
        card.style.marginBottom = "10px";

        const h = document.createElement("div");
        h.textContent = titleText;
        h.style.fontSize = "13px";
        h.style.fontWeight = "700";
        h.style.marginBottom = "8px";
        h.style.color = "#cbd5e1";
        card.appendChild(h);

        const grid = document.createElement("div");
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "180px 1fr";
        grid.style.gap = "6px 10px";

        fields.forEach(([k, v]) => {
          const keyEl = document.createElement("div");
          keyEl.textContent = k;
          keyEl.style.color = "#94a3b8";
          keyEl.style.fontSize = "12px";

          const valEl = document.createElement("div");
          valEl.textContent = textOrDash(v);
          valEl.style.color = "#f8fafc";
          valEl.style.fontSize = "12px";
          valEl.style.wordBreak = "break-word";

          grid.appendChild(keyEl);
          grid.appendChild(valEl);
        });

        card.appendChild(grid);
        return card;
      }

      function createRawBlock(titleText, textValue) {
        const card = document.createElement("div");
        card.style.background = "#0b1220";
        card.style.border = "1px solid #233044";
        card.style.borderRadius = "10px";
        card.style.padding = "10px";
        card.style.marginBottom = "10px";

        const h = document.createElement("div");
        h.textContent = titleText;
        h.style.fontSize = "13px";
        h.style.fontWeight = "700";
        h.style.marginBottom = "8px";
        h.style.color = "#cbd5e1";
        card.appendChild(h);

        const pre = document.createElement("pre");
        pre.textContent = textValue || "";
        pre.style.margin = "0";
        pre.style.whiteSpace = "pre-wrap";
        pre.style.wordBreak = "break-word";
        pre.style.color = "#e2e8f0";
        pre.style.fontSize = "12px";
        pre.style.lineHeight = "1.45";
        card.appendChild(pre);

        return card;
      }

      function renderBodyPage(info) {
        contentRoot.innerHTML = "";
        const body = info?.bodyObj && typeof info.bodyObj === "object" ? info.bodyObj : null;

        if (!body) {
          const empty = document.createElement("div");
          empty.textContent = "响应体为空或不是有效 JSON，展示原始响应体内容：";
          empty.style.fontSize = "13px";
          empty.style.marginBottom = "8px";
          empty.style.color = "#fbbf24";
          contentRoot.appendChild(empty);
          contentRoot.appendChild(createRawBlock("Body 原文", info?.bodyText || ""));
          return;
        }

        const wrapper = document.createElement("div");
        wrapper.style.display = "grid";
        wrapper.style.gridTemplateColumns = "repeat(auto-fit, minmax(420px, 1fr))";
        wrapper.style.gap = "10px";

        const rate = body?.rate_limit || {};
        const ratePrimary = rate?.primary_window || {};
        const codeRate = body?.code_review_rate_limit || {};
        const codePrimary = codeRate?.primary_window || {};
        const promo = body?.promo || {};

        wrapper.appendChild(
          createSection("基础信息", [
            ["用户ID", body.user_id],
            ["账户ID", body.account_id],
            ["邮箱", body.email],
            ["套餐类型", body.plan_type],
          ])
        );

        wrapper.appendChild(
          createSection("主限流", [
            ["是否允许", rate.allowed],
            ["是否触顶", rate.limit_reached],
            ["已用百分比", ratePrimary.used_percent === undefined ? "-" : `${ratePrimary.used_percent}%`],
            ["窗口总时长", formatSeconds(ratePrimary.limit_window_seconds)],
            ["重置剩余时间", formatSeconds(ratePrimary.reset_after_seconds)],
            ["重置时间", formatUnix(ratePrimary.reset_at)],
            ["次级窗口", rate.secondary_window],
          ])
        );

        wrapper.appendChild(
          createSection("代码评审限流", [
            ["是否允许", codeRate.allowed],
            ["是否触顶", codeRate.limit_reached],
            ["已用百分比", codePrimary.used_percent === undefined ? "-" : `${codePrimary.used_percent}%`],
            ["窗口总时长", formatSeconds(codePrimary.limit_window_seconds)],
            ["重置剩余时间", formatSeconds(codePrimary.reset_after_seconds)],
            ["重置时间", formatUnix(codePrimary.reset_at)],
            ["次级窗口", codeRate.secondary_window],
          ])
        );

        wrapper.appendChild(
          createSection("附加信息", [
            ["附加限流", body.additional_rate_limits],
            ["积分", body.credits],
            ["活动ID", promo.campaign_id],
            ["活动文案", promo.message],
          ])
        );

        contentRoot.appendChild(wrapper);
        contentRoot.appendChild(
          createRawBlock("响应体原始 JSON（键名保持原始）", JSON.stringify(body, null, 2))
        );
      }

      closeBtn.addEventListener("click", () => {
        overlay.style.display = "none";
      });
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.style.display = "none";
      });

      panel.appendChild(header);
      panel.appendChild(contentRoot);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      balanceModal = {
        overlay,
        title,
        statusBadge,
        contentRoot,
        show(payload) {
          const info = payload || {};
          title.textContent = info.title || "余额查询结果";
          const sc = info.statusCode;
          statusBadge.textContent = `状态码: ${sc === null || sc === undefined ? "-" : sc}`;
          if (sc === null || sc === undefined || sc === "") {
            statusBadge.style.background = "#1f2937";
            statusBadge.style.color = "#cbd5e1";
          } else {
            const ok = Number(sc) === 200;
            statusBadge.style.background = ok ? "#064e3b" : "#7f1d1d";
            statusBadge.style.color = ok ? "#a7f3d0" : "#fecaca";
          }
          renderBodyPage(info);
          overlay.style.display = "block";
        },
      };
      return balanceModal;
    }

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "展开";
    toggleBtn.style.position = "absolute";
    toggleBtn.style.left = `-${TOGGLE_WIDTH}px`;
    toggleBtn.style.top = "50%";
    toggleBtn.style.transform = "translateY(-50%)";
    toggleBtn.style.zIndex = "1";
    toggleBtn.style.width = `${TOGGLE_WIDTH}px`;
    toggleBtn.style.height = "96px";
    toggleBtn.style.padding = "0";
    toggleBtn.style.border = "0";
    toggleBtn.style.borderRadius = "10px 0 0 10px";
    toggleBtn.style.cursor = "pointer";
    toggleBtn.style.background = "#2563eb";
    toggleBtn.style.color = "#fff";
    toggleBtn.style.fontSize = "13px";
    toggleBtn.style.fontWeight = "700";
    toggleBtn.style.writingMode = "vertical-rl";
    toggleBtn.style.letterSpacing = "2px";
    bar.appendChild(toggleBtn);

    const title = document.createElement("div");
    title.textContent = "AuthFiles 清理";
    title.style.fontSize = "14px";
    title.style.fontWeight = "700";
    title.style.marginBottom = "8px";
    bar.appendChild(title);

    const btnFetch = document.createElement("button");
    btnFetch.textContent = "获取失效文件";
    btnFetch.style.width = "100%";
    btnFetch.style.padding = "8px";
    btnFetch.style.marginBottom = "8px";
    btnFetch.style.border = "0";
    btnFetch.style.borderRadius = "8px";
    btnFetch.style.cursor = "pointer";
    btnFetch.style.background = "#2563eb";
    btnFetch.style.color = "#fff";
    bar.appendChild(btnFetch);

    const btnBatchQuery = document.createElement("button");
    btnBatchQuery.textContent = "一键查询余额";
    btnBatchQuery.style.width = "100%";
    btnBatchQuery.style.padding = "8px";
    btnBatchQuery.style.marginBottom = "8px";
    btnBatchQuery.style.border = "0";
    btnBatchQuery.style.borderRadius = "8px";
    btnBatchQuery.style.cursor = "pointer";
    btnBatchQuery.style.background = "#059669";
    btnBatchQuery.style.color = "#fff";
    bar.appendChild(btnBatchQuery);

    const btnBatchQueryAll = document.createElement("button");
    btnBatchQueryAll.textContent = "批量查询全部状态(6并发)";
    btnBatchQueryAll.style.width = "100%";
    btnBatchQueryAll.style.padding = "8px";
    btnBatchQueryAll.style.marginBottom = "8px";
    btnBatchQueryAll.style.border = "0";
    btnBatchQueryAll.style.borderRadius = "8px";
    btnBatchQueryAll.style.cursor = "pointer";
    btnBatchQueryAll.style.background = "#0ea5e9";
    btnBatchQueryAll.style.color = "#fff";
    bar.appendChild(btnBatchQueryAll);

    const btnStopQueryAll = document.createElement("button");
    btnStopQueryAll.textContent = "停止查询";
    btnStopQueryAll.style.width = "100%";
    btnStopQueryAll.style.padding = "8px";
    btnStopQueryAll.style.marginBottom = "8px";
    btnStopQueryAll.style.border = "0";
    btnStopQueryAll.style.borderRadius = "8px";
    btnStopQueryAll.style.cursor = "pointer";
    btnStopQueryAll.style.background = "#6b7280";
    btnStopQueryAll.style.color = "#fff";
    btnStopQueryAll.disabled = true;
    btnStopQueryAll.style.opacity = "0.6";
    bar.appendChild(btnStopQueryAll);

    const btnBatchDelete = document.createElement("button");
    btnBatchDelete.textContent = "一键删除";
    btnBatchDelete.style.width = "100%";
    btnBatchDelete.style.padding = "8px";
    btnBatchDelete.style.marginBottom = "8px";
    btnBatchDelete.style.border = "0";
    btnBatchDelete.style.borderRadius = "8px";
    btnBatchDelete.style.cursor = "pointer";
    btnBatchDelete.style.background = "#b91c1c";
    btnBatchDelete.style.color = "#fff";
    bar.appendChild(btnBatchDelete);

    const btnClearHistory = document.createElement("button");
    btnClearHistory.textContent = "清空历史记录";
    btnClearHistory.style.width = "100%";
    btnClearHistory.style.padding = "8px";
    btnClearHistory.style.marginBottom = "8px";
    btnClearHistory.style.border = "0";
    btnClearHistory.style.borderRadius = "8px";
    btnClearHistory.style.cursor = "pointer";
    btnClearHistory.style.background = "#f59e0b";
    btnClearHistory.style.color = "#111827";
    btnClearHistory.style.fontWeight = "700";
    bar.appendChild(btnClearHistory);

    const status = document.createElement("div");
    status.style.fontSize = "12px";
    status.style.marginBottom = "6px";
    status.textContent = "状态：待操作";
    bar.appendChild(status);

    const querySummary = document.createElement("div");
    querySummary.style.fontSize = "11px";
    querySummary.style.color = "#93c5fd";
    querySummary.style.marginBottom = "8px";
    querySummary.textContent = "统计：成功 0，失败 0";
    bar.appendChild(querySummary);

    const listNote = document.createElement("div");
    listNote.style.fontSize = "11px";
    listNote.style.color = "#fbbf24";
    listNote.style.marginBottom = "8px";
    listNote.textContent = "备注：全量查询时，列表仅显示失败项。";
    bar.appendChild(listNote);

    function showBalanceResult(payload) {
      if (!payload) return;
      const modal = ensureBalanceModal();
      modal.show(payload);
    }

    function setQueryAllControlState(running) {
      queryAllRunning = running;
      btnFetch.disabled = running;
      btnBatchQuery.disabled = running;
      btnBatchQueryAll.disabled = running;
      btnBatchDelete.disabled = running;
      btnClearHistory.disabled = running;
      btnStopQueryAll.disabled = !running;
      btnStopQueryAll.style.opacity = running ? "1" : "0.6";
      if (running) {
        btnStopQueryAll.style.background = "#dc2626";
      } else {
        btnStopQueryAll.style.background = "#6b7280";
      }
    }

    function updateQuerySummary(success, failed, extraText) {
      const suffix = extraText ? ` | ${extraText}` : "";
      querySummary.textContent = `统计：成功 ${success}，失败 ${failed}${suffix}`;
    }

    const listContainer = document.createElement("div");
    listContainer.style.height = "360px";
    listContainer.style.overflow = "auto";
    listContainer.style.boxSizing = "border-box";
    listContainer.style.border = "1px solid #4b5563";
    listContainer.style.borderRadius = "8px";
    listContainer.style.padding = "8px";
    listContainer.style.background = "#0b1220";
    bar.appendChild(listContainer);

    function formatResetTime(primaryWindow) {
      if (!primaryWindow || typeof primaryWindow !== "object") return "-";
      const resetAt = primaryWindow.reset_at;
      if (resetAt !== undefined && resetAt !== null && resetAt !== "") {
        const ts = Number(resetAt);
        if (Number.isFinite(ts)) {
          return new Date(ts * 1000).toLocaleString();
        }
      }
      const after = primaryWindow.reset_after_seconds;
      if (after !== undefined && after !== null && after !== "") {
        const sec = Number(after);
        if (Number.isFinite(sec)) {
          const d = Math.floor(sec / 86400);
          const h = Math.floor((sec % 86400) / 3600);
          const m = Math.floor((sec % 3600) / 60);
          return `${sec}s (${d}天 ${h}小时 ${m}分后)`;
        }
        return String(after);
      }
      return "-";
    }

    function parseUsageSnapshot(bodyObj) {
      if (!bodyObj || typeof bodyObj !== "object") {
        return { usedPercent: null, resetText: "-" };
      }
      const primary = bodyObj?.rate_limit?.primary_window;
      const usedRaw = primary?.used_percent;
      const usedNum = Number(usedRaw);
      const usedPercent = Number.isFinite(usedNum)
        ? Math.max(0, Math.min(100, usedNum))
        : null;
      return {
        usedPercent,
        resetText: formatResetTime(primary),
      };
    }

    function renderPendingList() {
      listContainer.innerHTML = "";
      if (!pendingFiles.length) {
        const empty = document.createElement("div");
        empty.textContent = "暂无失效文件，请先点击“获取失效文件”";
        empty.style.fontSize = "12px";
        empty.style.color = "#94a3b8";
        listContainer.appendChild(empty);
        return;
      }

      pendingFiles.forEach((item, idx) => {
        const card = document.createElement("div");
        card.style.border = "1px solid #334155";
        card.style.borderRadius = "8px";
        card.style.padding = "8px";
        card.style.marginBottom = "8px";
        card.style.background = "#111827";

        const nameLine = document.createElement("div");
        nameLine.textContent = `${idx + 1}. ${item.name}`;
        nameLine.style.fontSize = "12px";
        nameLine.style.fontWeight = "700";
        nameLine.style.wordBreak = "break-all";
        nameLine.style.marginBottom = "6px";
        card.appendChild(nameLine);

        const metaLine = document.createElement("div");
        metaLine.textContent = `authIndex=${item.authIndex || "-"} | status=${item.status || "-"}`;
        metaLine.style.fontSize = "11px";
        metaLine.style.color = "#94a3b8";
        metaLine.style.wordBreak = "break-all";
        metaLine.style.marginBottom = "8px";
        card.appendChild(metaLine);

        const usageWrap = document.createElement("div");
        usageWrap.style.marginBottom = "8px";

        const statusCodeRow = document.createElement("div");
        statusCodeRow.style.display = "flex";
        statusCodeRow.style.alignItems = "center";
        statusCodeRow.style.gap = "6px";
        statusCodeRow.style.marginBottom = "6px";

        const statusCodeLabel = document.createElement("span");
        statusCodeLabel.textContent = "状态码:";
        statusCodeLabel.style.fontSize = "11px";
        statusCodeLabel.style.color = "#94a3b8";
        statusCodeRow.appendChild(statusCodeLabel);

        const statusCodeBadge = document.createElement("span");
        const sc = item.lastStatusCode;
        const scText = sc === null || sc === undefined || sc === "" ? "--" : String(sc);
        const is200 = Number(sc) === 200;
        statusCodeBadge.textContent = scText;
        statusCodeBadge.style.fontSize = "11px";
        statusCodeBadge.style.fontWeight = "700";
        statusCodeBadge.style.padding = "2px 8px";
        statusCodeBadge.style.borderRadius = "999px";
        if (scText === "--") {
          statusCodeBadge.style.background = "#1f2937";
          statusCodeBadge.style.color = "#cbd5e1";
        } else if (is200) {
          statusCodeBadge.style.background = "#064e3b";
          statusCodeBadge.style.color = "#a7f3d0";
        } else {
          statusCodeBadge.style.background = "#7f1d1d";
          statusCodeBadge.style.color = "#fecaca";
        }
        statusCodeRow.appendChild(statusCodeBadge);
        usageWrap.appendChild(statusCodeRow);

        const usageText = document.createElement("div");
        usageText.style.fontSize = "11px";
        usageText.style.color = "#cbd5e1";
        usageText.style.marginBottom = "5px";
        const usedLabel =
          item.usedPercent === null || item.usedPercent === undefined
            ? "未查询"
            : `${item.usedPercent}%`;
        const resetLabel = item.resetText || "-";
        usageText.textContent = `已用百分比: ${usedLabel} | 重置时间: ${resetLabel}`;
        usageWrap.appendChild(usageText);

        const progressBg = document.createElement("div");
        progressBg.style.height = "8px";
        progressBg.style.width = "100%";
        progressBg.style.borderRadius = "999px";
        progressBg.style.background = "#1f2937";
        progressBg.style.overflow = "hidden";

        const progressFill = document.createElement("div");
        const pct =
          item.usedPercent === null || item.usedPercent === undefined
            ? 0
            : Math.max(0, Math.min(100, Number(item.usedPercent)));
        progressFill.style.height = "100%";
        progressFill.style.width = `${pct}%`;
        progressFill.style.transition = "width 0.2s ease";
        progressFill.style.background =
          pct >= 100 ? "#ef4444" : pct >= 80 ? "#f59e0b" : "#10b981";
        progressBg.appendChild(progressFill);

        usageWrap.appendChild(progressBg);
        card.appendChild(usageWrap);

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "6px";

        const rowBalanceBtn = document.createElement("button");
        rowBalanceBtn.textContent = "查询余额";
        rowBalanceBtn.style.flex = "1";
        rowBalanceBtn.style.border = "0";
        rowBalanceBtn.style.borderRadius = "6px";
        rowBalanceBtn.style.padding = "6px 8px";
        rowBalanceBtn.style.cursor = "pointer";
        rowBalanceBtn.style.background = "#059669";
        rowBalanceBtn.style.color = "#fff";

        const rowDeleteBtn = document.createElement("button");
        rowDeleteBtn.textContent = "删除";
        rowDeleteBtn.style.flex = "1";
        rowDeleteBtn.style.border = "0";
        rowDeleteBtn.style.borderRadius = "6px";
        rowDeleteBtn.style.padding = "6px 8px";
        rowDeleteBtn.style.cursor = "pointer";
        rowDeleteBtn.style.background = "#dc2626";
        rowDeleteBtn.style.color = "#fff";

        const rowDetailBtn = document.createElement("button");
        rowDetailBtn.textContent = "查看详情";
        rowDetailBtn.style.flex = "1";
        rowDetailBtn.style.border = "0";
        rowDetailBtn.style.borderRadius = "6px";
        rowDetailBtn.style.padding = "6px 8px";
        rowDetailBtn.style.cursor = "pointer";
        rowDetailBtn.style.background = "#334155";
        rowDetailBtn.style.color = "#fff";
        rowDetailBtn.disabled = !item.lastBalancePayload;
        rowDetailBtn.style.opacity = item.lastBalancePayload ? "1" : "0.6";

        rowBalanceBtn.addEventListener("click", async () => {
          const token = getCachedToken().trim();
          if (!token) {
            status.textContent = "状态：未找到缓存 tm_auth_token";
            return;
          }
          if (!item.authIndex) {
            status.textContent = `状态：${item.name} 缺少 authIndex`;
            return;
          }

          rowBalanceBtn.disabled = true;
          rowDeleteBtn.disabled = true;
          rowDetailBtn.disabled = true;
          status.textContent = `状态：查询余额中 - ${item.name}`;
          try {
            const res = await queryUsageByAuthIndex(token, item);
            const snapshot = parseUsageSnapshot(res.bodyObj);
            item.usedPercent = snapshot.usedPercent;
            item.resetText = snapshot.resetText;
            item.lastStatusCode = res.statusCode;
            updateUsageCacheForItem(item, res, snapshot);
            item.lastBalancePayload = {
              title: `余额查询结果 - ${item.name}`,
              statusCode: res.statusCode,
              bodyObj: res.bodyObj,
              bodyText: res.bodyText,
              bodyParsed: res.bodyParsed,
            };
            showBalanceResult(item.lastBalancePayload);
            rowDetailBtn.disabled = false;
            rowDetailBtn.style.opacity = "1";
            renderPendingList();
            status.textContent = res.ok
              ? `状态：余额查询成功 - ${item.name}`
              : `状态：余额查询失败 - ${item.name}`;
          } catch (err) {
            status.textContent = `状态：余额查询失败 - ${err?.message || err}`;
          } finally {
            rowBalanceBtn.disabled = false;
            rowDeleteBtn.disabled = false;
            rowDetailBtn.disabled = !item.lastBalancePayload;
            rowDetailBtn.style.opacity = item.lastBalancePayload ? "1" : "0.6";
          }
        });

        rowDetailBtn.addEventListener("click", () => {
          if (!item.lastBalancePayload) {
            status.textContent = `状态：${item.name} 暂无可查看详情，请先查询余额`;
            return;
          }
          showBalanceResult(item.lastBalancePayload);
          status.textContent = `状态：已打开 ${item.name} 的余额详情`;
        });

        rowDeleteBtn.addEventListener("click", async () => {
          const token = getCachedToken().trim();
          if (!token) {
            status.textContent = "状态：未找到缓存 tm_auth_token";
            return;
          }
          if (!item.name || item.name === "(no-name)") {
            status.textContent = "状态：该文件缺少 name，无法删除";
            return;
          }

          const ok = window.confirm(`确认删除文件：${item.name} ?`);
          if (!ok) return;

          rowBalanceBtn.disabled = true;
          rowDeleteBtn.disabled = true;
          rowDetailBtn.disabled = true;
          status.textContent = `状态：删除中 - ${item.name}`;
          try {
            const res = await deleteByName(token, item.name);
            if (res.ok) {
              pendingFiles = pendingFiles.filter((x) => x !== item);
              renderPendingList();
              status.textContent = `状态：已删除 ${item.name}`;
            } else {
              status.textContent = `状态：删除失败 ${item.name} | HTTP ${res.status}`;
              rowBalanceBtn.disabled = false;
              rowDeleteBtn.disabled = false;
              rowDetailBtn.disabled = !item.lastBalancePayload;
            }
          } catch (err) {
            status.textContent = `状态：删除失败 ${item.name} | ${err?.message || err}`;
            rowBalanceBtn.disabled = false;
            rowDeleteBtn.disabled = false;
            rowDetailBtn.disabled = !item.lastBalancePayload;
          }
        });

        actions.appendChild(rowBalanceBtn);
        actions.appendChild(rowDetailBtn);
        actions.appendChild(rowDeleteBtn);
        card.appendChild(actions);
        listContainer.appendChild(card);
      });
    }

    function setOpen(open) {
      isOpen = open;
      bar.style.transform = isOpen ? "translate(0, -50%)" : `translate(${HIDDEN_X}px, -50%)`;
      toggleBtn.textContent = isOpen ? "收起" : "展开";
    }

    toggleBtn.addEventListener("click", () => {
      setOpen(!isOpen);
    });

    btnClearHistory.addEventListener("click", () => {
      const ok = window.confirm("确认清空本地历史查询记录吗？");
      if (!ok) return;
      usageQueryCache = {};
      try {
        localStorage.removeItem(QUERY_CACHE_KEY);
      } catch (_) {
        // ignore
      }
      pendingFiles.forEach((item) => {
        item.usedPercent = null;
        item.resetText = "-";
        item.lastStatusCode = null;
        item.lastBalancePayload = null;
      });
      renderPendingList();
      updateQuerySummary(0, 0, "已清空历史");
      status.textContent = "状态：历史记录已清空";
    });

    btnStopQueryAll.addEventListener("click", () => {
      if (!queryAllRunning) return;
      stopQueryAllRequested = true;
      status.textContent = "状态：已请求停止，等待当前批次完成...";
    });

    btnBatchQueryAll.addEventListener("click", async () => {
      const token = getCachedToken().trim();
      if (!token) {
        status.textContent = "状态：未找到缓存 tm_auth_token";
        return;
      }
      if (queryAllRunning) {
        status.textContent = "状态：批量全量查询正在执行中";
        return;
      }

      stopQueryAllRequested = false;
      setQueryAllControlState(true);
      updateQuerySummary(0, 0, "准备中");
      status.textContent = "状态：正在拉取全部文件...";

      try {
        const allFiles = await fetchAllFiles(token);
        const total = allFiles.length;
        let processed = 0;
        let success = 0;
        let failed = 0;
        let cacheHit = 0;
        const failedItems = [];

        pendingFiles = [];
        renderPendingList();

        for (let start = 0; start < allFiles.length; start += 6) {
          if (stopQueryAllRequested) break;

          const chunk = allFiles.slice(start, start + 6);
          status.textContent = `状态：全量查询中 ${processed}/${total}（每批6个）`;

          const results = await Promise.all(
            chunk.map(async (item) => {
              const cached = getCachedUsageForItem(item);
              if (cached) {
                applyCachedUsageToItem(item, cached);
                return { item, ok: Number(item.lastStatusCode) === 200, fromCache: true };
              }
              if (!item?.authIndex) {
                item.lastStatusCode = "NO_AUTH";
                item.usedPercent = null;
                item.resetText = "-";
                return { item, ok: false, fromCache: false };
              }
              try {
                const res = await queryUsageByAuthIndex(token, item);
                const snapshot = parseUsageSnapshot(res.bodyObj);
                item.usedPercent = snapshot.usedPercent;
                item.resetText = snapshot.resetText;
                item.lastStatusCode = res.statusCode;
                updateUsageCacheForItem(item, res, snapshot);
                item.lastBalancePayload = {
                  title: `余额查询结果 - ${item.name}`,
                  statusCode: res.statusCode,
                  bodyObj: res.bodyObj,
                  bodyText: res.bodyText,
                  bodyParsed: res.bodyParsed,
                };
                return { item, ok: Number(res.statusCode) === 200, fromCache: false };
              } catch (_) {
                item.lastStatusCode = "ERR";
                item.usedPercent = null;
                item.resetText = "-";
                return { item, ok: false, fromCache: false };
              }
            })
          );

          results.forEach((r) => {
            processed += 1;
            if (r.fromCache) cacheHit += 1;
            if (r.ok) {
              success += 1;
            } else {
              failed += 1;
              failedItems.push(r.item);
            }
          });

          pendingFiles = failedItems.slice();
          renderPendingList();
          updateQuerySummary(
            success,
            failed,
            `已处理 ${processed}/${total} | 缓存命中 ${cacheHit}${stopQueryAllRequested ? "（停止中）" : ""}`
          );
          status.textContent = `状态：全量查询中 ${processed}/${total}（成功 ${success}，失败 ${failed}）`;
        }

        pendingFiles = pendingFiles.filter(Boolean);
        renderPendingList();
        if (stopQueryAllRequested) {
          status.textContent = "状态：全量查询已停止（列表仅显示失败项）";
        } else {
          status.textContent = `状态：全量查询完成，成功 ${success}，失败 ${failed}（列表仅显示失败项）`;
        }
        updateQuerySummary(success, failed, `缓存命中 ${cacheHit}`);
      } catch (err) {
        status.textContent = `状态：全量查询失败 - ${err?.message || err}`;
      } finally {
        setQueryAllControlState(false);
        stopQueryAllRequested = false;
      }
    });

    btnBatchQuery.addEventListener("click", async () => {
      const token = getCachedToken().trim();
      if (!token) {
        status.textContent = "状态：未找到缓存 tm_auth_token";
        return;
      }
      if (!pendingFiles.length) {
        status.textContent = "状态：没有可查询文件，请先获取失效文件";
        return;
      }

      btnFetch.disabled = true;
      btnBatchQuery.disabled = true;
      btnBatchQueryAll.disabled = true;
      btnBatchDelete.disabled = true;
      btnClearHistory.disabled = true;
      btnStopQueryAll.disabled = true;

      let okCount = 0;
      let failCount = 0;
      let cacheHit = 0;
      updateQuerySummary(okCount, failCount, `已处理 0/${pendingFiles.length}`);
      for (let i = 0; i < pendingFiles.length; i += 1) {
        const item = pendingFiles[i];
        if (!item?.authIndex) {
          failCount += 1;
          renderPendingList();
          updateQuerySummary(okCount, failCount, `已处理 ${i + 1}/${pendingFiles.length}`);
          status.textContent = `状态：批量查询余额中 ${i + 1}/${pendingFiles.length}（成功 ${okCount}，失败 ${failCount}）`;
          continue;
        }
        const cached = getCachedUsageForItem(item);
        if (cached) {
          applyCachedUsageToItem(item, cached);
          cacheHit += 1;
          if (Number(item.lastStatusCode) === 200) okCount += 1;
          else failCount += 1;
          renderPendingList();
          updateQuerySummary(
            okCount,
            failCount,
            `已处理 ${i + 1}/${pendingFiles.length} | 缓存命中 ${cacheHit}`
          );
          status.textContent = `状态：批量查询余额中 ${i + 1}/${pendingFiles.length}（成功 ${okCount}，失败 ${failCount}）`;
          continue;
        }
        status.textContent = `状态：批量查询余额中 ${i + 1}/${pendingFiles.length}（成功 ${okCount}，失败 ${failCount}）`;
        try {
          const res = await queryUsageByAuthIndex(token, item);
          const snapshot = parseUsageSnapshot(res.bodyObj);
          item.usedPercent = snapshot.usedPercent;
          item.resetText = snapshot.resetText;
          item.lastStatusCode = res.statusCode;
          updateUsageCacheForItem(item, res, snapshot);
          item.lastBalancePayload = {
            title: `余额查询结果 - ${item.name}`,
            statusCode: res.statusCode,
            bodyObj: res.bodyObj,
            bodyText: res.bodyText,
            bodyParsed: res.bodyParsed,
          };
          if (res.ok) okCount += 1;
          else failCount += 1;
        } catch (_) {
          failCount += 1;
        }
        renderPendingList();
        updateQuerySummary(
          okCount,
          failCount,
          `已处理 ${i + 1}/${pendingFiles.length} | 缓存命中 ${cacheHit}`
        );
      }

      status.textContent = `状态：批量查询完成，成功 ${okCount}，失败 ${failCount}`;
      btnFetch.disabled = false;
      btnBatchQuery.disabled = false;
      btnBatchQueryAll.disabled = false;
      btnBatchDelete.disabled = false;
      btnClearHistory.disabled = false;
      btnStopQueryAll.disabled = true;
      btnStopQueryAll.style.opacity = "0.6";
    });

    btnBatchDelete.addEventListener("click", async () => {
      const token = getCachedToken().trim();
      if (!token) {
        status.textContent = "状态：未找到缓存 tm_auth_token";
        return;
      }
      if (!pendingFiles.length) {
        status.textContent = "状态：没有可删除文件，请先获取失效文件";
        return;
      }

      const ok = window.confirm(`确认一键删除 ${pendingFiles.length} 个文件？`);
      if (!ok) return;

      btnFetch.disabled = true;
      btnBatchQuery.disabled = true;
      btnBatchQueryAll.disabled = true;
      btnBatchDelete.disabled = true;
      btnClearHistory.disabled = true;
      btnStopQueryAll.disabled = true;

      const failedItems = [];
      let success = 0;
      for (let i = 0; i < pendingFiles.length; i += 1) {
        const item = pendingFiles[i];
        const name = item?.name || "";
        if (!name || name === "(no-name)") {
          failedItems.push(item);
          continue;
        }
        status.textContent = `状态：批量删除中 ${i + 1}/${pendingFiles.length}`;
        try {
          const res = await deleteByName(token, name);
          if (res.ok) {
            success += 1;
          } else {
            failedItems.push(item);
          }
        } catch (_) {
          failedItems.push(item);
        }
      }

      pendingFiles = failedItems;
      renderPendingList();
      status.textContent = `状态：批量删除完成，成功 ${success}，失败 ${failedItems.length}`;
      updateQuerySummary(success, failedItems.length, "一键删除结果");
      btnFetch.disabled = false;
      btnBatchQuery.disabled = false;
      btnBatchQueryAll.disabled = false;
      btnBatchDelete.disabled = false;
      btnClearHistory.disabled = false;
      btnStopQueryAll.disabled = true;
      btnStopQueryAll.style.opacity = "0.6";
    });

    btnFetch.addEventListener("click", async () => {
      const token = getCachedToken().trim();
      if (!token) {
        status.textContent = "状态：未找到缓存 tm_auth_token";
        return;
      }

      status.textContent = "状态：获取中...";
      btnFetch.disabled = true;
      try {
        pendingFiles = await fetchNonActive(token);
        renderPendingList();
        status.textContent = `状态：已获取 ${pendingFiles.length} 个失效文件`;
        updateQuerySummary(0, 0, "已重置");
      } catch (err) {
        status.textContent = `状态：获取失败 - ${err?.message || err}`;
      } finally {
        btnFetch.disabled = false;
      }
    });

    renderPendingList();

    document.body.appendChild(bar);
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", createSidebar, { once: true });
    } else {
      createSidebar();
    }
  }

  init();
})();