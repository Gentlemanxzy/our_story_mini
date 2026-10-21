# OurStory · 情侣「100 件小事」打卡手账

一个只给两个人用的微信小程序：把想一起做的事写成清单，做完就珍藏，攒成属于你们的章节。

规格文档见 `../情侣100件小事-小程序方案-v2.md`（云环境、数据模型、权限架构、验收标准）。

---

## 当前状态

**已可用（本地数据）**：打开即可完整体验，数据存在本机 Storage。

- 打卡墙：按分类分组、搜索、状态筛选、记录面板（状态 / 完成日期 / 心情 / 一句话）
- 我们的章节：百分比等级、分布统计、心情 Top3、珍藏时间线
- 管理小事：自定义新建、删除、从 105 条默认库挑选加入
- 情侣绑定：邀请码输入 / 扫码 / 复制（交互就绪）

**待接入云端**：

- 云函数：`login` 已就位；其余 8 个待补（`couple_create` / `couple_join` / `couple_unbind` / `thing_upsert` / `thing_delete` / `thing_seed` / `thing_reorder` / `code_gc`）
- 数据库集合与安全规则
- 图片上传（`chooseMedia` + 云存储）
- 实时同步（全局 watcher）

数据访问层已集中在 `miniprogram/services/things.js`，接口是 Promise 形态，换成云端调用时**只需改这一个文件**，页面不用动。

---

## 目录结构

```
ourStory/
├── miniprogram/
│   ├── app.js / app.json / app.wxss    # 入口与全局设计变量
│   ├── config.js                       # 云环境 ID、业务常量
│   ├── constants.js                    # 分类/状态/心情/等级枚举
│   ├── data/default-things.js          # 105 条默认小事库（本地常量，不入库）
│   ├── services/things.js              # 数据访问层（当前本地实现）
│   ├── utils/format.js                 # 日期、分组、进度计算
│   ├── components/record-sheet/        # 半屏记录面板
│   ├── images/tabbar/                  # tabBar 图标
│   └── pages/
│       ├── wall/                       # 打卡墙（tab）
│       ├── chapters/                   # 我们的章节（tab）
│       ├── mine/                       # 我的（tab）
│       ├── bind/                       # 情侣绑定
│       └── things-manage/              # 管理小事
├── cloudfunctions/login/               # 取 openid、upsert users
├── tools/gen-tabbar-icons.py           # tabBar 图标生成脚本
└── docs/security-rules.md              # 数据库安全规则
```

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
2. **建集合**：`users` / `couples` / `things`（`default_things` 不需要，已本地化）
3. **配安全规则**：见 `docs/security-rules.md`，三个集合逐个粘贴
4. **部署云函数**：`cloudfunctions/` 下每个目录右键「上传并部署：云端安装依赖」
5. **配隐私指引**（不配会直接调不动相册）：
   后台「设置 → 服务内容声明 → 用户隐私保护指引」，声明
   - 选中的照片或视频信息
   - 摄像头
   - 头像、昵称
   - 剪切板（复制邀请码用到）
6. **最低基础库**：后台「设置 → 基本设置」设为 **2.21.2**（`chooseAvatar` 的门槛）

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

主包当前 **< 100KB**（图片仅 6 个 tabBar 图标，合计约 12KB）。
主包上限 2MB，后续加页面和图仍有充足余量。新增图片前先压缩到合适尺寸。
