function adjacentInversions(items) {
  return items.slice(1).filter((value, index) => items[index] > value).length;
}

function initialStep(filename, items, annotation, extraMetrics) {
  return {
    sequence: 0,
    source: { file: filename, line: 1, column: 1 },
    kind: "sequence",
    state: { label: "numbers", items: [...items] },
    focus: [],
    changes: [],
    metrics: {
      "规模": items.length,
      "相邻逆序": adjacentInversions(items),
      ...extraMetrics,
    },
    annotation,
  };
}

const examples = {
  bubble: initialStep(
    "bubble_sort.py",
    [42, 18, 67, 9, 55, 31, 73, 24, 60, 12],
    "初始数组；运行后观察较大值如何逐轮移动到右侧。",
    { "固定后缀": 0 },
  ),
  selection: initialStep(
    "selection_sort.py",
    [64, 25, 12, 22, 11, 48, 36, 7, 51, 19],
    "初始数组；运行后观察最小值如何被选中并放到当前边界。",
    { "固定前缀": 0 },
  ),
  insertion: initialStep(
    "insertion_sort.py",
    [38, 17, 43, 3, 29, 51, 9, 26, 14, 35],
    "初始数组；运行后观察元素如何进入左侧有序前缀。",
    { "有序前缀": 1 },
  ),
};

export const lesson = {
  id: "sorting-runtime",
  title: "Python 排序运行时",
  visualTitle: "排序轨迹",
  visualKicker: "Execution trace",
  learningTarget: "对照实际 Python 源码，观察比较、选择和移动如何改变同一个数组。",
  runtime: "python",
  entry: "bubble_sort.py",
  entryMode: "active",
  files: [
    {
      id: "bubble",
      filename: "bubble_sort.py",
      label: "bubble_sort.py",
      language: "python",
      sourceUrl: "./lesson/bubble_sort.py",
      editable: true,
      visualTitle: "冒泡排序轨迹",
      learningTarget: "观察相邻比较如何把未排序区间中的最大值逐轮推到右侧。",
      initialStep: examples.bubble,
    },
    {
      id: "selection",
      filename: "selection_sort.py",
      label: "selection_sort.py",
      language: "python",
      sourceUrl: "./lesson/selection_sort.py",
      editable: true,
      visualTitle: "选择排序轨迹",
      learningTarget: "观察每一轮如何扫描候选值，并把最小值放到前缀边界。",
      initialStep: examples.selection,
    },
    {
      id: "insertion",
      filename: "insertion_sort.py",
      label: "insertion_sort.py",
      language: "python",
      sourceUrl: "./lesson/insertion_sort.py",
      editable: true,
      visualTitle: "插入排序轨迹",
      learningTarget: "观察右移如何腾出位置，并维持左侧前缀始终有序。",
      initialStep: examples.insertion,
    },
  ],
  traceUrl: "./lesson/trace.py",
  testsUrl: "./lesson/tests.py",
  seed: 17,
  limits: {
    timeoutMs: 5000,
    maxFrames: 3000,
    maxPayloadBytes: 4_000_000,
    maxOutputChars: 80_000,
    maxSourceChars: 200_000,
    maxItems: 160,
    maxDepth: 7,
    maxString: 1200,
  },
  initialStep: examples.bubble,
};

export default lesson;
