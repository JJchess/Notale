<sample id="waveform-air-lab" category="general" variant="full">
  <file path="samples/general/waveform-air-lab/pages/index.html">
```html
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Waveforms · Sound in motion</title><link rel="stylesheet" href="style.css"><body><div id="root"></div><script src="app.js"></script></body></html>
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/main.jsx">
```jsx
import React,{useState,useEffect,useRef} from 'react';import ReactDOM from 'react-dom';
import Waveform from './src/components/Waveform';import WaveformAxis from './src/components/WaveformAxis';import WaveformIntercept from './src/components/WaveformIntercept';import WaveformPlayer from './src/components/WaveformPlayer';import AirGrid from './src/components/AirGrid';import Oscillator from './src/components/Oscillator';import {getPointsForWaveform,convertProgressToCycle} from './src/helpers/waveform.helpers';
const shapes=['sine','triangle','square','sawtooth'],descriptions={sine:'A smooth oscillation with a single frequency. This is the waveform used in the original air-molecule demonstration.',triangle:'A linear rise and fall. Its odd harmonics taper off faster than those of a square wave.',square:'Alternates between the two extremes. The ideal shape has sudden jumps; a physical sound can only approximate them.',sawtooth:'A linear ramp with an abrupt reset. Unlike triangle and square waves, it contains both even and odd harmonics.'};
function App(){const[shape,setShape]=useState('sine'),[amplitude,setAmplitude]=useState(1),[frequency,setFrequency]=useState(1),[playing,setPlaying]=useState(!matchMedia('(prefers-reduced-motion: reduce)').matches),[tracked,setTracked]=useState(true),[phase,setPhase]=useState(0),[volume,setVolume]=useState(.2),[audible,setAudible]=useState(false),[audio,setAudio]=useState(null),[audioError,setAudioError]=useState(''),[width,setWidth]=useState(400);const measure=useRef(),graph=useRef(),grid=useRef(),audioRef=useRef();
useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.max(100,Math.floor(entry.contentRect.width))));observer.observe(measure.current);return()=>observer.disconnect()},[]);
useEffect(()=>{if(audio)audio.master.gain.setTargetAtTime(audible?volume:0,audio.ctx.currentTime,.015)},[audio,audible,volume]);
useEffect(()=>{const f=()=>{if(document.hidden){setAudible(false);setPlaying(false)}};document.addEventListener('visibilitychange',f);return()=>{document.removeEventListener('visibilitychange',f);audioRef.current?.ctx.close()}},[]);
async function sound(){try{let out=audioRef.current;if(!out){const ctx=new(window.AudioContext||window.webkitAudioContext)(),master=ctx.createGain(),filter=ctx.createBiquadFilter(),analyser=ctx.createAnalyser();master.gain.value=0;filter.type='lowpass';filter.frequency.value=5000;filter.gain.value=20;analyser.fftSize=16384;analyser.smoothingTimeConstant=0;master.connect(filter);filter.connect(analyser);analyser.connect(ctx.destination);out={ctx,master,analyser};audioRef.current=out;setAudio(out)}await out.ctx.resume();setAudible(x=>!x);setAudioError('')}catch(e){setAudioError('Audio could not start in this browser. The visual experiment remains available.')}}
function reset(){setShape('sine');setAmplitude(1);setFrequency(1);setPhase(0);setTracked(true);setAudible(false);setPlaying(false)}
useEffect(()=>{window.waveLab={getState:()=>({shape,amplitude,frequency,playing,tracked,phase,audible,volume,width}),getGraph:()=>graph.current,getGrid:()=>grid.current,getAudio:()=>audioRef.current,sourcePoints:getPointsForWaveform};document.body.dataset.ready='true'},[shape,amplitude,frequency,playing,tracked,phase,audible,volume,width]);
return <><header><a href="../../../../../index.html" target="_top">← Samples</a><span>Josh Comeau / The Pudding · 2018</span></header><main><p className="eyebrow">LET’S LEARN ABOUT</p><h1>Waveforms</h1><p className="intro">Sound moves through air. The molecules vibrate in place.<br/>Change the wave, then follow one column of particles.</p><div className="toolbar"><div className="shapes" role="group" aria-label="Waveform shape">{shapes.map(s=><button key={s} aria-pressed={shape===s} onClick={()=>setShape(s)}>{s[0].toUpperCase()+s.slice(1)}</button>)}</div><button id="motion" onClick={()=>setPlaying(!playing)}>{playing?'Pause motion':'Play motion'}</button><button id="reset" onClick={reset}>Reset</button></div>
<WaveformPlayer isPlaying={playing} amplitude={amplitude} frequency={frequency} phase={0} convergence={0}>{v=>{const progress=v.progress+phase/100,offset=convertProgressToCycle(progress);return <div className="panels"><section><h2>Displacement over time</h2><p className="panel-note">A one-second window · blue marks the current displacement.</p><div className="plot-space"><div ref={measure} className="wave-stage"><Waveform ref={graph} shape={shape} size={width} amplitude={v.amplitude} frequency={v.frequency} offset={offset} strokeWidth={5} color="#0380f4"/><WaveformAxis x waveformSize={width} strokeWidth={3} showLabels/><WaveformAxis y waveformSize={width} strokeWidth={3} showLabels/>{tracked&&<WaveformIntercept size={18} color="#0380f4" waveformSize={width} waveformShape={shape} amplitude={v.amplitude} frequency={v.frequency} offset={offset}/>}</div></div></section><section><h2>A field of air molecules</h2><p className="panel-note">26 × 26 particles · blue highlights the first column.</p><div className="air-space"><AirGrid key={width} ref={grid} width={width} height={Math.round(width*.5+10)} numOfRows={26} numOfCols={26} waveformShape={shape} waveformAmplitude={v.amplitude} waveformFrequency={v.frequency} waveformProgress={progress} highlightColumnIndex={tracked?0:null}/></div></section></div>}}</WaveformPlayer>
<div className="controls"><label>Amplitude <output>{amplitude.toFixed(2)}</output><input id="amplitude" type="range" min="0" max="1" step=".01" value={amplitude} onChange={e=>setAmplitude(+e.target.value)}/></label><label>Visual frequency <output>{frequency.toFixed(1)} Hz</output><input id="frequency" type="range" min=".5" max="2" step=".1" value={frequency} onChange={e=>setFrequency(+e.target.value)}/></label><label>Phase offset <output>{phase}% of a cycle</output><input id="phase" type="range" min="0" max="100" step="1" value={phase} onChange={e=>setPhase(+e.target.value)}/></label></div><label className="track"><input id="track" type="checkbox" checked={tracked} onChange={e=>setTracked(e.target.checked)}/> Follow the first column and the blue dot</label>
<div className="sound"><button id="sound" aria-pressed={audible} onClick={sound}>{audible?'Mute sound':'Listen to this wave'}</button><label>Listening volume <input id="volume" type="range" min="0" max=".5" step=".01" value={volume} onChange={e=>setVolume(+e.target.value)}/></label><span>{(frequency*130.81).toFixed(2)} Hz audible tone</span></div>{audioError&&<p role="alert">{audioError}</p>}{audio&&<Oscillator audioCtx={audio.ctx} masterOut={audio.master} shape={shape} frequency={frequency*130.81} amplitude={amplitude} slidePitch/>}
<div className="reading"><section><h2>{shape[0].toUpperCase()+shape.slice(1)} waves</h2><p aria-live="polite">{descriptions[shape]}</p><p>Amplitude controls the amount of displacement. Frequency controls how quickly the pattern repeats. Set amplitude to zero: the curve flattens, the particles stop moving and the tone becomes silent.</p></section><section><h2>A slowed-down model</h2><p>Watch a blue particle: it moves back and forth, rather than travelling across the field. The pattern of vibration moves through the grid. The graph plots displacement vertically; the particles move horizontally.</p><p>The animation is deliberately slow. As in the original, the audible tone uses the visual frequency × 130.81. These dots illustrate oscillation; they are not a simulation of individual molecular collisions or physical distances.</p></section></div></main><footer><a href="https://pudding.cool/2018/02/waveforms/" target="_blank" rel="noopener">Original interactive guide</a> · <a href="SAMPLE.md">Review notes</a><p>Original waveform and particle rendering, typefaces and oscillator. Approved local sample.</p></footer></>}
ReactDOM.render(<App/>,document.querySelector('#root'));
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/AirGrid/AirGrid.helpers.js">
```javascript
// @flow

// Canvases won't allow us to overflow. and our molecules can move outside
// the standard canvas dimensions.
// To maintain consistency with how I use SVG in this project (which is,
// the width/height isn't guaranteed to contain the SVG entirely).
// To solve this, we'll make it 2 rows/columns larger, and then offset that
// using margin so that it's "centered" with where it needs to be.
export const getDimensions = (
  baseWidth: number,
  baseHeight: number,
  numOfRows: number,
  numOfCols: number
) => {
  const colWidth = baseWidth / numOfCols;
  const rowHeight = baseHeight / numOfRows;

  const topBottomPadding = rowHeight;
  const sidePadding = colWidth * 2;

  const heightWithPadding = baseHeight + topBottomPadding * 2;
  const widthWithPadding = baseWidth + sidePadding * 2;

  return {
    colWidth,
    rowHeight,
    widthWithPadding,
    heightWithPadding,
    topBottomPadding,
    sidePadding,
  };
};
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/AirGrid/AirGrid.js">
```javascript
// @flow
import React, { PureComponent } from 'react';

