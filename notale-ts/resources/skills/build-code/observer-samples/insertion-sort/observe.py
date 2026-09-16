"""观察真实的比较与相邻交换；保留元素身份，重复值不混淆。"""
slots = None
original = []
current = 0     # 正在归位的元素下标 i；j 只会在换到下一个元素时变大


def frame(values, stage, j, will_swap=None):
    settled = stage == "compare" and not will_swap
    return {
        "stage": stage,
        "items": [{"id": identity, "value": values[index], "index": index}
                  for index, identity in enumerate(slots)],
        "original": original,
        "active": j - 1 if stage == "swap" else j,
        "pair": [j - 1, j] if stage in ("compare", "swap") and j > 0 else [],
        "prefix": len(values) if stage == "done" else
                  min(1, len(values)) if stage == "initial" else current + 1 if settled else current,
        "settled": settled or stage in ("initial", "done"),
        "will_swap": will_swap,
    }


def observe(context):
    global slots, original, current
    local = context.locals
    if context.function == "insertion_sort" and context.event == "call":
        original = list(local["values"])
        slots = list(range(len(original)))
        current = 0
        return frame(local["values"], "initial", 0)
    if context.event != "return" or slots is None:
        return None
    if context.function == "should_swap":
        j = local["j"]
        if j > current:
            current = j
        return frame(local["values"], "compare", j, bool(context.return_value))
    if context.function == "swap":
        j = local["j"]
        slots[j - 1], slots[j] = slots[j], slots[j - 1]
        return frame(local["values"], "swap", j)
    if context.function == "insertion_sort":
        return frame(context.return_value, "done", 0)
    return None
