# 读懂一幅神像

状态：pending-user-review；promoted: false。

原作：https://pudding.cool/2022/06/aztec-gods/ 。完整源码浅克隆：`../../sources/aztec-gods/`，https://github.com/the-pudding/aztec-gods ，commit `7dc6fda520fcfba0a15fe45bdb0a2d4e48dfc1f5`。

## 原作视觉与源码研究

亲自查看原页面的图像学说明、拆解插画以及 Tlaltecuhtli 的头发局部高亮（`../../evidence/aztec-gods/original-6500.png`）。进一步滚动到 Tezcatlipoca 鼻饰段落，亲自查看 `detail-nose.png`，确认原作使用完整图像加低透明背景和红色椭圆强调细节。并非凭截图文件名或搜索摘要挑选。

研究 `ScrollyTlalte.svelte`、`ScrollyTezca.svelte` 到 `Tlalte.svelte` / `Tezca.svelte`，最终到 `ScrollableImage.svelte`、`MaskedImage.svelte` 和 `setup/iconographySetup.js`。原作以 scrollama 在视口中点切换说明；SVG 的 image 引用 PNG，mask 中白底透明度 0.1，椭圆为白色全亮区，外轮廓描边 40，以 5320×5320 作为坐标系。

## 保留与改动

完整复制两幅 1064×1064 原 PNG（Tlaltecuhtli 与 Tezcatlipoca），以及 42×31 的 ezpitzal 小图。坐标模块和 doc.json 原封不动复制，5 个文件均带来源、大小和 SHA-256。保留全部 6+11=17 个讲解状态与英文正文，包括原文明确标记“本插画中缺席”的 ezpitzal；此小图仅在相应说明中显示，不补画进神像。

mini 保留原遮罩坐标、透明度、红色轮廓和 700ms 几何过渡，把滚动选段改为主题按钮、前后项和两幅图切换；增加临时查看完整插画，再回到当前局部。按钮切换不省略多区域遮罩，extra mouths 的五个圈完整保留。页面标题和操作为中文，说明原文为英文，图像出处及 Codex Borgia 链接保留。手机采用纵向阅读，原图完整显示。

这里 SVG 只承担原作已有的 PNG 遮罩；没有把原插画重画成简化 SVG。未纳入 137 个神像的整个 Pantheon 浏览器或开篇的虚构神像示例，因为它们是其他模块，不冒充本次两图讲解的覆盖范围。

原仓库此 commit 没有找到 LICENSE 文件，故提供事实性的 SOURCE-NOTICE.md，未虚构 MIT 或其他许可。插画与文字署名 Gwendal Uguen，原作代码 Luc Guillemot。此候选研究不赋予新许可。

## 复核

`node ../../tools/check-iconography.cjs` 在 1600×900、1280×720、390×844（reduced-motion）下逐一操作全部 17 个状态，对照原坐标模块全部 cx/cy/rx/ry 乘 5320 的数值和遮罩数量；正文 textContent 与原 doc 条目一致。检查前后边界、切图重置、键盘完整图切换及还原、五区遮罩、无水平溢出/页面异常。全部 3 PNG 在浏览器实际解码，5 个源文件逐字节及哈希比对一致。

亲自查看本地桌面五区域高亮和手机鼻饰状态：红圈与原图细节相符，背景原图仍可见，手机下没有裁掉原图。截图保存在 `shots/`，结果在 `../../evidence/iconography-candidate-checks.json`。没有独立考证宗教图像学解释，也没有把几何核对说成历史事实核验。
