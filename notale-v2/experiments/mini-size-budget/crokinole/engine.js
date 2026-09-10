const {Bodies,Body,Vector,Composite,Events,Runner,Render,Engine}=window.Matter;
import * as S from "./specs.js";
const variables={"color": {"pink-aa": "#FF24FF", "teal-aa": "#00A3A3", "black": "#000000"}};
const {Howl}=window;
import { muted } from "./mute.js";

const base=".";

const DISC_CATEGORY = 0x0001;
const PEG_CATEGORY = 0x0002;
const TRAP_CATEGORY = 0x0004;
const RIM_CATEGORY = 0x0008;
const SURFACE_CATEGORY = 0x0010;
const DISC_RESTITUTION = 1;
const DISC_DENSITY = 0.05;
const DISC_FRICTIONAIR = 0.05;
const PEG_RESTITUTION = 1;
const MAX_RATE = 0.2;

const COLOR = {
	player1: variables.color["pink-aa"],
	player2: variables.color["teal-aa"],
	active: variables.color["black"],
	vector: variables.color["black"]
};

let visible = false;
let globalMuted;

// Create a new sound
const DISC_SOUND = new Howl({
	src: [`${base}/assets/audio/disc.mp3`]
});

const RIM_SOUND = new Howl({
	src: [`${base}/assets/audio/rim.mp3`]
});

const FLICK_SOUND = new Howl({
	src: [`${base}/assets/audio/flick.mp3`]
});

const HOLE_SOUND = new Howl({
	src: [`${base}/assets/audio/hole.mp3`]
});

muted.subscribe((value) => {
	globalMuted = value;
});

// Define a simple event emitter class
class EventEmitter {
	constructor() {
		this.events = {};
	}

	// Register an event listener
	on(event, listener) {
		if (!this.events[event]) {
			this.events[event] = [];
		}
		this.events[event].push(listener);
	}

	// Emit an event
	emit(event, data) {
		if (this.events[event]) {
			this.events[event].forEach((listener) => listener(data));
		}
	}
}

