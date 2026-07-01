---
title: 「部署复盘」my-resume 上线实录：从踩坑到方法论
published: 2026-04-29
updated: 2026-05-21
tags: [Docker, ECS, GHCR, CI/CD, 实战复盘, 安全]
category: 工程化
---

> 📌 **系列简介**：《my-resume 部署实战三部曲》
> 
> 本篇：真实踩坑复盘
> 
> *前端转 JS 全栈，正在学部署，理解难免有偏差，欢迎批评指正 ~*
>
> *2026-05 更新：版本已迭代至 v2.3.1，构建缓存优化已落地，release snapshot 回滚机制已上线

---

## 写在前面

大半夜还说赢一把，不对，发一版就睡 - - 结果又… 又卡住了。

```bash
ERROR: failed to build: failed to solve: DeadlineExceeded:
failed to fetch oauth token:
Post "https://auth.docker.io/token": dial tcp 118.107.180.216:443: i/o timeout
```

`docker pull node:22-slim` 明明成功了，buildx 还是超时。
这不是第一次了。

从 my-resume 第一次上线到现在稳定在 `v2.3.1`，
我遇到的问题大多数不是"代码写错了"，
而是**环境、工具链、资源限制**这些前端平时碰不到的东西。

这篇想把这个过程完整写下来——
不只是"怎么发版"，还有"发版稳定之后发现了什么"：
业务验收的漏洞、已知的安全风险、以及我打算怎么走下一步。

还有一件事值得单独说：
**这套运维脚本不是我一个人写的，是我和 AI 一起迭代出来的。**
哪里麻烦，哪里加——这是整套脚本的生长方式。

---

## 一、运维目录是怎么长出来的

先看现在的目录结构：

```
deploy/
├── ecs/
│   ├── bootstrap.sh                 # 第一次初始化 ECS 环境
│   ├── build-and-push-images.sh     # 本地构建镜像并推送
│   ├── release-from-local.sh        # 本地构建 + 推送 + 远程发布，一键（504 行）
│   ├── release.sh                   # ECS 侧发布（拉镜像 + snapshot + compose up）
│   ├── rollback.sh                  # 出问题回滚到上一个 release snapshot
│   ├── deploy-latest-tag.sh         # 快速部署最近一个 tag（日常迭代用）
│   ├── sync-base-image.sh           # 同步基础镜像到 ACR（国内加速）
│   ├── pre-release-port-cleanup.sh  # 发布前清理端口
│   ├── pre-release-disk-cleanup.sh  # 发布前清理磁盘
│   ├── render-config.sh             # 渲染模板配置文件
│   ├── lib.sh                       # 公共函数库
│   └── stack-env-checklist.md       # 环境变量说明文档
└── templates/
    ├── compose.prod.image.yml.tpl   # image 模式 compose 模板
    ├── compose.prod.yml.tpl         # build 模式 compose 模板
    ├── nginx.conf.tpl               # nginx 配置模板（HTTPS）
    ├── nginx.http.conf.tpl          # nginx 配置模板（HTTP）
    └── stack.env.example            # 环境变量示例
```

这些脚本不是一开始设计好的。

最开始只有一个 `release.sh`，就是 SSH 上 ECS 跑 `docker compose up`。
后来发现 ECS 2核2G 跑 `next build` 会卡死，加了 `build-and-push-images.sh`。
后来发现每次要分两步执行很麻烦，加了 `release-from-local.sh` 把两步合一。
后来发现发布前端口经常被占，加了 `pre-release-port-cleanup.sh`。
后来发现配置文件里有重复逻辑，抽出了 `lib.sh`。
后来发现构建缓存每次都重新拉依赖，加了 registry cache + 基础镜像私有化。
后来发现出问题回滚要手动切 tag 很慢，加了 `rollback.sh` + release snapshot 机制。

**每一个脚本，都是被一个具体的麻烦逼出来的。**

---

## 二、lib.sh：公共函数库的设计思路

`lib.sh` 是整套脚本的地基，其他脚本都 `source` 它。
里面解决的是几类重复问题：

**1. 统一日志格式**
```bash
log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}
```
所有脚本的输出都带时间戳，排障时能看出哪一步卡了多久。

