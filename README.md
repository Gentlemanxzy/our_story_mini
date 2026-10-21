# OurStory · 情侣「100 件小事」打卡手账

一个只给两个人用的微信小程序：把想一起做的事写成清单，做完就珍藏，攒成属于你们的章节。

规格文档见 `../情侣100件小事-小程序方案-v2.md`（云环境、数据模型、权限架构、验收标准）。

---

## 当前状态

**已可用**：打开即可完整体验；**本地为主、云端自动同步，云端不可用时静默走本地**。

- 打卡墙：按分类分组、搜索、状态筛选、记录面板（分类 / 状态 / 完成日期 / 心情 / **照片** / 一句话）
- 我们的章节：百分比等级、分布统计、心情 Top3、珍藏时间线（带照片缩略图）
- 管理小事：自定义新建、删除、从 105 条默认库挑选加入
- **自定义分类**：新建、改名、删除；记录面板里也能直接改归属或现建一个
- **记录照片**：每条最多 9 张，相册或相机，点缩略图看大图；优先存云存储，云不可用落本机
- **头像与昵称**：走微信「头像昵称填写能力」，可随时改；头像优先存云存储，未连云端时存本机
- **登录态**：云函数取 openid 并缓存，未连云端时静默降级为本地模式
- **数据同步**：清单与分类本地先写、后台推云，失败入队待补传；「我的」页可看待同步条数并手动同步
- 情侣绑定：邀请码输入 / 扫码 / 复制（交互就绪）

**待补齐**：

- 云函数：7 个已就位（见下）；还差 5 个（`couple_create` / `couple_join` / `couple_unbind` / `thing_reorder` / `code_gc`）
- 4 个数据库集合与安全规则（`docs/security-rules.md`）
- 实时同步（`db.watch()`，依赖绑定关系先做完）
- 排序功能（`thing_reorder`）

数据访问层集中在 `miniprogram/services/` 下的 `things.js`、`categories.js`、`user.js`、`media.js`，接口都是 Promise 形态。

---

## 目录结构

```
ourStory/
├── miniprogram/
│   ├── app.js / app.json / app.wxss    # 入口与全局设计变量
│   ├── config.js                       # 云环境 ID、业务常量
│   ├── constants.js                    # 分类/状态/心情/等级枚举
│   ├── data/default-things.js          # 105 条默认小事库（本地常量，不入库）
│   ├── services/things.js              # 清单：本地优先 + 云端推送 + 兜底
│   ├── services/categories.js          # 分类：同一套同步策略
│   ├── services/user.js                # 昵称头像读写与头像落盘
│   ├── services/media.js               # 记录照片：上云 / 落本机 / 补传 / 清理
│   ├── utils/auth.js                   # 登录态（openid 缓存 + 云端不可用时降级）
│   ├── utils/cloud.js                  # 云调用封装（超时 / 连续失败短路）
│   ├── utils/format.js                 # 日期、分组、进度计算
│   ├── components/record-sheet/        # 半屏记录面板
│   ├── components/category-picker/     # 分类选择器（含新建）
│   ├── images/tabbar/                  # tabBar 图标
│   └── pages/
│       ├── wall/                       # 打卡墙（tab）
│       ├── chapters/                   # 我们的章节（tab）
│       ├── mine/                       # 我的（tab）
│       ├── bind/                       # 情侣绑定
│       ├── things-manage/              # 管理小事 + 管理分类
│       └── profile-edit/               # 编辑头像昵称
├── cloudfunctions/
│   ├── login/                          # 取 openid、upsert users
│   ├── user_update/                    # 保存昵称与头像
│   ├── thing_upsert/                   # 写入/更新清单（单条或批量）
│   ├── thing_delete/                   # 软删清单条目
│   ├── category_upsert/                # 写入/更新自定义分类
│   ├── category_delete/                # 软删分类
│   └── sync_pull/                      # 一次拉齐清单与分类
├── tools/gen-tabbar-icons.py           # tabBar 图标生成脚本
├── tools/smoke-test.js                 # 本地逻辑冒烟测试（node 直接跑）
└── docs/security-rules.md              # 数据库安全规则
```

---

## 登录与头像昵称

**登录不需要用户授权**。小程序端拿 openid 有两条路，本项目走后者：

- `wx.login` 取 code → 服务端换 openid（多一层网络与出错点）
- 云函数里 `cloud.getWXContext().OPENID`（直接就有）

所以「登录」对用户是无感的：`utils/auth.js` 在进入「我的」时调一次 `login` 云函数，把 openid 存本地，失败就静默降级为本地模式，不弹窗不阻塞。

**头像昵称必须用户主动确认**。`wx.getUserProfile` 自 **2022-10-25 已被回收**（只会返回「微信用户」+ 灰头像），现在的合规做法是「头像昵称填写能力」：

```html
<button open-type="chooseAvatar" bindchooseavatar="onChooseAvatar">
  <image src="{{avatar}}" />
</button>
<input type="nickname" bindinput="onNickInput" />
```

