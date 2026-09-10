<script>
	import * as Tone from 'tone'
	import { onMount,onDestroy } from 'svelte';
 const pendingNotes = new Set();
 const delay = (callback, ms) => { const id = setTimeout(() => { pendingNotes.delete(id); callback(); }, ms); pendingNotes.add(id); return id; };
 onDestroy(()=>{mounted=false;clearInterval(songTimer);clearInterval(eventTimer);pendingNotes.forEach(clearTimeout);synth?.dispose()});
	export let chapter;
	export let mode;
	export let eventClicked;
	let synth;
	let now;
	let mounted = false;
	export let soundon;
	let measure = 4000;
	let scales = ["A","Bb","B","C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B","C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B","C","Db","D","Eb","E","F","Gb","G","Ab"];
	let baseKey = 8;
	let key = baseKey;
	let progressionStep = -1;
	
	let chordProgressionLookup = {
"1": ["happy","anthem"],
"2": ["happy","anthem"],
"3": ["upbeat","peppy"]
}
	
	let songLookup = {
"anthem": [
			["1",measure/64/1000,2,0.5, true],
			["2",measure/64/1000,4,-1, true],
			["2",measure/64/1000,3,-1, true],
			["3",measure/16/1000,4, 0.5, true],
			["4",measure/64/1000,5, 0.5, false],
			["4",measure/64/1000,3, 0.5, false]
		],
"peppy": [
			["1",measure/64/1000,1,0.5, true],
			["2",measure/32/1000,4,-1, false],
			["3",measure/32/1000,3, 0.5, false],
			["4",measure/64/1000,3, 0.5, false],
			["4",measure/32/1000,4, 0.5, false]
		]
} 
	
	// each has 16
	let chordProgression = {
"happy": [
			[0, "M"],
			[4, "M"],
			[2, "m"],
			[5, "M"],
			[0, "M"],
			[4, "M"],
			[2, "m"],
			[5, "M"]
		],
"upbeat": [
			[0, "M"],
			[5, "M"],
			[2, "m"],
			[7, "M"],
			[0, "M"],
			[5, "M"],
			[2, "m"],
			[7, "M"]
		]
};
	let chord = "M";
	let chords = {
"M": [0, 4, 7],
"m": [0, 3, 7]
}
	
	onMount(async () => {
		synth = new Tone.PolySynth(Tone.Synth).toDestination();
		now = Tone.now();
		mounted = true;
	});
	
	async function soundToggle() {
 await Tone.start();
		soundon = !soundon;
		play("C8",0.05);
	}
	
	function play(n, length) {
		if (mounted) {
			if (soundon) {
				now = Tone.now();
				synth.triggerAttack(n, now);
			}
			synth.triggerRelease([n], now + length);
		}
	}

	let counter = 0;
	let songPlayed = false;
	const songTimer=setInterval(song, measure/24);
	function song() {
		if (mounted && soundon) {
			if (counter % 16 == 0 || counter == 0) {
				let currentProgression = chordProgression[chordProgressionLookup[chapter][0]];
				progressionStep +=1;
				if (progressionStep >= currentProgression.length - 1) {
					progressionStep = 0;
				}
				key = currentProgression[progressionStep][0];
				chord = currentProgression[progressionStep][1];
				//console.log(scales[key], chord);
			}

			let currentSong = songLookup[chordProgressionLookup[chapter][1]];
			for (let i = 0; i < currentSong.length; i++) {
				playNote(currentSong[i]);
			}
		} else if (mounted) {
			Tone.Transport.pause();
		}
		if (songPlayed) {
			counter++;
		}
	}
	
	function playNote(song) {
		songPlayed = true;
		let pitch = song[0];
		let len = song[1];
		let interval = song[2];
		let rand = song[3];
		let chordKey = song[4];
		if (counter % interval == 0 && 64-(counter%64) > len ) {
			let keyShift = key;
			if (!chordKey) {
				let keyRand = chords[chord].randFromArray();
				keyShift = key + keyRand;
			}
			let m = scales[keyShift];
			if (rand == -1 || Math.random() < rand ) {
				if (pitch == "4" || pitch == "3") {
					if (counter > 16) {
						play(m + pitch, len);
					}
				} else {
					play(m + pitch, len);
				}
			}
		}
	}
	
	const eventTimer=setInterval(function() {
		if (eventClicked == 1) {
			play("C8",0.05);
			eventClicked = 0;
		} 
		if (eventClicked == 3) {
			play("C6",0.05);
			delay(function() {
				play("G6",0.05);
				eventClicked = 0;
			},50);
		} 
		if (eventClicked == 2) {
			play("C7",0.05);
			delay(function() {
				play("E7",0.05);
			},50);
			delay(function() {
				play("G7",0.05);
			},100)
			delay(function() {
				play("Bb7",0.1);
			},150)
			eventClicked = 0;
		}
	},10);
	
	function onKeyDown(e) {
		if (e.keyCode == 32 && !e.target.closest("button,a,input,select,textarea")) {
 e.preventDefault();
			soundToggle();
		}
	}
	

	Array.prototype.randFromArray = function(){
	  return this[Math.floor(Math.random()*this.length)];
	}
	let oldChapter = -1;
	$: {
		if (chapter != oldChapter) {
			progressionStep = -1;
			oldChapter = chapter;
		}
		chapter = chapter;
		soundon = soundon;
 if(mounted && !soundon)synth.releaseAll();
		mode = mode;
	}
</script>	
<svelte:window on:keydown={onKeyDown}/>
<div class="soundbar">
		<button class="soundbutton" on:click={soundToggle}>
			{#if soundon}
				<img class="soundIcon" alt="sound on button" src="assets/kimchi/universal/sound-on-dark.png"/>
				Sound: on
			{:else}
				<img class="soundIcon" alt="sound off button" src="assets/kimchi/universal/sound-off-dark.png"/>
				Sound: off
			{/if}
		</button>
</div>
<style>
	.soundbar { margin: 0px auto; text-align: right; max-width: 1200px; position: relative; height: 23px; width: 100%;}
	.soundbutton {
		position: absolute;
		cursor: pointer;
		display: inline-block;
		/* position: absolute; */
		right: 0px;
		top: 0px;
		/* background: rgba(0,0,0,0.1); */
		width: 120px;
		font-size: 18px;
		border-radius: 0%;
		color: black;
		text-align: left;
		z-index: 999;
		user-select: none;
		background: none;
		margin: 0px auto;
		padding: 0px 0px 2px;
	}
	.soundbutton.light {
		color: white;
	}
	.soundbutton img {
		width: 20px;
		height: 20px;
		margin-right: 5px;
		float: left;
	}
	.soundbutton:hover {
		opacity: 0.6;
	}
</style>