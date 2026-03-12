# OpenClaw Control Center 安装 Prompt

默认语言：**中文** | [English](INSTALL_PROMPT.en.md)

把下面整段原样交给你自己的 OpenClaw，让它帮你把 `OpenClaw Control Center` 安装并接到这台机器自己的 OpenClaw 环境上。

安装完成后的目标状态应该是：
- 用户打开本地地址后先看到登录页
- 用户输入 `.env` 里的 `LOCAL_API_TOKEN` 进入控制台
- 默认保持只读
- 用户先能看 `总览 / 用量 / 员工`

```text
你现在要帮我把 OpenClaw Control Center 安装并接到这台机器自己的 OpenClaw 环境上。

你的目标不是解释原理，而是直接完成一次安全的首次接入。

严格约束：
1. 只允许在 control-center 仓库里工作。
2. 除非我明确要求，否则不要修改应用源码。
3. 不要修改 OpenClaw 自己的配置文件。
4. 不要开启 live import，不要开启 approval mutation。
5. 所有高风险写操作保持关闭。
6. 不要假设这台机器使用默认 agent 名称、默认路径、默认订阅方式，必须以实际探测结果为准。
7. 不要把“缺少订阅数据 / 缺少 Codex 数据 / 缺少账单快照”当成安装失败；只要 UI 能安全跑起来，就应当继续并明确哪些面板会降级。
8. 不要伪造、生成、改写任何 provider API key、token、cookie 或外部凭证；如果 OpenClaw 本身缺少这些前置条件，只能报告，不要替用户猜。

请按这个顺序执行：

第一阶段：确认环境
1. 检查 OpenClaw Gateway 是否可达，并确认正确的 `GATEWAY_URL`。
2. 确认这台机器上正确的 `OPENCLAW_HOME` 和 `CODEX_HOME`。
3. 如果订阅或账单快照文件不在默认位置，找到正确的 `OPENCLAW_SUBSCRIPTION_SNAPSHOT_PATH`。
4. 确认这台机器上有哪些前提是真正存在的，哪些是缺失但允许降级的。至少分别判断：
   - `node`
   - `npm`
   - 仓库目录写权限
   - npm registry 网络连通性（如果本机还没安装依赖）
   - OpenClaw Gateway
   - `openclaw.json`
   - OpenClaw 会话 / 运行时数据
   - `CODEX_HOME`
   - 订阅 / 账单快照
   - OpenClaw 当前依赖的 provider / 凭证是否已经由 OpenClaw 自己配置妥当（只检查是否存在，不要打印 secret）
5. 如果机器上存在多个候选 `OPENCLAW_HOME`、多个可能的 Gateway，或多个 workspace，不要猜。优先选择“当前正在运行的 Gateway + 可读 `openclaw.json` + 与当前项目最匹配”的组合；如果仍然无法确定，就停止并把候选项列出来。
6. 如果缺少会导致“完全无法启动控制中心”的必要路径、进程或文件，例如 `node` / `npm` 缺失、npm 无法下载依赖、仓库不可写、OpenClaw 根目录不可读，不要猜，直接停止并明确告诉我缺什么。
7. 如果缺少的只是增强型数据源，例如订阅快照、Codex telemetry、部分运行时文件，或者机器根本不是用订阅而是 API key/provider 方式运行，不要停止安装；继续并把这些项标记为“安装可继续，但相关页面会部分缺失”。
8. 不要假设任何固定 agent 名称。若 `openclaw.json` 可读，就以它为准；若不可读，再回退到运行时可见 agent，并明确说明可信度下降。

第二阶段：安装项目
9. 确认当前目录是 control-center 仓库根目录。
10. 先确认仓库本体完整。至少检查这些路径真实存在：
   - `package.json`
   - `src/runtime`
   - `src/ui`
   - `.env.example`
11. 如果缺少 `src/runtime`、`src/ui` 或 `package.json`，不要继续安装，也不要猜源码去哪了。直接把它判定为“错误仓库 / 不完整 checkout / 错误工作目录”，并执行：
   - 退出当前错误目录
   - 重新 clone：`https://github.com/TianyiDataScience/openclaw-control-center.git`
   - 进入新 clone 的仓库根目录后再继续