用户点头像时，微信面板里能直接选「用微信头像」；昵称输入框的键盘上方会出现「使用微信昵称」。体验接近一键，但必须用户点一下确认。

**头像存储三级降级**（`services/user.js`）：

1. `wx.cloud.uploadFile` → `cloud://` fileID（长期有效，换手机也在）
2. 云不可用 → `FileSystemManager.saveFile` 存到 `USER_DATA_PATH`（本机长期有效，重装丢失）
3. 都失败 → 临时路径（仅本次会话）

`chooseAvatar` 返回的是**临时路径，约 24 小时失效**，所以必须走上面这套落盘，不能直接存进数据库。

---

## 自定义分类的模型

内置 10 个分类**不落库**，写在 `constants.js` 里，key 固定（`youth` / `together` …），只读、不可删。

用户自建的分类单独存一张表，key 形如 `c_mvhj9rmd`：

| 字段 | 说明 |
|---|---|
| `key` | `c_` 前缀的短 id，`things.category` 存的就是它 |
| `name` | 显示名，最长 8 字 |
| `order` | 排序值，步长 1000 |

**为什么不让 `things.category` 直接存文字**：

1. 新建了「旅行」但还没加条目时，分类不能消失（否则选择器里看不到它）
2. 改名只改这一条记录，不用批量更新所有 `things`
3. 删除时能明确判断「这个分类下还有几件」

约束：

- 内置分类不可改名、不可删
- 自定义分类可改名；**只有当分类下没有条目时才能删**（避免条目变成孤儿）
- 名称查重会 trim 首尾空格，且与内置分类一起查
- 上限 30 个自定义分类

---

## 数据同步与离线兜底

**原则：本地是完整副本，云端是同步通道。云端挂了不丢数据，也不卡界面。**

| 环节 | 做法 |
|---|---|
| 读 | 只读本地 `Storage`，界面立刻出图，不等网络 |
| 写 | 先写本地 → 写入待传队列 → 后台推云；推成功才出队 |
| 云端失败 | 队列保留，下次 `flush()` 补传；界面完全不受影响 |
| 换手机 / 恢复 | `pull()` 拉云端全量，按 `updatedAt` 较新者合并进本地 |
| 删除 | 软删（`deleted: true`）保留墓碑，否则 `pull` 时会被云端复活 |

**触发时机**：App 回到前台（`onShow`，30 秒节流）、「我的」页进入、以及「我的 → 同步到云端」手动触发。顺序固定为 `pull → flush`：先拿云端最新，再推本地未上传的。

**队列设计**：以 `kind:_id` 为键去重，所以「先改后删」只会留最后一次操作；批量条目（如首次灌入的 105 条）合并成一次请求，不逐条发。

**两条默认假设**（写在这里，避免以后误判）：

1. **冲突用 `updatedAt` 字符串比较，取较新者**。时钟以客户端为准，极端情况下（两台设备系统时间差很大）可能判错；两人场景下影响可控。
2. **`sync_pull` 单次上限 1000 条**。105 条默认清单远低于此；若将来单方清单超过 1000 条，需要改成游标分页。

**编号 `no` 是派生字段**：读的时候按 `order` 重新编号，不入库、不同步，所以增删后编号永远连续，不会出现「删了第 3 条留下空号」。

跑一遍逻辑自检（不需要开发者工具，含云端失败/恢复两种路径）：

```bash
node tools/smoke-test.js
```

---

## 记录照片

入口在打卡墙点任意一条 → 记录面板里的「那天的照片」。每条最多 **9 张**（`config.js` 的 `MAX_PHOTOS`），相册或相机，`sizeType: compressed`。

### 存取策略

`chooseMedia` 返回的是**临时路径，约 24 小时失效**，不能直接存进数据。所以和头像走同一套三级降级：

| 优先级 | 结果 | 有效期 | 对方能看到 |
|---|---|---|---|
| 1 | `wx.cloud.uploadFile` → `cloud://` fileID | 长期 | 能 |
| 2 | `FileSystemManager.saveFile` → `USER_DATA_PATH` | 本机长期（重装丢） | 不能 |
| 3 | 原样保留临时路径 | 约 24 小时 | 不能 |

选了照片就立刻上传是错的——用户可能取消保存，留下没人引用的云文件。所以**点「记下来」时才上传**，带 `保存照片 1/3` 的进度提示，同时把面板里删掉的照片从云端和本机一并清理。

### 离线拍的照片怎么办

存成本机路径后，`things.flush()` 在推云前会调 `media.upgradeLocal()` 补传：传成功就替换成 fileID，并**顺带把 `updatedAt` 刷新**（否则对方按时间比较会认为没变化，拿不到新图）。所以「先离线记，回家连上 Wi-Fi 自动补传」是成立的。

记录面板里会显示「有 N 张暂存在本机，连上云端后会自动上传」，不让人误以为已经同步。

### 界面