**2. dry-run 支持**
```bash
run_cmd() {
  if [[ "$DRY_RUN" == '1' ]]; then
    log "[dry-run] $*"
    return 0
  fi
  "$@"
}
```
加 `--dry-run` 参数，只打印命令不执行。
每次改了脚本逻辑，先 dry-run 确认参数对不对，再真正跑。

**3. 模板渲染**
```bash
render_template() {
  local template_path="$1"
  local output_path="$2"
  # 用 python3 做变量替换，__VAR_NAME__ 格式
  # 缺变量直接报错，不会生成残缺配置
}
```
`templates/` 里的 `.tpl` 文件用 `__VAR_NAME__` 占位，渲染时从环境变量里取值。
缺了变量不会静默跳过，直接报错——这个设计救过我几次。

**4. 健康检查**
```bash
curl_check() {
  local url="$1"
  local label="$2"
  local max_seconds="${3:-120}"
  # 循环重试，超时才报错
}
```
发布完不是立刻验收，而是等服务真正可用再验收。
重试窗口默认 120 秒，2核2G 启动慢，这个时间是跑出来的。

**5. 环境变量加载与校验**
```bash
load_stack_env()      # 按优先级查找并加载 stack env 文件
require_vars()        # 检查必填变量，缺了直接 die
resolve_deploy_mode() # 自动判断 build 模式还是 image 模式
```
这几个函数加起来，解决了"脚本跑到一半才发现变量没配"的问题。

---

## 三、六个真实的坑

### 坑 1：buildx + auth.docker.io 超时

**现象：**
```bash
ERROR: failed to solve: failed to solve: DeadlineExceeded:
failed to fetch oauth token:
Post "https://auth.docker.io/token": i/o timeout
```
`docker pull node:22-slim` 成功了，但 buildx 还是超时。

**根因：**
`docker pull` 用的是宿主机 Docker daemon 的缓存。
但 `buildx` 的 `docker-container` builder 是一个独立容器，
**不共享宿主机的镜像缓存**，每次构建都要重新去 `auth.docker.io` 拿 token。
国内网络对 `auth.docker.io` 不稳定，一旦超时，整个构建就挂了。

**解法一（应急）：** 加 `--engine-build`，绕开 buildx 容器，用宿主机 daemon 直接构建：
```bash
./deploy/ecs/release-from-local.sh \
  --tag v2.3.1 \
  --stack-env ./.env.stack.local \
  --ecs-host <your-ecs-ip> \
  --engine-build
```

**解法二（根治）：** 把基础镜像私有化到自己的 ACR，彻底不依赖 DockerHub token：
```bash
# 1. 拉官方镜像
docker pull node:22-slim

# 2. 打 tag 推到自己的 ACR
BASE_REPO=crpi-xxxxxx.cn-chengdu.personal.cr.aliyuncs.com/fridolph-space/my-resume-base-node
docker tag node:22-slim $BASE_REPO:22-slim
docker tag node:22-slim $BASE_REPO:22-slim-20260421  # 带日期的不可变备份
docker push $BASE_REPO:22-slim
docker push $BASE_REPO:22-slim-20260421

# 3. 验证
docker manifest inspect $BASE_REPO:22-slim >/dev/null && echo "ACR base image OK"
```

**沉淀：** 写进 `.env.stack.local`，后续不用每次手传参数：
```env
DEPLOY_BASE_IMAGE=crpi-xxxxxx.cn-chengdu.personal.cr.aliyuncs.com/fridolph-space/my-resume-base-node:22-slim
```
还单独写了 `sync-base-image.sh` 脚本，一键完成拉取 → tag → push → 验证。

---

### 坑 2：no space left on device

**现象：**
发版时 ECS 报磁盘满，三个服务全部拉取失败。

**根因：**
2核2G / 40G 的 ECS，三个镜像并发拉取，加上历史版本没清理，磁盘就满了。
前端平时不会遇到这个报错——但在小规格服务器上，这是真实的约束。

**解法：**
- 串行 pull，不并发：`docker compose pull` 默认并发，改为逐个 pull
- 发布前检查磁盘：`pre-release-disk-cleanup.sh` 检查磁盘可用空间
- 定期清理旧镜像：`docker image prune -f`
- **release snapshot 管理**：ECS 只保留最近两个版本的 snapshot 目录，旧版本自动清理

