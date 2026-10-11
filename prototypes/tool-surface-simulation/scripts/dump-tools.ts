// PROTOTYPE — throwaway. Dumps a surface's tool names, descriptions, and JSON input schemas.
import { z } from "zod";
import { toolsFor, type Surface } from "../src/surfaces";

const surface = (process.argv[2] ?? "C") as Surface;
const tools = toolsFor(surface).map((t) => {
  const { $schema, ...inputSchema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
  return { name: t.name, write: t.write, description: t.description, inputSchema };
});
console.log(JSON.stringify(tools, null, 1));
