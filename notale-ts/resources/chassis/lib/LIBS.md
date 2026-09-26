# 本地库使用说明

文件已由宿主交付，不下载、不复制、不修改共享实现。页面从 `assets/lib/` 相对引用，
通过宿主 HTTP 预览。下面是当前打包版本的常用接口，不是最新版本手册。
`el` 表示页面自己创建且已有逻辑尺寸的容器；画面尺寸、字体、颜色沿用底盘和主题接口。

## 按「要做的事」查

JS 用 `<script src="assets/lib/文件"></script>`，CSS 用 `<link rel="stylesheet" href="assets/lib/文件">`。
“前置”列中的脚本必须先加载。全局对象是页面可直接调用的入口。

| 要做的事 | 文件 | 全局对象 | 打包版本 | 前置 |
|---|---|---|---|---|
| 刚体碰撞、摆动、拖拽、约束 | `matter.min.js` | `Matter` | 0.20.0 | — |
| 三维场景、光照材质 | `three.min.js` | `THREE` | r160 / 0.160.1 | — |
| 球面点、弧线、区块 | `globe.gl.min.js` | `Globe` | 2.32.0 | three |
| 生成式网络背景 | `vanta.net.min.js` | `VANTA` | 0.5.24，只有 NET | three |
| 带坐标轴、图例的常规图表 | `echarts.min.js` | `echarts` | 6.1.0 | — |
| 二维场景、拖拽、命中检测 | `konva.min.js` | `Konva` | 10.3.1 | — |
| 数据绑定、矢量图形、节点连线 | `d3.min.js` | `d3` | 7.9.0 | — |
| 大量二维对象同时运动 | `pixi.min.js` | `PIXI` | 7.4.2 | — |
| 属性动画、路径描绘 | `anime.min.js` | `anime` | 3.2.2 发行构建 / v3 API | — |
| 时间线编排 | `gsap.min.js` | `gsap` | 3.12.5 | — |
| 动画绑定滚动位置 | `ScrollTrigger.min.js` | `ScrollTrigger` | 3.12.5 | gsap |
| 播放矢量动画文件 | `lottie.min.js` | `lottie` | 5.12.2 | — |
| 伪三维插画 | `zdog.min.js` | `Zdog` | 1.1.3 | — |
| 指针倾斜效果 | `vanilla-tilt.min.js` | `VanillaTilt` | 1.8.1 | — |
| 进入视野时淡入 | `aos.js` | `AOS` | 2.3.4 | — |
| 数学公式排版 | `katex.min.css` + `katex.min.js` | `katex` | 0.18.4 | CSS 与 JS 一起引 |
| 矩阵乘法、求逆、特征分解 | `ml-matrix.umd.js` | `mlMatrix` | 6.15.0 | — |
| 有种子的随机序列 | `seedrandom.min.js` | `Math.seedrandom` | 3.0.5 | — |
| 实时训练小型二分类网络 | `mlp.js` | `MLP` | 自家固定实现，无版本号 | — |
| 预训练模型、卷积、GPU 大矩阵 | `tf.min.js` | `tf` | 4.22.0 | — |

## 物理与三维

### Matter

`const engine = Matter.Engine.create()`；用 `Matter.Bodies.circle(x,y,r)`、
`Matter.Bodies.rectangle(x,y,w,h,{isStatic:true})` 创建刚体，
`Matter.Composite.add(engine.world, bodies)` 加入世界。
`Matter.Engine.update(engine, dtMs)` 推进，读取 `body.position`、`angle` 绘制；
`Matter.Body.setPosition/setVelocity` 修改状态，`Matter.Constraint.create` 创建约束。
位置是模拟坐标，时间步是毫秒；不要同时使用自己的 update 循环和 `Runner.run` 重复推进。
指针来自屏幕时先换算为舞台逻辑坐标。

### Three

`new THREE.Scene()`、`new THREE.PerspectiveCamera(fov,aspect,near,far)`、
`new THREE.WebGLRenderer({antialias:true,alpha:true})`；
`renderer.setSize(w,h)` 后把 `renderer.domElement` 放入容器。
`new THREE.Mesh(geometry,material)` 加入 scene，`renderer.render(scene,camera)` 绘制；
用 `Raycaster.setFromCamera(pointer,camera)`、`intersectObjects` 做命中检测。
本版使用 `renderer.outputColorSpace = THREE.SRGBColorSpace`，不是旧的 outputEncoding。
OrbitControls、GLTFLoader 等 addons 不在这个单文件中；不要假设它们是 THREE 的成员。
销毁不再使用的 geometry、material 和 renderer；WebGL 不代替算法状态。

### Globe

`const globe = Globe()(el).width(w).height(h)`；
`globe.pointsData([{lat,lng,size}]).pointAltitude('size')`，
`globe.arcsData([{startLat,startLng,endLat,endLng}])`。
`globe.pointOfView({lat,lng,altitude}, durationMs)` 移动视角，
`globe.onPointClick(fn)` 接收交互。
角度是经纬度；纹理和 GeoJSON 不随库交付，只能引用已交付本地资源。
不需要地理贴图时可直接设置 `globe.globeMaterial().color`。

