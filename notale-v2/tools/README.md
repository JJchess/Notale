# 按工具归属组织的实现

这里只整理现有实现，不改变工具名、schema、执行顺序、参数默认值、返回格式、权限、错误处理或重试。迁移前生产版本：`def3afb2`。

各工具的 schema 与主实现放在 `tool.py`；`__init__.py` 仅保留包说明，不承载实现或可变状态。调用方直接导入 `from tools.<name> import tool as <name>`，专用的 `code.py`、`style.py`、`director.py`、`planner.py` 保持独立。

| 目录 | 对模型的工具名与职责 |
| --- | --- |
| `read/` | Read：文件与样本读取；`style.py` 单独保留 Director 的风格详情读取 |
| `write/` | Write：页面文件写入；`director.py` 和 `planner.py` 分别保留原有提交语义 |
| `edit/` | Edit：唯一匹配／全部匹配替换 |
| `patch/` | Patch：批量替换及原有失败记录 |
| `bash/` | Bash：原工作目录、输出和超时约定 |
| `check/` | Check：视觉检查、截图和报告；`code.py` 为代码工作台检查 |
| `image_search/` | ImageSearch：现有搜索、候选解析与下载 |
| `image_gen/` | ImageGen：子进程入口与原样迁入的 `gen.py` |
| `code_scaffold/` | CodeScaffold：固定工作台安装、课程文件初始化及 lesson 边界辅助函数 |
| `finalize_plan/` | FinalizePlan：Planner 定稿提交；角色循环与页表业务校验仍在 core |
| `shared/` | 共享结果类型、图片处理、路径边界和素材来源处理 |

`runtime.py` 保留静态工具列表、原有权限与派发顺序、异常回传、结果截断和共享媒体返回处理。不使用插件注册、自动发现或新的工具协议。

`read.SAMPLE_SHOTS` 和 `check.TEXT_REPORT` 各有唯一状态源，由 Builder 设置。工具专用测试在实际实现模块上打 mock，不使用旧模块兼容壳。

## 资源与 CLI

- `--skills` 名称、默认目录和自定义目录语义不变：内置 tools 根定位到 `image_gen/gen.py`；外部自定义根仍定位到 `make-illustration/scripts/gen.py`。这是旧 CLI 的路径契约，不是保留一份旧实现。
- ImageGen 仍是 subprocess 调用，参数、超时、服务端配置、结果文件和生成脚本内容不变。
- `--chassis` 中的 selfcheck 与底盘资源、vendor 中的代码工作台及其 check 脚本保持原位；它们是随 run 分发的资源，不复制第二份到此目录。
- core 继续维护角色编排和业务规则；工具专用入口调用原有规则，不重写或统一不同角色的含义。
