# 前端重构方案：Vue 3 + Naive UI + TailwindCSS

## 1. 现状分析

### 1.1 当前技术栈

| 项目 | 现状 |
|------|------|
| 框架 | 无（原生 HTML + JS） |
| 样式 | 内联 CSS + `<style>` 标签 |
| 文件数 | 3 个文件 |
| 总代码量 | ~8,700 行 / ~443KB |
| 构建工具 | 无 |

### 1.2 文件分析

| 文件 | 行数 | 大小 | 职责 |
|------|------|------|------|
| `common.js` | 3,447 行 | 173KB | 所有业务逻辑（认证、CRUD、状态管理、WebSocket、UI渲染） |
| `control_panel.html` | 3,091 行 | 155KB | 桌面端完整页面（HTML + 内联CSS + 部分JS） |
| `control_panel_mobile.html` | 2,199 行 | 115KB | 移动端完整页面（与桌面端大量重复） |

### 1.3 现有功能模块

```
管理面板
├── 🔐 认证登录
│   └── 密码登录 / 自动登录 / 退出
├── 📋 凭证管理（3套独立但同构的管理器）
│   ├── GeminiCLI 凭证管理
│   ├── Antigravity 凭证管理
│   └── Codex 凭证管理
│   每套包含：
│   ├── 凭证列表（分页 + 筛选：状态/错误码/冷却/Preview/Tier）
│   ├── 凭证卡片（状态徽章、操作按钮、详情展开）
│   ├── 批量操作（启用/禁用/删除/检验/配置Preview）
│   ├── 文件上传（拖拽 + 选择，进度显示）
│   ├── 单个操作（下载/删除/邮箱获取/检验/测试/对话）
│   └── 去重（按邮箱去重）
├── 🔑 OAuth 认证流程
│   ├── GeminiCLI OAuth
│   ├── Antigravity OAuth
│   └── Codex OAuth
│   每套包含：
│   ├── 启动认证 → 生成授权URL
│   ├── 回调URL处理
│   └── 凭证获取与保存
├── 💬 对话测试（Chat Modal）
├── 📊 用量统计
│   └── 凭证调用次数统计 + 重置
├── 📝 实时日志（WebSocket）
│   ├── 日志流 + 级别筛选
│   ├── 日志下载 / 清空
│   └── 自动滚动
├── ⚙️ 系统配置
│   ├── 服务器配置
│   ├── API端点配置
│   └── 镜像URL一键切换
└── 🌐 环境凭证管理
    └── 加载/清除环境变量凭证
```

### 1.4 痛点

1. **代码重复严重**：3 种凭证管理器逻辑几乎相同，导致改一个功能要改 3 遍
2. **桌面/移动端重复**：两个 HTML 文件大量重复内容
3. **单文件过大**：`common.js` 3400+ 行，难以维护
4. **无组件化**：所有 UI 用字符串拼接 HTML，无法复用
5. **内联样式泛滥**：样式散落在 HTML 和 JS 中，无统一设计系统

---

## 2. 目标技术栈

| 项目 | 选型 | 理由 |
|------|------|------|
| 框架 | **Vue 3** (Composition API) | 渐进式、易上手、生态成熟 |
| UI库 | **Naive UI** | 全组件 TypeScript、暗色主题优秀、表格/过滤器/分页现成 |
| CSS | **TailwindCSS v4** | 原子化CSS、减少自定义样式、响应式内置 |
| 构建 | **Vite** | 极快的HMR、Vue官方推荐 |
| 路由 | **Vue Router（Hash 模式）** | 兼容当前 FastAPI 入口结构，避免额外补 history fallback |
| 状态管理 | **Pinia** | Vue官方状态管理，替代全局 AppState |
| HTTP | **Axios** | 替代 authFetch，统一拦截器 |
| 语言 | **TypeScript** | 类型安全，减少运行时错误 |

---

## 3. 项目结构