**沉淀：** 发布脚本里加了发布前体检——端口、磁盘、旧栈状态，三连检查通过才继续。

---

### 坑 3：manifest unknown

**现象：**
ECS 执行 `docker compose pull` 报 `manifest unknown`，但本地明明 push 成功了。

**根因：**
两种情况：
1. push 没真正成功（网络中断，没有报错但也没完成）
2. `release.sh` 里用的 tag 和实际 push 的 tag 对不上

**解法：**
发布前做三服务 manifest 验证：
```bash
docker manifest inspect $SERVER_IMAGE:$TAG >/dev/null || die "server manifest missing"
docker manifest inspect $WEB_IMAGE:$TAG >/dev/null    || die "web manifest missing"
docker manifest inspect $ADMIN_IMAGE:$TAG >/dev/null  || die "admin manifest missing"
```

**沉淀：** 现在的判断是：**Git tag 存在不等于可部署，镜像 manifest 齐全才算版本。**

---

### 坑 4：depends_on 骗了我

**现象：**
`server` 容器显示 `Up`，但 `web` 一直报连接失败，
看日志发现 `web` 在 `server` 还没准备好时就开始请求了。

**根因：**
`depends_on` 只保证**容器启动顺序**，不保证**服务可用**。
`server` 容器起来了，不代表 API 已经在响应请求。

**解法：**
healthcheck + 重试窗口，固化进 compose 模板：
```yaml
server:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:5577/api"]
    interval: 10s
    timeout: 5s
    retries: 12       # 最多等 120 秒
    start_period: 30s # 启动缓冲期
```

**沉淀：** `compose.prod.image.yml.tpl` 里固化了这套 healthcheck 配置。
`curl_check` 函数的默认重试窗口 120 秒，也是从这个坑里定出来的。

---

### 坑 5：浏览器请求到了 http://server:5577

**现象：**
页面白屏，浏览器控制台：
```
Mixed Content: The page at 'https://resume.fridolph.top' was loaded over HTTPS,
but requested an insecure resource 'http://server:5577/api/...'
```

**根因：**
前端构建时 `NEXT_PUBLIC_API_BASE_URL` 没有正确注入公网地址，
用了容器内网地址 `http://server:5577`。

这是前端转全栈最容易踩的坑之一：
- `http://server:5577` 是**容器内网地址**，只有容器之间通信才用
- 浏览器发出的请求必须用**公网地址**，而且必须是 HTTPS
- 这个变量是**构建时注入**的，运行时改环境变量没用，镜像里已经固化了

两者在 Next.js 里是两个不同的变量：
```env
NEXT_PUBLIC_API_BASE_URL=https://api-resume.fridolph.top  # 浏览器用，构建时注入
RESUME_API_BASE_URL=http://server:5577                    # 服务端 SSR 用，运行时注入
```

**沉淀：** `release-from-local.sh` 里加了 `--public-api-base-url` 参数，
构建时强制传入，不依赖默认值。

---

### 坑 6：上线成功 ≠ 业务可用

**现象：**
```bash
GET /api/auth/me          → 200  ✅
GET /api/resume/published → 500: no such table: resume_publication_snapshots
```
基础接口通了，以为上线成功了。但业务接口报 `no such table`。

**根因：**
本地开发时跑过数据库迁移，线上没跑。
**表结构**和**业务数据**是两件事，我之前把它们混在一起验收了。

**解法：**
上线验收拆两步：
```bash
# 第一步：表结构存不存在
python3 - <<'PY'
import sqlite3
conn = sqlite3.connect('/root/my-resume/.deploy-runtime/shared/data/my-resume.db')
tables = [r[0] for r in conn.execute("select name from sqlite_master where type='table'")]
print("resume_publication_snapshots:", "resume_publication_snapshots" in tables)
PY

# 第二步：业务数据存不存在
# 接口返回 200 不等于业务可用，要看到数据才算
curl -s https://api-resume.fridolph.top/api/resume/published | python3 -m json.tool
```

**沉淀：** 发布验收 checklist 里加了"关键表校验"这一项，
不再只看接口状态码。

---

