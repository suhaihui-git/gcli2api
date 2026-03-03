# Antigravity 渠道授权逻辑逆向文档

> 模拟 Google Antigravity 客户端（`antigravity/2.15.8`）的 OAuth 2.0 授权流程，获取 Google Cloud 凭证并调用 Antigravity 内部 API。

---

## 1. 身份伪装

| 字段 | 值 |
|------|-----|
| **User-Agent** | `antigravity/2.15.8 (Windows; AMD64)` |
| **Client ID** | `1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com` |
| **Client Secret** | `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` |
| **OAuth 类型** | Google OAuth 2.0 标准授权码模式 (Authorization Code Grant) |

## 2. OAuth Scopes

```
https://www.googleapis.com/auth/cloud-platform
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/cclog
https://www.googleapis.com/auth/experimentsandconfigs
```

- `cloud-platform`：完整的 GCP 访问权限
- `userinfo.email` / `userinfo.profile`：获取用户信息
- `cclog`：Antigravity 特有，用于日志记录
- `experimentsandconfigs`：Antigravity 特有，用于实验和配置管理

> **与 GeminiCLI 的区别**：Antigravity 多了 `cclog` 和 `experimentsandconfigs` 两个 scope。

## 3. 授权流程

### 3.1 创建认证 URL

```
POST create_auth_url(project_id=None, mode="antigravity")
```

1. **动态分配回调端口**：从默认端口 `11451` 开始扫描可用端口
2. **启动本地 HTTP 回调服务器**：监听 `0.0.0.0:<port>`，回调地址为 `http://localhost:<port>`
3. **创建 Google OAuth Flow**（使用 Antigravity 专属 Client ID/Secret）：
   ```python
   Flow(
       client_id=ANTIGRAVITY_CLIENT_ID,
       client_secret=ANTIGRAVITY_CLIENT_SECRET,
       scopes=ANTIGRAVITY_SCOPES,
       redirect_uri=f"http://localhost:{port}"
   )
   ```
4. **生成授权 URL**：
   ```
   https://accounts.google.com/o/oauth2/auth?
     client_id=<ANTIGRAVITY_CLIENT_ID>
     &redirect_uri=http://localhost:<port>
     &scope=<ANTIGRAVITY_SCOPES>
     &response_type=code
     &access_type=offline
     &prompt=consent
     &include_granted_scopes=true
     &state=<UUID>
   ```
5. **流程状态**中标记 `mode="antigravity"`

### 3.2 用户在浏览器完成授权

与 GeminiCLI 完全相同：用户访问授权 URL → 登录 → 同意 → Google 回调本地服务器。

### 3.3 回调处理

与 GeminiCLI 共用同一个 `AuthCallbackHandler`，处理逻辑完全一致。

### 3.4 完成认证 (交换 Token)

```
POST asyncio_complete_auth_flow(project_id=None, mode="antigravity")
```

1. **等待回调**：轮询 `auth_flows[state]["code"]`，最多 60 秒
2. **交换授权码**：
   ```
   POST https://oauth2.googleapis.com/token
   Content-Type: application/x-www-form-urlencoded

   client_id=<ANTIGRAVITY_CLIENT_ID>
   &client_secret=<ANTIGRAVITY_CLIENT_SECRET>
   &redirect_uri=<redirect_uri>
   &code=<auth_code>
   &grant_type=authorization_code
   ```
3. **识别 `mode="antigravity"` 后进入专属分支**

### 3.5 获取 Project ID（与 GeminiCLI 不同）

Antigravity 的 `project_id` 获取逻辑独立：

**步骤 1 — `loadCodeAssist`**（使用 Antigravity UA）：
```
POST <antigravity_api_url>/v1internal:loadCodeAssist
Authorization: Bearer <access_token>
User-Agent: antigravity/2.15.8 (Windows; AMD64)

{
  "metadata": {
    "ideType": "ANTIGRAVITY",
    "platform": "PLATFORM_UNSPECIFIED",
    "pluginType": "GEMINI"
  }
}
```
从响应的 `cloudaicompanionProject` 字段提取 `project_id`。

