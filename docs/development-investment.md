# The work behind OwlAPI

What would it take to reproduce the development work behind OwlAPI 0.1.0?
The estimate puts the base case at **27,550 team hours** and **US$3.64 million** for an in-house US team.
That is about 15.3 person-years at 1,800 project hours per person-year.
Maksym Shostak makes the library available at no charge under the terms of the [project licence](../LICENSE).

## Rebuild scenarios

Costs are in November 2026 US dollars.
Both cost rows include outside counsel and direct expenses.
The vendor benchmark prices the same work using US vendor rates.

| Rebuild measure                              |     Base case |       Adverse |
| -------------------------------------------- | ------------: | ------------: |
| In-house cost, including people and overhead | $3.64 million | $6.01 million |
| Vendor delivery benchmark                    | $4.67 million | $7.71 million |
| Team hours                                   |        27,550 |        45,400 |
| Outside counsel hours                        |           130 |           260 |

The scenarios vary the time for each work package, legal review, and direct expenses.
The adverse case allows for more investigation and repeated qualification.
The figures describe a hypothetical rebuild.
Historical hours and spending would come from time records and invoices.

## What the estimate covers

The estimate uses a [development baseline for OwlAPI 0.1.0](https://github.com/Hadden-Industries/owlapi/commit/3191b95a884fdc4567719d411a8387a9d2b87efd).
It includes three published prereleases and the development work through that commit.

- **Library and compatibility.**
  Twelve public import paths, 79 JavaScript bindings, two behavior profiles, twelve input syntax families, and four storage formats.
  The work includes interpreting OWL structures, integrating existing parsers, and comparing the supported behavior with Java OWLAPI 5.5.1.
- **Verification.**
  Conformance tests, reference comparisons, browser and Node.js checks, and performance work.
  The baseline contains 301 JavaScript test and specification files and 70 benchmark cases.
- **Delivery.**
  Documentation, licensing and provenance evidence, security work, CI, package verification, and release recovery.

The estimate ends at that baseline.
Final 0.1.0 qualification, ongoing maintenance, and downstream deployments sit outside its scope.

## How the estimate was made

The model assigns hours and a mix of roles to each work package.
It assumes a US team using conventional development tools and existing open-source dependencies, without AI assistance.
For the in-house case, it starts with US occupational wages and accounts for wage changes, specialist skills, benefits, and overhead.
The vendor benchmark uses comparable rates from one US GSA schedule and an allowance for technical writing.
The base case also allows for 130 hours of outside counsel and for CI, test services, and equipment.

The *OwlAPI basis of estimate* and its companion cost-model workbook record the quantities, rates, and scenario assumptions.
The model uses the work breakdown and sensitivity analysis approach described in the [US Government Accountability Office cost estimating guide](https://www.gao.gov/products/gao-20-195g).
