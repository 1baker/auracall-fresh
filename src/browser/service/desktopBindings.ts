import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAuracallHomeDir } from '../../auracallHome.js';

const bindingSchema = z.object({
  desktopName: z.string().min(1),
  managedProfileDir: z.string().min(1),
  browserId: z.string().min(1),
  session: z.string().min(1),
  routePoolEntryId: z.string().min(1),
  routeId: z.string().min(1),
  displayAllocationId: z.string().min(1),
  cdpHost: z.string().min(1).optional(),
  cdpPort: z.number().int().min(1).max(65535).optional(),
  handoffUrl: z.url().refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && /^\/remote-view\/[A-Za-z0-9_-]+$/.test(url.pathname);
  }, 'A durable remote-view handoff without provider credentials is required.'),
});
export type DesktopBinding = z.infer<typeof bindingSchema>;

/** One atomic file per managed browser avoids lost updates between browser launches. */
export class DesktopBindingStore {
  constructor(private readonly directory = path.join(getAuracallHomeDir(), 'desktop-bindings')) {}

  async record(input: DesktopBinding): Promise<void> {
    const binding = bindingSchema.parse(input);
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const id = createHash('sha256').update(path.resolve(binding.managedProfileDir)).digest('hex');
    const temporary = path.join(this.directory, `.${id}-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, JSON.stringify(binding), { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, path.join(this.directory, `${id}.json`));
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  async list(): Promise<DesktopBinding[]> {
    const files = await fs.readdir(this.directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    return Promise.all(files.filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map(async (name) =>
      bindingSchema.parse(JSON.parse(await fs.readFile(path.join(this.directory, name), 'utf8')))));
  }
}
