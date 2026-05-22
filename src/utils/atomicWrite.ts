import { existsSync } from "fs";
import { writeFile, rename, unlink } from "fs/promises";
import { randomUUID } from "crypto";

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, content, "utf-8");
    await rename(tempPath, filePath);
  } catch (err) {
    if (existsSync(tempPath)) {
      await unlink(tempPath).catch(() => {});
    }
    throw err;
  }
}
