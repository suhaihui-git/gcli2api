# GeminiCLI 渠道授权逻辑逆向文档

> 模拟 Google Gemini CLI 客户端（`GeminiCLI/0.1.5`）的 OAuth 2.0 授权流程，获取 Google Cloud 凭证并调用内部 Code Assist API。

---

## 1. 身份伪装

| 字段 | 值 |
|------|-----|
| **User-Agent** | `GeminiCLI/0.1.5 (Windows; AMD64)` |
| **Client ID** | `681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com` |
| **Client Secret** | `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` |
| **OAuth 类型** | Google OAuth 2.0 标准授权码模式 (Authorization Code Grant) |

## 2. OAuth Scopes

```
https://www.googleapis.com/auth/cloud-platform
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

- `cloud-platform`：完整的 GCP 访问权限，用于调用 Code Assist API
- `userinfo.email` / `userinfo.profile`：获取用户邮箱和个人信息

## 3. 授权流程

### 3.1 创建认证 URL

```
POST create_auth_url(project_id=None, mode="geminicli")
```

1. **动态分配回调端口**：从默认端口 `11451` 开始扫描可用端口
2. **启动本地 HTTP 回调服务器**：监听 `0.0.0.0:<port>`，回调地址为 `http://localhost:<port>`
3. **创建 Google OAuth Flow**：
   ```python
   Flow(
       client_id=CLIENT_ID,
       client_secret=CLIENT_SECRET,
       scopes=SCOPES,
       redirect_uri=f"http://localhost:{port}"
   )
   ```
4. **生成授权 URL**：
   ```
   https://accounts.google.com/o/oauth2/auth?
     client_id=<CLIENT_ID>
     &redirect_uri=http://localhost:<port>
     &scope=<SCOPES>
     &response_type=code
     &access_type=offline       # 请求 refresh_token
     &prompt=consent            # 强制显示同意页面
     &include_granted_scopes=true
     &state=<UUID>
   ```
5. **记录流程状态**：保存 `state`、`flow`、`callback_port`、`server` 等到全局 `auth_flows` 字典
6. **标记 `auto_project_detection=True`**：如果未提供 `project_id`，后续自动检测

### 3.2 用户在浏览器完成授权

用户访问授权 URL → 登录 Google 账号 → 同意授权 → Google 重定向回 `http://localhost:<port>?code=<auth_code>&state=<state>`

### 3.3 回调处理

本地 HTTP 服务器 (`AuthCallbackHandler`) 收到 GET 请求：
1. 解析 `code` 和 `state` 参数
2. 将 `code` 写入 `auth_flows[state]["code"]`
3. 标记 `completed=True`
4. 返回成功 HTML 页面

### 3.4 完成认证 (交换 Token)

```
POST asyncio_complete_auth_flow(project_id=None, mode="geminicli")
```

1. **等待回调**：轮询 `auth_flows[state]["code"]`，最多等待 60 秒
2. **交换授权码**：
   ```
   POST https://oauth2.googleapis.com/token
   Content-Type: application/x-www-form-urlencoded

   client_id=<CLIENT_ID>
   &client_secret=<CLIENT_SECRET>
   &redirect_uri=<redirect_uri>
   &code=<auth_code>
   &grant_type=authorization_code
   ```
3. **获取 Token 响应**：
   ```json
   {
     "access_token": "ya29.xxx",
     "refresh_token": "1//xxx",
     "expires_in": 3599,
     "token_type": "Bearer"
   }
   ```

### 3.5 自动获取 Project ID

如果用户未手动提供 `project_id`，系统自动获取：

**步骤 1 — `loadCodeAssist`**：
```
POST <code_assist_endpoint>/v1internal:loadCodeAssist
Authorization: Bearer <access_token>
User-Agent: GeminiCLI/0.1.5 (Windows; AMD64)

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
如果 `loadCodeAssist` 失败，尝试通过 `onboardUser` 注册用户并获取 `project_id`，轮询最多 10 秒。

**步骤 3（再回退） — 项目列表**：
调用 `get_user_projects` 获取用户的 GCP 项目列表，自动选择唯一/默认项目。

### 3.6 启用必需 API

成功获取 `project_id` 后，自动调用 `enable_required_apis(credentials, project_id)` 启用 Code Assist 等必需的 GCP API。

## 4. 凭证存储格式

文件名：`{project_id}-{timestamp}.json`

```json
{
  "client_id": "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
  "client_secret": "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",
  "token": "<access_token>",
  "refresh_token": "<refresh_token>",
  "scopes": [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
  ],
  "token_uri": "https://oauth2.googleapis.com/token",
  "project_id": "<project_id>",
  "expiry": "2025-03-03T12:00:00+00:00"
}
```

存储表：`credentials`（SQLite）

## 5. Token 刷新

使用 Google OAuth 标准刷新流程：
```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id=<CLIENT_ID>
&client_secret=<CLIENT_SECRET>
&refresh_token=<refresh_token>
&grant_type=refresh_token
```

- 刷新时机：Token 剩余有效期 < 2 分钟
- 过期时间字段：`expiry`（ISO 8601 格式）
- 刷新失败时根据 HTTP 状态码判断是否永久失效（400/401/403 → 自动禁用凭证）

## 6. API 请求格式

**目标 URL**：`<code_assist_endpoint>/v1internal:generateContent`

**请求头**：
```
Authorization: Bearer <access_token>
Content-Type: application/json
User-Agent: GeminiCLI/0.1.5 (Windows; AMD64)
```

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

## 7. 关键逆向要点

| 要点 | 说明 |
|------|------|
| **Client ID/Secret** | 来自 Gemini CLI 官方客户端逆向 |
| **需要 Project ID** | 每个凭证必须绑定 GCP 项目 |
| **Project ID 获取** | 优先 `loadCodeAssist` → 回退 `onboardUser` → 再回退项目列表 |
| **API 端点** | 内部 API (`v1internal:generateContent`)，非公开 Gemini API |
| **UA 伪装** | 必须使用 `GeminiCLI/x.x.x` 格式 |
| **回调地址** | `http://localhost:<port>`（无路径） |
