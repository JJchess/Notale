export function music(state,render,score){
 const Tone=window.Tone,synth=new Tone.PolySynth(Tone.Synth).toDestination(),measure=4000,scales='A Bb B C Db D Eb E F Gb G Ab'.split(' ');
 let now=Tone.now(),key=8,chord='M',step=-1,counter=0,played=false,oldChapter=-1;
 const {chords,progressions,songs}=score;
 function play(note,length){if(state.s){now=Tone.now();synth.triggerAttack(note,now)}synth.triggerRelease([note],now+length)}
 setInterval(()=>{let chapter=Math.min(state.c,3);if(chapter!==oldChapter){step=-1;oldChapter=chapter}if(state.s){let progression=progressions[chapter===3?'upbeat':'happy'];if(counter%16===0){if(++step>=progression.length-1)step=0;[key,chord]=progression[step]}for(let [pitch,len,interval,chance,root]of songs[chapter===3?'peppy':'anthem']){played=true;if(counter%interval===0&&64-counter%64>len){let shift=key;if(!root)shift+=chords[chord][0];let note=scales[shift%12];if(chance===-1||Math.random()<chance){if(pitch<'3'||counter>16)play(note+pitch,len)}}}}else Tone.Transport.pause();if(played)counter++},measure/24);
 setInterval(()=>{if(state.e===1){play('C8',.05);state.e=0}if(state.e===2){play('C7',.05);setTimeout(()=>play('E7',.05),50);setTimeout(()=>play('G7',.05),100);setTimeout(()=>play('Bb7',.1),150);state.e=0}},10);
 return{async toggle(){await Tone.start();state.s=!state.s;play('C8',.05);if(!state.s)synth.releaseAll();render()},mute(){state.s=false;synth.releaseAll();render()}};
}