```
G:\2api\gcli2api\
├── frontend/                    # ← 新增前端项目目录
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── index.html               # Vite 入口
│   ├── public/
│   │   └── favicon.ico
│   └── src/
│       ├── main.ts              # 应用入口
│       ├── App.vue              # 根组件
│       ├── router/
│       │   └── index.ts         # Hash 路由配置
│       ├── stores/              # Pinia 状态管理
│       │   ├── auth.ts          # 认证状态
│       │   ├── credentials.ts   # 凭证管理（统一3种模式）
│       │   ├── config.ts        # 系统配置
│       │   ├── logs.ts          # 日志 WebSocket
│       │   └── ui.ts            # 主题 / 导航 / 全局UI状态
│       ├── api/                 # API 层
│       │   ├── client.ts        # Axios 实例 + 拦截器
│       │   ├── auth.ts          # 认证相关 API
│       │   ├── credentials.ts   # 凭证 CRUD API
│       │   ├── config.ts        # 配置 API
│       │   └── types.ts         # API 类型定义
│       ├── composables/         # 可组合函数
│       │   ├── useCredManager.ts     # 凭证管理逻辑（核心复用）
│       │   ├── useFileUpload.ts      # 文件上传
│       │   ├── usePagination.ts      # 分页
│       │   ├── useWebSocket.ts       # WebSocket 连接
│       │   └── useCooldownTimer.ts   # 冷却倒计时
│       ├── components/          # 通用组件
│       │   ├── layout/
│       │   │   ├── AppHeader.vue     # 顶部导航
│       │   │   ├── AppSidebar.vue    # 侧边栏（可选）
│       │   │   └── AppLayout.vue     # 布局容器
│       │   ├── common/
│       │   │   ├── TierBadge.vue     # Tier 等级徽章
│       │   │   ├── StatusBadge.vue   # 状态徽章
│       │   │   ├── ErrorCodeBadge.vue # 错误码徽章
│       │   │   └── CooldownTag.vue   # 冷却倒计时标签
│       │   ├── credentials/
│       │   │   ├── CredCard.vue       # 凭证卡片（核心组件）
│       │   │   ├── CredList.vue       # 凭证列表
│       │   │   ├── CredFilters.vue    # 筛选栏
│       │   │   ├── CredActions.vue    # 批量操作栏
│       │   │   ├── CredUpload.vue     # 文件上传区
│       │   │   ├── CredDetail.vue     # 凭证详情展开
│       │   │   └── CredManager.vue    # 凭证管理器（组合以上组件）
│       │   ├── auth/
│       │   │   ├── LoginForm.vue      # 登录表单
│       │   │   └── OAuthFlow.vue      # OAuth 认证流程
│       │   ├── chat/
│       │   │   └── ChatModal.vue      # 对话测试弹窗
│       │   └── logs/
│       │       └── LogViewer.vue      # 实时日志查看器
│       ├── views/               # 页面级组件
│       │   ├── LoginView.vue         # 登录页面
│       │   ├── DashboardView.vue     # 仪表盘（概览）
│       │   ├── CredentialsView.vue   # 凭证管理页（Tab切换3种模式）
│       │   ├── OAuthView.vue         # OAuth 认证页
│       │   ├── LogsView.vue          # 日志页
│       │   ├── ConfigView.vue        # 配置页
│       │   └── NotFoundView.vue      # 兜底页面
│       ├── utils/               # 工具函数
│       │   ├── format.ts        # 格式化（时间、文件大小等）
│       │   └── helpers.ts       # 通用辅助函数
│       └── styles/
│           └── global.css       # TailwindCSS 入口 + 少量全局样式
├── front/                       # 保留（构建产物覆盖此目录）
├── src/                         # Python 后端（不动）
├── Dockerfile                   # 修改为多阶段构建
└── deploy.sh                    # 不变
```

---

## 4. 核心设计

### 4.1 凭证管理器复用（消除 3 倍重复代码）

现状：GeminiCLI / Antigravity / Codex 三套几乎相同的代码，分别实现。

重构后：**一个 `useCredManager` composable + 模式参数**

```typescript
// composables/useCredManager.ts
export function useCredManager(mode: 'geminicli' | 'antigravity' | 'codex') {
  const items = ref<Credential[]>([])
  const pagination = usePagination()
  const filters = reactive({
    status: 'all',
    errorCode: 'all',
    cooldown: 'all',
    preview: 'all',   // 仅 geminicli
    tier: 'all',
  })

  async function fetchList() { /* 统一 API 调用 */ }
  async function batchAction(action: string, filenames: string[]) { /* ... */ }
  async function verifyProject(filename: string) { /* ... */ }

  return { items, pagination, filters, fetchList, batchAction, verifyProject, ... }
}
```

```vue
<!-- views/CredentialsView.vue -->
<template>
  <n-tabs v-model:value="activeTab">
    <n-tab-pane name="geminicli" tab="GeminiCLI">
      <CredManager mode="geminicli" />
    </n-tab-pane>
    <n-tab-pane name="antigravity" tab="Antigravity">
      <CredManager mode="antigravity" />
    </n-tab-pane>
    <n-tab-pane name="codex" tab="Codex">
      <CredManager mode="codex" />
    </n-tab-pane>
  </n-tabs>
</template>
```

