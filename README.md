# terence-portfolio-v2-backend

个人主页的后端接口。目前提供来访通知：前端打开页面时请求 `/api/visit`，服务按访客 IP 去重后，通过 [Bark](https://bark.day.app) 推到手机。

## 技术栈

- Node.js + Express
- Bark `https://api.day.app`
- MongoDB — 访问记录
- ip-api.com — IP 地理位置（国家、省、市、坐标、运营商）

## 快速开始

```bash
npm install
cp .env.example .env   # 填入 BARK_KEY
npm run dev            # 开发模式
npm start              # 生产模式
```

默认运行在 http://localhost:3002

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3002` |
| `CORS_ORIGIN` | 允许的前端域名，逗号分隔 | 空（允许任意来源） |
| `BARK_KEY` | Bark 设备 Key | 空 |
| `BARK_API` | Bark 接口地址 | `https://api.day.app` |
| `VISIT_PUSH_WINDOW_MS` | 同一 IP 两次推送的最小间隔 | `3600000`（1 小时） |
| `MONGODB_URI` | MongoDB 连接串；留空则不落库 | 空 |
| `MONGODB_DB` | 数据库名 | `portfolio` |
| `MONGODB_COLLECTION` | 访问记录集合 | `visits` |

## 接口

### `GET /health`

```json
{ "status": "ok", "database": "ok" }
```

`database` 可能是 `ok`、`disabled`（未配置 `MONGODB_URI`）或 `error`。

### `GET /api/stats`

返回访问统计：总访问、独立访客、今天、近 7 天、近 14 天每日数量、页面、位置、省级分布和最近 30 条记录。统计按北京时间计算，并排除爬虫和 `/status` 页面本身。User-Agent 含常见爬虫标识，或系统平台是 Linux（Android 除外），都算爬虫。省级图覆盖全世界：中国按省份上色，其他国家按国家上色，香港、澳门、台湾各自汇总。

### `GET /api/visit`、`POST /api/visit`

记录一次来访。每次请求都会做 IP 地理位置查询，并把访客信息写入 MongoDB。爬虫只落库，不推 Bark。真人访客同一 IP 在 `VISIT_PUSH_WINDOW_MS` 内只推送一次；窗口内的后续请求仍会落库，但不再打 Bark。

IP 定位能得到国家、省、市、邮编、经纬度、时区和运营商，到不了街道门牌。

请求头会保存 IP、`User-Agent`、`Accept-Language`、`Origin` 和 `Sec-CH-UA*`。前端可以在 JSON body 里补充：

| 字段 | 说明 |
|------|------|
| `path` | 当前页面路径，例如 `/projects` |
| `title` | 页面标题 |
| `referrer` | 来源页；未传时使用请求头 `Referer` |
| `language` / `languages` | 浏览器语言 |
| `timezone` | 时区 |
| `platform` / `vendor` | 系统平台 |
| `screenWidth` / `screenHeight` | 屏幕尺寸 |
| `viewportWidth` / `viewportHeight` | 视口尺寸 |
| `devicePixelRatio` | 设备像素比 |
| `hardwareConcurrency` / `deviceMemory` | CPU 线程数、大致内存 |
| `maxTouchPoints` | 触控点数 |
| `cookieEnabled` | 是否允许 Cookie |

推送成功：

```json
{ "ok": true, "pushed": true, "saved": true }
```

一小时内已经推过：

```json
{ "ok": true, "pushed": false, "saved": true, "retryAfter": 2400 }
```

同一 IP 每分钟最多 30 次请求，超出返回 `429`。

前端示例：

```js
fetch('http://localhost:3002/api/visit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    path: location.pathname,
    referrer: document.referrer,
  }),
}).catch(() => {})
```