**步骤 2（回退） — `onboardUser`**：
如果 `loadCodeAssist` 失败，通过 `onboardUser` 注册并获取 `project_id`。

**步骤 3（最终回退） — 随机生成**：
```python
project_id = f"projects/random-{uuid.uuid4().hex[:8]}/locations/global"
```

> **关键区别**：GeminiCLI 回退到「获取项目列表让用户选择」，而 Antigravity 回退到「随机生成 project_id」。这意味着 Antigravity 对 project_id 的要求更宽松。

### 3.6 无需启用 API

Antigravity 模式**不调用** `enable_required_apis`，与 GeminiCLI 不同。

## 4. 凭证存储格式

文件名：`ag_{project_id}-{timestamp}.json`（前缀 `ag_` 区分渠道）

```json
{
  "client_id": "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
  "client_secret": "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",
  "token": "<access_token>",
  "refresh_token": "<refresh_token>",
  "scopes": [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs"
  ],
  "token_uri": "https://oauth2.googleapis.com/token",
  "project_id": "<project_id>",
  "expiry": "2025-03-03T12:00:00+00:00"
}
```

存储表：`antigravity_credentials`（SQLite）

## 5. Token 刷新

与 GeminiCLI 完全相同，使用 Google OAuth 标准刷新流程：
```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id=<ANTIGRAVITY_CLIENT_ID>
&client_secret=<ANTIGRAVITY_CLIENT_SECRET>
&refresh_token=<refresh_token>
&grant_type=refresh_token
```

- 刷新时机：Token 剩余有效期 < 2 分钟
- 过期时间字段：`expiry`
- 失败处理：同 GeminiCLI，根据 HTTP 状态码判断永久失效

## 6. API 请求格式

**目标 URL**：`<antigravity_api_url>/v1internal:generateContent`

**请求头**：
```
User-Agent: antigravity/2.15.8 (Windows; AMD64)
Authorization: Bearer <access_token>
Content-Type: application/json
Accept-Encoding: gzip
requestId: req-<UUID>
requestType: agent | image_gen
```

> **Antigravity 特有请求头**：`requestId`（每次请求唯一 UUID）和 `requestType`（`agent` 用于文本，`image_gen` 用于图片模型）

**请求体**：
```json
{
  "model": "gemini-2.5-pro",
  "project": "<project_id>",
  "request": {
    "contents": [...],
    "generationConfig": {...}
  }
}
```

## 7. 与 GeminiCLI 的核心差异对比

| 维度 | GeminiCLI | Antigravity |
|------|-----------|-------------|
| **Client ID** | `681255...` | `1071006...` |
| **User-Agent** | `GeminiCLI/0.1.5` | `antigravity/2.15.8` |
| **额外 Scopes** | 无 | `cclog`, `experimentsandconfigs` |
| **Project ID 回退** | 获取项目列表 | 随机生成 |
| **启用 API** | 是 (`enable_required_apis`) | 否 |
| **文件名前缀** | 无 | `ag_` |
| **请求头** | 标准 Bearer | 额外 `requestId`, `requestType` |
| **存储表** | `credentials` | `antigravity_credentials` |
| **API 端点** | Code Assist endpoint | Antigravity endpoint |

## 8. 关键逆向要点

| 要点 | 说明 |
|------|------|
| **Client ID/Secret** | 来自 Antigravity 扩展逆向，与 GeminiCLI 不同 |
| **requestType 头** | 必须根据模型设置 `agent` 或 `image_gen` |
| **requestId 头** | 每次请求需要唯一 UUID，格式 `req-<UUID>` |
| **Project ID 宽松** | 可以随机生成，说明 Antigravity 后端校验较松 |
| **UA 伪装** | 必须使用 `antigravity/x.x.x` 格式 |
| **回调地址** | `http://localhost:<port>`（无路径，与 GeminiCLI 相同） |
