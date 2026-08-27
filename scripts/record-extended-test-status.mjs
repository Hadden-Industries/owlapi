const observations = [
  ["branded-safari", "NOT_RUN", "NO_BRANDED_PROVIDER_CONFIGURED"],
  ["historical-browsers", "NOT_RUN", "NO_HISTORICAL_PROVIDER_CONFIGURED"],
  ["hosted-browser-service", "NOT_RUN", "NO_HOSTED_PROVIDER_CONFIGURED"],
  ["physical-real-devices", "NOT_RUN", "NO_DEVICE_LAB_CONFIGURED"],
];
process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      blocking: false,
      observations: observations.map(([environment, result, reason]) => ({
        environment,
        result,
        reason,
      })),
    },
    null,
    2,
  )}\n`,
);