### 4.2 响应式布局（消除桌面/移动端重复）

现状：两个独立的 HTML 文件。

重构后：TailwindCSS 响应式断点，**一套代码适配所有设备**。

```vue
<!-- 示例：CredFilters.vue -->
<template>
  <!-- 移动端竖排，桌面端横排 -->
  <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
    <n-select v-model:value="filters.status" :options="statusOptions" class="w-full md:w-40" />
    <n-select v-model:value="filters.tier" :options="tierOptions" class="w-full md:w-32" />
    <!-- ... -->
  </div>
</template>
```

### 4.3 API 层统一

```typescript
// api/client.ts
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const client = axios.create({ baseURL: './' })

client.interceptors.request.use(config => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      useAuthStore().logout()
    }
    return Promise.reject(err)
  }
)

export default client
```

### 4.4 路由与入口策略（修正）

当前后端并没有为 SPA 历史路由提供 `index.html` fallback，而是通过 `src/panel/root.py`
直接读取 HTML 文件返回首页。

因此新前端采用：

1. **`createWebHashHistory()`**：保证刷新 `/` 后仍由前端接管页面切换
2. **`root.py` 平滑切换**：
   - 若 `front/index.html` 已存在，则优先返回新前端入口
   - 否则继续回退旧的 `control_panel.html` / `control_panel_mobile.html`
3. **`web.py` 继续保持不变**：静态资源仍通过 `app.mount("/front", StaticFiles(...))` 提供

### 4.5 类型定义

```typescript
// api/types.ts
export type CredMode = 'geminicli' | 'antigravity' | 'codex'
export type TierLevel = 'free' | 'pro' | 'ultra'
export type StatusFilter = 'all' | 'enabled' | 'disabled'

export interface Credential {
  filename: string
  user_email: string | null
  disabled: boolean
  error_codes: (string | number)[]
  last_success: number
  tier: TierLevel
  preview?: boolean           // 仅 geminicli
  model_cooldowns: Record<string, number>
  usage_result?: CodexUsage   // 仅 codex
}

export interface CredListResponse {
  items: Credential[]
  total: number
  offset: number
  limit: number
  stats: { total: number; normal: number; disabled: number }
}
```

---

## 5. Naive UI 组件映射

| 现有功能 | Naive UI 组件 |
|---------|--------------|
| Tab 切换 | `n-tabs` / `n-tab-pane` |
| 凭证列表 | `n-card` + `n-list` 或 `n-data-table` |
| 筛选下拉框 | `n-select` |
| 分页 | `n-pagination` |
| 状态徽章 | `n-tag` |
| Tier 徽章 | `n-tag` (不同 type/color) |
| 操作按钮 | `n-button` / `n-button-group` |
| 文件上传 | `n-upload` (内置拖拽) |
| 登录表单 | `n-form` / `n-input` |
| 弹窗 | `n-modal` / `n-dialog` |
| 消息提示 | `n-message` / `n-notification` |
| 对话窗口 | `n-modal` + 自定义聊天布局 |
| 日志显示 | `n-log` (Naive UI 内置日志组件) |
| 配置表单 | `n-form` / `n-input` / `n-switch` |
| 进度条 | `n-progress` |
| 确认删除 | `n-popconfirm` |
| 加载状态 | `n-spin` / `n-skeleton` |
| 暗色主题 | `n-config-provider` (theme 切换) |

---

## 6. 部署方案

### 6.1 Dockerfile（多阶段构建）

```dockerfile
# Stage 1: 构建前端
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Python 后端 + 前端静态产物
FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Asia/Shanghai
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# 构建产物覆盖 front 目录
COPY --from=frontend /frontend/dist ./front
EXPOSE 7861
CMD ["python", "web.py"]
```

### 6.2 后端入口改动

`web.py` 无需改动，但 **`src/panel/root.py` 需要调整**：

- 优先返回 `front/index.html`
- 若新前端尚未构建完成，则回退旧的 `front/control_panel.html` / `front/control_panel_mobile.html`

这样可以保证重构期间旧前端可用，切换时也不需要额外变更部署入口。

