const byId = id => document.getElementById(id);
function fallback() {
	byId("fallback").hidden = false;
	byId("webgl").hidden = true;
}
let RAPIER;
try {
	RAPIER = (await import("./lib/rapier3d-deterministic/dist/rapier.mjs")).default;
	await RAPIER.init();
} catch {
	fallback();
}
if (RAPIER) initialize();
function initialize() {
	Deck.init();
	const THREE = window.THREE;
	const canvas = byId("webgl");
	let renderer;
	try {
		renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
	} catch {
		fallback();
		return;
	}
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(37, 1116 / 652, .1, 100);
	camera.position.set(-8.4, 5.2, 9.8);
	camera.lookAt(0, 0, 0);
	scene.add(new THREE.HemisphereLight(0xf7fbfc, 0x526267, 1.7));
	const light = new THREE.DirectionalLight(0xffffff, 2.4);
	light.position.set(-5, 8, 7);
	scene.add(light);
	const finish = color => new THREE.MeshStandardMaterial({
		color, metalness: .76, roughness: .25
	});
	const materials = {
		outer: finish(0x315e69), middle: finish(0x718d8d), inner: finish(0x99928a),
		rotor: finish(0xc65a34), steel: finish(0xdce4e5)
	};
	const names = ["housing", "outer", "middle", "inner", "rotor"];
	const parts = Object.fromEntries(names.map(name => [name, new THREE.Group()]));
	names.forEach(name => scene.add(parts[name]));
	function add(parent, geometry, material, rotation = [0, 0, 0]) {
		const object = new THREE.Mesh(geometry, material);
		object.rotation.set(...rotation);
		parent.add(object);
		return object;
	}
	const cube = new THREE.BoxGeometry(1, 1, 1);
	const frame = new THREE.LineSegments(new THREE.EdgesGeometry(
		new THREE.BoxGeometry(6.85, 6.45, .3)), new THREE.LineBasicMaterial({ color: 0x46565b }));
	parts.housing.add(frame);
	for (const [name, radius, rotation] of [
		["outer", 2.62, [0, 0, 0]], ["middle", 2.16, [0, Math.PI / 2, 0]],
		["inner", 1.7, [Math.PI / 2, 0, 0]]
	]) add(parts[name], new THREE.TorusGeometry(radius, .12, 18, 128), materials[name], rotation);
	const wheel = add(parts.rotor,
		new THREE.TorusGeometry(1.12, .19, 20, 128), materials.rotor);
	wheel.rotation.y = Math.PI / 2;
	for (let index = 0; index < 12; index++) {
		const spoke = add(parts.rotor, cube, materials.rotor, [index * Math.PI / 12, 0, 0]);
		spoke.scale.set(.12, 1.9, .1);
	}
	for (const [radius, length] of [[.3, .65], [.12, 4]]) {
		add(parts.rotor, new THREE.CylinderGeometry(radius, radius, length, 28),
			materials.steel).rotation.z = Math.PI / 2;
	}
	const grid = new THREE.GridHelper(15, 30, 0x81969b, 0xb8c5c8);
	grid.position.y = -3.7;
	scene.add(grid);
	const zero = { x: 0, y: 0, z: 0 };
	const identity = { w: 1, ...zero };
	const finalStep = 1128;
	let world;
	let bodies;
	let step = 0;
	let comparison;
	function body(mass, values) {
		const description = mass ? RAPIER.RigidBodyDesc.dynamic().setAdditionalMassProperties(
			mass, zero, { x: values[0], y: values[1], z: values[2] }, identity).setAngularDamping(0)
			: RAPIER.RigidBodyDesc.kinematicPositionBased();
		return world.createRigidBody(description);
	}
	function resetModel() {
		world?.free();
		world = new RAPIER.World(zero);
		world.timestep = 1 / 240;
		world.integrationParameters.numSolverIterations = 32;
		bodies = { housing: body() };
		for (const [name, mass, inertia] of [
			["outer", 2.4, [8.24, 8.24, 16.48]], ["middle", 2, [9.33, 4.67, 4.67]],
			["inner", 1.7, [2.46, 4.91, 2.46]], ["rotor", 6, [7.2, 3.7, 3.7]],
			["spin", 6, [7.2, 3.7, 3.7]], ["still", 6, [7.2, 3.7, 3.7]]
		]) bodies[name] = body(mass, inertia);
		bodies.spin.setTranslation({ x: 30, y: 0, z: 0 }, false);
		bodies.still.setTranslation({ x: 60, y: 0, z: 0 }, false);
		for (const [parent, child, axis] of [
			["housing", "outer", [1, 0, 0]], ["outer", "middle", [0, 1, 0]],
			["middle", "inner", [0, 0, 1]], ["inner", "rotor", [1, 0, 0]]
		]) world.createImpulseJoint(RAPIER.JointData.revolute(zero, zero,
			{ x: axis[0], y: axis[1], z: axis[2] }), bodies[parent], bodies[child], true);
		bodies.rotor.setAngvel({ x: 52, y: 0, z: 0 }, true);
		bodies.spin.setAngvel({ x: 52, y: 0, z: 0 }, true);
		step = 0;
		comparison = null;
	}
	const target = new THREE.Quaternion(.173, -.228, .254, .924);
	function advance() {
		if (step >= 180 && step < 660) {
			let amount = (step - 179) / 480;
			amount = amount * amount * (3 - 2 * amount);
			bodies.housing.setNextKinematicRotation(new THREE.Quaternion().slerp(target, amount));
		}
		if (step >= 840 && step < 1008) {
			for (const name of ["rotor", "spin", "still"])
				bodies[name].applyTorqueImpulse({ x: 0, y: 0, z: 10 / 240 }, true);
		}
		world.step();
		step++;
		if (step === 1008) comparison = {
			spin: drift(bodies.spin), still: drift(bodies.still)
		};
	}
	function drift(body) {
		const rotation = body.rotation();
		return Math.acos(THREE.MathUtils.clamp(
			1 - 2 * (rotation.y ** 2 + rotation.z ** 2), -1, 1)) * 180 / Math.PI;
	}
	function render() {
		for (const name of names) {
			const rotation = bodies[name].rotation();
			parts[name].quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
		}
		const phase = step < 180 ? "建立角动量" : step < 660 ? "外壳转动"
			: step < 840 ? "主轴保持" : step < 1008 ? "施加横向力矩" : "决定性状态";
		byId("phase-name").textContent = phase;
		const readings = comparison || { spin: drift(bodies.spin), still: drift(bodies.still) };
		const rotation = bodies.housing.rotation();
		readings.housing = 2 * Math.acos(Math.min(1, Math.abs(rotation.w))) * 180 / Math.PI;
		readings.drift = drift(bodies.rotor);
		for (const name in readings) byId(name).textContent = `${readings[name].toFixed(1)}°`;
		for (const name of ["spin", "still"])
			byId(`${name}-bar`).style.setProperty("--value", `${Math.min(100, readings[name] * 2)}%`);
		renderer.render(scene, camera);
	}
	let stopLoop = () => {};
	function replay() {
		stopLoop();
		resetModel();
		render();
		stopLoop = Deck.loop(time => {
			const targetStep = Math.min(finalStep, Math.round(time * .24));
			while (step < targetStep) advance();
			render();
			if (step === finalStep && !Deck.reduced()) stopLoop();
		}, { still: 4700 });
	}
	function resize() {
		renderer.setPixelRatio(Deck.ratio());
		renderer.setSize(1116, 652, false);
		render();
	}
	const stopResize = Deck.onResize(resize);
	byId("reset").addEventListener("click", replay);
	addEventListener("pagehide", () => {
		stopLoop();
		stopResize();
		byId("reset").removeEventListener("click", replay);
		world.free();
		scene.traverse(object => {
			object.geometry?.dispose();
			object.material?.dispose();
		});
		renderer.dispose();
		renderer.forceContextLoss?.();
		document.documentElement.dataset.disposed = "true";
	}, { once: true });
	replay();
	resize();
}
