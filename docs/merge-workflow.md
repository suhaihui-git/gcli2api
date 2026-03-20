# Fork 分支合并操作规范

## 分支模型

```
上游仓库 (原作者)                   你的仓库 (origin)
  main / master ──────────────► master (同步上游)
                                    │
                                    ├── merge ──► new (二次开发主分支)
                                    │
                                    └── (可选) feature/* 临时功能分支
```

| 分支 | 用途 | 规则 |
|------|------|------|
| `master` | **只做上游同步**，不在上面直接开发 | 只允许 `git pull upstream master` |
| `new` | **你的二次开发主分支**，所有自定义功能在这里 | 定期从 master 合并 |

---

## 一次性准备（只需执行一次）

### 1. 添加上游仓库 remote

```bash
# 检查当前 remote
git remote -v

# 添加上游仓库（替换为原作者的仓库地址）
git remote add upstream https://github.com/su-kaka/gcli2api.git

# 验证
git remote -v
# 应该看到：
# origin    https://github.com/suhaihui-git/gcli2api.git (fetch/push)
# upstream  https://github.com/su-kaka/gcli2api.git (fetch/push)
```

> 设置好后，以后 `origin` 指你的仓库，`upstream` 指原作者的仓库。

---

## 标准合并流程（每次同步上游时执行）

### 步骤总览

```
Step 1: 拉取上游最新代码到 master
Step 2: 推送 master 到你的 origin
Step 3: 切到 new 分支，合并 master
Step 4: 解决冲突 → 测试 → 提交 → 推送
```

### Step 1：同步上游代码到本地 master

```bash
# 确保当前在 new 分支（避免误操作 master）
git checkout new

# 拉取上游所有更新（不会修改任何本地文件）
git fetch upstream

# 切到 master 分支
git checkout master

# 用上游代码覆盖本地 master（fast-forward）
git merge upstream/master
# 或者更安全的：
git reset --hard upstream/master
```

### Step 2：推送 master 到你的 origin

```bash
git push origin master
```

### Step 3：切到 new 分支，合并 master

```bash
git checkout new

# 合并 master 到 new
git merge master
```

### Step 4：解决冲突

如果出现冲突，Git 会提示冲突文件。按以下策略处理：

#### 冲突处理策略

| 文件类型 | 策略 | 说明 |
|---------|------|------|
| **你没改过的文件** | 接受上游（theirs） | `git checkout --theirs <file>` |
| **你改过、上游也改了** | 手动合并 | 打开文件，看 `<<<<<<<` 标记，逐个决定 |
| **你改过、上游没改** | 保留你的（ours） | `git checkout --ours <file>` |
| **version.txt 等自动文件** | 接受上游 | `git checkout --theirs version.txt` |

#### 批量处理冲突的快捷命令

```bash
# 查看所有冲突文件
git diff --name-only --diff-filter=U

# 对于确定要用上游版本的文件（批量）
git checkout --theirs file1.py file2.py

# 对于确定要保留自己版本的文件（批量）
git checkout --ours file1.py file2.py

# 标记冲突已解决
git add <resolved-files>

# 提交合并
git commit -m "merge: 同步上游 master 到 new 分支"
```

#### 手动合并冲突的流程

对于需要同时保留双方改动的文件（如 `common.js`、`sqlite_manager.py` 等）：

1. **先看上游改了什么**：
   ```bash
   # 查看上游在这个文件上的改动
   git diff new...master -- src/storage/sqlite_manager.py
   ```

2. **理解上游意图**：看 diff 判断是新增功能、Bug修复、还是重构

3. **决定合并方式**：
   - 如果是**新增功能**（如添加 tier 这种）：先接受上游版本，再把你的改动补上去
   - 如果是**Bug修复**：通常直接接受上游
   - 如果**双方都改了同一段代码**：需要手动编辑，保留两边有意义的部分

4. **测试验证**：
   ```bash
   # Python 语法检查
   python -c "import py_compile; py_compile.compile('src/xxx.py', doraise=True)"
   ```

### Step 5：推送 new 分支

```bash
git push origin new
```

---

## 完整命令速查（复制即用）

```bash
# ===== 同步上游到 master =====
git fetch upstream
git checkout master
git merge upstream/master
git push origin master

# ===== 合并 master 到 new =====
git checkout new
git merge master

# ===== 如果有冲突 =====
# 查看冲突文件
git diff --name-only --diff-filter=U

# 解决冲突后
git add -A
git commit -m "merge: 同步上游更新到 new 分支"
git push origin new
```

---

## 这次合并的经验教训

### 问题回顾

这次合并 master 的 tier 功能到 new 分支时踩了几个坑：

1. **`git merge -X ours` 丢失了上游新增代码**
   - 用 `-X ours` 自动解决冲突会导致上游的新增内容被完全忽略
   - 应该只对确实不需要的文件用 `--ours`，新功能文件必须手动合并

2. **API 返回值格式未验证**
   - 上游的 tier 功能假设 API 返回 `"FREE"` / `"PRO"` / `"ULTRA"`
   - 实际返回的是 `"g1-pro-tier"` 这种格式
   - **教训**：合并新功能后必须实际测试 API 调用，不能只看代码

3. **多处遗漏参数传递**
   - 新增 `subscription_tier` 参数后，某些调用路径忘记传递
   - **教训**：新增参数时，全局搜索所有调用点（`grep -r "函数名"` ）

### 推荐的合并检查清单

合并完成后，逐项检查：

- [ ] `python -c "import py_compile; ..."` 所有修改的 .py 文件语法通过
- [ ] 新增的数据库字段有自动迁移逻辑（`_ensure_schema_compatibility`）
- [ ] 新增的函数参数在所有调用路径上都正确传递
- [ ] 前后端数据格式一致（字段名、大小写、枚举值）
- [ ] 筛选功能实际可用（前端下拉 → API 参数 → 存储层查询）
- [ ] 新功能在 3 种模式（geminicli / antigravity / codex）下都验证

---

## 高级技巧

### 预览上游有哪些新提交（合并前先看看）

```bash
git fetch upstream
git log master..upstream/master --oneline
# 显示上游比你的 master 多了哪些提交
```

### 预览合并会影响哪些文件（干跑）

```bash
git checkout new
git diff new...master --stat
# 显示 master 相对于 new 改了哪些文件及改动量
```

### 如果合并搞砸了，一键回退

```bash
# 合并过程中放弃（还没 commit）
git merge --abort

# 已经 commit 了但想撤销
git reset --hard HEAD~1
```

### 查看某个文件在上游的完整最新版本

```bash
git show upstream/master:src/storage/sqlite_manager.py
# 可以直接看到上游的文件内容，用于对比
```
