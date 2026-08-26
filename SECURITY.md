# Security Policy

## Supported versions

`owlapi` uses a deliberately narrow security-support window:

| Release state                           | Security-supported version                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Before production `0.1.0`               | Only the single prerelease currently designated by npm's `next` tag                                                    |
| After production `0.1.0`                | Only the latest production release designated by npm's `latest` tag, unless a later explicit policy names another line |
| Older production or prerelease versions | Unsupported unless a later explicit LTS or security-branch policy names them                                           |

Old versions may remain downloadable because npm releases are immutable.
Availability does not imply security maintenance. Runtime compatibility also does
not mean that `owlapi` can remediate a defect in a Node.js version that its own
maintainers no longer support.

## Privately report a vulnerability

Please do **not** disclose a suspected vulnerability through a public issue, pull
request, discussion, Code of Conduct report, or other public project channel.

Use these channels in order:

1. [GitHub private vulnerability reporting](https://github.com/Hadden-Industries/owlapi/security/advisories/new)
   is preferred because it opens a private repository advisory.
2. If GitHub's private mechanism is unavailable or unsuitable, email
   `security@haddenindustries.com`.

Include only what is reasonably needed to reproduce and assess the issue: the
affected version, environment, impact, reproduction steps or proof of concept,
and any relevant mitigation. Minimize credentials, production data, third-party
personal data, and other sensitive information. The project communication
channels process information that reporters choose to send; see
[`PRIVACY.md`](./PRIVACY.md) before submitting a report.

The project aims to acknowledge a private report within **five working days**.
This is a target, **not an SLA**, a guaranteed resolution time, or a promise that
the report will be accepted as a vulnerability. The reporter may be asked about
affected versions, severity, reproducibility, embargo or coordination needs, and
their preferred contact method.

## Handling and disclosure

Confirmed vulnerabilities are normally coordinated through a private GitHub
security advisory. The project will request or associate a CVE where the issue
warrants one and coordinate public disclosure after a fixed version or effective
mitigation is available, unless an overriding safety or legal reason is recorded.

A security release may be expedited, but it is not exempt from the deterministic
package, required-test, production-dependency, provenance, retained-tarball,
fresh-registry, and consumer-verification controls. Sensitive report content may
remain restricted until coordinated disclosure; public evidence must not expose
embargoed details or reporter personal data.

The security mailbox is reserved for vulnerability and genuinely
security-sensitive correspondence. Behavioural concerns belong to the private
Code of Conduct process, and privacy-rights requests belong to
`privacy@haddenindustries.com`.
