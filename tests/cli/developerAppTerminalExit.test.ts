import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { expect, it } from 'vitest';

it.each([['completed', 0], ['failed', 1]] as const)('settles the actual apps CLI action after %s despite retained browser handles', (status, expectedCode) => {
  const source = readFileSync('bin/auracall.ts', 'utf8');
  const ast = ts.createSourceFile('auracall.ts', source, ts.ScriptTarget.Latest, true);
  const names = ['runChatgptDeveloperAppsCliAction', 'exitAfterCompletedDeveloperAppCommand'];
  const bodies = ast.statements.filter((s) => ts.isFunctionDeclaration(s) && s.name && names.includes(s.name.text)).map((s) => s.getText(ast)).join('\n');
  const compiled = ts.transpile(bodies, { target: ts.ScriptTarget.ES2022 });
  const script = `
    const path=require('node:path');
    const program={opts:()=>({json:true})};
    const resolveConfig=async()=>({});
    const getAuracallHomeDir=()=>'/fixture';
    const resolveManagedProfileDirForUserConfig=()=>'/fixture/browser';
    const createFileBackedBrowserOperationDispatcher=()=>({acquire:async()=>({acquired:true,release:async()=>{process.stdout.write('RELEASED\\n')}})});
    const runChatgptDeveloperAppOperationForCli=async()=>({action:'test',status:${JSON.stringify(status)},payload:'x'.repeat(200000)});
    const formatChatgptDeveloperAppOperationResult=()=>'';
    const formatBrowserOperationBusyResult=()=>'';
    setInterval(()=>{},10000);
    ${compiled}
    runChatgptDeveloperAppsCliAction({opts:()=>({})},()=>({action:'test',submit:false})).catch(e=>{console.error(e);process.exit(2)});
  `;
  const result=spawnSync(process.execPath,['-e',script],{timeout:1500,maxBuffer:1000000,encoding:'utf8',env:{...process.env,NODE_OPTIONS:''}});
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(expectedCode);
  expect(result.stdout.endsWith('RELEASED\n')).toBe(true);
  expect(JSON.parse(result.stdout.slice(0, -'RELEASED\n'.length)).payload).toHaveLength(200000);
});
