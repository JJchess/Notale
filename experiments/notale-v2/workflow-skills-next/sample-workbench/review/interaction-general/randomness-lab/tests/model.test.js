const M=require('../output/pages/assets/model.js');
const cases=['000000000000','010101010101','001001001001','011010011101'].map(M.analyze);
for(let i=1;i<cases.length;i++)if(!(cases[i-1].score<cases[i].score))throw Error('fixture order failed');
if(M.theory().n!==4096||M.theory().scores.length!==4096)throw Error('theory is not exhaustive');
for(const x of cases)console.log(x.sequence,x.score.toFixed(3),`LZ=${x.lz}`,`blocks=${x.blocks.join('/')}`,`switches=${x.switches}`,`lag=${x.lag.match.toFixed(3)}`);
