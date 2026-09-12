import fs from "node:fs/promises";
import { collectRSDL, collectX } from "./public-data.mjs";
await fs.mkdir("public/data", { recursive: true });
for (const [name, collect] of [
  ["rsdl", collectRSDL],
  ["x", collectX],
]) {
  try {
    const result = await collect();
    await fs.writeFile(
      `public/data/${name}.json`,
      JSON.stringify(result, null, 2),
    );
    console.log(`${name}: refreshed ${result.items.length} public records`);
  } catch (error) {
    console.warn(
      `${name}: ${error.message}; retaining previous public snapshot`,
    );
    try {
      await fs.access(`public/data/${name}.json`);
    } catch {
      await fs.writeFile(
        `public/data/${name}.json`,
        JSON.stringify(
          {
            sourceId: name === "x" ? "x-tibo" : "wechat-rsdl",
            fetchedAt: "",
            items: [],
            error: error.message,
          },
          null,
          2,
        ),
      );
    }
  }
}