### Vanta NET

`const effect = VANTA.NET({el,THREE,color:0x335577,backgroundColor:0x112233})`；
`effect.setOptions({...})` 更新，`effect.destroy()` 释放。
这里只打包 NET，不存在 WAVES/BIRDS 等效果。它是背景效果，不是数据或算法计算结果。

## 二维图形与图表

### ECharts

```js
const chart = echarts.init(el, null, {renderer:'svg'});
chart.setOption({
  textStyle:{fontSize:16},
  xAxis:{type:'category',data:labels,axisLabel:{fontSize:14}},
  yAxis:{type:'value',axisLabel:{fontSize:14}},
  series:[{type:'line',data:values}]
});
```

`chart.setOption(options)` 更新数据，`chart.on('click',fn)` 接收事件，
`chart.resize()` 响应容器尺寸变化，`chart.dispose()` 释放。
页面使用 SVG renderer；普通标签、图例、tooltip 显式设置可读字号，纯数字刻度可用12px。
颜色、线宽和字体从主题取值，不把默认皮肤当成主题。

### Konva

`const stage = new Konva.Stage({container:el,width:w,height:h})`；
`const layer = new Konva.Layer()`，`stage.add(layer)`；
`layer.add(new Konva.Circle({x,y,radius:20,fill:color,draggable:true}))`。
节点 `on('dragmove',fn)`、`position()`，批量改动后 `layer.batchDraw()`。
`stage.getPointerPosition()` 已返回容器逻辑坐标，不再除一次底盘缩放；
节点局部坐标可用 `node.getRelativePointerPosition()`。
主要文字用邻近 DOM 标签；图内短标注若用 Konva.Text，须显式设置字体和字号。
`stage.destroy()` 释放。不要再给其 canvas 套 Deck.fit。

### D3

`d3.select(svg).selectAll('circle').data(rows,d=>d.id).join('circle')` 创建/更新节点，
`.attr('cx',d=>x(d.value))` 编码数据。
`d3.scaleLinear().domain([lo,hi]).range([left,right])`、
`d3.scaleBand().domain(labels).range([left,right])` 创建比例尺；
`d3.axisBottom(x)` 生成坐标轴，`d3.line().x(...).y(...)` 生成路径。
v7 事件处理是 `(event,d)=>...`，不是 d3.event。
`d3.pointer(event,svg)` 得到 SVG 局部坐标；有自己的坐标变换时不要再重复换算。

### PixiJS

`const app = new PIXI.Application({width:w,height:h,backgroundAlpha:0})`；
`el.appendChild(app.view)`，`app.stage.addChild(sprite)`。
`new PIXI.Graphics().beginFill(color).drawCircle(0,0,20).endFill()` 创建图形；
`PIXI.Sprite.from(localImagePath)` 创建精灵，`app.ticker.add(delta=>...)` 更新。
本版是 v7 的同步构造与 app.view，不是 v8 的 await app.init()/app.canvas。
交互对象设置 `eventMode='static'`，监听 `pointerdown` 等事件；
`app.destroy(true,{children:true})` 释放。不要再用 Deck.fit 缩放 app 的 canvas。

## 动画与效果

### anime

`anime({targets:el,translateX:[0,100],duration:600,easing:'easeInOutQuad'})`；
也可对普通状态对象数值做动画，在 update 中重绘。
`anime.timeline({autoplay:false}).add({...})` 返回可 play/pause/seek 的时间线；
`anime.remove(target)` 移除目标动画。
这是 v3 的 anime({...})，不是 v4 的 animate()。不要同时由两个循环修改同一属性。

### GSAP / ScrollTrigger

`const tl = gsap.timeline({paused:true})`；
`tl.to(state,{x:100,duration:1,onUpdate:draw})` 添加动画，
`tl.play()/pause()/seek(seconds)/kill()` 控制播放，duration 单位是秒。
ScrollTrigger 先 `gsap.registerPlugin(ScrollTrigger)`，再
`ScrollTrigger.create({trigger:el,start:'top center',onEnter:fn})`。
固定 slides 舞台不可滚动，不为使用插件而增加滚动；一般用时间线或底盘步骤。

### Lottie

`const animation = lottie.loadAnimation({container:el,renderer:'svg',loop:false,autoplay:false,animationData:data})`。
也可用 `path` 指向已交付的本地动画 JSON；库本身没有动画素材。
`animation.play()/pause()/goToAndStop(frame,true)/destroy()` 控制。
素材播放不是实时算法模拟，不能用预录动画冒充计算结果。

### Zdog

