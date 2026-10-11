import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {DesktopControlGate} from '../../../../dist/src/browser/service/desktopControlGate.js';
const directory=await mkdtemp(join(tmpdir(),'auracall-control-repro-'));
const lock=join(directory,createHash('sha256').update('fixture-display').digest('hex'));
try {
 await mkdir(lock); await writeFile(join(lock,'owner.json'),'');
 let effects=0,error;
 try {await new DesktopControlGate('fixture-display',directory).withAutomation('fixture',async()=>{effects++;});} catch(e){error=e;}
 const preserved=(await readFile(join(lock,'owner.json'),'utf8'))==='';
 console.log(JSON.stringify({error:error?.message,effects,preserved}));
 if(effects!==0||!preserved||!error?.message.includes('ownership record is invalid'))process.exitCode=1;
}finally{await rm(directory,{recursive:true,force:true});}
