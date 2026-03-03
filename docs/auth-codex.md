# Codex 渠道授权逻辑逆向文档

> 模拟 OpenAI Codex CLI 客户端（`codex_cli_rs/0.101.0`）的 OAuth 2.0 PKCE 授权流程，获取 OpenAI 凭证并调用 ChatGPT Codex Responses API。

---

## 1. 身份伪装

| 字段 | 值 |
|------|-----|
| **User-Agent** | `codex_cli_rs/0.101.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464` |
| **Client Version** | `0.101.0` |
| **Client ID** | `app_EMoamEEZ73f0CkXaXp7hrann` |
| **OAuth 类型** | OAuth 2.0 PKCE (Proof Key for Code Exchange)，**无 Client Secret** |

> **与 GeminiCLI / Antigravity 的根本区别**：Codex 使用 OpenAI OAuth（非 Google OAuth），采用 PKCE 流程（公开客户端，无 Client Secret）。

## 2. OAuth Scopes

```
openid email profile offline_access
```

- `openid`：OpenID Connect 标准身份认证
- `email`：获取用户邮箱
- `profile`：获取用户个人资料
- `offline_access`：获取 `refresh_token`，支持离线刷新

## 3. 授权流程

### 3.1 PKCE 码生成

在发起授权前，需要生成 PKCE 验证码对：

```python
# 1. 生成 code_verifier：96 字节随机数 → base64url 编码（无 padding）→ 128 字符
code_verifier = base64url_encode(random_bytes(96))  # 128 chars

# 2. 生成 code_challenge：SHA256(code_verifier) → base64url 编码（无 padding）
code_challenge = base64url_encode(SHA256(code_verifier))
```

### 3.2 创建认证 URL

```
POST create_auth_url(project_id=None, mode="codex")
```

1. **动态分配回调端口**：从端口 `1455` 开始扫描可用端口（与 Google OAuth 不同的起始端口）
2. **回调地址格式不同**：`http://localhost:<port>/auth/callback`（有路径 `/auth/callback`）
3. **启动本地 HTTP 回调服务器**：监听 `0.0.0.0:<port>`
4. **构建 OpenAI OAuth 认证 URL**：
   ```
   https://auth.openai.com/oauth/authorize?
     client_id=app_EMoamEEZ73f0CkXaXp7hrann
     &response_type=code
     &redirect_uri=http://localhost:<port>/auth/callback
     &scope=openid email profile offline_access
     &state=<UUID>
     &code_challenge=<code_challenge>
     &code_challenge_method=S256
     &prompt=login
     &id_token_add_organizations=true
     &codex_cli_simplified_flow=true
   ```

**特殊参数说明**：
| 参数 | 说明 |
|------|------|
| `code_challenge_method=S256` | PKCE 使用 SHA256 哈希 |
| `prompt=login` | 强制登录（不同于 Google 的 `consent`） |
| `id_token_add_organizations=true` | 在 id_token 中包含组织信息 |
| `codex_cli_simplified_flow=true` | 启用 Codex CLI 简化流程 |

5. **保存流程状态**（Codex 特有字段）：
   ```python
   auth_flows[state] = {
       "flow": None,                    # Codex 不使用 Google Flow
       "project_id": None,              # Codex 不需要 project_id
       "pkce_verifier": code_verifier,  # PKCE 验证码（核心）
       "mode": "codex",                 # 标识渠道类型
       ...
   }
   ```

### 3.3 用户在浏览器完成授权

用户访问授权 URL → 登录 OpenAI 账号 → 同意授权 → OpenAI 重定向回 `http://localhost:<port>/auth/callback?code=<auth_code>&state=<state>`

### 3.4 回调处理

共用同一个 `AuthCallbackHandler`，逻辑与 Google OAuth 一致：解析 `code` 和 `state`，存入 `auth_flows`。

### 3.5 完成认证 — Token 交换（PKCE 流程）

```
POST asyncio_complete_auth_flow(project_id=None, mode="codex")
```

