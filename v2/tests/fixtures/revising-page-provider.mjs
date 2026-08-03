let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const payload = JSON.parse(input);
  const id = payload.page.id;
  const broken = payload.attempt === 0;
  const extra = broken ? '<div class="overflow">故意越界</div>' : '';
  const css = `
    [data-page-id="${id}"]{box-sizing:border-box;width:1440px;height:900px;padding:80px;overflow:hidden;background:#08101A;color:#F4F8FC;font-family:system-ui;text-align:left}
    [data-page-id="${id}"] h2{margin:0;font-size:54px;line-height:1.2}
    [data-page-id="${id}"] p{font-size:24px;line-height:1.5;color:#DCE7F5}
    [data-page-id="${id}"] .overflow{position:absolute;left:1510px;top:100px;width:200px;height:100px;font-size:24px}
  `;
  process.stdout.write(JSON.stringify({
    html: `<section data-page-id="${id}"><style>${css}</style><h2>${payload.page.title}</h2><p>${payload.page.purpose}</p>${extra}</section>`,
  }));
});
