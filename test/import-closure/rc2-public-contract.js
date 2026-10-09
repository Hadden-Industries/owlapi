/** One public-only semantic exercise shared by installed Node and browser hosts. */
export const exerciseRC2PublicContract = async (owl) => {
  const require = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  let acquisitions = 0;
  const manager = owl.OWLManager.createOWLOntologyManager({
    documentLoader: {
      load() {
        acquisitions++;
        throw new Error("Unexpected acquisition");
      },
    },
  });
  const factory = manager.getOWLDataFactory();
  const a = factory.getOWLClass(owl.IRI.create("urn:rc2:installed:A"));
  const b = factory.getOWLClass(owl.IRI.create("urn:rc2:installed:B"));
  const c = factory.getOWLClass(owl.IRI.create("urn:rc2:installed:C"));
  const ontology = manager.createOntology();
  manager.addAxioms(ontology, [
    factory.getOWLDeclarationAxiom(a),
    factory.getOWLDeclarationAxiom(b),
    factory.getOWLSubClassOfAxiom(a, b),
    factory.getOWLAnnotationAssertionAxiom(
      factory.getRDFSLabel(),
      a.iri,
      factory.getOWLLiteral("A label", "en"),
    ),
  ]);
  require(ontology.getSubClassAxiomsForSubClass(a).size ===
    1, "Named axiom index failed");
  require(owl.EntitySearcher.getSuperClasses(a, [ontology, ontology]).length ===
    2, "Search lost input multiplicity");
  const snapshot = ontology.getClassesInSignature(owl.Imports.EXCLUDED);
  snapshot.clear();
  require(ontology.getClassesInSignature().size ===
    2, "Query result mutation escaped");
  const shortForms = new owl.AnnotationValueShortFormProvider(
    [factory.getRDFSLabel()],
    new Map([[factory.getRDFSLabel(), ["en"]]]),
    { ontologies: () => [ontology] },
  );
  require(shortForms.getShortForm(a) ===
    "A label", "Annotation short form failed");
  const renderer = new owl.ManchesterOWLSyntaxOWLObjectRendererImpl();
  renderer.setShortFormProvider(shortForms);
  require(renderer.render(a) ===
    "A label", "Renderer provider identity failed");
  renderer.setShortFormProvider(new owl.SimpleShortFormProvider());
  require(renderer.render(a) === "A", "Renderer provider replacement failed");
  const duplicate = new owl.OWLObjectDuplicator(new Map([[a, c.iri]]), manager);
  require(duplicate.duplicateObject(a).equals(c), "Typed duplication failed");
  const axiomBase = [
    factory.getOWLSubClassOfAxiom(a, b),
    factory.getOWLSubClassOfAxiom(b, c),
  ];
  const localityModules = {};
  for (const mode of Object.values(owl.LocalityClass)) {
    const extractor = new owl.SyntacticLocalityModuleExtractor(mode, axiomBase);
    const module = await extractor.extract([a]);
    require(module.length ===
      (mode === "BOTTOM"
        ? 2
        : 0), `Installed ${mode} locality propagation failed`);
    let limited = false;
    try {
      await extractor.extract([a], undefined, { maxWork: 0 });
    } catch (error) {
      limited = error instanceof owl.ResourceLimitError;
    }
    require(limited, "Locality work exhaustion returned a partial module");
    require((
      await extractor.extract([a], undefined, {
        maxWork: null,
        timeoutMs: null,
      })
    ).length ===
      module.length, "Unlimited locality options changed the module");
    localityModules[mode] = module.length;
  }
  const profileStatuses = [];
  for (const Profile of [
    owl.OWL2ELProfile,
    owl.OWL2QLProfile,
    owl.OWL2RLProfile,
  ]) {
    const profile = new Profile();
    const report = await profile.checkOntology(ontology);
    require(report.isInProfile(), `Installed ${profile.getName()} rejected the common grammar`);
    require((await profile.checkOntology(ontology, { maxWork: 0 })).status ===
      "unverified", "Incomplete profile certified validity");
    profileStatuses.push(report.status);
  }
  const stored = {};
  for (const name of ["OWL_XML", "TURTLE"]) {
    const target = new owl.StringDocumentTarget();
    await manager.saveOntology(ontology, owl.OWLDocumentFormats[name], target);
    const text = target.toString();
    const reloaded =
      await owl.OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        new owl.StringDocumentSource(text),
      );
    require(reloaded.getAxiomCount() ===
      ontology.getAxiomCount(), `Installed ${name} lost axioms`);
    require(reloaded.containsAxiom(
      factory.getOWLSubClassOfAxiom(a, b),
    ), `Installed ${name} lost the subclass axiom`);
    let rejected = false;
    try {
      await manager.saveOntology(
        ontology,
        owl.OWLDocumentFormats[name].withParameter("unsupported", true),
        target,
      );
    } catch (error) {
      rejected =
        error instanceof owl.OWLOntologyStorageError &&
        !(error instanceof owl.OWLStorerNotFoundError);
    }
    require(rejected &&
      target.toString() ===
        text, `Installed ${name} failure changed the target`);
    stored[name] = reloaded.getAxiomCount();
  }
  const changes = new owl.OWLEntityRenamer(manager, [ontology]).changeIRI(
    a,
    c.iri,
  );
  require(!ontology.containsEntityInSignature(
    c,
  ), "Renamer applied its proposals");
  manager.applyChanges(changes);
  require(ontology.containsEntityInSignature(c) &&
    !ontology.containsEntityInSignature(a), "Atomic rename failed");
  const before = ontology.getAxiomCount();
  const foreign = owl.OWLManager.createOWLOntologyManager().createOntology();
  let rejected = false;
  try {
    manager.applyChanges([
      new owl.RemoveAxiom(ontology, factory.getOWLDeclarationAxiom(c)),
      new owl.AddAxiom(foreign, factory.getOWLDeclarationAxiom(c)),
    ]);
  } catch {
    rejected = true;
  }
  require(rejected &&
    ontology.getAxiomCount() === before &&
    ontology.containsAxiom(
      factory.getOWLDeclarationAxiom(c),
    ), "Failed batch published an earlier removal");
  const remover = new owl.OWLEntityRemover(ontology);
  remover.visit(c);
  const removals = remover.getChanges();
  remover.reset();
  require(removals.length > 0 &&
    remover.getChanges().length ===
      0, "Remover did not return a defensive proposal array");
  manager.applyChanges(removals);
  require(!ontology.containsEntityInSignature(c) &&
    ontology.containsEntityInSignature(
      b,
    ), "Removal damaged unrelated declarations");
  require(acquisitions === 0, "RC.2 operations acquired remote documents");
  return {
    localityModules,
    profileStatuses,
    stored,
    renameChanges: changes.length,
    removalChanges: removals.length,
    acquisitions,
  };
};