- 记录面板：3 列方格，点格子看大图（`wx.previewImage`，2.2.3 起支持 `cloud://` 文件ID）
- 打卡墙：行尾 104rpx 缩略图，多于一张时右下角带数字角标；点缩略图直接看大图，不会误触打开面板
- 我们的章节：时间线上 148rpx 小图，多图显示 `+N`

### 两个要注意的上限

1. **云存储免费额度 5GB**（含头像）。单张压缩后通常 200–500KB，9 张约 2–4MB，够用很久；但这是唯一会在长期使用后真的被撑满的配额，比资源点更早见底。
2. **`deleteFile` 单次最多 50 个文件**，当前每条最多 9 张，没有风险。

> 相册权限不配会直接调不起来：小程序后台 → 设置 → 服务内容声明 → **用户隐私保护指引** → 勾选「**选中的照片或视频信息**」（用相机还要勾「摄像头」）。没配时点「＋」不会有任何反应，代码里已经把这个错误转成一句明确提示。

---

## 本地运行

1. 微信开发者工具 →「导入项目」→ 选择本目录
2. AppID 已写入 `project.config.json`（`wx1d57f098520957db`）
3. 基础库 3.17.3，`project.config.json` 与 `project.private.config.json` 已对齐
4. 直接编译即可看到打卡墙

> 首次进入会自动从默认库灌入 105 条清单。想重来一遍：我的 → 重新体验首次引导。

---

## 接入云开发

1. **确认环境 ID**：`miniprogram/config.js` 里的 `ENV_ID` 必须与你云开发控制台一致
2. **建集合**：`users` / `couples` / `things` / `categories`（`default_things` 不需要，已本地化）
3. **配安全规则**：见 `docs/security-rules.md`，四个集合都设为 `read: false / write: false`（全部走云函数）
4. **云存储**：权限用默认的「所有用户可读、仅创建者可写」即可。头像走 `avatar/`，记录照片走 `photos/`，两个目录都在第一次上传时自动创建
5. **部署云函数**：`cloudfunctions/` 下 7 个目录逐个右键「上传并部署：云端安装依赖」。先部署 `login`，否则「我的」页会一直显示本地模式
6. **配隐私指引**（不配会直接调不动相册和头像）：
   后台「设置 → 服务内容声明 → 用户隐私保护指引」，声明
   - 选中的照片或视频信息
   - 摄像头
   - 头像、昵称
   - 剪切板（复制邀请码用到）
7. **最低基础库**：后台「设置 → 基本设置」设为 **2.21.2**（`chooseAvatar` 的门槛）

### 批量部署（可选，省去逐个右键）

开发者工具「设置 → 安全设置 → 服务端口」打开后，可用官方 CLI 一次部署全部：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  -e cloud1-d0gg6c2cv301bef68 \
  -r \
  --project /Users/Admin/myWorkSpace/ourStory \
  --paths cloudfunctions/login cloudfunctions/user_update cloudfunctions/thing_upsert \
          cloudfunctions/thing_delete cloudfunctions/category_upsert cloudfunctions/category_delete \
          cloudfunctions/sync_pull
```

`-r`（`--remote-npm-install`）让云端装依赖，本机不需要 `node_modules`。

### 报错对照

| 控制台报错 | 含义 | 处理 |
|---|---|---|
| `-501000 FunctionName parameter could not be found` | 该环境里没有这个云函数 | 按上面第 5 步部署；部署后「我的 → 同步到云端」会重新探测，不用重启 |
| `-501001` 或 `env not exists` | 环境 ID 不对／环境已删 | 核对 `miniprogram/config.js` 的 `ENV_ID` 与云开发控制台 |
| 云函数返回 `{ ok: false, msg: 'collection not exists' }` | 集合没建 | 补建集合（第 2 步） |
| 日志提示「已切到本地模式」 | 预期行为，不是崩溃 | 数据在本地完整保存，云端恢复后自动补传 |

> `login` 在 `users` 集合缺失时仍会返回 openid（只带一个 `warn`），因为身份不依赖该集合；同步类函数则需要 `things` / `categories` 集合存在。

---

## 设计规范

奶油纸感手账风，变量集中在 `app.wxss` 的 `page` 上，页面只引用变量：

| 变量 | 值 | 用途 |
|---|---|---|
| `--paper` | `#FDFBF7` | 纸面底色 |
| `--paper-2` | `#F8F3EA` | 输入框、浅色块 |
| `--ink` | `#3D3630` | 主文字 |
| `--ink-3` | `#A99F94` | 次要文字 |
| `--line` | `#E8DFD1` | 细线描边 |
| `--accent` | `#C2603F` | 砖红强调 |

- 尺寸一律 `rpx`，按钮 ≥ 92rpx，正文 ≥ 28rpx
- 标题用衬线（`Songti SC`），正文用系统无衬线
- 底部适配 `env(safe-area-inset-bottom)`
- 图标不用外链、不用内联 SVG

---

## 包体积

主包当前 **约 121KB**（图片仅 6 个 tabBar 图标，合计约 12KB）。
主包上限 2MB，后续加页面和图仍有充足余量。新增图片前先压缩到合适尺寸。
