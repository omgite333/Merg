import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AllProvidersFailedError, normalizeContent, runChain } from "./llmProvider";

const OPTIONS = { temperature: 0, maxTokens: 1024, label: "test-agent" };

/** A provider whose behaviour is scripted per call site under test. */
function provider(id: any, model: string, invoke: () => Promise<any>) {
  return { id, model, invoke };
}

function httpError(status: number, message: string) {
  const error: any = new Error(message);
  error.status = status;
  return error;
}

let log: ReturnType<typeof spyOn>;

beforeEach(() => {
  log = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  log.mockRestore();
});

interface LogEntry {
  component?: string;
  event: string;
  [key: string]: any;
}

function servedEvents(): LogEntry[] {
  return (log.mock.calls as any[][])
    .map((call: any[]) => JSON.parse(call[0] as string) as LogEntry)
    .filter((entry: LogEntry) => entry.component === "llm");
}

describe("runChain", () => {
  test("uses the primary provider and reports it when it succeeds", async () => {
    const result = await runChain(
      [provider("groq", "gpt-oss", async () => ({ content: "[]" }))],
      [],
      OPTIONS
    );

    expect(result.provider).toBe("groq");
    expect(result.attempts).toBe(1);
    expect(result.content).toBe("[]");
    expect(servedEvents().map((e) => e.event)).toEqual(["llm.served"]);
  });

  test("falls over to the next provider when the primary 500s", async () => {
    const result = await runChain(
      [
        provider("groq", "gpt-oss", async () => {
          throw httpError(500, "upstream exploded");
        }),
        provider("gemini", "gemini-2.5-flash", async () => ({ content: "[]" })),
      ],
      [],
      OPTIONS
    );

    expect(result.provider).toBe("gemini");
    expect(result.attempts).toBe(2);
    expect(servedEvents().map((e) => e.event)).toEqual(["llm.failover", "llm.served"]);
  });

  test("falls over on a rate limit", async () => {
    const result = await runChain(
      [
        provider("groq", "gpt-oss", async () => {
          throw httpError(429, "rate_limit_exceeded");
        }),
        provider("openai", "gpt-4o-mini", async () => ({ content: "[]" })),
      ],
      [],
      OPTIONS
    );

    expect(result.provider).toBe("openai");
  });

  test("falls over on an auth failure and flags the key as suspect", async () => {
    const result = await runChain(
      [
        provider("groq", "gpt-oss", async () => {
          throw httpError(401, "invalid api key");
        }),
        provider("gemini", "gemini-2.5-flash", async () => ({ content: "[]" })),
      ],
      [],
      OPTIONS
    );

    expect(result.provider).toBe("gemini");
    const events = servedEvents();
    expect(events[0]!.event).toBe("llm.auth_failed");
    expect(events[0]!.hint).toContain("API key");
    expect(events[0]!.next).toBe("gemini");
  });

  test("does not burn the chain on a malformed request", async () => {
    const secondCalled = { value: false };
    const promise = runChain(
      [
        provider("groq", "gpt-oss", async () => {
          throw httpError(400, "bad request");
        }),
        provider("gemini", "gemini-2.5-flash", async () => {
          secondCalled.value = true;
          return { content: "[]" };
        }),
      ],
      [],
      OPTIONS
    );

    await expect(promise).rejects.toThrow("bad request");
    expect(secondCalled.value).toBe(false);
    expect(servedEvents().map((e) => e.event)).toEqual(["llm.fatal"]);
  });

  test("throws with every provider's reason once the chain is exhausted", async () => {
    const promise = runChain(
      [
        provider("groq", "gpt-oss", async () => {
          throw httpError(500, "boom");
        }),
        provider("gemini", "gemini-2.5-flash", async () => {
          throw new Error("socket hang up");
        }),
      ],
      [],
      OPTIONS
    );

    await expect(promise).rejects.toThrow(AllProvidersFailedError);
    try {
      await runChain(
        [
          provider("groq", "gpt-oss", async () => {
            throw httpError(500, "boom");
          }),
        ],
        [],
        OPTIONS
      );
    } catch (error: any) {
      expect(error.failures).toEqual([
        { provider: "groq", model: "gpt-oss", reason: "500: boom" },
      ]);
    }
    expect(servedEvents().map((e) => e.event)).toContain("llm.exhausted");
  });

  test("records how long the whole failover took, not just the winner", async () => {
    const result = await runChain(
      [
        provider("groq", "gpt-oss", async () => {
          throw httpError(500, "boom");
        }),
        provider("gemini", "gemini-2.5-flash", async () => ({ content: "[]" })),
      ],
      [],
      OPTIONS
    );

    const served = servedEvents().find((e) => e.event === "llm.served")!;
    expect(served.attempt).toBe(2);
    expect(served.of).toBe(2);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("normalizeContent", () => {
  test("passes a plain string through", () => {
    expect(normalizeContent("hello")).toBe("hello");
  });

  test("flattens the content-block array some providers return", () => {
    expect(normalizeContent([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("ab");
  });

  test("flattens the nested text.value shape", () => {
    expect(normalizeContent([{ type: "text", text: { value: "a" } }])).toBe("a");
  });

  test("degrades to an empty string rather than throwing", () => {
    expect(normalizeContent(null)).toBe("");
    expect(normalizeContent(undefined)).toBe("");
  });
});