import {
  COLORS,
  DEFAULT_WAVEFORM_SHAPE,
  DEFAULT_WAVEFORM_SIZE,
  DEFAULT_WAVEFORM_NUM_OF_CYCLES,
  DEFAULT_WAVEFORM_AMPLITUDE,
  WAVEFORM_ASPECT_RATIO,
} from '../../constants';
import { range } from '../../utils';
import { getPositionAtPointRelativeToAxis } from '../../helpers/waveform.helpers';

import Canvas from '../Canvas';

import { getDimensions } from './AirGrid.helpers';

import type { WaveformShape } from '../../types';

const DEFAULT_COLS = 26;
const DEFAULT_ROWS = 26;

type Props = {
  width: number,
  height: number,
  numOfRows: number,
  numOfCols: number,
  direction: 'horizontal' | 'vertical',
  waveformShape: WaveformShape,
  waveformFrequency: number,
  waveformAmplitude: number,
  waveformProgress: number,
  highlightColumnIndex: ?number,
};

class AirGrid extends PureComponent<Props> {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  static defaultProps = {
    width: DEFAULT_WAVEFORM_SIZE,
    height: DEFAULT_WAVEFORM_SIZE * WAVEFORM_ASPECT_RATIO,
    numOfRows: DEFAULT_ROWS,
    numOfCols: DEFAULT_COLS,
    direction: 'horizontal',
    waveformShape: DEFAULT_WAVEFORM_SHAPE,
    waveformFrequency: DEFAULT_WAVEFORM_NUM_OF_CYCLES,
    waveformAmplitude: DEFAULT_WAVEFORM_AMPLITUDE,
    highlightColumnIndex: null,
  };

  componentDidMount() { this.componentDidUpdate(); }

  componentDidUpdate() {
    const {
      width,
      height,
      numOfRows,
      numOfCols,
      highlightColumnIndex,
    } = this.props;

    const {
      colWidth,
      rowHeight,
      sidePadding,
      topBottomPadding,
    } = getDimensions(width, height, numOfRows, numOfCols);

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    range(0, numOfCols - 1).map(columnNum => {
      const wavePosition = this.getCellDisplacement(columnNum);

      return range(0, numOfRows - 1).forEach(rowNum => {
        // We want to offset each molecule by half of the row/column size, so that
        // the molecules sit in the center of the cell (rather than in the top
        // left corner)
        const yCenterOffset = rowHeight / 2;
        const xCenterOffset = colWidth / 2;

        // The `y` position is simple since cells don't move up and down.
        // Put it in the right cell, move it to the center of the cell, and
        // add the padding amount (see jsdoc of `getDimensions` in the helper
        // file)
        const yInPixels = rowNum * rowHeight + yCenterOffset + topBottomPadding;

        // `x` is a bit more complicated since it moves side-to-side depending
        // on the offset (and the column). Start by getting the 'baseline'
        // position.
        const xBaselineInPixels =
          columnNum * colWidth + xCenterOffset + sidePadding;

        const totalDisplacementAmount = sidePadding;

        // Each molecule can move +/- by the column width (less, if the
        // amplitude is less than 1). This
        const xInPixels =
          xBaselineInPixels + wavePosition * totalDisplacementAmount;

        const particleRadius = Math.min(colWidth, rowHeight) * 0.3;

        this.ctx.beginPath();
        this.ctx.arc(xInPixels, yInPixels, particleRadius, 0, 2 * Math.PI);

        // If we've provided a `highlightColumnIndex`, we want to color a
        // specific column with our primary color.
        // Additionally, if ANY `highlightColumnIndex` is provided, we want to
        // soften all un-highlighted columns to a lighter gray.
        // prettier-ignore
        const baseColor = typeof highlightColumnIndex === 'number'
          ? COLORS.gray[300]
          : COLORS.gray[500];

        // prettier-ignore
        this.ctx.fillStyle = columnNum === highlightColumnIndex
          ? COLORS.primary[500]
          : baseColor;

        this.ctx.fill();
      });
    });
  }

  getCellDisplacement = (columnNum: number) => {
    // Each cell will translate from side to side. The columns are staggered,
    // to represent how a wave moves through space.
    const {
      numOfCols,
      waveformShape,
      waveformFrequency,
      waveformAmplitude,
      waveformProgress,
    } = this.props;

    // if every column operated the same way, we could simply use `progress`,
    // but we want to stagger them baed on their frequency.
    // Let's assume that the total grid represents 1 second (same as waveform).
    // Then, we can get the progress through the waveform by adding the number
    // of milliseconds to the current offset
    let columnOffset = columnNum / numOfCols * 1.25;

    const rawProgress = ((waveformProgress - columnOffset) * 100) % 100;
    const progress = waveformShape === "sine" ? rawProgress : ((rawProgress + 100) % 100);

    return getPositionAtPointRelativeToAxis(
      waveformShape,
      waveformFrequency,
      waveformAmplitude,
      progress
    );
  };

  captureRefs = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    this.canvas = canvas;
    this.ctx = ctx;
  };

  render() {
    const { width, height, numOfRows, numOfCols } = this.props;

    const {
      widthWithPadding,
      heightWithPadding,
      topBottomPadding,
      sidePadding,
    } = getDimensions(width, height, numOfRows, numOfCols);

    // We want to allow our canvas to show a bit of overflow (if the molecules
    // bounce out of the available space). So the width/height will be a bit
    // larger. We want to "inset" it so that the primary content area is still
    // where you'd expect (we're essentially just adding a 1 row/column buffer
    // around each edge, and then moving it back to center it)
    const style = {
      marginTop: -topBottomPadding,
      marginBottom: -topBottomPadding,
      marginLeft: -sidePadding,
      marginRight: -sidePadding,
    };

    return (
      <Canvas
        style={style}
        width={widthWithPadding}
        height={heightWithPadding}
        innerRef={this.captureRefs}
      />
    );
  }
}

export default AirGrid;
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/AirGrid/index.js">
```javascript
export { default } from './AirGrid';
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/Canvas/Canvas.js">
```javascript
import React, { PureComponent } from 'react';

import { scaleCanvas } from '../../helpers/canvas.helpers';

type Props = {
  innerRef: (elem: HTMLElement) => void,
};

class Canvas extends PureComponent<Props> {
  static defaultProps = {
    width: 800,
    height: 600,
  };

  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  handleRef = (canvas: ?HTMLCanvasElement) => {
    if (!canvas) {
      return;
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    scaleCanvas(this.canvas, this.ctx);

    this.props.innerRef(this.canvas, this.ctx);
  };

  render() {
    const { innerRef, ...delegatedProps } = this.props;
    return <canvas ref={this.handleRef} {...delegatedProps} />;
  }
}

export default Canvas;
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/Canvas/index.js">
```javascript
export { default } from './Canvas';
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/FadeTransition/FadeTransition.js">
```javascript
// @flow
import React, { PureComponent } from 'react';
import Transition from 'react-transition-group/Transition';

type Props = {
  isVisible: boolean,
  mountOnEnter: boolean,
  unmountOnExit: boolean,
  duration: number,
  typeName: string,
  children: React$Node,
};

class FadeTransition extends PureComponent<Props> {
  static defaultProps = {
    duration: 500,
    typeName: 'span',
  };

