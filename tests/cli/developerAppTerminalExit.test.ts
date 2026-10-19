import { Command } from "commander";
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { DeveloperAppTimeoutError, formatChatgptDeveloperAppListFailure } from '../../src/cli/chatgptDeveloperAppsCommand.js';

it.each([
	"inventory",
	"queue-admission",
])("returns JSON and nonzero status from the actual list action at %s", async (stage) => {
	const source = readFileSync("bin/auracall.ts", "utf8");
	const ast = ts.createSourceFile("auracall.ts", source, ts.ScriptTarget.Latest, true);
	const body = ast.statements.find(
		(s) => ts.isFunctionDeclaration(s) && s.name?.text === "runChatgptDeveloperAppsCliAction",
	)!;
	const compiled = ts.transpile(body.getText(ast), { target: ts.ScriptTarget.ES2022 });
	let released = 0;
	let exited = 0;
	const output: string[] = [];
	const process = { exitCode: 0, cwd: () => "/fixture", env: {} };
	const action = new Function(
		"path",
		"program",
		"resolveConfig",
		"getAuracallHomeDir",
		"resolveManagedProfileDirForUserConfig",
		"createFileBackedBrowserOperationDispatcher",
		"runChatgptDeveloperAppOperationForCli",
		"formatChatgptDeveloperAppListFailure",
		"formatBrowserOperationBusyResult",
		"exitAfterCompletedBrowserUtilityCommand",
		"process",
		"console",
		`${compiled};return runChatgptDeveloperAppsCliAction;`,
	)(
		{ join: () => "/fixture" },
		{ opts: () => ({ json: true }) },
		async () => ({}),
		() => "/fixture",
		() => "/fixture",
		() => ({
			acquireQueued: async () =>
				stage === "queue-admission"
					? { acquired: false }
					: {
							acquired: true,
							release: async () => {
								released++;
							},
						},
		}),
		async () => {
			throw new DeveloperAppTimeoutError("inventory deadline", "inventory", 10);
		},
		formatChatgptDeveloperAppListFailure,
		() => "operation busy",
		async () => {
			exited++;
		},
		process,
		{ log: (value: string) => output.push(value) },
	);
	await action({ opts: () => ({}) }, () => ({ action: "list" }));
	expect(process.exitCode).toBe(1);
	expect(output).toHaveLength(1);
	expect(JSON.parse(output[0])).toMatchObject({ action: "list", status: "failed", stage });
	expect(released).toBe(stage === "inventory" ? 1 : 0);
	expect(exited).toBe(1);
});

it.each([['completed', 0], ['failed', 1]] as const)('settles the actual apps CLI action after %s despite retained browser handles', (status, expectedCode) => {
  const source = readFileSync('bin/auracall.ts', 'utf8');
  const ast = ts.createSourceFile('auracall.ts', source, ts.ScriptTarget.Latest, true);
  const names = ['runChatgptDeveloperAppsCliAction', 'exitAfterCompletedBrowserUtilityCommand'];
  const bodies = ast.statements.filter((s) => ts.isFunctionDeclaration(s) && s.name && names.includes(s.name.text)).map((s) => s.getText(ast)).join('\n');
  const compiled = ts.transpile(bodies, { target: ts.ScriptTarget.ES2022 });
  const script = `
    const path=require('node:path');
    const program={opts:()=>({json:true})};
    const resolveConfig=async()=>({});
    const getAuracallHomeDir=()=>'/fixture';
    const resolveManagedProfileDirForUserConfig=()=>'/fixture/browser';
    const createFileBackedBrowserOperationDispatcher=()=>({acquireQueued:async()=>({acquired:true,release:async()=>{process.stdout.write('RELEASED\\n')}})});
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

it.each([[], ['--browser-model-strategy', 'select'], ['--browser-model-strategy', 'current']])('forwards only an explicit model flag from the actual app command registration: %j', async (...args) => {
  const flags = args as string[];
  const program = new Command().option('--browser-model-strategy <strategy>', '', 'select');
  program.parse(['node','fixture',...flags]);
  const source=readFileSync('bin/auracall.ts','utf8');
  const start=source.indexOf("appsCommand\n  .command('test <app>')");
  const end=source.indexOf("appsCommand\n  .command('uninstall",start);
  const ast=ts.createSourceFile('action.ts',source.slice(start,end),ts.ScriptTarget.Latest,true);
  let callback: ts.FunctionExpression | undefined;
  const visit=(node: ts.Node)=>{if(ts.isFunctionExpression(node))callback=node;else ts.forEachChild(node,visit);};
  visit(ast); expect(callback).toBeDefined();
  let strategy: unknown;
  const compiled=ts.transpile('const action='+callback!.getText(ast)+';',{target:ts.ScriptTarget.ES2022});
  const action=new Function('program','runChatgptDeveloperAppsCliAction',compiled+';return action;')(program,async (_command: unknown, build: (options: Record<string,unknown>)=>{modelStrategy?:unknown})=>{strategy=build({...program.opts(),submit:true,yes:true,prompt:'fixture',expectedAccount:'fixture'}).modelStrategy;});
  await action.call(new Command(),'fixture-app');
  expect(strategy).toBe(flags.length ? flags[1] : undefined);
});
