"""shell —— L4 专能 Hermes 外壳(对话式做讲义)。Pipeline B。

有界 ReAct 主循环 + 工具集 + 委派 + 会话末自演化。依赖 schema+ports+domain + 共享 `engine`
(经 tools/make 造 deck),只认接口不认实现(禁 import adapters)。不 re-export 引擎符号——
建 deck 引擎在 `lecture_agent.engine`,按需从那里 import。
"""