  render() {
    const {
      isVisible,
      duration,
      typeName,
      children,
      ...delegated
    } = this.props;

    return (
      <Transition in={isVisible} timeout={duration} {...delegated}>
        {transitionState =>
          React.createElement(
            typeName,
            {
              style: {
                position: 'static',
                display: 'inline-block',
                transition: `opacity ${duration}ms`,
                opacity: transitionState === 'entered' ? 1 : 0,
                pointerEvents: transitionState === 'entered' ? 'auto' : 'none',
              },
            },
            children
          )
        }
      </Transition>
    );
  }
}

export default FadeTransition;
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/FadeTransition/index.js">
```javascript
export { default } from './FadeTransition';
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/Oscillator/Oscillator.helpers.js">
```javascript
// @flow
type fadeArgs = {
  oscillator: OscillatorNode,
  direction: 'in' | 'out',
  output: GainNode,
  maxAmplitude?: number,
  duration?: number,
  context: AudioContext,
};

export const fade = ({
  oscillator,
  direction,
  output,
  maxAmplitude = 1,
  duration = 0.015,
  context,
}: fadeArgs) => {
  const now = context.currentTime;
  const end = now + duration;
  output.gain.cancelScheduledValues(now);

  if (direction === 'in') {
    output.gain.setValueAtTime(0, now);
    output.gain.linearRampToValueAtTime(maxAmplitude, end);
    oscillator.start(now);
  } else if (direction === 'out') {
    output.gain.setValueAtTime(output.gain.value, now);
    output.gain.linearRampToValueAtTime(0, end);
    oscillator.stop(end);
  }
};
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/Oscillator/Oscillator.js">
```javascript
// @flow
import { PureComponent } from 'react';

import { DEFAULT_WAVEFORM_SHAPE } from '../../constants';

import { fade } from './Oscillator.helpers';

import type { WaveformShape } from '../../types';

type Props = {
  slidePitch: boolean,
  audioCtx: AudioContext,
  masterOut: AudioDestinationNode,
  shape: WaveformShape,
  frequency: number,
  amplitude: number,
};

// CLIP_FADE_DURATION controls the duration over amplitude changes when
// starting/stopping, to avoid pops/clicks.
const CLIP_FADE_DURATION = 0.015;
// GLIDE_DURATION is used for the frequency, to smoothly shift to a new value.
const GLIDE_DURATION = 0.5;

class Oscillator extends PureComponent<Props> {
  audioCtx: AudioContext;
  oscillatorNode: OscillatorNode;
  amplitudeGainNode: GainNode;

  static defaultProps = {
    shape: DEFAULT_WAVEFORM_SHAPE,
    amplitude: 1,
  };

  componentDidMount() {
    this.initializeAudio();
  }

  componentWillReceiveProps(nextProps: Props) {
    const { shape, frequency, amplitude } = nextProps;

    if (shape !== this.props.shape) {
      this.updateShape(shape);
    }

    if (frequency !== this.props.frequency) {
      this.updateFrequency(frequency);
    }

    if (amplitude !== this.props.amplitude) {
      this.updateAmplitude(amplitude);
    }
  }

  componentWillUnmount() {
    this.stop();
  }

  initializeAudio = () => {
    const { audioCtx, masterOut, shape, frequency, amplitude } = this.props;

    this.oscillatorNode = audioCtx.createOscillator();

    this.amplitudeGainNode = audioCtx.createGain();

    this.oscillatorNode.type = shape;
    this.oscillatorNode.frequency.value = frequency;

    this.oscillatorNode.connect(this.amplitudeGainNode);
    this.amplitudeGainNode.connect(masterOut);

    fade({
      direction: 'in',
      oscillator: this.oscillatorNode,
      output: this.amplitudeGainNode,
      maxAmplitude: amplitude,
      duration: CLIP_FADE_DURATION,
      context: audioCtx,
    });
  };

  updateShape = (shape: WaveformShape) => {
    this.oscillatorNode.type = shape;
  };

  updateFrequency = (frequency: number) => {
    const { audioCtx, slidePitch } = this.props;

    if (slidePitch) {
      this.oscillatorNode.frequency.exponentialRampToValueAtTime(
        frequency,
        audioCtx.currentTime + GLIDE_DURATION
      );
    } else {
      this.oscillatorNode.frequency.value = frequency;
    }
  };

  updateAmplitude = (amplitude: number) => {
    const { audioCtx } = this.props;

    // For some reason, `exponentialRampToValueAtTime` doesn't like 0s.
    // In that case, let's just cut it off instantly, whatever.
    if (amplitude === 0) {
      this.amplitudeGainNode.gain.value = 0;
      return;
    }

    this.amplitudeGainNode.gain.exponentialRampToValueAtTime(
      amplitude,
      audioCtx.currentTime + GLIDE_DURATION / 2
    );
  };

  stop = () => {
    const { audioCtx } = this.props;

    if (this.oscillatorNode) {
      fade({
        direction: 'out',
        oscillator: this.oscillatorNode,
        output: this.amplitudeGainNode,
        duration: CLIP_FADE_DURATION,
        context: audioCtx,
      });
    }
  };

  render() {
    return null;
  }
}

export default Oscillator;
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/Oscillator/index.js">
```javascript
export { default } from './Oscillator';
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/Waveform/Waveform.js">
```javascript
// @flow
import React, { Component } from 'react';

import {
  WAVEFORM_ASPECT_RATIO,
  DEFAULT_WAVEFORM_SIZE,
  DEFAULT_WAVEFORM_SHAPE,
  DEFAULT_WAVEFORM_NUM_OF_CYCLES,
  DEFAULT_WAVEFORM_AMPLITUDE,
} from '../../constants';
import {
  getPointsForWaveform,
  createSVGPathFromWaveformPoints,
  translateAxisRelativeYValue,
} from '../../helpers/waveform.helpers';

import Canvas from '../Canvas';

import type { Linecap, WaveformShape, WaveformPoint } from '../../types';

const CANVAS_PADDING = 10;

export type Props = {
  // In most cases, the Waveform simply requires an enum waveform shape, like
  // 'sine' or 'square'.
  shape: WaveformShape,
  // In certain cases (eg. waveform addition), it's more helpful to provide an
  // array of points, instead of a `shape`. The Waveform will simply plot those
  // points, in that case.
  points?: Array<WaveformPoint>,
  // 'size' will be used for the width, and the height will be derived, using
  // the ASPECT_RATIO constant.
  size: number,
  // Line color for the waveform line.
  // TODO: Find a way to support other line features (width, endcap) in a nice
  // way?
  color: string,
  strokeWidth: number,
  strokeLinecap: Linecap,
  opacity: number,
  // frequency is the number of cycles to squeeze into this waveform
  // visualization. The default value of `1` means that a single iteration of
  // the waveform is drawn. `2` means that the cycle is rendered twice, etc
  // This can be thought of as `frequency`, if the X-axis is thought to range
  // between 0s and 1s. I've avoided naming it `frequency` to avoid ambiguity
  // with WaveformPlayer, which controls how fast the waveform actually moves.
  frequency: number,
  // Amplitude is the strength of the waveform (AKA loudness, volume).
  // it can range from 0 to 1, and affects how 'tall' the waveform is.
  amplitude: number,
  // At what point in the waveform should the drawing start?
  // By default, it starts at `0`, but any value between 0 and 99 can be
  // used.
  // This is useful for animating the waveform, by simply auto-incrementing
  // the value in a requestAnimationFrame loop!
  offset: number,

  renderTo: 'svg' | 'canvas',
};

class Waveform extends Component<Props> {
  static defaultProps = {
    size: DEFAULT_WAVEFORM_SIZE,
    shape: DEFAULT_WAVEFORM_SHAPE,
    color: 'black',
    strokeWidth: 1,
    strokeLinecap: 'butt',
    opacity: 1,
    frequency: DEFAULT_WAVEFORM_NUM_OF_CYCLES,
    amplitude: DEFAULT_WAVEFORM_AMPLITUDE,
    offset: 0,
    renderTo: 'svg',
  };

  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  componentDidMount() {
    if (this.props.renderTo === 'canvas') {
      this.drawCanvas();
    }
  }

  componentDidUpdate() {
    if (this.props.renderTo === 'canvas') {
      this.drawCanvas();
    }
  }

  captureCanvasRef = (
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
  ) => {
    this.canvas = canvas;
    this.ctx = ctx;
  };

  /**
   * This method gathers the data needed to perform the drawing.
   * In the most common case, this transforms a WaveformShape like 'sine' into
   * an array of {x,y} coordinates.
   *
   * Furthermore, these values are fully ready--to-draw; the coordinates are in
   * "real" space. This means that for SVGs, the X values range from 0 to width.
   * The y values range from 0 to height. It also takes into account Canvas
   * padding, which needs to be accounted for.
   */
  getPoints(): Array<WaveformPoint> {
    const { size, shape, frequency, amplitude, offset, renderTo } = this.props;
    let { points } = this.props;

    const height = Math.round(size * WAVEFORM_ASPECT_RATIO);

    if (typeof points === 'undefined') {
      points = getPointsForWaveform({
        shape,
        frequency,
        amplitude,
        width: size,
        offset,
      });
    }

    // `points` will be mathy values: y-values ranging from -1 to 1.
    // We want to convert that to values understandable by our waveform
    // drawing surfaces: values from 0 to the height of the canvas/svg.
    // For Canvas only: We need to add a bit of padding to each value.
    const drawablePoints = points.map(({ x, y }) => {
      const relativeY = translateAxisRelativeYValue(y, height);

      return {
        x: renderTo === 'canvas' ? x + CANVAS_PADDING : x,
        y: renderTo === 'canvas' ? relativeY + CANVAS_PADDING : relativeY,
      };
    });

    return drawablePoints;
  }

  drawCanvas() {
    const { color, strokeWidth, strokeLinecap } = this.props;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.beginPath();

    const [firstPoint, ...otherPoints] = this.getPoints();

    this.ctx.moveTo(firstPoint.x, firstPoint.y);

    otherPoints.forEach(({ x, y }) => this.ctx.lineTo(x, y));

    this.ctx.lineWidth = strokeWidth;
    this.ctx.lineCap = strokeLinecap;
    this.ctx.strokeStyle = color;

    this.ctx.stroke();
  }

  renderCanvas(width: number, height: number) {
    // Unlike SVGs, there's no way to support overflow with Canvas.
    // So, we need to set it as slightly larger than ideal, and then offset it
    // with margin.
    const widthWithPadding = width + CANVAS_PADDING * 2;
    const heightWithPadding = height + CANVAS_PADDING * 2;

    return (
      <Canvas
        innerRef={this.captureCanvasRef}
        width={widthWithPadding}
        height={heightWithPadding}
        style={{ margin: -CANVAS_PADDING }}
      />
    );
  }

  renderSVG(width: number, height: number) {
    const { color, strokeWidth, strokeLinecap, opacity } = this.props;

    const points = this.getPoints();

    const svgPath = createSVGPathFromWaveformPoints(points, height);

    return (
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <path
          d={svgPath}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
          fill="none"
          style={{ opacity, transition: 'opacity 500ms' }}
        />
      </svg>
    );
  }

  render() {
    const { shape, size, renderTo, points } = this.props;

    const width = size;
    const height = Math.round(size * WAVEFORM_ASPECT_RATIO);

    if (typeof shape !== 'string' && !Array.isArray(points)) {
      throw new Error(
        'Waveform requires either a `shape` string, or an array ' +
          'of `points`. Please provide one of the two.'
      );
    }

    return renderTo === 'svg'
      ? this.renderSVG(width, height)
      : this.renderCanvas(width, height);
  }
}

export default Waveform;
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/Waveform/index.js">
```javascript
export { default } from './Waveform';
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/WaveformAxis/WaveformAxis.js">
```javascript
// @flow
import React, { Fragment, PureComponent } from 'react';
import styled from 'styled-components';

import {
  COLORS,
  DEFAULT_WAVEFORM_SIZE,
  WAVEFORM_ASPECT_RATIO,
  IS_MOBILE_USER_AGENT,
} from '../../constants/index';
import { range } from '../../utils';

import FadeTransition from '../FadeTransition';

import type { Linecap } from '../../types';

const SIDE_AXIS_SPACING = 10;
const TOP_AXIS_SPACING = 10;
const STROKE_DASHARRAY = 3;

type Props = {
  y: boolean,
  x: boolean,
  waveformSize: number,
  color: string,
  strokeWidth: number,
  strokeLinecap: Linecap,
  opacity: number,
  showLabels: boolean,
};

class WaveformAxis extends PureComponent<Props> {
  static defaultProps = {
    y: false,
    x: false,
    waveformSize: DEFAULT_WAVEFORM_SIZE,
    color: COLORS.gray[900],
    strokeWidth: 2,
    strokeLinecap: 'square',
    opacity: 1,
    showLabels: false,
  };

  render() {
    const {
      y,
      x,
      waveformSize,
      color,
      strokeWidth,
      strokeLinecap,
      opacity,
      showLabels,
    } = this.props;

    // This represents a single axis. Only one of x/y may be passed.
    // I may create a thin wrapper that supplies both, but I like being able to
    // control their line styles individually. It gets messy otherwise.
    if (x && y) {
      throw new Error(
        'You provided both `x` and `y`, but these are mutually exclusive. Please supply a single axis to render to WaveformAxis'
      );
    }

    if (!x && !y) {
      throw new Error(
        'You need to specify either `x` or `y` for WaveformAxis. Which axis do you wish to show?'
      );
    }

    // We want our axes to have some "breathing room" around the waveform.
    // It would be inconvenient to need to position the waveform explicitly,
    // though.
    //
    // Happily, a semi-hacky workaround has presented itself.
    //
    // These axes will be positioned absolutely, and they will overflow their
    // parent. If they're placed in a 200x200 container, they'll actually take
    // up 220x230px space, spilling out over all 4 sides.
    //
    // This works because this project doesn't need the axes to be specifically
    // positioned; they'll be floating around in their own area. This trick
    // wouldn't work in most situations, but it does here.

    const width = waveformSize;
    const height = waveformSize * WAVEFORM_ASPECT_RATIO;

    const axisWidth = width + SIDE_AXIS_SPACING * 2;
    const axisHeight = height + TOP_AXIS_SPACING * 2;

    const halfHeight = Math.round(height / 2);

    const showXLabels = x && showLabels;
    const showYLabels = y && showLabels;

    const coordinates = x
      ? {
          x1: -SIDE_AXIS_SPACING,
          y1: halfHeight,
          x2: width + SIDE_AXIS_SPACING,
          y2: halfHeight,
        }
      : {
          x1: 0,
          y1: -TOP_AXIS_SPACING,
          x2: 0,
          y2: height + TOP_AXIS_SPACING,
        };

    const labelLineStyles = {
      stroke: 'rgba(0, 0, 0, 0.5)',
      strokeDasharray: STROKE_DASHARRAY,
    };

    const yAxisGuideSquish = IS_MOBILE_USER_AGENT
      ? -SIDE_AXIS_SPACING
      : SIDE_AXIS_SPACING;

    return (
      <WaveformAxisSvg width={width} height={height}>
        <FadeTransition isVisible={showXLabels} typeName="g">
          {range(0, 1, 0.25).map(i => {
            return (
              <Fragment key={i}>
                {i > 0 && (
                  <line
                    x1={width * i}
                    y1={-TOP_AXIS_SPACING}
                    x2={width * i}
                    y2={height + TOP_AXIS_SPACING}
                    {...labelLineStyles}
                  />
                )}

                <text
                  x={width * i + 4}
                  y={height / 2 + 16}
                  style={{ fontSize: 14 }}
                >
                  {i}s
                </text>
              </Fragment>
            );
          })}
        </FadeTransition>
        <FadeTransition isVisible={showYLabels} typeName="g">
          <Fragment>
            <line
              x1={-SIDE_AXIS_SPACING}
              y1={-3}
              x2={width + yAxisGuideSquish}
              y2={-3}
              {...labelLineStyles}
            />
            <text
              x={axisWidth}
              y={0}
              dx={yAxisGuideSquish}
              dy={4}
              style={{ fontSize: 14, textAnchor: 'end' }}
            >
              +1
            </text>

            <line
              x1={-SIDE_AXIS_SPACING}
              y1={halfHeight}
              x2={width + yAxisGuideSquish}
              y2={halfHeight}
              {...labelLineStyles}
            />
            <text
              x={axisWidth}
              y={halfHeight}
              dx={yAxisGuideSquish}
              dy={4}
              style={{ fontSize: 14, textAnchor: 'end' }}
            >
              0
            </text>

            <line
              x1={-SIDE_AXIS_SPACING}
              y1={height + 3}
              x2={width + yAxisGuideSquish}
              y2={height + 3}
              {...labelLineStyles}
            />
            <text
              x={axisWidth}
              dx={yAxisGuideSquish}
              y={axisHeight}
              dy={-16}
              style={{ fontSize: 14, textAnchor: 'end' }}
            >
              -1
            </text>
          </Fragment>
        </FadeTransition>
        <line
          {...coordinates}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
          style={{ opacity, transition: `opacity ${500}ms` }}
        />
      </WaveformAxisSvg>
    );
  }
}

const WaveformAxisSvg = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: ${props => props.width + 'px'};
  height: ${props => props.height + 'px'};
  overflow: visible;
`;

export default WaveformAxis;
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/WaveformAxis/index.js">
```javascript
export { default } from './WaveformAxis';
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/WaveformIntercept/WaveformIntercept.js">
```javascript
// @flow
import React from 'react';
import styled from 'styled-components';

import {
  WAVEFORM_ASPECT_RATIO,
  DEFAULT_WAVEFORM_SIZE,
  DEFAULT_WAVEFORM_NUM_OF_CYCLES,
  DEFAULT_WAVEFORM_AMPLITUDE,
} from '../../constants';
import { getInterceptPosition } from '../../helpers/waveform.helpers';

import type { WaveformShape } from '../../types/index';

type Props = {
  color?: string,
  size?: number,
  waveformSize?: number,
  waveformShape: WaveformShape,
  frequency: number,
  amplitude: number,
  offset: number,
};

const WaveformIntercept = ({
  color = 'red',
  size = 16,
  waveformSize = DEFAULT_WAVEFORM_SIZE,
  waveformShape,
  frequency = DEFAULT_WAVEFORM_NUM_OF_CYCLES,
  amplitude = DEFAULT_WAVEFORM_AMPLITUDE,
  offset,
}: Props) => {
  const waveformHeight = waveformSize * WAVEFORM_ASPECT_RATIO;

  const interceptPosition = getInterceptPosition(
    waveformShape,
    waveformHeight,
    frequency,
    amplitude,
    offset
  );

  return (
    <WaveformInterceptElem
      position={interceptPosition}
      color={color}
      size={size}
    />
  );
};

const WaveformInterceptElem = styled.div.attrs({
  style: ({ position }) => ({
    transform: `translateY(${position}px)`,
  }),
})`
  width: ${props => props.size + 'px'};
  height: ${props => props.size + 'px'};
  border-radius: 50%;
  background: ${props => props.color};
  position: absolute;
  top: ${props => -1 * props.size / 2 + 'px'};
  left: ${props => -1 * props.size / 2 + 'px'};
  will-change: transform;
`;

export default WaveformIntercept;
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/WaveformIntercept/index.js">
```javascript
export { default } from './WaveformIntercept';
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/WaveformPlayer/WaveformPlayer.js">
```javascript
// @flow
import React, { Fragment, PureComponent } from 'react';
import { Motion, spring } from 'react-motion';

import {
  DEFAULT_WAVEFORM_NUM_OF_CYCLES,
  DEFAULT_WAVEFORM_AMPLITUDE,
  SPRING_SETTINGS,
} from '../../constants';

type DynamicValues = {
  amplitude: number,
  frequency: number,
  convergence: number,
  phase: number,
  progress: number,
};

type Props = {
  isPlaying: boolean,
  amplitude: number,
  // How many times does the waveform repeat within the viewable area of this
  // player? Defaults to 1, which shows a single "period" of the waveform.
  frequency: number,
  convergence: number,
  phase: number,

  children: (values: DynamicValues) => React$Node,
};

type State = {
  // `progress` is the number of cycles that have advanced since starting.
  // It can be decimal: eg. a progress of 1.5 means that the waveform has
  // advanced by 1 and a half iterations.
  progress: number,
  lastTickAt: ?Date,
  // When we receive the request to stop the animation, it's nice to follow
  // through to the end of the current cycle, so that it winds up in its
  // original position.
  // This number controls the cycle the stop was requested in.
  stopRequestedAtCycle: ?number,
};

class WaveformPlayer extends PureComponent<Props, State> {
  animationFrameId: number;

