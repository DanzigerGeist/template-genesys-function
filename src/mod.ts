import type { FunctionHandler } from "./types/mod.ts";

/**
 * Genesys Cloud function entry point.
 *
 * Receives a {@linkcode FunctionRequest} from the Data Action and returns
 * a {@linkcode FunctionResponse} to the calling Architect flow.
 */
export const handler: FunctionHandler = (_request, _context) => {
  return Promise.resolve({
    exampleOutput: "Hello from Genesys Cloud function",
  });
};
