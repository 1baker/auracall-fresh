import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { win32 } from "node:path";
import { promisify } from "node:util";

/** Read-only checks of the explicit capability path, never a profile/credential scan. */
export async function assertStockPrivatePath(path: string): Promise<void> {
	const info = await lstat(path);
	if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
		throw new Error("Native capability path is not a regular private path");
	if (process.platform !== "win32") {
		if ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())
			throw new Error("Native capability path is not private to this user");
		return;
	}
	const systemRoot = process.env.SystemRoot;
	if (!systemRoot || !win32.isAbsolute(systemRoot))
		throw new Error("Windows ACL checker unavailable");
	const literal = path.replace(/'/g, "''");
	const script = `$ErrorActionPreference='Stop'; $p='${literal}'; $i=Get-Item -LiteralPath $p -Force; if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse path'}; $acl=Get-Acl -LiteralPath $p; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid){throw 'Foreign owner'}; $allowed=@($sid,'S-1-5-18','S-1-5-32-544'); $mask=1 -bor 2 -bor 4 -bor 64 -bor 65536 -bor 262144 -bor 524288; foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and ($rule.FileSystemRights.value__ -band $mask) -ne 0 -and $allowed -notcontains $rule.IdentityReference.Value){throw 'Broad access'}}; [Console]::Out.Write('PRIVATE')`;
	const { stdout } = await promisify(execFile)(
		win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
		[
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-EncodedCommand",
			Buffer.from(script, "utf16le").toString("base64"),
		],
		{ timeout: 5000, maxBuffer: 1024, windowsHide: true },
	);
	if (stdout !== "PRIVATE") throw new Error("Windows private-path verification unavailable");
}