1. **等待回调**：轮询 `auth_flows[state]["code"]`，最多 60 秒
2. **识别 Codex 模式后，调用 `_complete_codex_auth()`**
3. **使用 PKCE 向 OpenAI 交换 Token**：
   ```
   POST https://auth.openai.com/oauth/token
   Content-Type: application/x-www-form-urlencoded
   Accept: application/json

   grant_type=authorization_code
   &client_id=app_EMoamEEZ73f0CkXaXp7hrann
   &code=<auth_code>
   &redirect_uri=http://localhost:<port>/auth/callback
   &code_verifier=<code_verifier>
   ```

   > **注意**：无 `client_secret`，PKCE 模式用 `code_verifier` 替代。

4. **Token 响应**：
   ```json
   {
     "access_token": "eyJhbGc...",
     "id_token": "eyJhbGc...",
     "refresh_token": "xxx",
     "expires_in": 1800,
     "token_type": "Bearer"
   }
   ```

### 3.6 解析 id_token（JWT 无签名验证）

从 `id_token` 的 JWT payload 中提取用户信息：

```python
# JWT Payload 结构
{
  "email": "user@example.com",
  "https://api.openai.com/auth": {
    "chatgpt_account_id": "acc_xxx",      # 账户 ID
    "chatgpt_plan_type": "plus",           # 计划类型：free / plus / team
    "chatgpt_user_id": "user_xxx"          # 用户 ID
  },
  "exp": 1735689600                         # 过期时间戳
}
```

提取的关键信息：
- `email`：用户邮箱
- `account_id`：ChatGPT 账户 ID（Team 用户请求时必需）
- `plan_type`：计划类型（影响文件命名和功能权限）

### 3.7 生成凭证文件名

根据用户类型生成不同的文件名：

```python
# Team 用户：使用 account_id 哈希
"codex-{md5(account_id)[:8]}-{email}-team.json"

# 其他付费用户（plus 等）
"codex-{email}-{plan_type}.json"

# 无计划类型
"codex-{email}.json"
```

## 4. 凭证存储格式

```json
{
  "id_token": "<JWT id_token>",
  "access_token": "<access_token>",
  "refresh_token": "<refresh_token>",
  "account_id": "<chatgpt_account_id>",
  "last_refresh": "2025-03-03T12:00:00+00:00",
  "email": "user@example.com",
  "type": "codex",
  "expired": "2025-03-03T12:30:00+00:00"
}
```

> **字段差异**：
> - 使用 `expired` 而非 `expiry`（Google OAuth 使用 `expiry`）
> - 包含 `id_token`（Google OAuth 无此字段）
> - 包含 `account_id`（Google OAuth 使用 `project_id`）
> - 不包含 `client_id`、`client_secret`（PKCE 公开客户端不存储）
> - `type` 字段标记为 `"codex"`

存储表：`codex_credentials`（SQLite）

## 5. Token 刷新

使用 OpenAI OAuth 刷新端点（**与 Google OAuth 完全不同**）：

```
POST https://auth.openai.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=<refresh_token>
&client_id=app_EMoamEEZ73f0CkXaXp7hrann
```

> **无 `client_secret`**：PKCE 刷新同样不需要 Client Secret。

**刷新响应处理**：
- 更新 `access_token`
- 更新 `id_token`（如果返回）
- 更新 `refresh_token`（如果返回，OpenAI 可能轮换 refresh_token）
- 根据 `expires_in` 计算新的 `expired` 时间
- 记录 `last_refresh` 时间戳

**过期时间字段**：`expired`（ISO 8601 格式）

**刷新时机**：Token 剩余有效期 < 2 分钟（与 Google OAuth 共用判断逻辑，同时检查 `expiry` 和 `expired` 字段）

## 6. API 请求格式

### 6.1 流式请求

**目标 URL**：`<codex_api_url>/responses`（默认 `https://chatgpt.com/backend-api/codex/responses`）