12. 运行依赖安装。
13. 如果 `.env` 不存在，就从 `.env.example` 创建；如果存在，就在保留安全默认值的前提下修正它。不要删除用户已有的无关安全配置，只改这次接线真正需要的项。

第三阶段：配置安全首次接入
14. 保持这些值：
   - READONLY_MODE=true
   - LOCAL_TOKEN_AUTH_REQUIRED=true
   - APPROVAL_ACTIONS_ENABLED=false
   - APPROVAL_ACTIONS_DRY_RUN=true
   - IMPORT_MUTATION_ENABLED=false
   - IMPORT_MUTATION_DRY_RUN=false
   - UI_MODE=false
15. 只有在本机环境确实不同的时候，才修改：
   - GATEWAY_URL
   - OPENCLAW_HOME
   - CODEX_HOME
   - OPENCLAW_SUBSCRIPTION_SNAPSHOT_PATH
   - UI_PORT
16. 如果这台机器是通过 provider API key / 自定义 LLM 提供商运行 OpenClaw，而不是通过 Codex / GPT 订阅运行，不要把这当成错误；只要 OpenClaw 自己能工作，就继续安装，并明确说明订阅额度与部分 provider-specific 卡片可能不可见。
17. 如果 `CODEX_HOME` 不存在，或者这台机器根本没有 Codex / GPT 订阅数据，不要强行填假路径；保留为空，并在结果里明确说明“Usage / Subscription 将部分可见或不可见”。
18. 如果订阅快照不存在，不要伪造 `OPENCLAW_SUBSCRIPTION_SNAPSHOT_PATH`；继续安装，并明确说明订阅额度相关卡片会显示未连接或估算状态。
19. 如果 `4310` 被占用，选择一个空闲本地端口并写入 `UI_PORT`，然后把新地址明确告诉我。
20. 不要因为我的 agent roster 和示例仓库不同就改应用逻辑；控制中心应该根据我机器自己的 OpenClaw 配置和运行时数据来显示 agent。

第四阶段：验证安装
21. 运行：
   - npm run build
   - npm test
   - npm run smoke:ui
22. 如果有任何一步失败，停止并告诉我：
   - 哪一步失败了
   - 原因是什么
   - 我下一步该怎么修
23. 如果 build / test / smoke 通过，但 live Gateway 仍不可达，也不要把这次接入判定为失败；要把结果归类为“本地 UI 已可用，但 live 观测尚未接通”。
24. 如果 OpenClaw 自己因为外部 provider 凭证缺失而无法产出实时数据，也不要误判为 control-center 安装失败；要单独归类为“控制中心已装好，但上游 OpenClaw 前置条件未满足”。

第五阶段：交付可启动结果
25. 如果验证通过，输出：
   - 你实际修改了哪些 env 值
   - 最终 `.env` 中哪些值沿用了默认值
   - 我下一步启动 UI 的准确命令
   - 登录页地址
   - 我应该用什么令牌登录（只提示来源，不要打印明文 token）
   - 我应该先打开的 3 个页面
   - 哪些信号如果为空，属于“正常但未接线完全”
   - 哪些能力现在已经可用
   - 哪些能力因为当前机器没有相关数据源而处于降级状态
   - 如果我以后补上订阅 / Codex / Gateway，只需要补哪几个 env 或前置条件
   - 如果当前缺的是 provider API key / 外部凭证 / 上游 OpenClaw 进程，请把它们列为“控制中心外部前置条件”

最后请用这个格式给我结果：
- 环境检查
- 差异与降级判断
- 实际修改
- 验证结果
- 登录方式
- 下一步命令
- 首次打开页面
```
