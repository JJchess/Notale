# 作废的第一版设计

`schema.py` / `views.py` / `example.py` / `EXAMPLE.md` / `test_schema.py` / `DESIGN.md`

这一版把领域结构**设计**成了 Deck / Segment / PagePlan,字段(role、budget、libs、
establishes/assumes)是推理出来的,不是从证据里长出来的。nn-06 跑完之后逐字段比对,
发现:

  · role          它从没分过类,20 页没有一页需要
  · budget / libs 放错了层,实际在 CONTRACT.md 里全局定,不随页变化
  · establishes / assumes  方向反了。实际用的是「独占」+ 全局归属表,
                  防的是「同一件事讲三遍」,不是「后面的页不知道前面定义了什么」
  · 完全漏掉    共享计算模块(Lec.P / Lec.K)+「不许写死数字」这条硬规矩,
                  那才是跨页数值一致性的真正机制

现行版本是 core/artifacts.py,格式全部从 lab/derived-nn-06/ 里的真实产物量出来,
并用无损 round-trip 验证。wire.py / trace.py 不属于这一版,继续用。

留着是为了对照,不要引用。