**请求头**：
```
Content-Type: application/json
Authorization: Bearer <access_token>
Version: 0.101.0
Session_id: <UUID>
User-Agent: codex_cli_rs/0.101.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464
Accept: text/event-stream
Connection: Keep-Alive
Originator: codex_cli_rs
Chatgpt-Account-Id: <account_id>
```

**请求体**（Codex Responses API 格式）：
```json
{
  "model": "o4-mini",
  "instructions": "You are a coding assistant.",
  "input": [
    {
      "type": "message",
      "role": "user",
      "content": [
        {"type": "input_text", "text": "Hello"}
      ]
    }
  ],
  "reasoning": {"effort": "medium", "summary": "auto"},
  "tools": [...],
  "stream": true
}
```

### 6.2 非流式请求

**目标 URL**：`<codex_api_url>/responses/compact`

请求头中 `Accept` 改为 `application/json`，请求体中去掉 `stream` 字段。

### 6.3 特殊请求头说明

| 请求头 | 说明 |
|--------|------|
| `Version` | Codex CLI 版本号，当前 `0.101.0` |
| `Session_id` | 每次请求生成新 UUID |
| `Originator` | 固定值 `codex_cli_rs`，仅 OAuth 凭证使用 |
| `Chatgpt-Account-Id` | ChatGPT 账户 ID，仅 OAuth 凭证且有 account_id 时发送 |

## 7. 429 速率限制处理

Codex 的 429 错误包含重置时间信息：

```json
{
  "error": {
    "resets_at": 1735689600,        // Unix 时间戳
    "resets_in_seconds": 30         // 或者倒计时秒数
  }
}
```

系统会解析这些字段并设置模型级冷却时间。

## 8. 三渠道核心差异全对比

| 维度 | GeminiCLI | Antigravity | Codex |
|------|-----------|-------------|-------|
| **OAuth 提供商** | Google | Google | OpenAI |
| **OAuth 模式** | 授权码 + Secret | 授权码 + Secret | 授权码 + PKCE |
| **Client ID** | `681255...` | `1071006...` | `app_EMoam...` |
| **Client Secret** | 有 | 有 | **无** |
| **User-Agent** | `GeminiCLI/0.1.5` | `antigravity/2.15.8` | `codex_cli_rs/0.101.0` |
| **Token URL** | `oauth2.googleapis.com` | `oauth2.googleapis.com` | `auth.openai.com` |
| **需要 Project ID** | 是 | 是（可随机生成） | **否** |
| **需要 Account ID** | 否 | 否 | 是（从 id_token 提取） |
| **回调路径** | `/`（无路径） | `/`（无路径） | `/auth/callback` |
| **回调起始端口** | 11451 | 11451 | **1455** |
| **过期时间字段** | `expiry` | `expiry` | `expired` |
| **文件名前缀** | 无 | `ag_` | `codex-` |
| **存储表** | `credentials` | `antigravity_credentials` | `codex_credentials` |
| **API 端点** | Code Assist 内部 API | Antigravity 内部 API | ChatGPT Codex Responses API |
| **请求格式** | Google generateContent | Google generateContent | OpenAI Responses API |

## 9. 关键逆向要点

| 要点 | 说明 |
|------|------|
| **PKCE 流程** | 核心安全机制，`code_verifier` 96 字节随机数 → 128 字符 base64url |
| **无 Client Secret** | 公开客户端，所有安全性依赖 PKCE |
| **id_token 解析** | JWT 无签名验证解析，提取 `account_id` 和 `plan_type` |
| **Account ID** | Team 用户必须在请求头发送 `Chatgpt-Account-Id` |
| **Originator 头** | OAuth 凭证必须发送 `Originator: codex_cli_rs` |
| **Session ID** | 每次请求生成新 UUID，放在 `Session_id` 头中 |
| **API 格式** | 使用 OpenAI Responses API 格式（非 Chat Completions） |
| **回调路径** | 必须是 `/auth/callback`（OpenAI 注册的 redirect_uri 要求） |
| **codex_cli_simplified_flow** | 认证 URL 中的特殊参数，启用简化登录流程 |