### 6.3 Vite 构建配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  base: '/front/',        // 与 FastAPI 静态路由匹配
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },
  build: {
    outDir: '../front',   // 构建产物输出到 front/
    emptyOutDir: true,
  },
  server: {
    proxy: {              // 开发时代理后端API
      '/creds': 'http://localhost:7861',
      '/auth': 'http://localhost:7861',
      '/config': 'http://localhost:7861',
      '/panel': 'http://localhost:7861',
      '/ws': { target: 'ws://localhost:7861', ws: true },
    }
  }
})
```

### 6.4 deploy.sh

**无需修改**。`docker compose up -d --build` 会触发多阶段构建，自动完成前端打包。

---

## 7. 分阶段实施计划

### Phase 1：项目脚手架 + 基础页面（2-3天）

- [ ] 初始化 Vite + Vue 3 + TypeScript 项目
- [ ] 安装配置 Naive UI + TailwindCSS v4
- [ ] 完成 API 层封装（`api/client.ts` + 类型定义）
- [ ] 完成认证 Store + 登录页面
- [ ] 完成 AppLayout 布局（导航 + 侧边栏/Tab）
- [ ] 配置 Vite 开发代理
- [ ] 调整 `root.py`，验证构建产物能被 FastAPI 正确 serve

### Phase 2：凭证管理核心（3-4天）

- [ ] 实现 `useCredManager` composable（核心复用逻辑）
- [ ] CredCard 组件（状态徽章、Tier标签、操作按钮）
- [ ] CredList 组件（分页列表 + 空状态）
- [ ] CredFilters 组件（状态/错误码/冷却/Preview/Tier筛选）
- [ ] CredActions 组件（批量操作 + 全选）
- [ ] CredManager 组件（组合以上组件）
- [ ] CredentialsView 页面（Tab切换3种模式）
- [ ] 凭证详情展开（JSON查看器）
- [ ] 错误详情展开

### Phase 3：文件上传 + OAuth（1-2天）

- [ ] CredUpload 组件（拖拽上传，利用 Naive UI `n-upload`）
- [ ] OAuthFlow 组件（授权URL + 回调URL处理）
- [ ] GeminiCLI / Antigravity / Codex 三种认证流程

### Phase 4：辅助功能（2-3天）

- [ ] ChatModal 对话测试弹窗
- [ ] LogViewer 实时日志（WebSocket + `n-log`）
- [ ] ConfigView 系统配置页
- [ ] Codex 余额查询/显示
- [ ] 仪表盘概览（版本信息 + 三类凭证汇总）

> 说明：旧前端中的“环境凭证管理”和“独立 usage 统计页”依赖 `/auth/env-creds-*`、
> `/usage/*` 等接口；这些接口在当前 `src/panel/*.py` 中不存在。本轮以适配真实后端能力为准，
> 不额外补造未落地后端接口。

### Phase 5：打磨 + 部署（1-2天）

- [ ] 响应式适配测试（移动端/平板/桌面）
- [ ] 暗色主题支持
- [ ] 修改 Dockerfile 为多阶段构建
- [ ] 端到端测试
- [ ] 删除旧的 `front/` 原始文件
- [ ] 更新 README

**预估总工期：9-14天**

---

## 8. 代码量对比预估

| 项目 | 重构前 | 重构后（预估） |
|------|--------|---------------|
| 总文件数 | 3 | ~35-40 |
| 总代码行数 | ~8,700 | ~4,000-5,000 |
| 单个最大文件 | 3,447 行 | <300 行 |
| 重复代码 | ~60%（3种管理器） | <5% |
| 桌面/移动适配 | 2套独立HTML | 1套响应式 |

---

## 9. 风险与注意事项

> [!WARNING]
> **重构期间保持旧前端可用**：在 `frontend/` 目录下开发新前端，并让 `root.py`
> 保留旧入口回退逻辑。只有新前端完成验证后，才让 `front/index.html` 成为默认入口。

> [!IMPORTANT]
> **API 兼容性**：后端 API 不做任何改动，新前端完全适配现有 API 接口。

> [!IMPORTANT]
> **以真实后端能力为边界**：旧前端中部分历史按钮调用的接口已不存在，重构时以前端适配
> 当前 `src/panel/*.py` 中真实开放的接口为准，不把失效调用原样搬迁。

> [!NOTE]
> **渐进式切换**：可以先在新分支（如 `vue-frontend`）开发，完成后合并。期间旧前端继续工作不受影响。

> [!TIP]
> **开发效率**：Vite 的 HMR 热更新 + Vue DevTools + TypeScript 类型提示，开发体验会比现在好很多。Naive UI 的 `n-data-table` 组件可以直接替代手写的整个凭证列表+分页+筛选逻辑。
