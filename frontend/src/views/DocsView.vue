<template>
  <app-layout>
    <section class="space-y-4">
      <div class="panel-shell">
        <div class="panel-header">
          <div>
            <div class="panel-title">使用文档</div>
            <p class="panel-desc">补齐下游接入说明、请求格式、能力特性与控制台接口参考。</p>
          </div>
        </div>
        <div class="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
          <div class="app-contrast-panel px-6 py-6">
            <p class="app-contrast-kicker">API Guide</p>
            <h3 class="mt-4 text-3xl font-semibold">统一接入说明</h3>
            <p class="app-contrast-copy mt-3 text-sm leading-7">
              控制台负责维护凭证；真正给下游系统对接时，请按这里的认证方式、端点路径和请求格式接入。
              文档按 GeminiCLI、Antigravity、Codex 与控制台接口四组来组织，方便你从原有 OpenAI、Gemini、
              Claude 或 Responses 客户端平滑迁移。
            </p>
          </div>
          <div class="surface-panel rounded-[28px] p-5">
            <p class="text-xs uppercase tracking-[0.24em] app-text-muted">认证方式</p>
            <div class="mt-4 grid gap-2 text-sm app-text-strong">
              <div
                v-for="item in authMethods"
                :key="item"
                class="app-surface-soft rounded-2xl px-4 py-3"
              >
                <code>{{ item }}</code>
              </div>
            </div>
            <div class="mt-4 rounded-2xl border border-[color:color-mix(in_srgb,var(--panel-border)_80%,transparent)] px-4 py-4 text-sm leading-7 app-text-muted">
              下游 API 默认使用 <code>API_PASSWORD</code> 或通用 <code>PASSWORD</code> 鉴权；
              控制台登录单独使用 <code>PANEL_PASSWORD</code>。
            </div>
          </div>
        </div>
      </div>

      <n-grid cols="1 s:1 m:2 xl:4" responsive="screen" x-gap="16" y-gap="16">
        <n-grid-item v-for="group in endpointGroups" :key="group.title">
          <div class="panel-shell h-full">
            <div class="panel-header">
              <div>
                <div class="panel-title">{{ group.title }}</div>
                <p class="panel-desc">{{ group.desc }}</p>
              </div>
            </div>
            <div class="space-y-3">
              <div
                v-for="item in group.items"
                :key="`${group.title}-${item.path}`"
                class="surface-panel rounded-2xl px-4 py-4"
              >
                <div class="flex items-center justify-between gap-3">
                  <n-tag :bordered="false" round :type="resolveMethodTag(item.method)">
                    {{ item.method }}
                  </n-tag>
                  <span class="text-xs app-text-muted">{{ item.desc }}</span>
                </div>
                <p class="mt-3 break-all text-sm font-medium app-text-strong">{{ item.path }}</p>
              </div>
            </div>
          </div>
        </n-grid-item>
      </n-grid>

      <n-grid cols="1 s:1 m:2" responsive="screen" x-gap="16" y-gap="16">
        <n-grid-item v-for="card in formatCards" :key="card.title">
          <div class="panel-shell h-full">
            <div class="panel-header">
              <div>
                <div class="panel-title">{{ card.title }}</div>
                <p class="panel-desc">{{ card.desc }}</p>
              </div>
            </div>
            <div class="space-y-3">
              <div
                v-for="line in card.points"
                :key="line"
                class="surface-panel rounded-2xl px-4 py-3 text-sm leading-7 app-text-muted"
              >
                {{ line }}
              </div>
            </div>
          </div>
        </n-grid-item>
      </n-grid>

      <n-grid cols="1 s:1 m:2" responsive="screen" x-gap="16" y-gap="16">
        <n-grid-item v-for="example in examples" :key="example.title">
          <div class="panel-shell h-full">
            <div class="panel-header">
              <div>
                <div class="panel-title">{{ example.title }}</div>
                <p class="panel-desc">{{ example.desc }}</p>
              </div>
            </div>
            <pre class="code-block whitespace-pre-wrap text-xs app-text-strong">{{ example.code }}</pre>
          </div>
        </n-grid-item>
      </n-grid>

      <n-grid cols="1 s:1 m:2 xl:4" responsive="screen" x-gap="16" y-gap="16">
        <n-grid-item v-for="feature in featureCards" :key="feature.title">
          <div class="panel-shell h-full">
            <div class="panel-header">
              <div class="panel-title">{{ feature.title }}</div>
            </div>
            <div class="space-y-3">
              <p class="text-sm leading-7 app-text-muted">{{ feature.desc }}</p>
              <div class="space-y-2">
                <div
                  v-for="item in feature.items"
                  :key="item"
                  class="app-surface-soft rounded-2xl px-4 py-3 text-sm leading-7 app-text-strong"
                >
                  {{ item }}
                </div>
              </div>
            </div>
          </div>
        </n-grid-item>
      </n-grid>

      <n-grid cols="1 s:1 m:3" responsive="screen" x-gap="16" y-gap="16">
        <n-grid-item v-for="card in modelCards" :key="card.title">
          <div class="panel-shell h-full">
            <div class="panel-header">
              <div>
                <div class="panel-title">{{ card.title }}</div>
                <p class="panel-desc">{{ card.desc }}</p>
              </div>
            </div>
            <div class="space-y-2">
              <div
                v-for="item in card.items"
                :key="item"
                class="surface-panel rounded-2xl px-4 py-3 text-sm app-text-strong"
              >
                {{ item }}
              </div>
            </div>
          </div>
        </n-grid-item>
      </n-grid>

      <div class="panel-shell">
        <div class="panel-header">
          <div>
            <div class="panel-title">控制台 API 参考</div>
            <p class="panel-desc">这部分用于管理前端自身，不是给下游模型客户端直接调用的推理接口。</p>
          </div>
        </div>
        <div class="grid gap-4 xl:grid-cols-4">
          <div
            v-for="section in panelSections"
            :key="section.title"
            class="panel-embedded"
          >
            <div class="panel-header">
              <div>
                <div class="panel-title">{{ section.title }}</div>
                <p class="panel-desc">{{ section.desc }}</p>
              </div>
            </div>
            <div class="space-y-3">
              <div
                v-for="item in section.items"
                :key="item.path"
                class="surface-panel rounded-2xl px-4 py-4"
              >
                <div class="flex items-center justify-between gap-3">
                  <n-tag :bordered="false" round :type="resolveMethodTag(item.method)">
                    {{ item.method }}
                  </n-tag>
                  <span class="text-xs app-text-muted">{{ item.desc }}</span>
                </div>
                <p class="mt-3 break-all text-sm font-medium app-text-strong">{{ item.path }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </app-layout>
</template>

<script setup lang="ts">
import { NGrid, NGridItem, NTag } from "naive-ui";

import AppLayout from "@/components/layout/AppLayout.vue";

const authMethods = [
  "Authorization: Bearer your_api_password",
  "x-goog-api-key: your_api_password",
  "x-api-key: your_api_password",
  "x-anthropic-auth-token: your_api_password",
  "anthropic-auth-token: your_api_password",
  "access_token: your_api_password",
  "?key=your_api_password",
];

const endpointGroups = [
  {
    title: "GeminiCLI",
    desc: "标准 GCLI 通道，支持 OpenAI、Gemini 原生与 Claude 风格。",
    items: [
      { method: "POST", path: "/v1/chat/completions", desc: "OpenAI 兼容" },
      { method: "POST", path: "/v1/messages", desc: "Claude Messages" },
      { method: "POST", path: "/v1/models/{model}:generateContent", desc: "Gemini 非流式" },
      { method: "POST", path: "/v1/models/{model}:streamGenerateContent", desc: "Gemini 流式" },
      { method: "GET", path: "/v1/models", desc: "模型列表" },
    ],
  },
  {
    title: "Antigravity",
    desc: "实验通道，支持 Claude 与 Gemini 系列模型混合接入。",
    items: [
      { method: "POST", path: "/antigravity/v1/chat/completions", desc: "OpenAI 兼容" },
      { method: "POST", path: "/antigravity/v1/messages", desc: "Claude Messages" },
      { method: "POST", path: "/antigravity/v1/models/{model}:generateContent", desc: "Gemini 非流式" },
      { method: "POST", path: "/antigravity/v1/models/{model}:streamGenerateContent", desc: "Gemini 流式" },
      { method: "GET", path: "/antigravity/v1/models", desc: "模型列表" },
    ],
  },
  {
    title: "Codex",
    desc: "OpenAI 原生模型通道，含 Chat Completions、Claude 与 Responses 三种入口。",
    items: [
      { method: "POST", path: "/codex/v1/chat/completions", desc: "OpenAI Chat" },
      { method: "POST", path: "/codex/v1/messages", desc: "Claude Messages" },
      { method: "POST", path: "/codex/v1/responses", desc: "OpenAI Responses" },
      { method: "GET", path: "/codex/v1/models", desc: "模型列表" },
    ],
  },
  {
    title: "控制台",
    desc: "管理前端和面板接口，用于登录、凭证管理、配置和日志。",
    items: [
      { method: "POST", path: "/auth/login", desc: "控制台登录" },
      { method: "GET", path: "/creds/status", desc: "凭证状态列表" },
      { method: "GET", path: "/config/get", desc: "读取配置" },
      { method: "WS", path: "/logs/stream", desc: "实时日志" },
      { method: "GET", path: "/version/info", desc: "版本信息" },
    ],
  },
] as const;

const formatCards = [
  {
    title: "OpenAI 兼容请求",
    desc: "可直接复用现有 OpenAI SDK、脚本或网关。",
    points: [
      "GeminiCLI 的 /v1/chat/completions 支持标准 OpenAI messages，也能自动识别并处理 Gemini 原生 body。",
      "Antigravity 的 /antigravity/v1/chat/completions 同样支持 OpenAI 风格请求，适合 Claude/Gemini 混合模型。",
      "Codex 的 /codex/v1/chat/completions 支持 GPT-5、o 系列等 OpenAI 模型，并兼容 stream、tools、tool_choice 等常见字段。",
    ],
  },
  {
    title: "Gemini 原生请求",
    desc: "适合已有 Google GenAI SDK 或原生 Gemini 请求体的客户端。",
    points: [
      "使用 /v1/models/{model}:generateContent 或 /streamGenerateContent 直接发送 contents / generationConfig。",
      "Antigravity 通道也提供同名 Gemini 原生端点，只是路径前缀改成 /antigravity/v1。",
      "Gemini 原生端点支持 x-goog-api-key、Authorization Bearer 和 URL key 三种常见认证写法。",
    ],
  },
  {
    title: "Claude Messages 请求",
    desc: "适合 Claude Code、Anthropic SDK 或已按 Claude 协议开发的客户端。",
    points: [
      "/v1/messages、/antigravity/v1/messages 和 /codex/v1/messages 都支持 Claude Messages 风格 body。",
      "GCLI 和 Antigravity 通道支持 system 字段；Codex 通道还支持 thinking、tool_use / tool_result 和 web_search 映射。",
      "Claude 风格请求可用 x-api-key、Authorization Bearer，也兼容 anthropic 风格头部。",
    ],
  },
  {
    title: "Codex Responses 请求",
    desc: "用于更接近 OpenAI 新版 Responses API 的客户端。",
    points: [
      "/codex/v1/responses 会近似直通转发到 Codex 上游，只做必要的字段清理和兼容处理。",
      "string input 会自动标准化成 message 结构；system role 会被转换为 developer role。",
      "会删除 Codex 上游已知不兼容字段，如 max_output_tokens、temperature、top_p、truncation 等。",
    ],
  },
] as const;

const examples = [
  {
    title: "OpenAI Chat 示例",
    desc: "GeminiCLI 通道，直接复用标准 Chat Completions。",
    code: `curl -X POST "http://127.0.0.1:7861/v1/chat/completions" \\
-H "Authorization: Bearer your_api_password" \\
-H "Content-Type: application/json" \\
-d '{
  "model": "gemini-2.5-flash",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Hello"}
  ],
  "stream": true
}'`,
  },
  {
    title: "Gemini 原生示例",
    desc: "Gemini generateContent / streamGenerateContent。",
    code: `curl -X POST "http://127.0.0.1:7861/v1/models/gemini-2.5-pro:generateContent?key=your_api_password" \\
-H "Content-Type: application/json" \\
-d '{
  "contents": [
    {"role": "user", "parts": [{"text": "Hello"}]}
  ],
  "generationConfig": {
    "temperature": 0.7
  }
}'`,
  },
  {
    title: "Claude Messages 示例",
    desc: "支持 system 参数和 Claude 风格 body。",
    code: `curl -X POST "http://127.0.0.1:7861/v1/messages" \\
-H "x-api-key: your_api_password" \\
-H "anthropic-version: 2023-06-01" \\
-H "Content-Type: application/json" \\
-d '{
  "model": "gemini-2.5-pro",
  "max_tokens": 1024,
  "system": "You are a helpful assistant",
  "messages": [
    {"role": "user", "content": "Hello"}
  ]
}'`,
  },
  {
    title: "Codex Responses 示例",
    desc: "近似直通的 Responses API 接口。",
    code: `curl -X POST "http://127.0.0.1:7861/codex/v1/responses" \\
-H "Authorization: Bearer your_api_password" \\
-H "Content-Type: application/json" \\
-d '{
  "model": "gpt-5.2",
  "input": [
    {
      "role": "user",
      "content": [{"type": "input_text", "text": "Summarize this project"}]
    }
  ],
  "stream": true
}'`,
  },
] as const;

const featureCards = [
  {
    title: "多模态支持",
    desc: "OpenAI 风格请求支持 text + image_url 组合内容。",
    items: [
      "支持 data URL 图片输入。",
      "Gemini 与 Antigravity 通道都能把多模态消息转换到上游。",
    ],
  },
  {
    title: "思维模式",
    desc: "支持 Gemini thinking 模型与 Codex reasoning 深度映射。",
    items: [
      "Codex 模型名可加 (none|minimal|low|medium|high|xhigh) 后缀。",
      "响应里会保留 reasoning_content / thinking 相关字段。",
    ],
  },
  {
    title: "流式抗截断",
    desc: "长输出场景可用前缀模型名触发自动续写。",
    items: [
      "示例模型名：流式抗截断/gemini-2.5-pro。",
      "适合长文章、长代码块和大段分析输出。",
    ],
  },
  {
    title: "工具调用",
    desc: "支持 OpenAI tools 和 Claude tool_use/tool_result 两种风格。",
    items: [
      "Codex 通道支持 function tools 和 tool_choice。",
      "Claude 风格工具块会自动映射到 Codex 上游。",
    ],
  },
] as const;

const modelCards = [
  {
    title: "GeminiCLI 常用模型",
    desc: "以 GCLI 标准通道为主，具体可用列表以 /v1/models 返回为准。",
    items: [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-3-pro-preview",
      "gemini-3-flash-preview",
    ],
  },
  {
    title: "Antigravity 常用模型",
    desc: "支持 Claude 和 Gemini 系列混合暴露，具体以 /antigravity/v1/models 为准。",
    items: [
      "claude-sonnet-4-5",
      "claude-opus-4-5",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ],
  },
  {
    title: "Codex 常用模型",
    desc: "支持 GPT-5、o 系列以及不同 reasoning 等级，具体以 /codex/v1/models 为准。",
    items: [
      "gpt-5",
      "gpt-5.2",
      "gpt-5.4",
      "gpt-5.1-codex-max",
    ],
  },
] as const;

const panelSections = [
  {
    title: "认证接口",
    desc: "控制台登录和 OAuth 相关能力。",
    items: [
      { method: "POST", path: "/auth/login", desc: "用户登录" },
      { method: "POST", path: "/auth/start", desc: "开始 OAuth 认证" },
      { method: "POST", path: "/auth/callback", desc: "处理 OAuth 回调" },
      { method: "POST", path: "/auth/callback-url", desc: "从回调 URL 完成认证" },
      { method: "GET", path: "/auth/status/{project_id}", desc: "检查认证状态" },
    ],
  },
  {
    title: "凭证管理",
    desc: "支持 mode=geminicli / antigravity / codex。",
    items: [
      { method: "POST", path: "/creds/upload", desc: "上传 JSON / ZIP" },
      { method: "GET", path: "/creds/status", desc: "分页筛选列表" },
      { method: "GET", path: "/creds/detail/{filename}", desc: "单凭证详情" },
      { method: "POST", path: "/creds/action", desc: "启用/禁用/删除" },
      { method: "POST", path: "/creds/batch-action", desc: "批量操作" },
      { method: "GET", path: "/creds/download/{filename}", desc: "下载单个凭证" },
      { method: "GET", path: "/creds/download-all", desc: "打包下载全部" },
      { method: "POST", path: "/creds/fetch-email/{filename}", desc: "抓取邮箱" },
      { method: "POST", path: "/creds/refresh-all-emails", desc: "批量刷新邮箱" },
      { method: "POST", path: "/creds/deduplicate-by-email", desc: "按邮箱去重" },
      { method: "POST", path: "/creds/verify-project/{filename}", desc: "检验 Project ID" },
      { method: "GET", path: "/creds/errors/{filename}", desc: "错误信息" },
      { method: "GET", path: "/creds/quota/{filename}", desc: "Antigravity 额度" },
      { method: "POST", path: "/creds/configure-preview/{filename}", desc: "配置 Preview" },
      { method: "GET", path: "/creds/codex-usage/{filename}", desc: "单条 Codex usage" },
      { method: "POST", path: "/creds/codex-usage/batch", desc: "批量 Codex usage" },
      { method: "POST", path: "/creds/test/{filename}", desc: "测试凭证" },
      { method: "POST", path: "/creds/chat/{filename}", desc: "对话测试" },
    ],
  },
  {
    title: "配置与日志",
    desc: "系统参数、版本与实时日志相关接口。",
    items: [
      { method: "GET", path: "/config/get", desc: "读取当前配置" },
      { method: "POST", path: "/config/save", desc: "保存配置" },
      { method: "POST", path: "/logs/clear", desc: "清空日志" },
      { method: "GET", path: "/logs/download", desc: "下载日志" },
      { method: "WS", path: "/logs/stream", desc: "实时日志流" },
      { method: "GET", path: "/version/info", desc: "版本信息" },
    ],
  },
  {
    title: "兼容特性",
    desc: "原 README 中的常用补充说明。",
    items: [
      { method: "INFO", path: "OpenAI 端点返回 OpenAI 格式", desc: "Gemini / Antigravity / Codex" },
      { method: "INFO", path: "Gemini 端点返回 Gemini 原生格式", desc: "适配原生 SDK" },
      { method: "INFO", path: "Claude 端点返回 Claude Messages 格式", desc: "适配 Claude 客户端" },
      { method: "INFO", path: "兼容性模式会把 system 转成 user", desc: "提高部分客户端兼容性" },
    ],
  },
] as const;

function resolveMethodTag(method: string) {
  if (method === "GET") {
    return "info";
  }
  if (method === "WS") {
    return "warning";
  }
  if (method === "INFO") {
    return "default";
  }
  return "success";
}
</script>