## 四、AI 辅助写脚本：我的工作方式

`release-from-local.sh` 现在有 500 多行，支持十几个参数。

但它最开始只是一条命令：
```bash
ssh root@<ecs-ip> "cd /opt/my-resume && ./deploy/ecs/release.sh v2.1.0"
```

是怎么长成现在这样的？**不是一次设计好的，是一次次被问题推着加的。**

我的工作方式：
```
1. 遇到麻烦，描述给 AI
     ↓
2. AI 给初版方案或修改建议
     ↓
3. 跑一遍，把报错贴给 AI
     ↓
4. AI 解释根因 + 给修改
     ↓
5. 验证通过，沉淀进脚本或文档
```

比如 `--engine-build`，是因为 buildx 超时加的。
比如 `--reuse-from-tag`，是因为只改了 `server` 但不想重新构建 `web/admin` 加的。
比如 `--cache-ref`，是因为构建缓存每次都重新拉依赖，加了 registry cache 引用。
比如 `--skip-public-check`，是因为有时候只想验证 ECS 侧，不想等公网检查加的。
比如 `rollback.sh`，是因为手动切 tag + 重启太慢，需要自动回滚。

每一个参数背后，都有一个具体的麻烦。

**AI 在这个过程里做什么？**
- 生成初版脚本框架
- 解释报错的根因（buildx 不共享宿主机缓存这件事，我自己不一定能想到）
- 提供备选方案（`--engine-build` 还是私有化基础镜像，两个方案都是 AI 给的）
- 帮我把"我的需求"翻译成"bash 的正确写法"

**我做什么？**
- 提需求，描述麻烦
- 验证，看日志，判断对不对
- 决定用哪个方案
- 把结果沉淀进文档

脚本是 AI 写的，但判断是我做的。

---

## 五、2核2G ECS 的运维原则

跑了这么多版本，总结下来就这几条：

**构建不上 ECS。**
本地或 CI 构建镜像，ECS 只拉取启动。
2核2G 跑 `next build` 会把内存打满，直接卡死。

**串行不并发。**
拉三个镜像串行，不并发。磁盘 40G，并发拉容易满。

**release snapshot 管理。**
ECS 保留最近两个版本的 snapshot 目录（`release-snapshots/v2.3.0`、`v2.3.1`），
通过 `current` 软链接指向当前运行版本。
旧镜像 `docker image prune -f` 定期清理。

**tag 有纪律。**
用 `v2.3.1`，不用 `latest`。
出了问题，`rollback.sh` 一键切回上一个 snapshot。

**发布前体检。**
端口可用、磁盘可用、manifest 齐全，三连通过才发布。
这三个检查加起来不到 10 秒，但能拦住大多数"发到一半失败"的情况。

---

## 六、已知的安全风险（诚实说）

部署稳定之后，我做了一轮联调，发现了另一类问题——
不是"发不出去"，而是"发出去了但不安全"。

**目前这套上线的东西，安全层面是在持续完善的。**
作为学习项目公开出来，有必要把风险和进展都写清楚。

### API 响应契约已标准化（v2.2.9+）

之前 API 各接口返回格式不一致，`v2.2.9` 起统一了 `{ code, message, data }` 响应信封。
NestJS 端接入了 Swagger 注解，Admin 可在线浏览接口文档。
但统一的输入校验（zod schema 层）还没全量覆盖——这是后续要补的。

### API 访问控制

- CORS 已限制为 `RESUME_DOMAIN` + `ADMIN_DOMAIN`
- admin 后台接口全部走 JWT 鉴权 + 角色能力守卫
- 公开 AI Chat 接口有 useKey 配额控制（20 轮/天）

### AI 接口成本控制（已部分落地）

- 所有 AI 调用走 `ai_usage_records` 表记录（调用时间、模型、token、费用）
- Admin 后台有 AI Chat 治理台，可查看/删除会话、useKey 管理
- visitor 角色不能触发真实 AI 调用（只能体验缓存结果）
- 用量上限功能已规划，待下一阶段落地

### admin 后台：主动关掉了公开体验

admin 后台能直接操作数据库、管理内容、调用所有 API。
如果开放公开体验，等于把数据库管理权交给了所有访客。

