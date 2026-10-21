# 数据库安全规则

三个集合都在 **云开发控制台 → 数据库 → 选中集合 → 权限设置 → 自定义安全规则** 里粘贴。

## 为什么是这套规则

云开发只有 4 种预设权限，**没有「指定两个人共写」**。而 `db.watch()` 走的是客户端数据库权限——如果权限全收口到云函数，客户端就没读权限，实时同步直接失效。

所以采用**读写分离**：

| 操作 | 通道 | 依据 |
|---|---|---|
| 读（含 watch） | 客户端直连 | 安全规则 `auth.openid in doc.members` |
| 写 | 云函数 | 管理端权限，函数内校验 openid ∈ members |

`write: false` 是刻意的：**允许客户端写就等于把安全规则作废**，恶意用户可构造 `members` 把自己塞进别人的空间。

---

## `things`

```json
{
  "read": "auth.openid in doc.members",
  "write": false
}
```

## `couples`

```json
{
  "read": "auth.openid in doc.members",
  "write": false
}
```

## `users`

```json
{
  "read": "doc._openid == auth.openid",
  "write": "doc._openid == auth.openid"
}
```

---

## 两个必须注意的点

**1. `things` 必须冗余存 `members`**

安全规则**无法跨集合查询**，不能靠 `coupleId` 去 join `couples` 判断。所以每条 `things` 都要带一份 `members: [openidA, openidB]`，与 `couples.members` 保持同步。

绑定成功时，`couple_join` 云函数要**级联补齐**该 `coupleId` 下所有 `things` 的 `members`，否则加入方看不到已有清单。

**2. `in` 不生效时的等价写法**

若你的环境里 `in` 操作符报错，换成：

```json
{ "read": "doc.members.indexOf(auth.openid) > -1", "write": false }
```

**上线前务必用两个真实微信号各测一次**：A 号不应读到 B 号未共享的数据。

---

## 建议索引

| 集合 | 索引字段 | 说明 |
|---|---|---|
| `things` | `coupleId` + `order` | 清单按序拉取 |
| `things` | `coupleId` + `status` | 章节页统计 |

**不要给 `couples.code` 建唯一索引**：唯一索引下缺失字段视为 `null`，全集合最多只能有一条无 `code` 的记录，且绑定后把 `code` 置空会冲突。唯一性由 `couple_create` 云函数在事务内「查重 → 插入」保证。
