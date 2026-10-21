import { jest } from "@jest/globals";
import { createServer } from "node:http";

// Model Node 22.0's lookup contract: `order` is ignored and the resolver may
// return IPv6 before IPv4. A newer host runtime must not conceal that behavior.
let resolverAddresses;
const lookup = jest.fn(async (_hostname, options) => {
  const addresses =
    options.verbatim === false
      ? [...resolverAddresses].sort((left, right) => left.family - right.family)
      : resolverAddresses;
  return options.all ? addresses : addresses[0];
});
jest.unstable_mockModule("node:dns/promises", () => ({ lookup }));

const { NodeDocumentLoader } = await import("./index.js");
const { IRI, OWLOntologyLoaderConfiguration } =
  await import("../../model/index.js");

test.each([
  {
    description: "IPv6-first dual-stack",
    bind: "127.0.0.1",
    answers: [
      { address: "::1", family: 6 },
      { address: "127.0.0.1", family: 4 },
    ],
    family: 4,
  },
  {
    description: "IPv6-only",
    bind: "::1",
    answers: [{ address: "::1", family: 6 }],
    family: 6,
  },
])(
  "$description DNS results pin one authorized address on Node 22.0",
  async ({ bind, answers, family }) => {
    resolverAddresses = answers;
    lookup.mockClear();
    const server = createServer((_request, response) => response.end("owned"));
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, bind, resolve);
    });
    try {
      const operations = [];
      const loader = new NodeDocumentLoader({
        authorize(_iri, context) {
          operations.push(context);
          return true;
        },
      });
      const document = await loader.load(
        IRI.create(
          `http://owned-dns-fixture.invalid:${server.address().port}/`,
        ),
        {
          config: new OWLOntologyLoaderConfiguration({
            behaviorProfileId: "java-owlapi-5.5.1",
          }),
        },
      );
      expect(document.getText()).toBe("owned");
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(operations.map(({ operation }) => operation)).toEqual([
        "request-document",
        "resolve-hostname",
        "connect-http",
      ]);
      expect(operations.at(-1)).toMatchObject({
        resolvedAddress: bind,
        addressFamily: family,
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
