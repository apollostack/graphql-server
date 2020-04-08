import { IncomingMessage } from "http";
import { SerializedGraphqlRequest } from "./transport";
import { GraphQLRequest } from "../../types";
import { parse as urlParse } from "url";

/**
 * Parse an [`http.IncomingMessage`] for GET parameters from the query-string.
 */
export async function parseGetRequest(
  req: IncomingMessage,
): Promise<SerializedGraphqlRequest> {
  if (typeof req.url !== "string") {
    throw new Error("Must have `url` on request to parse the query string.");
  }
  // We'll extract the parameters from the query string for GET requests.
  const { query: parsedQueryString } = urlParse(req.url, true);
  [
    "query",
    "operationName",
    "variables",
    "extensions"
  ].forEach(
    (paramName: string) => {
      if (typeof parsedQueryString[paramName] === "object") {
        throw new Error(
          `The '${paramName}' parameter must not be specified more than once.`,
        );
      }
    },
  );
  return parsedQueryString;
}

/**
 * Parse an [`http.IncomingMessage`] for JSON content POST-ed with the
 * request.  This data is received on its [`stream.Readable`] provided by
 * the [`EventEmitter`] it extends from.
 *
 * [`http.IncomingMessage`]: https://nodejs.org/api/http.html#http_class_http_incomingmessage
 * [`stream.Readable`]: https://nodejs.org/api/stream.html#stream_class_stream_readable
 * [`EventEmitter`]: https://nodejs.org/api/events.html#events_class_eventemitter
 */
export async function parsePostRequest(
  req: IncomingMessage,
): Promise<SerializedGraphqlRequest> {
  // On a POST, we'll read the body from the `Readable` stream.
  const body: string = await new Promise((resolve, reject) => {
    const data: Uint8Array[] = [];
    req
      .on("data", chunk => data.push(chunk))
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(data).toString("utf-8")));
  });
  return (
    parseJsonInputAsObject<GraphQLRequest>(body, "Body is malformed JSON") ||
    Object.create(null)
  );
}

/**
 * Parse a JSON string and assert that it is in fact an object after parsing.
 *
 * @param input
 * @param errMsg
 */
export function parseJsonInputAsObject<T>(
  input: string,
  errMsg: string,
): T | undefined {
  if (typeof input !== "string") {
    return;
  }
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed !== "object") {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new SyntaxError(errMsg);
  }
}

export const __testing__ = {
  parseGetRequest,
  parsePostRequest,
};