export default function createCrokinoleSimulation() {
	const emitter = new EventEmitter(); // Event emitter instance

	let engine;
	let world;
	let runner;
	let render;
	let shotMaxMagnitude;
	let shotMaxIndicatorMagnitude;
	let shotVector;
	let indicatorVector;
	let indicatorVisible;
	
	let muteOverride;
	let canvasWidth;
	let discs = [];
	let state;
	let activeDisc;

	function scale(v) {
		const s = canvasWidth / (S.boardR * 2);
		return v * s;
	}

function createZones(){
const radii=[S.boardR,S.boardR-S.rimW,S.surfaceR,S.twentyR,S.fifteenR,S.tenR,S.fiveR],labels=['surface','surface','surface','20','15','10','5'];
const bodies=radii.map((r,i)=>Bodies.circle(S.center,S.center,r,{isStatic:true,isSensor:true,render:{visible,fillStyle:'rgba(0,0,0,0)',lineWidth:1},label:labels[i]},64));
Composite.add(world,[bodies[1],bodies[0],...bodies.slice(2)]);
}

function createTrap(n,t,r,label,category){let trap=[];for(let i=0;i<n;i++){let angle=i/n*2*Math.PI;trap.push(Bodies.rectangle(S.center+Math.cos(angle)*r,S.center+Math.sin(angle)*r,t,2*Math.PI*r/n,{isStatic:true,isSensor:false,angle,render:{visible:false},label,collisionFilter:{category,mask:DISC_CATEGORY}}))}Composite.add(world,trap)}
function createTrap20(){const t=Math.max(2,S.twentyR);createTrap(16,t,S.twentyR+t/2-1,'trap 20',TRAP_CATEGORY)}

function createTrapRim(){const t=S.twentyR*4;createTrap(32,t,S.baseR-S.rimW+t/2-1,'trap rim',RIM_CATEGORY)}

function createTrapSurface(){const t=S.twentyR;createTrap(32,t,S.surfaceR-t/2+1,'trap surface',SURFACE_CATEGORY)}

	function createPegs() {
		const pegBodies = [];
		const r = S.pegR;

		// Loop through 8 pegs
		for (let i = 0; i < 8; i++) {
			const angle = 3 / 8 + (i / 8) * Math.PI * 2;
			const x = S.center + Math.cos(angle) * S.fifteenR;
			const y = S.center + Math.sin(angle) * S.fifteenR;

			const peg = Bodies.circle(
				x,
				y,
				r,
				{
					isStatic: true,
					restitution: PEG_RESTITUTION,
					render: { visible },
					collisionFilter: {
						category: PEG_CATEGORY,
						mask: DISC_CATEGORY
					}
				},
				32
			);

			pegBodies.push(peg);
		}

		Composite.add(world, pegBodies);
	}

	function drawArrow(ctx, fromX, fromY, toX, toY, arrowLength) {
		const angle = Math.atan2(toY - fromY, toX - fromX);

		// Calculate the points for the arrowhead
		const arrowX1 = toX - arrowLength * Math.cos(angle - Math.PI / 4);
		const arrowY1 = toY - arrowLength * Math.sin(angle - Math.PI / 4);

		const arrowX2 = toX - arrowLength * Math.cos(angle + Math.PI / 4);
		const arrowY2 = toY - arrowLength * Math.sin(angle + Math.PI / 4);

		// Draw the two lines of the arrowhead
		ctx.moveTo(toX, toY);
		ctx.lineTo(arrowX1, arrowY1);

		ctx.moveTo(toX, toY);
		ctx.lineTo(arrowX2, arrowY2);
	}

	function drawIndicator(ctx) {
		if (!activeDisc) return;

		const discR = activeDisc.circleRadius;
		const discP = activeDisc.position;

		if (state === "shoot" && indicatorVector && indicatorVisible) {
			// Calculate the direction of the vector (normalized)
			const normalizedVector = Vector.normalise(indicatorVector);

			const startX = scale(discP.x + normalizedVector.x * discR * 1.25);
			const startY = scale(discP.y + normalizedVector.y * discR * 1.25);

			const endX = scale(
				discP.x + normalizedVector.x * discR * 1.5 + indicatorVector.x
			);
			const endY = scale(
				discP.y + normalizedVector.y * discR * 1.5 + indicatorVector.y
			);

			// Start drawing the main indicator line
			ctx.beginPath();
			ctx.strokeStyle = COLOR.vector;
			ctx.lineWidth = canvasWidth < 480 ? 1 : 2;

			// Draw the solid line starting from the outer edge of the disc
			ctx.moveTo(startX, startY);
			ctx.lineTo(endX, endY);
			ctx.stroke();

			// Draw the arrow at the end of the line
			const arrowLength = scale(discR * 0.75);
			const arrowAngle = Math.PI / 4; // Angle for the arrowhead

			// Calculate direction of the arrow based on the indicatorVector
			const angle = Math.atan2(indicatorVector.y, indicatorVector.x);
			const x1 = endX - arrowLength * Math.cos(angle - arrowAngle);
			const y1 = endY - arrowLength * Math.sin(angle - arrowAngle);
			const x2 = endX - arrowLength * Math.cos(angle + arrowAngle);
			const y2 = endY - arrowLength * Math.sin(angle + arrowAngle);

			// Draw the two lines of the arrowhead
			ctx.beginPath();
			ctx.moveTo(endX, endY);
			ctx.lineTo(x1, y1);
			ctx.moveTo(endX, endY);
			ctx.lineTo(x2, y2);
			ctx.stroke();
			ctx.closePath();
		} else if (state === "position" && indicatorVisible) {
			ctx.beginPath();
			ctx.strokeStyle = COLOR.vector;
			ctx.stroke();

			ctx.beginPath();
			ctx.strokeStyle = COLOR.vector;
			ctx.lineWidth = canvasWidth < 480 ? 1 : 2;

			const x1 = scale(discP.x - discR * 2.5);
			const x2 = scale(discP.x - discR * 1.25);
			const x3 = scale(discP.x + discR * 2.5);
			const x4 = scale(discP.x + discR * 1.25);
			const y = scale(discP.y);
			const r = scale(discR * 0.75);

			ctx.moveTo(x1, y);
			ctx.lineTo(x2, y);
			ctx.moveTo(x3, y);
			ctx.lineTo(x4, y);

			ctx.stroke();
			ctx.closePath();

			ctx.beginPath();
			drawArrow(ctx, x2, y, x1, y, r);
			drawArrow(ctx, x4, y, x3, y, r);
			ctx.stroke();
			ctx.closePath();
		}
	}

	function afterRender() {
		const ctx = render.context;
		drawIndicator(ctx);
	}

	function collisionActive(event) {
		// twenty hole
		event.pairs.forEach(({ bodyA, bodyB }) => {
			const disc =
				bodyA.label === "disc" ? bodyA : bodyB.label === "disc" ? bodyB : null;
			const zone20 =
				bodyA.label === "20" ? bodyA : bodyB.label === "20" ? bodyB : null;

			if (disc && zone20 && !disc.in20) {
				const dist = Vector.magnitude(
					Vector.sub(disc.position, zone20.position)
				);

				const discRadius = disc.circleRadius;

				const distThreshold = discRadius * 0.75;
				const speedThreshold = 10;

				const isClose = dist < distThreshold;
				const isSlow = disc.speed < speedThreshold;

				const enableTrap = isClose && isSlow;

				if (enableTrap) {
					if (!globalMuted && !muteOverride) {
						const v = Math.min(1, disc.speed * 0.03);

						HOLE_SOUND.volume(v);
						HOLE_SOUND.play();
					}
					disc.in20 = true;
					disc.collisionFilter.mask =
						DISC_CATEGORY | PEG_CATEGORY | RIM_CATEGORY | TRAP_CATEGORY;
					disc.restitution = 0.4;
				}
			}
		});
	}

	function collisionStart(event) {
		event.pairs.forEach(({ bodyA, bodyB }) => {
			const disc =
				bodyA.label === "disc" ? bodyA : bodyB.label === "disc" ? bodyB : null;

			const otherDisc =
				bodyA.label === "disc" && bodyA.id !== disc.id
					? bodyA
					: bodyB.label === "disc" && bodyB.id !== disc.id
						? bodyB
						: null;

			const rim =
				bodyA.label === "trap rim"
					? bodyA
					: bodyB.label === "trap rim"
						? bodyB
						: null;

			if (disc && rim) {
				if (!globalMuted && !muteOverride) {
					const v = Math.min(1, disc.speed * 0.05);
					RIM_SOUND.volume(v);
					RIM_SOUND.play();
				}
				disc.frictionAir = 0.3;
				disc.collisionFilter.mask =
					DISC_CATEGORY | PEG_CATEGORY | RIM_CATEGORY | SURFACE_CATEGORY;
			} else if (disc && otherDisc) {
				if (!globalMuted && !muteOverride) {
					const v = Math.min(1, disc.speed * 0.05);
					RIM_SOUND.volume(v);
					DISC_SOUND.play();
				}
				disc.collided = true;
				otherDisc.collided = true;
				const opp = disc.player !== otherDisc.player;
				disc.collidedOpp = opp;
				otherDisc.collidedOpp = opp;
			}
		});
	}

	function updateShotVector(target) {
		if (!activeDisc) return;
		const vector = {
			x: target.x - activeDisc.position.x,
			y: target.y - activeDisc.position.y
		};

		const normalizedVector = Vector.normalise(vector);

		const currentMagnitude = Vector.magnitude(vector);
		const indicatorMagnitude = Math.min(
			currentMagnitude,
			shotMaxIndicatorMagnitude
		);

		const shotVectorMagnitude =
			(indicatorMagnitude / shotMaxIndicatorMagnitude) * shotMaxMagnitude;

		// update vector based on clamped vector length
		shotVector = Vector.mult(normalizedVector, shotVectorMagnitude);

		// visual version
		indicatorVector = Vector.mult(normalizedVector, indicatorMagnitude);
	}

	function getZoneForDisc(disc) {
		const discR = disc.circleRadius;
		const discP = disc.position;

		const distance = Math.sqrt(
			Math.pow(discP.x - S.center, 2) + Math.pow(discP.y - S.center, 2)
		);

		const zones = [
			{ r: S.twentyR, score: 20 },
			{ r: S.fifteenR, score: 15 },
			{ r: S.tenR, score: 10 },
			{ r: S.fiveR, score: 5 }
		];

		// see if it is outside, if not move on
		const match = zones.find((zone) => distance + discR < zone.r);

		return match?.score || 0;
	}

	function getIntersect15(disc) {
		const discR = disc.circleRadius;
		const discP = disc.position;

		const distance = Math.sqrt(
			Math.pow(discP.x - S.center, 2) + Math.pow(discP.y - S.center, 2)
		);

		const zoneR = S.fifteenR;

		if (distance - discR < zoneR) return true;
	}

	function sleepStart() {
		// check if all discs sleeping
		const allSleeping = discs.every((d) => d.isSleeping);

		if (allSleeping) {
			// score
			discs.forEach((d) => {
				d.score = getZoneForDisc(d);
				d.intersect15 = getIntersect15(d);
			});

			// validate
			// opponents on board
			const hasOpps = discs.some((d) => d.player !== activeDisc.player);
			const collidedOpp = discs.some((d) => d.collidedOpp);
			const intersected15 = discs
				.filter((d) => d.player === activeDisc.player)
				.some((d) => d.intersect15);
			discs.forEach((d) => {
				// opponent on board
				if (hasOpps) {
					// same as shooter
					const samePlayer = d.player === activeDisc.player;
					if (samePlayer) {
						// if shooter
						const isShooter = d.id === activeDisc.id;
						if (isShooter) {
							d.valid = collidedOpp;
						} else {
							// if non-shooter (if it collided, one disc must have opp collided)
							d.valid = d.collided ? collidedOpp : true;
						}
					} else {
						// opp is always valid
						d.valid = true;
					}
				} else {
					// no opps on board - open 20
					if (d.id === activeDisc.id) {
						d.valid = d.collided ? intersected15 : d.intersect15;
					} else {
						// one disc must be in or on 15 or it didn't get touched
						d.valid = d.collided ? intersected15 : true;
					}
				}
				if (!d.valid || !d.score) Composite.remove(world, d);
			});

			// was active disc valid?
			const valid = discs.find((d) => d.id === activeDisc.id).valid;

			// clean up
			discs = discs.filter((d) => d.score > 0 && d.valid);

            emitter.emit("shotCompleteManual", { discs, valid });
		}
	}

	// public methods
	function removeDiscs() {
		discs.forEach((disc) => {
			Composite.remove(world, disc);
		});

		discs = [];
		activeDisc = null;
		indicatorVisible = false;
		indicatorVector = undefined;
		shotVector = undefined;
	}

	function addDisc(opts = {}) {
		const player = opts.player || "player1";
		const s = opts.state || "position";
		const x = opts.x ? opts.x : S.center;
		const y = opts.y
			? opts.y
			: player === "player1"
				? S.center + S.fiveR
				: S.center - S.fiveR;
		const r = S.discR;
		const density = DISC_DENSITY;
		const restitution = DISC_RESTITUTION;
		const frictionAir = DISC_FRICTIONAIR;

		const disc = Bodies.circle(
			x,
			y,
			r,
			{
				density,
				restitution,
				frictionAir,
				render: {
					fillStyle: COLOR[player]
				},
				label: "disc",
				collisionFilter: {
					category: DISC_CATEGORY,
					mask: DISC_CATEGORY | PEG_CATEGORY | RIM_CATEGORY
				},
				sleepThreshold: 60,
				isSleeping: true
			},
			64
		);

		disc.player = player;
		discs.push(disc);
		activeDisc = disc;

		Events.on(disc, "sleepStart", sleepStart);
		Composite.add(world, disc);

		shotMaxMagnitude = activeDisc.mass * MAX_RATE;

		setState(s);
	}

	// Practice shots are controlled by the learner; the unused bot search is omitted.

	function positionDisc(inputX) {
		if (!activeDisc || state !== "position") return;
		const buffer = 2;
		const angles = [45 - buffer, 135 + buffer];

		// Clamp diffX to be within the bounds of the five circle's radius
		const diffX = Math.max(-S.fiveR, Math.min(S.fiveR, inputX - S.center));

		const p1 = activeDisc.player === "player1";
		const mult = p1 ? -1 : 1;
		const minAngle = angles[p1 ? 0 : 1] * mult * -1;
		const maxAngle = angles[p1 ? 1 : 0] * mult * -1;
		// Calculate the y-coordinate based on the clamped diffX
		const y =
			S.center -
			Math.sqrt(Math.max(0, Math.pow(S.fiveR, 2) - Math.pow(diffX, 2))) * mult;

		// Set the disc's position to the clamped x and calculated y
		const newPosition = { x: S.center + diffX, y };
		const radians = Vector.angle(
			{ x: S.center, y: S.center },
			newPosition
		);
		const degrees = (radians * 180) / Math.PI;
		if (degrees > minAngle && degrees < maxAngle) {
			Body.setPosition(activeDisc, newPosition);
		} else if (degrees <= minAngle) {
			const radiansClamped = (minAngle * Math.PI) / 180;
			const a = Math.cos(radiansClamped) * S.fiveR;
			const b = Math.sin(radiansClamped) * S.fiveR;
			const x = S.center + a;
			const y = S.center + b;
			Body.setPosition(activeDisc, { x, y });
		} else if (degrees >= maxAngle) {
			const radiansClamped = (maxAngle * Math.PI) / 180;
			const a = Math.cos(radiansClamped) * S.fiveR;
			const b = Math.sin(radiansClamped) * S.fiveR;
			const x = S.center + a;
			const y = S.center + b;
			Body.setPosition(activeDisc, { x, y });
		}
	}



	function getTarget({ degrees, speed, random }) {
		const offset = 0;
		const radians = ((degrees + offset - 90) * Math.PI) / 180;
		const x = activeDisc.position.x + Math.cos(radians);
		const y = activeDisc.position.y + Math.sin(radians);

		// make the target maxVectorIndicatorMagnitude away from the activeDisc position
		const target = {
			x: activeDisc.position.x + (x - activeDisc.position.x) * speed,
			y: activeDisc.position.y + (y - activeDisc.position.y) * speed
		};

		return target;
	}

	function aimDisc({ degrees, power, visible, random }) {
		if (!activeDisc || state !== "shoot") return;

		const v = visible === undefined ? true : visible;
		setIndicatorVisible(v);

		const speed = Math.max(0.01, power) * shotMaxIndicatorMagnitude;
		const target = getTarget({ degrees, speed, random });
		updateShotVector(target);
	}

	function flickDisc() {
		if (!activeDisc || state !== "shoot") return;

		setState("play");

		setIndicatorVisible(false);

		Body.applyForce(activeDisc, activeDisc.position, shotVector);

		if (!globalMuted && !muteOverride) {
			const v = Math.min(1, Vector.magnitude(shotVector) * 0.4);
			FLICK_SOUND.volume(v);
			FLICK_SOUND.play();
		}
	}

	function setState(v) {
		state = v;
	}

	function autoMute(v) {
		muteOverride = v;
	}

	function setIndicatorVisible(v) {
		indicatorVisible = v;
	}

	function resize(w) {
		if (render) {
			canvasWidth = w;
			render.canvas.width = w;
			render.canvas.height = w;

			Render.setSize(render, w, w);
			Render;

			Render.lookAt(render, {
				min: { x: 0, y: 0 },
				max: { x: S.boardR * 2, y: S.boardR * 2 }
			});
		}
	}

	function init({ element, width, tutorial }) {
		

		shotMaxIndicatorMagnitude = S.center * 0.2;

		engine = Engine.create({
			enableSleeping: true
		});
		world = engine.world;

		engine.gravity.y = 0;

		runner = Runner.create();

		render = Render.create({
			element,
			engine,
			options: {
				width: S.boardR * 2,
				height: S.boardR * 2,
				wireframes: false,
				pixelRatio: "auto",
				background: "transparent",
				showSleeping: false,
				hasBounds: true
			}
		});

		createZones();
		createPegs();
		createTrap20();
		createTrapRim();
		createTrapSurface();

		Runner.run(runner, engine);
		Render.run(render);

		resize(width);

		Events.on(render, "afterRender", afterRender);
		Events.on(engine, "collisionActive", collisionActive);
		Events.on(engine, "collisionStart", collisionStart);

		emitter.emit("ready");
	}

	return {
		destroy() { Runner.stop(runner); Render.stop(render); Composite.clear(world, false); Engine.clear(engine); render.canvas.remove(); },
		snapshot() { return discs.map(d => ({player:d.player,x:d.position.x,y:d.position.y,score:d.score,valid:d.valid})); },
		removeDiscs,
		addDisc,
		positionDisc,
		aimDisc,
		flickDisc,
		setState,
		setIndicatorVisible,
		autoMute,
		resize,
		init,
		on: (event, listener) => emitter.on(event, listener)
	};
}
