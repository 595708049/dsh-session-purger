# dsh-session-purger

彻底删除 DSH 会话 —— 右键左侧会话列表中的任意一条，即可把该会话从磁盘上真正删掉。

## 用法

1. 刷新一次 Web GUI 页面（让新的客户端包加载）。
2. 在左侧会话列表上**右键**任意会话 → 「删除会话」。
3. 选择：
   - **确认删除（不可恢复）** —— 删除不在使用中的会话；
   - **强制删除（含正在使用的会话）** —— 连正在打开的那个会话一起删（删完当前页面会失联，请自行切换或重开）；
   - **取消**。

删除成功后侧栏立即消失，输入框的 `@` 候选也会同步消失（两者都来自同一份会话存储列表）。

## 它到底删了什么

| 位置 | 内容 |
| --- | --- |
| `~/.dsh/sessions/<项目目录>/<sessionId>/` | 会话日志 `session.v4.jsonl.zstd`（整个目录递归删除） |
| `~/.dsh/storages/session_projcache/sessions/<sessionId>.json` | 标题 / 统计等投影缓存 |
| `~/.dsh/storages/workspace.json` | 从工作区 `sessionIds` 摘除，并清除归档 / 固定标记 |

## 安全说明

- 删除**不可恢复**，没有回收站。重要会话请先用「导出会话日志」备份。
- 当前正在进行的会话不能直接删（接口返回 409），要么先切到别的会话，要么用「强制删除」。
- 宿主侧接口：`POST /dsh-session-purger/delete`，body `{"id": "<sessionId>", "force": false}`；`GET /dsh-session-purger/list` 列出可删会话。

## 安装状态

已作为 profile bundle 安装于 `~/.dsh/profiles/desktop`（`file:../../dsh-plugins/dsh-session-purger`）。
修改源码后需要把文件同步到 `~/.dsh/profiles/desktop/node_modules/dsh-session-purger/`
（`file:` 依赖是文件复制，不是符号链接），然后关闭再打开该插件以重载。
