# ECharts Recipe

Use this recipe for conventional statistical charts. The chassis provides ECharts 6.1.0 as a UMD global.

## Initialize correctly

```html
<script src="assets/lib/echarts.min.js"></script>
```

```js
const host = document.querySelector('[data-chart]');
const chart = echarts.init(host, null, { renderer: 'svg' });
chart.setOption({
  animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
  textStyle: { fontSize: 16 },
  legend: { textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis', textStyle: { fontSize: 16 } },
  xAxis: { name: 'Time (s)', axisLabel: { fontSize: 14 } },
  yAxis: {
    name: 'Distance (m)',
    nameTextStyle: { fontSize: 14 },
    axisLabel: { fontSize: 12 }
  },
  series: [{ type: 'line', data: values, showSymbol: true }]
});
```

Always pass `renderer: 'svg'`. Canvas hides chart text from the typography and accessibility checks. Keep prose labels at least 14px, tooltip text at least 16px, and purely numeric ticks at least 12px.

## Keep state explicit

- Keep the canonical records outside ECharts options.
- Derive `series`, domains, annotations, and selected items from one state object.
- Update the existing instance with `setOption(nextOption, { notMerge: true })` when the representation changes.
- Give categories stable names and series stable `id` values.
- Disable random animation delays. Set explicit durations only when change over time teaches something.
- On Reset, replace the full state and call the same render function.

## Preserve statistical truth

- Include units in axis names, tooltip values, and nearby readouts.
- Use a zero baseline for bars unless the page explicitly explains the exception.
- Use `null` for missing observations; do not interpolate silently.
- Keep identical domains when readers must compare panels.
- Show uncertainty with error bars, bands, ranges, or explicit notes.
- Do not use pie charts when precise comparison or many categories matter.

## Make interaction accessible

- Put filters, toggles, and mode controls in semantic DOM outside the chart.
- Mirror the focused or selected value into a DOM status element.
- Offer a compact table or ordered list containing the evidence for the conclusion.
- Avoid relying on the built-in hover tooltip as the only route to a value.

## Resize and clean up

```js
const observer = new ResizeObserver(() => chart.resize());
observer.observe(host);

function cleanup() {
  observer.disconnect();
  chart.dispose();
}
```

Do not create a new chart inside the observer or state renderer. Check `echarts.getInstanceByDom(host)` before initializing code that may run twice.

## Smoke

- Assert `echarts.getInstanceByDom(host)` exists.
- Confirm the SVG contains rendered marks and readable text.
- Change one control and confirm the series data and DOM readout change.
- Reset twice and compare the option data and ordering.
- Resize the host and verify the chart still fills it without clipped labels.