**我的判断是：这个风险不值得冒。**

所以我直接关掉了 admin 的公开体验入口。
感兴趣的朋友可以 fork 仓库，自己部署，自己玩。

这不是功能不完善，是主动的风险控制。

---

## 七、沉淀成什么

现在每次发版的完整流程：

```bash
# 1. 保持代码和 tag 最新
git checkout main && git pull origin main && git fetch --tags --force

# 2. 一键构建 + 推送 + 远程发布
./deploy/ecs/release-from-local.sh \
  --tag v2.3.1 \
  --stack-env ./.env.stack.local \
  --ecs-host <your-ecs-ip>

# 脚本自动完成：
#   - 检查 git tag，不存在自动创建并推送
#   - 三服务 manifest 验证
#   - 本地构建镜像（用 ACR 基础镜像，不依赖 DockerHub）
#   - 推送到 GHCR
#   - SSH 到 ECS 执行 release.sh
#   - ECS 创建 release snapshot、切换 current 软链接
#   - compose up + 健康检查三个公网域名
```

只改后端时，只构建 `server`（web/admin 从上一个 tag 复用）：
```bash
./deploy/ecs/release-from-local.sh \
  --tag v2.3.1 \
  --stack-env ./.env.stack.local \
  --ecs-host <your-ecs-ip> \
  --services server
```

快速部署最近一个已有 tag：
```bash
./deploy/ecs/deploy-latest-tag.sh --ecs-host <your-ecs-ip>
```

出了问题，回滚：
```bash
./deploy/ecs/rollback.sh   # 自动切到上一个 release snapshot
```

---

## 八、现在在哪里，下一步去哪里

诚实地说，现在的状态是：

```
✅ L1 基础可用
    镜像化发布、ECS pull + up、健康检查、回滚

✅ L2 联调稳定
    DB 同步、API 基址一致性、环境变量分层
    release snapshot 管理 + rollback

✅ L2.5 安全加固（持续进行中）
    ✅ API 响应契约标准化 + Swagger 注解
    ✅ JWT 鉴权 + 角色能力守卫
    ✅ AI 调用记录 + Chat 治理台
    ✅ 输入治理（简历导入识别中的安全过滤）
    🔄 全量 zod schema 校验（部分已做）

✅ L3 研发效率
    ✅ 构建缓存优化（registry cache + 基础镜像私有化）
    ✅ 增量发布（--services 按需构建 + --reuse-from-tag）
    ✅ release snapshot 软链接管理

⬜ L4 生产可靠性
    蓝绿发布、自动回滚、告警体系

⬜ L5 企业治理
    镜像安全扫描、多环境权限分级（暂不考虑）
```

L4 以上，我现在没有足够的实际经历，不打算在这里展开。
等真正做了，再写。

**接下来的优先级：**
把部署这件事放下，去做 AI 实战。
安全加固会随着功能开发一起补，不单独开一个阶段做。

---

## 写在最后

三篇写下来，我想说两件事。

第一件：**这套东西现在是学习项目，不是生产系统。**

API 校验还没全量覆盖，安全加固还在持续做——
这些我都知道，也都写出来了。
不是因为不重要，是因为我现在的阶段，
比起"做完整"，更重要的是"做清楚"：
清楚自己在哪里，清楚风险在哪里，清楚下一步去哪里。

第二件：**工具可以借，经验得自己攒。**

这套脚本是 AI 帮我写的，但每一行背后的判断是我做的。
每一个坑，是我踩的。每一个 SOP，是我验证过的。

如果你也在学全栈，希望这篇能让你少踩几个坑。
如果你发现了我写错的地方，欢迎告诉我——
我们一起学，一起改。

---

## 参考

- [Docker buildx 文档](https://docs.docker.com/buildx/working-with-buildx/)
- [阿里云容器镜像服务 ACR](https://help.aliyun.com/product/60716.html)
- [GitHub Container Registry (GHCR)](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Compose healthcheck](https://docs.docker.com/compose/compose-file/05-services/#healthcheck)
- [Twelve-Factor App](https://12factor.net/)

---

*昇哥 · 2026年5月（2026年6月更新）*
*my-resume 从 v1.1.0 跑到 v2.3.1 途中，把踩过的坑写下来*