`const illo = new Zdog.Illustration({element:canvas,dragRotate:true})`；
`new Zdog.Box({addTo:illo,width:80,height:80,depth:80,color})` 加入对象，
修改 rotate/translate 后调用 `illo.updateRenderGraph()`。
它是伪三维插画，不提供真实光照或物理；dragRotate 本身不构成有效学习交互。

### VanillaTilt / AOS

`VanillaTilt.init(el,{max:10,speed:300})`；
`el.vanillaTilt.destroy()` 释放。只作局部装饰，不承载模型状态。
AOS 使用 `data-aos`、`AOS.init({once:true})`、`AOS.refresh()`。
本包只有 AOS JS，没有配套 aos.css；未定义相应 CSS 就不会产生动画。
固定舞台没有滚动进入视野的过程，通常不需要 AOS。

## 数学、随机与神经网络

### KaTeX

同时引用 `katex.min.css` 和 `katex.min.js`；
`katex.render('x^2',el,{throwOnError:false})` 渲染。
当前 CSS 已内嵌字体，不要再下载另一份 CSS/字体目录；未打包 auto-render 插件。
公式继承实际使用的字体尺寸：简单公式可用16px；分式叠加上下标时基准至少20px，
并检查最小字形是否可读，不靠缩小整式塞入布局。

### ml-matrix

`const A = new mlMatrix.Matrix([[1,2],[3,4]])`；
`A.mmul(A).to2DArray()` 返回普通二维数组，`mlMatrix.determinant(A)` 为行列式，
`mlMatrix.inverse(A)` 返回逆矩阵，`new mlMatrix.EigenvalueDecomposition(A)` 做特征分解。
只提供矩阵计算，不画图，也不提供训练循环；小网络训练直接用 MLP。

### seedrandom

`const rng = new Math.seedrandom('page-seed')`；`rng()` 返回 [0,1) 的数。
保留局部 rng，不覆盖全局 Math.random。重置时重新用同一 seed 创建 rng。
需要复现的数据必须使用同一随机源；给初始化设种子不等于整个训练过程都可复现。

### MLP

自家实现支持任意输入维度、任意层数、单 sigmoid 输出的二分类；损失是交叉熵。
不支持多分类、回归、CNN、动量或 Adam。样本为 `{x:[...],t:0或1}`；
输入长度等于 sizes[0]，最后一层大小为1。

```js
const net = MLP.create({sizes:[2,10,1],act:'tanh',lr:0.3,seed:1});
net.step(train,16);                    // 一次 mini-batch，不是一个 epoch
const {loss,acc} = net.evaluate(test); // acc 为 0..1；test 不参与训练
const probability = net.predict([x,y]); // 0..1，和指标使用同一个 net
const field = net.field(x0,y0,x1,y1,nx,ny); // 可加第7参 Float64Array 复用输出
const levels = net.activationLevels(); // 数组：每层平均绝对激活值
net.reset();                          // 重新初始化权重，外部数据/页面历史自行重置
```

- act 可选 tanh/relu/sigmoid；`net.lr` 可修改学习率；`net.iter` 是已更新的 batch 数。
  配置 `wmax` 是数值发散阈值，默认1e4；step/reset 返回 net，便于连续调用。
- field 长度 nx*ny，索引 j*nx+i；x 从 x0 到 x1，y 从 y0 到 y1，含端点。
  数学坐标 y 向上、canvas y 向下时只反转一次；不能只翻散点而不翻热力场。
- predict/field/evaluate 都会更新层激活缓冲；levels 反映最近一次前向传播的输入，
  不是整个数据集的平均。要展示指定样本，先 predict 该样本再读 levels。
- `net.layers[i]` 的 `nin/nout` 是层尺寸；`W[j*nin+k]` 是输入 k 到输出 j 的权重，
  `b[j]` 为偏置，`a[j]` 为最近一次前向激活。绘图只读这些缓冲，不改权重凑图形。
- `net.diverged` 表示 NaN/Inf 或权重超限等数值发散；它不判断是否学会。
- seed 控制权重初始化；当前训练打乱使用 Math.random，因此不能承诺完整训练轨迹复现。
  使用固定 seed 时 reset 恢复初始权重；不设 seed 则重新随机初始化。
  它不自动重置页面数据、指标历史或全局随机序列。

### TensorFlow.js

用在预训练模型、卷积或大矩阵，不用它替代 MLP 的小型逐批训练。
`await tf.ready()` 后可 `tf.loadLayersModel(localModelJson)` 或
`tf.sequential({layers:[tf.layers.dense({units:1,inputShape:[2],activation:'sigmoid'})]})`。
训练先 `model.compile({optimizer:tf.train.sgd(lr),loss:'binaryCrossentropy'})`，
再 `await model.fit(xs,ys,{epochs:1})`；预测 `model.predict(xs)` 返回 Tensor。
同步临时计算放进 `tf.tidy(()=>...)`；异步训练的 xs/ys、持久预测结果用完显式 dispose。
tf.tidy 不接受异步函数。模型 JSON 和权重分片须本地交付，库自身不包含预训练权重。
