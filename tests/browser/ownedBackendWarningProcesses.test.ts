import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

test("a native response on one owned client denies another OS process sharing its provider account", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "auracall-response-processes-"));
	const children: ChildProcess[] = [];
	const start = (id: string) => {
		const child = spawn(
			process.execPath,
			[
				"--import",
				"tsx",
				"--input-type=module",
				"-e",
				`
import {setAuracallHomeDirOverrideForTest} from ${JSON.stringify(path.resolve("src/auracallHome.ts"))};
import {createConfiguredProviderTrafficAuthorityFactory} from ${JSON.stringify(path.resolve("src/browser/configuredProviderTrafficAuthority.ts"))};
import {annotateClientMutationContext,resolveProviderTrafficGovernor} from ${JSON.stringify(path.resolve("src/browser/providers/mutationAudit.ts"))};
setAuracallHomeDirOverrideForTest(${JSON.stringify(root)});
const runtime=${JSON.stringify(id)};
const factory=createConfiguredProviderTrafficAuthorityFactory({userConfig:{auracallProfile:runtime,services:{chatgpt:{identity:{email:'operator@example.test'}}}},provider:'chatgpt',managedBrowserProfile:'/fixture/'+runtime,mutationAudit:async()=>{},baseOptions:{interactionGovernor:{beforeInteraction:async()=>{}}}});
const handlers=new Set();
const client={Network:{enable:async()=>{},responseReceived:handler=>{handlers.add(handler);return()=>handlers.delete(handler);}},close:async()=>{}};
await annotateClientMutationContext(client,{providerTrafficAuthorityFactory:factory,providerTrafficRequired:true},'provider:chatgpt','target-'+runtime);
const governor=resolveProviderTrafficGovernor(client);
process.on('message',async command=>{
try{
 if(command==='warning'){for(const handler of handlers)await handler({requestId:'fixture-request',response:{url:'https://chatgpt.com/backend-api/conversations',status:429}});process.send('warning-observed');}
 if(command==='admit'){try{const action=await governor.begin({kind:'navigate',interactionClass:'renavigation',source:'fixture',targetId:'target-'+runtime});await action.settle({outcome:'succeeded'});process.send('admitted');}catch(e){process.send(e.reason??e.message);}}
 if(command==='close'){await client.close();process.send('closed');}
}catch(e){process.send('fixture-error:'+e.message);}
});process.send('ready');
`,
			],
			{ stdio: ["ignore", "ignore", "inherit", "ipc"] },
		);
		children.push(child);
		const messages: unknown[] = [];
		const waiters: Array<(value: unknown) => void> = [];
		child.on("message", (value) => {
			const waiter = waiters.shift();
			if (waiter) waiter(value);
			else messages.push(value);
		});
		return {
			child,
			next: () =>
				messages.length
					? Promise.resolve(messages.shift())
					: new Promise<unknown>((resolve) => waiters.push(resolve)),
		};
	};
	try {
		const a = start("runtime-a");
		const b = start("runtime-b");
		expect(await a.next()).toBe("ready");
		expect(await b.next()).toBe("ready");
		b.child.send("admit");
		expect(await b.next()).toBe("admitted");
		a.child.send("warning");
		expect(await a.next()).toBe("warning-observed");
		b.child.send("admit");
		expect(await b.next()).toBe("provider-warning");
		for (const worker of [a, b]) {
			worker.child.send("close");
			expect(await worker.next()).toBe("closed");
		}
	} finally {
		await Promise.all(
			children.map(async (child) => {
				if (child.exitCode !== null || child.signalCode !== null) return;
				const exit = once(child, "exit");
				child.kill();
				await exit;
			}),
		);
		await rm(root, { recursive: true, force: true });
	}
}, 10000);
