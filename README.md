# CloudSub

CloudSub 是一个部署在 Cloudflare Workers 上的轻量订阅分发平台。它聚合上游机场订阅和自建节点，经过关键词过滤、节点去重、地区命名、分流规则处理后，通过兑换码向用户分发订阅链接。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/akweksks/cloudsub)

## 核心能力

- 上游机场订阅管理、自建节点管理、定时同步。
- 节点池：原始节点、过滤节点、无效节点、重复节点、最终可分发节点。
- 关键词过滤、地区识别、统一命名、节点去重。
- 分流规则：策略组、规则、rule-providers、DNS 全部使用 YAML 内容维护。
- 套餐、兑换码、订阅用户管理。
- 兑换码支持套餐默认天数、自定义订阅天数、固定订阅到期时间。
- 用户中心支持兑换、查询、续期、复制订阅链接和选择后台开放的分流规则。
- 分发域名可配置默认域名，订阅链接支持通用入口和客户端入口。
- 订阅访问频率限制和单 Token 异常访问检测。

CloudSub 不内置支付系统，不做复杂多租户，也不做大型机场面板的计费体系。它更适合轻量分发、内部运营、订阅聚合和兑换码模式。

## 技术栈

- Cloudflare Workers
- Hono
- React Router v7
- Tailwind CSS
- shadcn 风格组件
- D1：套餐、兑换码、订阅用户、访问日志等业务数据
- R2：节点池、原始订阅、同步快照、历史记录等大对象
- KV：可选热点缓存，用于当前配置、节点池和同步状态加速
- Workers Assets：前端静态资源

## 项目结构

```text
.
├─ page/poly-page              # React 管理后台和用户中心
├─ workers/poly-workers        # Worker API、订阅生成和后台接口
├─ workers/poly-workers/db     # D1 初始化与迁移 SQL
├─ wrangler.jsonc              # 根目录部署配置，适合 GitHub + Cloudflare Workers Builds
└─ package.json                # 根目录构建、测试、部署脚本
```

## 本地开发

```bash
npm install
npm run build
npm test
npm run dev
```

本地只调试 Worker 后端时，也可以进入 Worker 目录：

```bash
cd workers/poly-workers
npm install
npm run dev
```

## Cloudflare 资源

必须绑定：

- D1：`DB`
- R2：`SUB_CACHE`

D1 数据库 ID 不写入仓库配置，避免 Fork 或连接其他 Cloudflare 账号时引用到不存在的数据库。执行 `npm run deploy` 时会自动在当前账号查找或创建 `cloudsub` D1 数据库和 `cloudsub-cache` R2 存储桶，并使用真实 ID 完成本次部署。

可选绑定：

- KV：`SUB_KV`

如果没有绑定 `SUB_KV`，系统会自动回退到 D1 + R2，不影响功能。绑定后，当前配置、节点池和同步状态会优先读取 KV 热缓存，后台切换页面和读取配置会更快。

## 首次初始化 D1

首次部署新建 D1 时，部署脚本会自动执行全部数据库脚本。已有数据库升级时，可进入 Worker 目录后按顺序手动执行新增脚本：

```bash
cd workers/poly-workers
wrangler d1 execute cloudsub --file=./db/base.sql --remote
wrangler d1 execute cloudsub --file=./db/1.1.0.sql --remote
wrangler d1 execute cloudsub --file=./db/1.2.0.sql --remote
wrangler d1 execute cloudsub --file=./db/1.3.0.sql --remote
wrangler d1 execute cloudsub --file=./db/1.4.0.sql --remote
wrangler d1 execute cloudsub --file=./db/1.5.0.sql --remote
wrangler d1 execute cloudsub --file=./db/1.6.0.sql --remote
wrangler d1 execute cloudsub --file=./db/1.7.0.sql --remote
wrangler d1 execute cloudsub --file=./db/1.8.0.sql --remote
```

`1.8.0.sql` 用于新增兑换码固定订阅到期时间字段，线上升级时需要执行。

## GitHub + Cloudflare Workers Builds

推荐使用 Cloudflare Workers Builds 连接 GitHub 仓库自动构建部署：

1. Fork 或导入本仓库到 GitHub。
2. 在 Cloudflare 控制台进入 `Workers & Pages`。
3. 创建 Worker，并连接 GitHub 仓库。
4. Root directory 使用仓库根目录。
5. Build command 使用：

```bash
npm install && npm run build
```

6. Deploy command 使用：

```bash
npm run deploy
```

7. 部署脚本会自动准备 D1、R2 和 D1 初始表；如需更快读取后台配置，再创建 KV 并绑定为 `SUB_KV`。

之后推送到 GitHub 主分支即可自动构建和部署。

相关官方文档：

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Deploy to Cloudflare Button](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
- [Workers KV](https://developers.cloudflare.com/kv/)
- [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)

## 手动部署

```bash
npm install
npm run deploy
```

非交互环境需要提前配置 Cloudflare API Token：

```bash
CLOUDFLARE_API_TOKEN=你的 Cloudflare API Token
```

## 后台入口

后台主导航收敛为 8 个核心入口：

- 工作台
- 节点池
- 节点来源
- 分流规则
- 分发设置
- 套餐
- 兑换码
- 订阅用户

同步任务、访问日志、操作日志、后台密码等高级页面仍保留路由和功能，但不放在主导航里干扰新手操作。

## 订阅生成规则

兑换码生成订阅时按以下优先级计算到期时间：

1. 如果兑换码设置了固定订阅到期时间，使用该绝对时间。
2. 否则使用兑换码自定义订阅天数。
3. 如果兑换码没有自定义天数，回退到套餐默认天数。

兑换码自身过期时间只控制兑换码能否被兑换，不等于用户订阅到期时间。

## 后台密码

后台密码由数据库中的 `common/token` 配置控制。上线后请第一时间进入后台修改密码。
