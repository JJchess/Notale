import {build} from 'esbuild';await build({entryPoints:['src/main.js'],bundle:true,format:'iife',outfile:'app.js',minify:true});
