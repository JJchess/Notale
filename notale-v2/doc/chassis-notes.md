# 底盘维护说明

本文件不注入 Builder。创作接口见 `vendor/chassis/CHASSIS.md`。

- Check 核对基础资源是否引入并生效、舞台逻辑尺寸及居中等比缩放。缺资源时恢复引用，不靠改主题或页面布局补偿。
- 截图等待 `document.fonts.ready`，但该 Promise 不证明没有缺字或字体 fallback。不能以服务器安装字体、CSS family 字符串或字体请求成功作为跨机器渲染一致的证据。
- 代码工作台不加载共享主题；其界面和运行契约独立维护。
