import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, test } from "vitest";

test.each([
	{ size: 1, failed: false },
	{ size: 200000, failed: false },
	{ size: 1, failed: true },
])("context command preserves terminal status and complete output: %j", ({ size, failed }) => {
	const source = readFileSync("bin/auracall.ts", "utf8");
	const start = source.indexOf("conversationContextCommand\n  .command('get <id>')");
	const end = source.indexOf("program\n  .command('rename <id> <name>')", start);
	const ast = ts.createSourceFile(
		"context-command.ts",
		source.slice(start, end),
		ts.ScriptTarget.Latest,
		true,
	);
	let action: ts.ArrowFunction | undefined;
	const visit = (node: ts.Node) => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === "action"
		) {
			action = node.arguments[0] as ts.ArrowFunction;
		} else ts.forEachChild(node, visit);
	};
	visit(ast);
	if (!action) throw new Error("Registered context command callback missing");
	const whole = ts.createSourceFile("auracall.ts", source, ts.ScriptTarget.Latest, true);
	const helpers = whole.statements
		.filter(
			(node) =>
				ts.isFunctionDeclaration(node) &&
				node.name &&
				node.name.text === "exitAfterCompletedBrowserUtilityCommand",
		)
		.map((node) => node.getText(whole))
		.join("\n");
	const compiled = ts.transpile(`${helpers}\nconst action = ${action.getText(ast)};`, {
		target: ts.ScriptTarget.ES2022,
	});
	const script = `
    const program={opts:()=>({})};
    const resolveConfig=async()=>({browser:{target:'chatgpt'}});
    const promptForCacheIdentity=()=>{throw new Error('No identity prompt expected')};
    const DEFAULT_CACHE_HISTORY_LIMIT=2000;
    const createLlmService=()=>({getConversationContext:async()=>{
      if(${failed})throw new Error('fixture context failure');
      process.stderr.write('SETTLED\\n');
      return {provider:'chatgpt',messages:[{role:'assistant',text:'x'.repeat(${size})}]};
    }});
    setInterval(()=>{},10000);
    ${compiled}
    action('11111111-1111-4111-8111-111111111111',{jsonOnly:true},{parent:{parent:{opts:()=>({})}},getOptionValueSource:()=>undefined})
      .catch(e=>{console.error(e);process.exit(1)});
  `;
	const childEnv = { ...process.env };
	childEnv.NODE_OPTIONS = "";
	const result = spawnSync(process.execPath, ["-e", script], {
		timeout: 1500,
		maxBuffer: 1000000,
		encoding: "utf8",
		env: childEnv,
	});
	expect(result.error?.message).toBeUndefined();
	expect(result.status).toBe(failed ? 1 : 0);
	if (failed) {
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("fixture context failure");
	} else {
		expect(result.stderr).toBe("SETTLED\n");
		expect(JSON.parse(result.stdout).messages[0].text).toHaveLength(size);
	}
});
