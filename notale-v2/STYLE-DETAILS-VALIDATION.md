# 风格详情与字体交付 · 2026-09-08

本轮接续 baseline `c0e8bd11` 后的 Style Director 升级；不回写旧 run，不更改并行的 Planner/Builder 模型配置，没有新增角色或主题编译器。

## 已交付

- 40 项轻索引：ID、名称、简述、详情链接。默认不注入八张概览或系统 465 个字体名称。
- 40 份独立 Markdown 详情：逐项识别特征、五类中英字体角色、字重/字姿与混排、构图、材质、配色、边界和原图来源。字体搭配是项目设计判断，不冒称截图原字体。
- 明确匹配条目直接预载详情；其他情况由同一 Director history 中的 Read 返回详情＋原图＋相关原生字体声明；同轮可读多个条目。
- 19 家族、25 个原始字体文件，总计 118,358,472 字节（约 112.9 MiB）。上游版本、SHA-256、真实字体 metadata 与授权均留档。Noto 使用上游 SC 分发版，不依赖服务器安装的 CJK family 名称。
- CSS 引用的库内字体才复制进 run，随附授权和上游 notices；既有资源冲突和路径越界报错。导入复用保留字体授权，不要求调用模型或访问全局字体库。
- 主要字体用独立 CSS 别名及本地文件，不用 local() 或 CDN。Builder 提示词补上字体加载后再做 Canvas 测量/绘制的要求。

## 可直接查看

- [40 项中英字体样张](http://localhost:4177/runs/notale-v2/style-fonts-0908/)
- [四个真实 Director 主题测试页](http://localhost:4177/runs/notale-v2/style-details-0908a-audit/)
- [完整风格索引](references/styles/INDEX.md) · [字体来源与授权](vendor/fonts/README.md)

第一组是确定性字样测试，不是 40 套生成作品。第二组 CSS 来自真实 Director，HTML 使用相同固定文字和排布，不冒充四个 Builder 成品。

## 验证证据

### 资料、资源与回归

40 项 ID/详情/裁图对应，所有角色引用文件与授权存在；校验字体哈希、实际 family/字重及样本文字覆盖。单测覆盖轻索引无图、明确风格预载、多项 Read 的连续上下文、按引用复制、文件冲突、越界/软链接及自包含复用。

回归命令：

最终确定性回归 135 项通过，原有底盘浏览器测试 2 项通过，新增字体/Canvas 浏览器测试 2 项通过；作用域内 `git diff --check` 通过。

```sh
python3 -B -m unittest test.test_director test.test_style_upgrade test.test_style_fonts test.test_prompts test.test_media test.test_builder test.test_skills test.test_artifacts test.test_check_report test.test_llm_adapters
python3 -B -m unittest test.test_style_browser
python3 -B -m unittest test.test_style_fonts_browser
```

### 40 项字体字样

`scripts/style_font_preview.py` 在阻断外网的 Chromium 中渲染 40 项 × 5 类文字。200 项全部通过：cmap 覆盖样本文字，实际渲染字体均为随包 webfont；无 JS 异常或失败请求。每项截图及实际 glyph-count/family/PostScript 记录保存在 [字体审计](../runs/notale-v2/style-fonts-0908/audit.json)。不是只看 CSS 名称，也不是只看字体请求成功。

### 四个真实主题

冻结题目为中英“知识的形状 / The shape of knowledge”及指数增长。使用已配置 Director 模型 AWS-GPT-5.6-Sol，medium effort，没有新增取图。

| 路线 | 实际响应 | 结果与保留的失败 |
| --- | --- | --- |
| 自动 | 3 | 选配色 → 同轮 Read Swiss 与 Minimalism → 写主题；一次提交通过 |
| 明确手绘＋用户图 | 3 | 预载文楷/Caveat 等资料；两次技术修订后通过 |
| 明确像素＋用户图 | 2 | 实际中文 Fusion Pixel＋英文 Press Start 2P；一次技术修订后通过 |
| 明确时尚编辑＋用户图 | 2 | 实际小薇体＋Bodoni Moda；一次技术修订后通过 |

后三例首稿用了裸 `::selection`，现有作用域检查拒绝；手绘第二稿还用了 Chromium 不支持的 `hanging-punctuation`。沿同一 history 修订，未人工改主题 CSS，不把它们计为一次成功。

共 10 次 Director 响应，输入 106,239 token，输出 35,421 token，缓存读取 40,904 token。数据来自各 run trace，包含重复上下文；未猜测价格。

四页 × 五类文本的实际渲染均为随包字体，位于视口内；没有 JS 异常或失败请求，原生主题校验通过。[逐项证据](../runs/notale-v2/style-details-0908a-audit/audit.json)

### Builder 集成

**2026-09-09 补充：** 已另跑三路真实 Planner / Director → Builder → 浏览器实验，三路均已结束，未人为中断 Builder；0/3 路完整通过、计划 9 页实际交付 4 页。此前“尚未跑完”的状态由这次实测接续，但不能改写为已验收通过。完整失败、数据图错误、字体回退及调用耗时见 [三路端到端记录](STYLE-E2E-0909-VALIDATION.md)。

首个测试脚本把页号传成 `page-01`，而 brief 构造器需要 `01`；随后发现测试准备漏了完整底盘。两次均在模型调用前失败，属于测试脚本错误，不归因给 Builder 模型。已改为正确页号并使用正常 `planner.seed()`。失败输入和 manifest 保留在 `style-details-0908a-hand`。

使用新 run `style-details-0908b-hand`，复制已经生成的手绘主题与同一页内容，再运行一次正常 Builder；本阶段没有重跑 Director。配置仍为 `sonnet5-low`、mini＋aux、视觉输入开启。实际完成 3 次响应（读取参考），在预设 420 秒内没有写出页面，父进程超时终止；没有继续补跑，不能声称 Builder 端到端通过。[失败记录](../runs/notale-v2/style-details-0908b-hand/style-detail-result.json)

因此本轮结果是：详情读取与字体交付实现、200 项字样及四个实际主题通过；真实 Builder 页面集成尚未通过。独立字体/Canvas 浏览器测试证明加载机制，不替代失败的模型页面测试。测试脚本现已补上结构化超时记录，保留这次旧脚本的退出记录。

## 明确边界

- 40 份资料和样本字形检查不代表 40 种模型生成质量全部通过。
- 完整 CJK TTF 较大；本轮没有静态/动态子集编译链，复制到 run 的体积与浏览器实际请求体积分别计算。
- 没有验证所有 Unicode 字符、全部浏览器/操作系统或所有字体搭配。用户特殊字形仍需按实际内容检查。
- 四个主题未人工改 CSS，但仍可有混排字重、字距和材质上的审美问题。手绘示例的语言分支只匹配部分显式 lang；已补提示词要求 :lang(zh) 覆盖继承/地区标签及真实字重，未为这一提示改动重跑整组模型。
- 不引入审美评分/配色阈值，不优化代码页，不更改历史截图或旧主题。

复现：`scripts/fetch_style_fonts.py`（固定上游资源）、`scripts/style_font_preview.py`（无模型）、`scripts/style_detail_smoke.py`（付费调用）、`scripts/style_detail_audit.py`（无模型）。
