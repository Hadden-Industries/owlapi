import { describe, expect, jest, test } from "@jest/globals";

import {
  MAINTENANCE_ISSUE_TITLE,
  reportMaintenanceResult,
} from "./report-maintenance-failure.mjs";

const context = Object.freeze({
  apiUrl: "https://api.github.com",
  repository: "Hadden-Industries/owlapi",
  runId: "12345",
  runAttempt: "2",
  commit: "0123456789abcdef0123456789abcdef01234567",
  serverUrl: "https://github.com",
  token: "test-token",
});

// GitHub's stateless installation-token format is substantially longer than
// the legacy token shape and contains JWT separators. Keep this synthetic
// credential obviously non-secret while exercising the full opaque value.
const STATELESS_INSTALLATION_TOKEN =
  "ghs_1234567890123_" +
  "a".repeat(160) +
  "." +
  "b".repeat(170) +
  "." +
  "c".repeat(170);

const response = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe("maintenance finding reporter", () => {
  test("creates one stable issue for the first failed health run", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(201, { number: 17 }));

    await expect(
      reportMaintenanceResult({ ...context, result: "failure", fetchImpl }),
    ).resolves.toEqual({ action: "CREATED", issueNumber: 17 });

    const [, mutation] = fetchImpl.mock.calls;
    expect(mutation[0]).toBe(
      "https://api.github.com/repos/Hadden-Industries/owlapi/issues",
    );
    expect(JSON.parse(mutation[1].body)).toMatchObject({
      title: MAINTENANCE_ISSUE_TITLE,
    });
    expect(mutation[1].headers.authorization).toBe("Bearer test-token");
  });

  test("forwards stateless installation tokens as opaque credentials", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, []))
      .mockResolvedValueOnce(response(201, { number: 17 }));

    await expect(
      reportMaintenanceResult({
        ...context,
        result: "failure",
        token: STATELESS_INSTALLATION_TOKEN,
        fetchImpl,
      }),
    ).resolves.toEqual({ action: "CREATED", issueNumber: 17 });

    expect(STATELESS_INSTALLATION_TOKEN).toHaveLength(520);
    for (const [, request] of fetchImpl.mock.calls) {
      expect(request.headers.authorization).toBe(
        `Bearer ${STATELESS_INSTALLATION_TOKEN}`,
      );
    }
  });

  test("adds a run-specific comment instead of creating duplicate issues", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        response(200, [{ number: 17, title: MAINTENANCE_ISSUE_TITLE }]),
      )
      .mockResolvedValueOnce(response(201, { id: 99 }));

    await expect(
      reportMaintenanceResult({ ...context, result: "cancelled", fetchImpl }),
    ).resolves.toEqual({ action: "COMMENTED", issueNumber: 17 });

    expect(fetchImpl.mock.calls[1][0]).toBe(
      "https://api.github.com/repos/Hadden-Industries/owlapi/issues/17/comments",
    );
  });

  test("closes an open maintenance issue after health recovers", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        response(200, [{ number: 17, title: MAINTENANCE_ISSUE_TITLE }]),
      )
      .mockResolvedValueOnce(response(200, { number: 17, state: "closed" }));

    await expect(
      reportMaintenanceResult({ ...context, result: "success", fetchImpl }),
    ).resolves.toEqual({ action: "CLOSED", issueNumber: 17 });

    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
      state: "closed",
      state_reason: "completed",
    });
  });

  test("reconciles an ambiguous create response without retrying the write", async () => {
    const marker = "<!-- owlapi-maintenance-run:12345:2 -->";
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, []))
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(
        response(200, [
          {
            number: 18,
            title: MAINTENANCE_ISSUE_TITLE,
            body: `${marker}\nRecorded despite the lost response.`,
          },
        ]),
      );

    await expect(
      reportMaintenanceResult({ ...context, result: "failure", fetchImpl }),
    ).resolves.toEqual({ action: "RECONCILED_CREATED", issueNumber: 18 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("rejects untrusted repository and result values before network access", async () => {
    const fetchImpl = jest.fn();

    await expect(
      reportMaintenanceResult({
        ...context,
        repository: "attacker/repository;echo",
        result: "failure",
        fetchImpl,
      }),
    ).rejects.toThrow(/repository/u);
    await expect(
      reportMaintenanceResult({
        ...context,
        result: "unexpected",
        fetchImpl,
      }),
    ).rejects.toThrow(/result/u);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
