# 旧原生模板工具

2026-09-10 从根目录 `tools/` 成组归档。用于 `refs/template/organized` 的历史模板重建、矢量描摹与视觉调参，不进入当前 notale-v2 Planner / Director / Builder 链路。

保留原实现，仅调整迁移后的工具互引和仓库根定位；不自动运行、不改旧模板产物。从 Notale 仓库根手动使用：

```sh
node legacy/native-template-tools/build-native-templates.mjs
python3 legacy/native-template-tools/check-native-templates.py
```

这些命令会重建产物或启动浏览器，归档时未执行。其历史环境依赖和浏览器路径不在本轮升级范围。
