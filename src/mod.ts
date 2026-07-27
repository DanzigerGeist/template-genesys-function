import type { Context } from "aws-lambda";
import type { FunctionHandler, FunctionRequest, FunctionResponse } from "./types/mod.ts";

/**
 * Genesys Cloud function entry point.
 *
 * Receives a {@linkcode FunctionRequest} from the Data Action and returns
 * a {@linkcode FunctionResponse} to the calling Architect flow.
 */
export const handler: FunctionHandler = (
  _request: FunctionRequest,
  _context: Context,
): Promise<FunctionResponse> => {
  return Promise.resolve({
    exampleOutput: "Hello from Genesys Cloud function",
  });
};
