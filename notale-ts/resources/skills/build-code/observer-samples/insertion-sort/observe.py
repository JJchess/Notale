"""观察真实的相邻交换；保留元素身份，重复值不混淆。"""
slots = None
original = []


def observe(context):
    global slots, original
    if context.function != "insertion_sort":
        return None
    loc = context.locals
    values = loc["values"]
    text = context.source["text"].strip()
    i, j = loc.get("i", 0), loc.get("j", 0)
    if slots is None:
        original = list(values)
        slots = list(range(len(values)))
        stage = "initial"
    elif context.event == "return":
        stage = "done"
    elif context.event != "line":
        return None
    elif text == "j = i":
        stage = "select"
    elif text == "while j > 0 and values[j - 1] > values[j]:":
        stage = "compare"
    elif text == "values[j - 1], values[j] = values[j], values[j - 1]":
        slots[j - 1], slots[j] = slots[j], slots[j - 1]
        stage = "swap"
    else:
        return None
    if context.event == "return":
        stage = "done"
    will_swap = j > 0 and values[j - 1] > values[j] if stage == "compare" else None
    settled = stage == "compare" and not will_swap
    return {
        "stage": stage,
        "items": [{"id": identity, "value": values[index], "index": index}
                  for index, identity in enumerate(slots)],
        "original": original,
        "active": j - 1 if stage == "swap" else j,
        "pair": [j - 1, j] if stage in ("compare", "swap") and j > 0 else [],
        "prefix": len(values) if stage == "done" else
                  min(1, len(values)) if stage == "initial" else i + 1 if settled else i,
        "settled": settled or stage in ("initial", "done"),
        "will_swap": will_swap,
    }
