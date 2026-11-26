import assert from "node:assert/strict";

/** Parse the native UTC timestamp, including the REST API's whole seconds. */
export function releaseTime(value) {
  const time = Date.parse(value);
  assert.ok(Number.isSafeInteger(time), "Invalid release evidence timestamp");
  const precise = new Date(time).toISOString();
  assert.ok(
    value === precise || value === precise.replace(".000Z", "Z"),
    "Invalid release evidence timestamp",
  );
  return time;
}

/** A whole-second native timestamp bounds events to the end of that second. */
export function latestRecordedTime(value) {
  return releaseTime(value) + (value.length === 20 ? 999 : 0);
}

export function sealAuthorizationTime(authorizedAt, publishedAt) {
  const time = releaseTime(authorizedAt);
  assert.equal(
    authorizedAt,
    new Date(time).toISOString(),
    "Missing precise native seal authorization time",
  );
  assert.ok(
    time <= latestRecordedTime(publishedAt),
    "The native seal authorization postdates provider publication",
  );
  return time;
}