  state = {
    progress: 0,
    lastTickAt: null,
    stopRequestedAtCycle: null,
  };

  static defaultProps = {
    isPlaying: false,
    frequency: DEFAULT_WAVEFORM_NUM_OF_CYCLES,
    amplitude: DEFAULT_WAVEFORM_AMPLITUDE,
  };

  componentDidMount() {
    if (this.props.isPlaying) {
      this.start();
    }

    if (typeof document.addEventListener === 'function') {
      document.addEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
    }
  }

  componentWillReceiveProps(nextProps: Props) {
    const isJustStarting = !this.props.isPlaying && nextProps.isPlaying;
    const isJustStopping = this.props.isPlaying && !nextProps.isPlaying;

    if (isJustStarting) {
      this.start();
    } else if (isJustStopping) {
      this.stop();
    }
  }

  componentWillUnmount() {
    window.cancelAnimationFrame(this.animationFrameId);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  handleVisibilityChange = () => {
    // When the user switches tabs or applications, the animation will
    // automatically pause (due to `requestAnimationFrame` implementation).
    // Our animation uses a timestamp, though, and so when it resumes, it
    // frantically does a bunch of work until it's caught up.
    // By detecting visibility changes, we can update that timestamp when the
    // user returns to the tab. This way, the animation restarts smoothly.
    const userReturnedToPage = !document.hidden;

    if (userReturnedToPage) {
      this.setState({ lastTickAt: new Date() });
    }
  };

  start = () => {
    window.cancelAnimationFrame(this.animationFrameId);
    this.setState({ lastTickAt: new Date(), stopRequestedAtCycle: null }, this.tick);
  };

  stop = () => {
    this.setState({
      stopRequestedAtCycle: this.state.progress,
    });
  };

  tick = () => {
    this.animationFrameId = window.requestAnimationFrame(() => {
      const { frequency } = this.props;
      const { progress, stopRequestedAtCycle, lastTickAt } = this.state;

      if (!lastTickAt) {
        return;
      }

      const tickAt = new Date();

      let secondsSinceLastTick = (tickAt - lastTickAt) / 1000;
      // Let's clamp the `secondsSinceLastTick` to 0.5 max. This is to avoid the
      // wild flurry that happens when returning to an inactive tab.
      secondsSinceLastTick = Math.min(secondsSinceLastTick, 0.5);

      const periodsSinceLastTick = secondsSinceLastTick * frequency;

      // At first glance, you might think we're just translating a fixed SVG
      // by `n` pixels to the left on every tick.
      // Actually, though, we're redrawing the wave on every tick.
      // This winds up being simpler, since it's an endless animation; this way
      // we don't have to worry about running out of wave, and every tick is
      // exactly the same.
      //
      // So, since we're not actually "moving" anything, all we need to know is
      // how many cycles have passed. If the number is 0.2, we're 20% through
      // the wave, and can start drawing from there.
      // By changing that value, we get the illusion of it moving.
      // on every frame.

      const nextProgressVal = progress + periodsSinceLastTick;

      // If this is the tick that pushes us into the next cycle, and we've
      // requested a stop, let's end this animation.
      if (typeof stopRequestedAtCycle === 'number') {
        const nextCyclesInteger = Math.floor(nextProgressVal);

        if (nextCyclesInteger > progress) {
          this.setState({
            progress: Math.floor(nextProgressVal),
            lastTickAt: tickAt,
            stopRequestedAtCycle: null,
          });
          return;
        }
      }

      this.setState(
        { progress: nextProgressVal, lastTickAt: tickAt },
        this.tick
      );
    });
  };

  renderValues = (values: DynamicValues) => {
    const { children } = this.props;

    // To appease React Motion, we have to return a React element, so we use
    // the DOM-free Fragment. This is really just a bit of a hack; I shouldn't
    // really be using React Motion for this at all, I should just manage my own
    // spring values!
    return <Fragment>{children(values)}</Fragment>;
  };

  render() {
    const { amplitude, frequency, convergence, phase } = this.props;
    const { progress } = this.state;

    return (
      <Motion
        defaultStyle={{
          progress: 0,
          amplitude,
          frequency,
          convergence: 0,
          phase: 0,
        }}
        style={{
          amplitude: spring(amplitude, SPRING_SETTINGS),
          frequency: spring(frequency, SPRING_SETTINGS),
          progress: spring(progress, SPRING_SETTINGS),
          convergence: spring(convergence, SPRING_SETTINGS),
          phase: spring(phase, SPRING_SETTINGS),
        }}
      >
        {this.renderValues}
      </Motion>
    );
  }
}

export default WaveformPlayer;
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/components/WaveformPlayer/index.js">
```javascript
export { default } from './WaveformPlayer';
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/constants/index.js">
```javascript
// @flow
import type { WaveformShape } from '../types';

// Logic
export const WAVEFORM_ASPECT_RATIO = 0.5;
export const DEFAULT_WAVEFORM_SHAPE = 'sine';
export const DEFAULT_WAVEFORM_SIZE = 200;
export const DEFAULT_WAVEFORM_NUM_OF_CYCLES = 1;
export const DEFAULT_WAVEFORM_AMPLITUDE = 1;

export const SHAPES: Array<WaveformShape> = [
  'sine',
  'triangle',
  'square',
  'sawtooth',
];

export const SPRING_SETTINGS = {
  stiffness: 170,
  damping: 26,
  precision: 0.1,
};

type Colors = {
  [color: string]: { [label: string | number]: string } | string,
};
export const COLORS: Colors = {
  red: {
    '100': '#FFCDD2',
    '300': '#E57373',
    '500': '#F44336',
    '700': '#D32F2F',
    '900': '#B71C1C',
  },
  orange: {
    '100': '#FFECB3',
    '300': '#FFD54F',
    '500': '#FFC107',
    '700': '#FFA000',
    '900': '#ee7314',
  },
  green: {
    '100': '#DCEDC8',
    '300': '#AED581',
    '500': '#8BC34A',
    '700': '#689F38',
    '900': '#33691E',
  },
  indigo: {
    '100': '#b3defc',
    '300': '#4f9ef7',
    '500': '#0380f4',
    '700': '#0268d1',
    '900': '#01499b',
  },
  blue: {
    '100': '#B3E5FC',
    '300': '#4FC3F7',
    '500': '#03A9F4',
    '700': '#0288D1',
    '900': '#01579B',
  },
  purple: {
    '100': '#E1BEE7',
    '300': '#BA68C8',
    '500': '#9C27B0',
    '700': '#7B1FA2',
    '900': '#4A148C',
  },
  pink: {
    '100': '#F8BBD0',
    '300': '#F06292',
    '500': '#E91E63',
    '700': '#C2185B',
    '900': '#880E4F',
  },
  gray: {
    '50': '#FAFAFA',
    '100': '#F5F5F5',
    '300': '#E0E0E0',
    '400': '#CCCCCC',
    '500': '#9E9E9E',
    '700': '#616161',
    '800': '#414141',
    '900': '#212121',
  },
  cream: {
    '50': '#FFFEFC',
  },
  white: '#FFFFFF',
};

COLORS.primary = COLORS.indigo;
COLORS.secondary = COLORS.pink;
COLORS.tertiary = COLORS.orange;

// Media queries
export const BREAKPOINT_SIZES = {
  xs: 320,
  sm: 540,
  md: 900,
  lg: 1100,
  xl: 1440,
};

export const BREAKPOINTS = {
  xs: `(max-width: ${BREAKPOINT_SIZES.xs}px)`,
  sm: `(max-width: ${BREAKPOINT_SIZES.sm}px)`,
  md: `(max-width: ${BREAKPOINT_SIZES.md}px)`,
  lg: `(max-width: ${BREAKPOINT_SIZES.lg}px)`,
  xl: `(max-width: ${BREAKPOINT_SIZES.xl}px)`,
  xsMin: `(min-width: ${BREAKPOINT_SIZES.xs}px)`,
  smMin: `(min-width: ${BREAKPOINT_SIZES.sm}px)`,
  mdMin: `(min-width: ${BREAKPOINT_SIZES.md}px)`,
  lgMin: `(min-width: ${BREAKPOINT_SIZES.lg}px)`,
  xlMin: `(min-width: ${BREAKPOINT_SIZES.xl}px)`,
  desktop: `(min-width: ${BREAKPOINT_SIZES.sm + 1}px)`,
};

export const MAX_WIDTH = {
  sm: '100%',
  md: BREAKPOINT_SIZES.md + 'px',
  base: BREAKPOINT_SIZES.lg + 'px',
};

const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i;
export const IS_MOBILE_USER_AGENT = mobileRegex.test(navigator.userAgent);
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/helpers/canvas.helpers.js">
```javascript
// @flow
// Figure out our backing scale.
// This ensures canvas looks crisp on retina displays, where there are
// in fact 4 on-screen pixels for every 1 calculated pixel.
export function scaleCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
) {
  // If we're rendering on the server, do nothing.
  if (typeof window === 'undefined') {
    return;
  }

  const backingStoreRatio =
    ctx.webkitBackingStorePixelRatio ||
    ctx.mozBackingStorePixelRatio ||
    ctx.msBackingStorePixelRatio ||
    ctx.oBackingStorePixelRatio ||
    ctx.backingStorePixelRatio ||
    1;

  // $FlowFixMe - apparently backingStoreRatio can contain non-numbers?
  const ratio = (window.devicePixelRatio || 1) / backingStoreRatio;

  if (ratio > 1) {
    /* eslint-disable no-param-reassign */
    canvas.style.height = `${canvas.height}px`;
    canvas.style.width = `${canvas.width}px`;
    canvas.width *= ratio;
    canvas.height *= ratio;
    /* eslint-enable */

    ctx.scale(ratio, ratio);
  }
}
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/helpers/waveform.helpers.js">
```javascript
// @flow
import { COLORS } from '../constants';
import { range, sum, convertHexToRGBA } from '../utils';

import type {
  WaveformShape,
  WaveformPoint,
  WaveformAdditionType,
} from '../types';
import type { Props as WaveformProps } from '../components/Waveform';

/**
 * This method gets an array of axis-relative points that can be used for
 * further calculations.
 * Given a waveform shape, and some information about its frequency/offset/size,
 * this method returns an array of X/Y values that describes the waveform.
 * This is NOT plot-ready, since the Y values range from -1 to 1.
 * Further processing is required to get something drawable.
 */
export const getPointsForWaveform = ({
  shape,
  frequency,
  amplitude,
  width,
  offset = 0,
}: WaveformProps): Array<WaveformPoint> => {
  // Get an array of `x` values.
  // For now, we're drawing lines at every second point, for performance.
  // After experimentation, this may change.
  const ratioBetweenPointsAndPixels = 2;
  const xValues = range(0, width + 1, ratioBetweenPointsAndPixels);

  // Convert each X value to a proper coordinate system, relative to the axis
  // (so, Y values will be from -1 to 1)
  const rawValues = xValues.map(x => {
    // We need a progress value, to help inform where this `x` value is, in
    // terms of the cycles drawn.

    // Start by getting the width of a single cycle.
    // If `frequency` is `1`, then this is just the whole width.
    // If we're drawing more/less than a single cycle, though, we need to do
    // some division.
    const widthOfSingleCycle = width / frequency;

    // Next, we need to figure out the progress in terms of the cycle.
    // If the frequency is 4, This progress will be a value from 0 to 4.
    const progressRelativeToCycles = x / widthOfSingleCycle;

    // Finally, we have to take the waveform's offset into account.
    // As a refresher: `offset` ranges from 0 to 99, and it controls how much
    // to shift the waveform by.
    // Example: A sine wave with 50 offset will look like an inverted sine wave.
    // The `* 100` is necessary since offset is 0-99 instead of 0-1.
    // TODO: Probably makes sense to keep it from 0-1, makes more semantic sense
    const progress = progressRelativeToCycles * 100 + offset;

    return {
      x,
      y: getPositionAtPointRelativeToAxis(
        shape,
        frequency,
        amplitude,
        progress
      ),
    };
  });

  if (shape === 'triangle') {
    // Find the peak points in the wave, and set it to max amplitude.
    fixPeaks(amplitude, rawValues);
  }

  return rawValues;
};

// HACK HACK HACK: So, the current method I have for generating waveforms is
// flawed, in that it produces glitchy peaks because of rounding errors.
// The proper solution eludes me, but I did find this mathy way of fixing it.
// I'll go through and find those 'peak' values, and adjust their coordinates to
// actually sit at the peak.
const fixPeaks = (amplitude, values) => {
  return values.forEach((value, index) => {
    if (index <= 2 || index === values.length - 1) {
      return;
    }

    const previousVal = values[index - 1];
    const nextVal = values[index + 1];

    if (
      Math.abs(value.y) > Math.abs(previousVal.y) &&
      Math.abs(value.y) > Math.abs(nextVal.y)
    ) {
      // Is a peak!
      // Figure out the slope of the line.
      const previousPreviousVal = values[index - 2];

      const slope =
        (previousVal.y - previousPreviousVal.y) /
        (previousVal.x - previousPreviousVal.x);

      value.y = value.y < 0 ? -amplitude : amplitude;

      value.x = (value.y - previousVal.y) / slope + previousVal.x;
    }
  });
};

export const createSVGPathFromWaveformPoints = (
  points: Array<WaveformPoint>,
  height: number
) =>
  points.reduce((acc, { x, y }, index) => {
    // For the very first point, we have to Move to that area
    if (index === 0) {
      return `M ${x},${y} `;
    }

    // For all subsequent points, we can just draw a line to it.
    return `${acc} L ${x},${y}`;
  }, '');
/**
 * Given progress between 0 and 100, figure out the Y position, relative
 * to the X axis (from 1 to -1)
 */
export const getPositionAtPointRelativeToAxis = (
  shape: WaveformShape,
  frequency: number,
  amplitude: number,
  progress: number
) => {
  switch (shape) {
    case 'sine': {
      // Each sine cycle is 2Pi long, in trigonometry terms.
      // The frequency determines how many cycles are in the available space.
      const cycleLength = Math.PI * 2;
      const totalLength = cycleLength * frequency;

      // the progress is through the given cycle, but we may be rendering
      // multiple cycles.
      const progressThroughDrawableArea = progress * (1 / frequency);

      // Right now, `progress` ranges from 0 to 100.
      // Normalize this value to fit between 0 and `totalLength`.
      // Just cross-multiplying to get the normalized value:
      //
      // progress         positionInRads
      // --------  =      --------------
      //   100             totalLength
      //
      // prettier-ignore
      const positionInRads = (progressThroughDrawableArea * totalLength) / 100;

      // Now we can simply take the sin of the rad position to get a value,
      // from -1 to 1. We multiply by amplitude (a value between 0 and 1) to
      // make sure the waveform isn't more powerful than desired.
      return Math.sin(positionInRads) * amplitude;
    }

    case 'square': {
      // Square waves are easy; the value is either `amplitude` or `-amplitude`.
      // Figure out how far we are through the current iteration, since the
      // drawable wave might have multiple iterations if frequency > 1Hz.
      const progressThroughIteration = progress % 100;

      return progressThroughIteration < 50 ? amplitude : -amplitude;
    }

    case 'sawtooth': {
      // Each sawtooth iteration simply ranges from `-amplitude` to `amplitude`
      // in a linear way.

      const progressThroughIteration = progress % 100;

      // Normally, this would be a simple cross-multiplication to normalize
      // between min and max, but our min is a negative number. Start by
      // adding that amount so that it ranges from `0 - 2*amplitude`
      const adjustedMax = amplitude * 2;

      return progressThroughIteration * adjustedMax / 100 - amplitude;
    }

    case 'triangle': {
      // This waveform might include multiple iterations, if frequency > 1Hz.
      // This is an easy thing to solve, though; make it cyclical so that we're
      // only looking at values from 0 to 99.
      const progressThroughIteration = progress % 100;

      // Each triangle iteration has 4 quadrants of equal size:
      // - the initial ramp up from 0 to 1
      // - the ramp down from 1 to 0,
      // - another from 0 to -1
      // - the final ramp back up from -1 to 0.
      //
      //  Q1 | Q2 |    |
      //    /|\   |    |
      //  /  |  \ |    |
      //  ---|---\|--- |-----/--------------------------------
      //     |    | \  |   /
      //     |    |  \ | /
      //     |    | Q3 | Q4
      //
      // Our `progressThroughIteration` is a value from 0 to 99, so we can
      // figure out which quadrant it's in by dividing this number by 4.
      //
      // (Adding 1 so that it ranges from 1-4 instead of 0.3. So that, for
      // example, 'second quadrant' is unambiguous.)
      const quadrant = Math.floor(progressThroughIteration / 25) + 1;

      const progressThroughQuadrant = progress % 25;

      switch (quadrant) {
        case 1: {
          // Quadrant 1 is easy, since it ranges from 0 to 1.
          // To get the value from 0 to 1, just divide progress by the
          // quadrant max (25). Then, to get the amplitude, multiply by the
          // wave's actual amplitude.
          //
          // To understand the `* amplitude` bit, remember that the wave's
          // amplitude ranges from 0 to 1.
          // If the wave is at max loudness, this value wouldn't be necessary
          // (since `* 1` can always be omitted).
          // If the wave is at half amplitude, though, our triangle's peak
          // should be halfway up from the X-axis. So we multiply by 0.5.
          return progressThroughQuadrant / 25 * amplitude;
        }

        case 2: {
          // Quadrant 2 is similar to quadrant 1, but reversed. Going from 1-0.
          // To solve this, we can simply subtract the value from our max
          // amplitude.
          // Again, if we're at max amplitude, this would just be `1 - stuff`.
          // Since we want to "invert" it vertically:
          //
          // Value  |  Inverted value
          // 1      |  0
          // 0.25   |  0.75
          // 0.5    |  0.5
          //
          // See how you can "invert" each value by subtracting it from 1?
          //
          // But yeah, because our max amplitude can be less than 1, we have
          // to use `amplitude` instead of `1`.
          return amplitude - progressThroughQuadrant / 25 * amplitude;
        }

        case 3: {
          // Our third quadrant ranges from 0 to -1.
          // This is getting more complicated, but it's really just building on
          // the previous 2 quadrants.
          //
          // Quadrant 3 is identical to quadrant 2 except that it's lower.
          // If amplitude is 1, you could think of quadrant 2 as being 1 lower
          // than quadrant 3.
          //
          // By subtracting our max amplitude from the end of the Q2 formula,
          // we lower it accordingly.
          return (
            amplitude - progressThroughQuadrant / 25 * amplitude - amplitude
          );
        }

        case 4: {
          // Finally, our final quadrant ranges from -1 to 0.
          // Similar to how Q3 was just Q2 minus amplitude, Q4 is really just
          // Q1 minus amplitude.
          //
          // This make sense when you think about it. Q3 is just Q2 but lower.
          // Similarly, Q4 is just Q1 but lower.
          return progressThroughQuadrant / 25 * amplitude - amplitude;
        }

        default: {
          // Should be impossible
          throw new Error('Unrecognized quadrant!');
        }
      }
    }

    default:
      throw new Error('Unrecognized waveform shape supplied: ' + shape);
  }
};

export const translateAxisRelativeYValue = (
  // a value from -1 to 1 (relative to the axis)
  yValue: number,
  // The height in pixels of our waveform drawing
  height: number
) => {
  // Invert the y value. This is so that negative values are below the line,
  // while positive ones are above it.
  yValue *= -1;

  // Start by changing the range of the yValue:
  // -1...1 -> 0...2
  const incrementedYValue = yValue + 1;

  // Now we can just cross-multiply!
  //     Y              X
  //  ------    =    ------
  //     2           height
  //
  // prettier-ignore
  return (incrementedYValue * height) / 2;
};

export const getInterceptPosition = (
  shape: WaveformShape,
  height: number,
  frequency: number,
  amplitude: number,
  progress: number
) => {
  const relativePosition = getPositionAtPointRelativeToAxis(
    shape,
    frequency,
    amplitude,
    progress
  );

  return translateAxisRelativeYValue(relativePosition, height);
};

export const applyWaveformAddition = (
  mainWave: Array<WaveformPoint>,
  appliedWaves: Array<Array<WaveformPoint>>,
  // ratio is the "effect" of the applied wave on the main wave, from 0-1.
  ratio: number
) => {
  if (ratio === 0) {
    // At 0, it has no effect. We can just return the main wave as-is.
    return mainWave;
  }

  // For everything in-between, the applied wave adjusts the main wave by the
  // amount specified.
  return mainWave.map((point, index) => {
    const appliedWavesAtPoint = sum(appliedWaves.map(wave => wave[index].y));

    const mainValue = point.y * (1 - ratio);
    const appliedValue = appliedWavesAtPoint * ratio;

    return {
      x: point.x,
      y: mainValue + appliedValue,
    };
  });
};

export const convertProgressToCycle = (progress: number) =>
  (progress * 100) % 100;

type GetHarmonicsForWaveArgs = {
  harmonicsForShape?: WaveformShape,
  baseFrequency: number,
  baseAmplitude: number,
  maxNumberToGenerate: number,
};
export const getHarmonicsForWave = ({
  harmonicsForShape = 'sine',
  baseFrequency,
  baseAmplitude,
  maxNumberToGenerate,
  ...delegated
}: GetHarmonicsForWaveArgs) => {
  if (maxNumberToGenerate === 0) {
    return [];
  }

  switch (harmonicsForShape) {
    // Sine waves have no harmonics
    case 'sine':
      return [];

    case 'sawtooth': {
      return range(1, maxNumberToGenerate).map(i => {
        // the first index would be our main wave; we're only interested in the
        // harmonics.
        const harmonicIndex = i + 1;

        const frequency = baseFrequency * harmonicIndex;
        const amplitude = baseAmplitude / harmonicIndex;

        return { shape: 'sine', frequency, amplitude, ...delegated };
      });
    }

    case 'square': {
      return range(1, maxNumberToGenerate).map(i => {
        // Our index will be simple increments (1,2,3,4...)
        // We're only interested in ODD harmonics for square waves, though
        // (3, 5, 7, 9...)
        //
        // We want to do the following conversion:
        //
        // Index | Harmonic
        //   1   |    3
        //   2   |    5
        //   3   |    7
        //   4   |    9
        //
        // Looking at the numbers, a simple formula presents itself:
        const harmonicIndex = i * 2 + 1;

        const frequency = baseFrequency * harmonicIndex;
        const amplitude = baseAmplitude / harmonicIndex;

        return { shape: 'sine', frequency, amplitude, ...delegated };
      });
    }

    case 'triangle': {
      // Triangles are similar to squares - they feature odd harmonics at
      // ever-increasing amplitudes - but with one wrinkle: the phase is
      // inverted for every second harmonic.
      return range(1, maxNumberToGenerate).map(i => {
        const harmonicIndex = i * 2 + 1;

        // Triangles alternate phases.
        // To understand this, first we need to understand that these two things
        // are equivalent:
        //
        // - cut the offset of the waveform by π (AKA 50%)
        // - Multiplying the amplitude by -1
        //
        // The reason for this makes sense if you imagine both scenarios.
        // A periodic waveform like the triangle can be thought of in 2 "halves"
        // the first half is a positive triangle, the second half is negative.
        //
        //   First
        //    /\ |
        //  /   \|
        //  -----|------/-
        //       |\   /
        //       | \/
        //       |Second
        //
        // When we rotate the offset by 50%, we invert it:
        //
        //           Second
        //             /\
        //           /   \
        //  \------/------\
        //   \   /
        //    \/
        //  First
        //
        // Similarly, if we multiply every point's amplitude by -1, we achieve
        // the exact same effect, through a different mechanism; instead of
        // pulling the waveform forward by 50%, we rotate it across a 3D axis
        // (imagine flipping a sign away from you to be upside down).
        //
        // So yeah, for triangles to work, we need to invert every second
        // wave that we add.
        const isOddHarmonic = i % 2 !== 0;
        const amplitudePhaseMultiplier = isOddHarmonic ? -1 : 1;

        const frequency = baseFrequency * harmonicIndex;
        const amplitude =
          baseAmplitude / harmonicIndex ** 2 * amplitudePhaseMultiplier;

        return { shape: 'sine', frequency, amplitude, ...delegated };
      });
    }

    default:
      return [];
  }
};

type GetWaveformsProps = {
  type: WaveformAdditionType,
  harmonicsForShape?: WaveformShape,
  phase?: number,
  baseFrequency: number,
  baseAmplitude: number,
  numOfHarmonics: number,
};

export const getWaveforms = ({
  type,
  harmonicsForShape,
  phase = 0,
  baseFrequency,
  baseAmplitude,
  numOfHarmonics,
}: GetWaveformsProps) => {
  switch (type) {
    case 'phase': {
      // Our phase ranges from 0 to 360, but we need to convert that to our
      // 0-100 offset for the waves. Additionally, we want the value to go
      // from 100-o, so that the phase moves to the right instead of the left.
      const offset = 100 - phase * 100 / 360;

      return [
        {
          shape: 'sine',
          frequency: baseFrequency,
          amplitude: baseAmplitude * 0.5,
          offset,
          strokeWidth: 5,
          color: convertHexToRGBA(COLORS.secondary[500], 0.6),
        },
        {
          shape: 'sine',
          frequency: baseFrequency,
          amplitude: baseAmplitude * 0.5,
          offset: 0,
          strokeWidth: 5,
          color: convertHexToRGBA(COLORS.primary[500], 0.6),
        },
      ];
    }

    case 'chord': {
      const sharedProperties = {
        shape: 'sine',
        amplitude: 0.45,
        offset: 0,
        strokeWidth: 5,
      };

      return [
        {
          ...sharedProperties,
          frequency: baseFrequency,
          color: convertHexToRGBA(COLORS.tertiary[500], 0.6),
        },
        {
          ...sharedProperties,
          frequency: baseFrequency * 1.25,
          color: convertHexToRGBA(COLORS.secondary[500], 0.6),
        },
        {
          ...sharedProperties,
          frequency: baseFrequency * 1.5,
          color: convertHexToRGBA(COLORS.primary[500], 0.6),
        },
      ];
    }

    case 'harmonics':
      return [
        ...getHarmonicsForWave({
          harmonicsForShape,
          baseFrequency,
          baseAmplitude,
          maxNumberToGenerate: numOfHarmonics,
          strokeWidth: 5,
          color: convertHexToRGBA(COLORS.secondary[500], 0.6),
        }),
        {
          shape: 'sine',
          frequency: baseFrequency,
          amplitude: baseAmplitude,
          offset: 0,
          strokeWidth: 5,
          color: convertHexToRGBA(COLORS.primary[500], 0.6),
        },
      ];

    default:
      throw new Error('Unrecognized type for `IntroRouteWaveformAddition`');
  }
};
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/types/index.js">
```javascript
export type Linecap = 'square' | 'round' | 'butt';

export type WaveformShape = 'sine' | 'triangle' | 'square' | 'sawtooth';
export type WaveformPoint = { x: number, y: number };

export type HarmonicsForShape = WaveformShape | 'cancellable';

export type WaveformAdditionType = 'harmonics' | 'phase' | 'chord';

export type AvailableIcon = 'volumeOff' | 'volumeOn';
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/src/utils/index.js">
```javascript
// TODO: Modernize
/* eslint-disable */
export const range = function(start, end, step) {
  var range = [];
  var typeofStart = typeof start;
  var typeofEnd = typeof end;

  if (step === 0) {
    throw TypeError('Step cannot be zero.');
  }

  if (typeof end === 'undefined' && typeof 'step' === 'undefined') {
    end = start;
    start = 0;
    typeofStart = typeof start;
    typeofEnd = typeof end;
  }

  if (typeofStart == 'undefined' || typeofEnd == 'undefined') {
    throw TypeError('Must pass start and end arguments.');
  } else if (typeofStart != typeofEnd) {
    throw TypeError('Start and end arguments must be of same type.');
  }

  typeof step == 'undefined' && (step = 1);

  if (end < start) {
    step = -step;
  }

  if (typeofStart == 'number') {
    while (step > 0 ? end >= start : end <= start) {
      range.push(start);
      start += step;
    }
  } else if (typeofStart == 'string') {
    if (start.length != 1 || end.length != 1) {
      throw TypeError('Only strings with one character are supported.');
    }

    start = start.charCodeAt(0);
    end = end.charCodeAt(0);

    while (step > 0 ? end >= start : end <= start) {
      range.push(String.fromCharCode(start));
      start += step;
    }
  } else {
    throw TypeError('Only string and number types are supported');
  }

  return range;
};
/* eslint-enable */

export const sample = arr => arr[Math.floor(Math.random() * arr.length)];

export const random = (min, max) =>
  Math.floor(Math.random() * (max - min)) + min;

export const sum = values => values.reduce((sum, value) => sum + value, 0);
export const mean = values => sum(values) / values.length;

export const clamp = (val, min = 0, max = 1) =>
  Math.max(min, Math.min(max, val));

export const roundTo = (number, places = 0) =>
  Math.round(number * 10 ** places) / 10 ** places;

export const debounce = (callback, wait, timeoutId = null) => (...args) => {
  window.clearTimeout(timeoutId);

  timeoutId = setTimeout(() => {
    callback.apply(null, args);
  }, wait);
};

export const isEmpty = obj => Object.keys(obj).length === 0;

export const omit = function(obj, key) {
  var newObj = {};

  for (var name in obj) {
    if (name !== key) {
      newObj[name] = obj[name];
    }
  }

  return newObj;
};

export const convertArrayToMap = list =>
  list.reduce(
    (acc, item) => ({
      ...acc,
      [item.id]: item,
    }),
    {}
  );

// Either removes or adds an item to an array
// EXAMPLE: toggleInArray([1, 2], 3) -> [1, 2, 3]
// EXAMPLE: toggleInArray([1, 2], 2) -> [1]
export const toggleInArray = (arr, item) =>
  arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];

// Combines 2 arrays, removing duplicates.
// EXAMPLE: mergeUnique([1, 2], [2, 3]) -> [1, 2, 3]
export const mergeUnique = (arr1, arr2) =>
  arr1.concat(arr2.filter(item => arr1.indexOf(item) === -1));

export const findRight = (arr, predicate) =>
  arr
    .slice()
    .reverse()
    .find(predicate);

export function requestAnimationFramePromise() {
  return new Promise(resolve => window.requestAnimationFrame(resolve));
}

export function setTimeoutPromise(duration) {
  return new Promise(resolve => window.setTimeout(resolve, duration));
}

export const deleteCookie = key => {
  document.cookie = `${encodeURIComponent(
    key
  )}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};

export const convertHexToRGBA = (hex, alpha = 1) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
```
  </file>
  <file path="samples/general/waveform-air-lab/pages/style.css">
```css
@font-face{font-family:Canela;src:url(assets/Canela-Bold-Web.woff2);font-weight:700}@font-face{font-family:Atlas;src:url(assets/AtlasGrotesk-Regular-Web.woff2)}@font-face{font-family:Atlas;src:url(assets/AtlasGrotesk-Bold-Web.woff2);font-weight:700}@font-face{font-family:Publico;src:url(assets/PublicoText-Roman-Web.woff2)}*{box-sizing:border-box}body{margin:0;background:#fafafa;color:#212121;font-family:Atlas,sans-serif}a{color:inherit;text-underline-offset:4px}header,footer{max-width:1250px;margin:auto;padding:24px 30px}header{display:flex;justify-content:space-between;font-size:12px;gap:24px;border-bottom:1px solid #ddd}main{max-width:1250px;margin:auto;padding:44px 30px 0}.eyebrow{font-size:15px;letter-spacing:3px;color:#888;margin:0 0 10px}h1{font-family:Canela,serif;font-size:88px;line-height:1;margin:0 0 25px}.intro{font-family:Publico,serif;font-size:21px;line-height:1.6;margin:0 0 34px}.toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.shapes{display:flex;gap:6px;margin-right:auto}button{font:inherit;font-size:13px;padding:11px 16px;cursor:pointer;border:1px solid #aaa;border-radius:3px;background:transparent;color:inherit}.shapes button[aria-pressed=true],#sound[aria-pressed=true]{background:#0380f4;color:white;border-color:#0380f4}:focus-visible{outline:3px solid #0380f4;outline-offset:4px}.panels{display:grid;grid-template-columns:1fr 1fr;gap:52px;margin-top:40px}.panels section{min-width:0}h2{font-size:17px;line-height:1.5;margin:0 0 9px}.panel-note{font-size:12px;line-height:1.6;color:#777;min-height:38px;margin:0}.plot-space{padding:25px 22px 30px 34px}.wave-stage{position:relative;line-height:0}.air-space{padding:25px 22px 30px 34px}.air-space canvas{display:block}.controls{display:grid;grid-template-columns:1fr 1fr 1fr;gap:30px;margin:15px 0 28px}.controls label{font-size:13px;color:#616161}.controls output{float:right;color:#212121;font-variant-numeric:tabular-nums}input[type=range]{display:block;width:100%;height:28px;accent-color:#0380f4;margin:13px 0 0;cursor:pointer}.track{display:flex;align-items:center;gap:8px;font-size:13px;color:#616161}.track input{accent-color:#0380f4;width:17px;height:17px}.sound{margin:28px 0 34px;padding:22px 0;display:flex;align-items:center;gap:25px;flex-wrap:wrap;border-top:1px solid #ddd;border-bottom:1px solid #ddd}.sound label{font-size:12px;display:flex;gap:16px;align-items:center}.sound input{width:135px;margin:0}.sound span{font-size:12px;color:#777;margin-left:auto}.reading{display:grid;grid-template-columns:1fr 1fr;gap:52px;margin-bottom:35px}.reading p{font-family:Publico,serif;font-size:16px;line-height:1.8;margin:15px 0}footer{border-top:1px solid #ddd;color:#777;font-size:12px;line-height:1.8}footer p{margin:10px 0 0}@media(max-width:750px){header{padding:20px;font-size:10px}header span{max-width:160px;text-align:right}main{padding:32px 20px 0}h1{font-size:64px}.eyebrow{font-size:12px}.intro{font-size:17px}.panels{grid-template-columns:1fr;gap:26px;margin-top:28px}.plot-space{padding:20px 20px 25px 32px}.air-space{padding:10px 20px 5px 32px}.panel-note{min-height:0;margin-bottom:15px}.shapes{flex-wrap:wrap;width:100%;gap:5px;margin-bottom:5px}button{font-size:12px;padding:10px 12px}.controls{grid-template-columns:1fr;gap:19px;margin-top:32px}.controls input{margin-top:6px}.sound{gap:18px}.sound span{margin:0}.reading{grid-template-columns:1fr;gap:16px}.reading p{font-size:15px}footer{padding:22px 20px}.track{font-size:12px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
```
  </file>
  <omitted path="app.js">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
</sample>
