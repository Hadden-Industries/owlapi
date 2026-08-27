const reasons = Object.freeze({
  push: "NOT_APPLICABLE_ON_PUSH",
  workflow_dispatch: "NOT_APPLICABLE_ON_MANUAL_RELEASE",
});
const eventName = process.env.GITHUB_EVENT_NAME;
const reason = reasons[eventName];
if (!reason) {
  throw new Error(
    `Dependency-review applicability has no closed reason for ${eventName ?? "missing event"}.`,
  );
}
process.stdout.write(
  `${JSON.stringify({ result: "NOT_APPLICABLE", reason }, null, 2)}\n`,
);
