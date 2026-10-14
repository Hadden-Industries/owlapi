# Java-compatible external document transport decision

Status: approved by the repository owner in the implementation chat on 2026-10-14: "Approve the Node adapter and stated browser boundary".

The accepted implementation plan requires Java's connection, attempt and redirect settings to control real resource access.
The existing `documentLoader.load(iri, options)` extension receives configuration but owns all transport.
OwlAPI currently has no HTTP client that consumes `getConnectionTimeout()`, `getRetriesToAttempt()` or `isFollowRedirects()`.
Passing those settings to an arbitrary callback does not prove their behavior.
See [the plan's resource boundary](../../../plans/2026-10-13-java-compatible-api-behavior-implementation-plan.md#behaviour-and-external-resource-authorization) and [native network observations](central-observations.json).

## Approved boundary

Add an explicit Node adapter, `NodeDocumentLoader`, exported only from `@hadden-industries/owlapi/io/node`.
A caller constructs it with an authorization callback and passes it through the existing manager `documentLoader` option.
There is no automatic network or filesystem access.
Browser imports remain free of Node dependencies.
Existing caller-supplied loaders remain available; their transport behavior is owned by the host, and their mere presence does not qualify the Java transport contract.

The adapter uses Node's HTTP, HTTPS, DNS and file APIs.
It receives the actual loader configuration for each operation and applies the native Java getter/setter values without replacement defaults. It preserves the released Java/JDK-observed attempt, connection-only timeout, redirect and credential behavior.
Each resolved destination, redirect and file access requires authorization before access.
Credentials and resolved destinations are available to that decision.
Errors distinguish denied access from parsing failures and unsupported host capabilities.

The adapter's public constructor is `new NodeDocumentLoader({ authorize })`.
`authorize(resourceIRI, context)` must explicitly return `true` to permit the concrete operation.
The context records resource purpose, resolved destination, redirect origin, requested credential headers and the immutable loader configuration.
The adapter implements the existing `load(iri, options)` contract and returns a `StringDocumentSource` with the response content type.
The Java profile retains the originally requested document IRI as its parsing base; the normative profile uses the final resource IRI.
A subsequent end-to-end released Java probe (`redirect-rdf-base` in `ObserveNetworkContracts.java`) resolved this detail: a relative class IRI after a redirect still resolves against the original request path.
This corrects the proposal's initial assumption that both profiles should return the final resource IRI.
Concrete redirect destinations still require authorization before access.

## Qualification and host scope

Use owned loopback HTTP servers and files for native and installed JS consumers.
Compare real request order, destination, credentials, output and failure phase.
Cover zero/negative attempts, deferred negative timeout rejection, delayed bodies, 301/302/303/307 versus 308, relative locations, long chains, loops, protocol changes, denied final destinations and failures.
The existing native observation already measures those cases independently of the proposed adapter.

Browser Fetch does not expose the JDK's connection-only timeout and underlying redirect handling.
Do not claim browser transport parity from Fetch simulations or from getters.
Browser parsing of supplied documents remains in scope.
Browser external transport remains an explicitly unmatched host capability until an adapter can establish the same contract.
This is a support boundary requiring an owner decision, not a new Java-profile resource default.

## Approval scope

The owner approved the public Node adapter boundary and the explicitly unmatched browser transport capability, subject to real consumer tests and the planned consolidated security/API reviews.
This decision does not approve publication, a network grant, or a partially qualified Java profile.
The existing authorization and Java profile selection remain separate.
