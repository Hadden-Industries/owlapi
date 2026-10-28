import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.jsonldjava.core.DocumentLoader;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.function.LongSupplier;
import java.util.stream.Collectors;
import org.eclipse.rdf4j.rio.helpers.JSONLDSettings;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.*;
import org.semanticweb.owlapi.io.*;
import org.semanticweb.owlapi.krss1.parser.KRSSOWLParserFactory;
import org.semanticweb.owlapi.manchestersyntax.renderer.ManchesterOWLSyntaxOWLObjectRendererImpl;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.model.parameters.*;
import org.semanticweb.owlapi.modularity.locality.*;
import org.semanticweb.owlapi.profiles.*;
import org.semanticweb.owlapi.search.EntitySearcher;
import org.semanticweb.owlapi.util.*;
import org.semanticweb.owlapi.vocab.OWL2Datatype;
import org.semanticweb.owlapi.vocab.OWLFacet;

/**
 * Single-JVM comparative performance benchmark suite for the Java OWLAPI 5.5.1
 * public API surface, paired 1-to-1 with util/benchmark-owlapi-java-parity.mjs.
 */
public final class BenchmarkPublicApiSurface {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final String RICH_NS = "urn:bench:rich#";
  private static final String IMPORT_NS = "urn:bench:rich:import#";
  private static final int RICH_COUNT = 60;
  private static final int IMPORT_COUNT = 20;

  private BenchmarkPublicApiSurface() {}

  private static double roundMs(long nanos) {
    return Math.round((nanos / 1_000_000.0) * 1000.0) / 1000.0;
  }

  private static double median(List<Double> values) {
    List<Double> sorted = new ArrayList<>(values);
    Collections.sort(sorted);
    int mid = sorted.size() / 2;
    return sorted.size() % 2 == 0
        ? Math.round(((sorted.get(mid - 1) + sorted.get(mid)) / 2.0) * 1000.0) / 1000.0
        : sorted.get(mid);
  }

  private static long medianLong(List<Long> values) {
    List<Long> sorted = new ArrayList<>(values);
    Collections.sort(sorted);
    int mid = sorted.size() / 2;
    return sorted.size() % 2 == 0
        ? Math.round((sorted.get(mid - 1) + sorted.get(mid)) / 2.0)
        : sorted.get(mid);
  }

  private static long usedHeap() {
    Runtime rt = Runtime.getRuntime();
    return rt.totalMemory() - rt.freeMemory();
  }

  private static final class RichOntologyFixture {
    final OWLOntologyManager manager;
    final OWLDataFactory df;
    final OWLOntology mainOntology;
    final OWLOntology importedOntology;
    final List<OWLClass> classes = new ArrayList<>();
    final List<OWLClass> superClasses = new ArrayList<>();
    final List<OWLObjectProperty> objectProps = new ArrayList<>();
    final List<OWLObjectProperty> superObjectProps = new ArrayList<>();
    final List<OWLDataProperty> dataProps = new ArrayList<>();
    final List<OWLDataProperty> superDataProps = new ArrayList<>();
    final List<OWLAnnotationProperty> annProps = new ArrayList<>();
    final List<OWLDatatype> datatypes = new ArrayList<>();
    final List<OWLNamedIndividual> individuals = new ArrayList<>();
    final List<OWLNamedIndividual> otherIndividuals = new ArrayList<>();
    final List<OWLAxiom> allMainAxioms = new ArrayList<>();
    final List<OWLClassExpression> complexExpressions = new ArrayList<>();

    RichOntologyFixture() throws Exception {
      this.manager = OWLManager.createOWLOntologyManager();
      this.df = manager.getOWLDataFactory();
      IRI importedIRI = IRI.create("urn:bench:rich:imported");
      IRI mainIRI = IRI.create("urn:bench:rich:main");
      this.importedOntology = manager.createOntology(importedIRI);
      this.mainOntology = manager.createOntology(mainIRI);

      List<OWLAxiom> importedAxioms = buildAxiomBatch(df, IMPORT_NS, IMPORT_COUNT, false, null);
      manager.addAxioms(importedOntology, importedAxioms);

      List<OWLAxiom> mainAxioms = buildAxiomBatch(df, RICH_NS, RICH_COUNT, true, this);
      this.allMainAxioms.addAll(mainAxioms);
      manager.addAxioms(mainOntology, mainAxioms);
      manager.applyChange(new AddImport(mainOntology, df.getOWLImportsDeclaration(importedIRI)));
      for (int i = 0; i < 5; i++) {
        manager.applyChange(
            new AddOntologyAnnotation(
                mainOntology,
                df.getOWLAnnotation(df.getRDFSLabel(), df.getOWLLiteral("Ontology Label " + i, "en"))));
      }
    }
  }

  private static List<OWLAxiom> buildAxiomBatch(
      OWLDataFactory df,
      String ns,
      int count,
      boolean recordEntities,
      RichOntologyFixture target) {
    List<OWLAxiom> axioms = new ArrayList<>();
    OWLDatatype xsdString = df.getOWLDatatype(OWL2Datatype.XSD_STRING.getIRI());
    OWLDatatype xsdInteger = df.getOWLDatatype(OWL2Datatype.XSD_INTEGER.getIRI());
    OWLDatatype xsdDecimal = df.getOWLDatatype(OWL2Datatype.XSD_DECIMAL.getIRI());
    OWLAnnotationProperty rdfsLabel = df.getRDFSLabel();

    for (int i = 0; i < count; i++) {
      OWLClass c = df.getOWLClass(IRI.create(ns + "C" + i));
      OWLClass d = df.getOWLClass(IRI.create(ns + "D" + i));
      OWLObjectProperty op = df.getOWLObjectProperty(IRI.create(ns + "op" + i));
      OWLObjectProperty q = df.getOWLObjectProperty(IRI.create(ns + "q" + i));
      OWLDataProperty dp = df.getOWLDataProperty(IRI.create(ns + "dp" + i));
      OWLDataProperty dp2 = df.getOWLDataProperty(IRI.create(ns + "dp2" + i));
      OWLAnnotationProperty ap = df.getOWLAnnotationProperty(IRI.create(ns + "ap" + i));
      OWLDatatype dt = df.getOWLDatatype(IRI.create(ns + "dt" + i));
      OWLNamedIndividual ind = df.getOWLNamedIndividual(IRI.create(ns + "ind" + i));
      OWLNamedIndividual ind2 = df.getOWLNamedIndividual(IRI.create(ns + "ind2" + i));

      if (recordEntities && target != null) {
        target.classes.add(c);
        target.superClasses.add(d);
        target.objectProps.add(op);
        target.superObjectProps.add(q);
        target.dataProps.add(dp);
        target.superDataProps.add(dp2);
        target.annProps.add(ap);
        target.datatypes.add(dt);
        target.individuals.add(ind);
        target.otherIndividuals.add(ind2);
      }

      axioms.add(df.getOWLDeclarationAxiom(c));
      axioms.add(df.getOWLDeclarationAxiom(d));
      axioms.add(df.getOWLDeclarationAxiom(op));
      axioms.add(df.getOWLDeclarationAxiom(q));
      axioms.add(df.getOWLDeclarationAxiom(dp));
      axioms.add(df.getOWLDeclarationAxiom(dp2));
      axioms.add(df.getOWLDeclarationAxiom(ap));
      axioms.add(df.getOWLDeclarationAxiom(dt));
      axioms.add(df.getOWLDeclarationAxiom(ind));
      axioms.add(df.getOWLDeclarationAxiom(ind2));

      if (i < 10) {
        IRI punIri = IRI.create(ns + "pun" + i);
        axioms.add(df.getOWLDeclarationAxiom(df.getOWLClass(punIri)));
        axioms.add(df.getOWLDeclarationAxiom(df.getOWLNamedIndividual(punIri)));
      }
      if (i < 20) {
        OWLAnonymousIndividual anon = df.getOWLAnonymousIndividual("bnode_" + i);
        axioms.add(df.getOWLObjectPropertyAssertionAxiom(op, ind, anon));
      }

      OWLAnnotation ann = df.getOWLAnnotation(rdfsLabel, df.getOWLLiteral("sub_" + i));
      axioms.add(df.getOWLSubClassOfAxiom(c, d, Collections.singleton(ann)));
      OWLClassExpression someExpr = df.getOWLObjectSomeValuesFrom(op, d);
      OWLClassExpression allExpr = df.getOWLObjectAllValuesFrom(op, d);
      OWLClassExpression interExpr = df.getOWLObjectIntersectionOf(d, allExpr);
      if (recordEntities && target != null) {
        target.complexExpressions.add(someExpr);
        target.complexExpressions.add(interExpr);
      }
      axioms.add(df.getOWLSubClassOfAxiom(c, someExpr));
      axioms.add(df.getOWLEquivalentClassesAxiom(c, interExpr));
      axioms.add(df.getOWLDisjointClassesAxiom(c, d));
      if (i < 20) {
        axioms.add(df.getOWLDisjointUnionAxiom(c, new HashSet<>(Arrays.asList(d, df.getOWLObjectHasSelf(op)))));
      }

      axioms.add(df.getOWLSubObjectPropertyOfAxiom(op, q));
      if (i < 20) {
        axioms.add(df.getOWLSubPropertyChainOfAxiom(Arrays.asList(op, q), q));
        axioms.add(df.getOWLEquivalentObjectPropertiesAxiom(op, q));
      } else if (i < 40) {
        axioms.add(df.getOWLDisjointObjectPropertiesAxiom(op, q));
      }
      axioms.add(df.getOWLObjectPropertyDomainAxiom(op, c));
      axioms.add(df.getOWLObjectPropertyRangeAxiom(op, d));
      axioms.add(df.getOWLInverseObjectPropertiesAxiom(op, q));
      axioms.add(df.getOWLFunctionalObjectPropertyAxiom(op));
      if (i < 20) {
        axioms.add(df.getOWLInverseFunctionalObjectPropertyAxiom(op));
        axioms.add(df.getOWLSymmetricObjectPropertyAxiom(op));
        axioms.add(df.getOWLReflexiveObjectPropertyAxiom(op));
        axioms.add(df.getOWLTransitiveObjectPropertyAxiom(q));
      } else if (i < 40) {
        axioms.add(df.getOWLAsymmetricObjectPropertyAxiom(q));
        axioms.add(df.getOWLIrreflexiveObjectPropertyAxiom(q));
      }

      axioms.add(df.getOWLSubDataPropertyOfAxiom(dp, dp2));
      if (i < 20) {
        axioms.add(df.getOWLEquivalentDataPropertiesAxiom(dp, dp2));
      } else if (i < 40) {
        axioms.add(df.getOWLDisjointDataPropertiesAxiom(dp, dp2));
      }
      axioms.add(df.getOWLDataPropertyDomainAxiom(dp, c));
      axioms.add(df.getOWLDataPropertyRangeAxiom(dp, xsdString));
      axioms.add(df.getOWLFunctionalDataPropertyAxiom(dp));
      if (i < 20) {
        axioms.add(df.getOWLDatatypeDefinitionAxiom(dt, df.getOWLDataIntersectionOf(xsdInteger, xsdDecimal)));
        axioms.add(df.getOWLHasKeyAxiom(c, new HashSet<>(Arrays.asList(op, dp))));
      }

      axioms.add(df.getOWLClassAssertionAxiom(c, ind));
      axioms.add(df.getOWLObjectPropertyAssertionAxiom(op, ind, ind2));
      axioms.add(df.getOWLNegativeObjectPropertyAssertionAxiom(q, ind, ind2));
      axioms.add(df.getOWLDataPropertyAssertionAxiom(dp, ind, df.getOWLLiteral("val_" + i)));
      axioms.add(df.getOWLNegativeDataPropertyAssertionAxiom(dp2, ind, df.getOWLLiteral("neg_" + i)));
      if (i < 30) {
        axioms.add(df.getOWLSameIndividualAxiom(ind, ind2));
      } else {
        axioms.add(df.getOWLDifferentIndividualsAxiom(ind, ind2));
      }

      axioms.add(df.getOWLAnnotationAssertionAxiom(rdfsLabel, c.getIRI(), df.getOWLLiteral("Class " + i, "en")));
      axioms.add(df.getOWLAnnotationAssertionAxiom(ap, c.getIRI(), df.getOWLLiteral("Alt " + i, "fr")));
      axioms.add(df.getOWLSubAnnotationPropertyOfAxiom(ap, rdfsLabel));
      axioms.add(df.getOWLAnnotationPropertyDomainAxiom(ap, c.getIRI()));
      axioms.add(df.getOWLAnnotationPropertyRangeAxiom(ap, d.getIRI()));
    }
    return axioms;
  }

  private static OWLOntology buildProfileOntology(OWLOntologyManager manager) throws Exception {
    OWLDataFactory df = manager.getOWLDataFactory();
    OWLOntology ont = manager.createOntology(IRI.create("urn:bench:profile"));
    OWLDatatype xsdString = df.getOWLDatatype(OWL2Datatype.XSD_STRING.getIRI());
    OWLDatatype xsdInteger = df.getOWLDatatype(OWL2Datatype.XSD_INTEGER.getIRI());
    List<OWLAxiom> axioms = new ArrayList<>();
    for (int i = 0; i < 40; i++) {
      OWLClass c = df.getOWLClass(IRI.create("urn:bench:profile#C" + i));
      OWLClass d = df.getOWLClass(IRI.create("urn:bench:profile#D" + i));
      OWLObjectProperty op = df.getOWLObjectProperty(IRI.create("urn:bench:profile#op" + i));
      OWLDataProperty dp = df.getOWLDataProperty(IRI.create("urn:bench:profile#dp" + i));
      OWLNamedIndividual ind = df.getOWLNamedIndividual(IRI.create("urn:bench:profile#ind" + i));
      axioms.add(df.getOWLDeclarationAxiom(c));
      axioms.add(df.getOWLDeclarationAxiom(d));
      axioms.add(df.getOWLDeclarationAxiom(op));
      axioms.add(df.getOWLDeclarationAxiom(dp));
      axioms.add(df.getOWLDeclarationAxiom(ind));
      axioms.add(df.getOWLSubClassOfAxiom(c, d));
      axioms.add(df.getOWLSubClassOfAxiom(c, df.getOWLObjectSomeValuesFrom(op, d)));
      axioms.add(df.getOWLObjectPropertyDomainAxiom(op, c));
      axioms.add(df.getOWLObjectPropertyRangeAxiom(op, d));
      axioms.add(df.getOWLDataPropertyDomainAxiom(dp, c));
      axioms.add(df.getOWLDataPropertyRangeAxiom(dp, xsdString));
      axioms.add(df.getOWLClassAssertionAxiom(c, ind));
      axioms.add(
          df.getOWLDataPropertyAssertionAxiom(
              dp, ind, df.getOWLLiteral(String.valueOf(i), xsdInteger)));
    }
    manager.addAxioms(ont, axioms);
    return ont;
  }

  private record BenchmarkDef(String id, LongSupplier operation) {}

  public static void main(String[] args) throws Exception {
    System.setProperty(JSONLDSettings.SECURE_MODE.getKey(), "true");
    System.setProperty(JSONLDSettings.WHITELIST.getKey(), "[]");
    System.setProperty(DocumentLoader.DISALLOW_REMOTE_CONTEXT_LOADING, "true");

    Path specPath = Path.of(args[0]);
    var specNode = JSON.readTree(Files.readString(specPath));
    int warmupCount = specNode.get("warmupCount").asInt();
    int runCount = specNode.get("runCount").asInt();
    Path fixturesDir = Path.of(specNode.get("fixturesDirectory").asText());
    Set<String> filterIds = new HashSet<>();
    if (specNode.has("filterIds") && specNode.get("filterIds").isArray()) {
      specNode.get("filterIds").forEach(n -> filterIds.add(n.asText()));
    }

    Map<String, String> syntaxTexts = new LinkedHashMap<>();
    for (String syntax :
        List.of(
            "functional",
            "manchester",
            "owlxml",
            "rdfxml",
            "turtle",
            "ntriples",
            "nquads",
            "trig",
            "jsonld",
            "dl",
            "krss2",
            "krss1",
            "rdf-metadata")) {
      String text = Files.readString(fixturesDir.resolve(syntax + ".txt"));
      if ("dl".equals(syntax)) text = text.trim();
      syntaxTexts.put(syntax, text);
    }

    var importManifest = specNode.get("importClosure");
    String importRootIri = importManifest.get("rootIRI").asText();
    Map<String, File> importFiles = new LinkedHashMap<>();
    importManifest
        .get("files")
        .fields()
        .forEachRemaining(e -> importFiles.put(e.getKey(), new File(e.getValue().asText())));
    String importRootText = Files.readString(importFiles.get(importRootIri).toPath());

    RichOntologyFixture rich = new RichOntologyFixture();
    OWLOntology profileOntology = buildProfileOntology(OWLManager.createOWLOntologyManager());

    // Pre-build 8-ontology import closure for getImportsClosure and ImportsClosureSetProvider
    OWLOntologyManager closureManager = OWLManager.createOWLOntologyManager();
    for (var entry : importFiles.entrySet()) {
      if (!entry.getKey().equals(importRootIri)) {
        closureManager
            .getIRIMappers()
            .add(new SimpleIRIMapper(IRI.create(entry.getKey()), IRI.create(entry.getValue().toURI())));
      }
    }
    OWLOntology loadedClosureRoot =
        closureManager.loadOntologyFromOntologyDocument(
            new StringDocumentSource(
                importRootText,
                IRI.create(importRootIri),
                new FunctionalSyntaxDocumentFormat(),
                null));

    // Pre-build RDF metadata ontology
    OWLOntologyManager rdfMetaManager = OWLManager.createOWLOntologyManager();
    OWLOntology rdfMetaOntology =
        rdfMetaManager.loadOntologyFromOntologyDocument(
            new StringDocumentSource(
                syntaxTexts.get("rdf-metadata"),
                IRI.create("urn:bench:rdf-metadata"),
                new TurtleDocumentFormat(),
                null));

    // Pre-build 100-class save ontology from functional fixture
    OWLOntologyManager saveManager = OWLManager.createOWLOntologyManager();
    OWLOntology saveOntology =
        saveManager.loadOntologyFromOntologyDocument(
            new StringDocumentSource(
                syntaxTexts.get("functional"),
                IRI.create("urn:bench:save"),
                new FunctionalSyntaxDocumentFormat(),
                null));

    // Pre-build 500-axiom utility ontology for renamer/remover/locality
    OWLOntologyManager utilManager = OWLManager.createOWLOntologyManager();
    OWLDataFactory utilDf = utilManager.getOWLDataFactory();
    OWLOntology utilOntology = utilManager.createOntology(IRI.create("urn:bench:util"));
    List<OWLAxiom> utilAxioms = buildAxiomBatch(utilDf, "urn:bench:util#", 20, false, null);
    utilManager.addAxioms(utilOntology, utilAxioms);
    List<OWLEntity> utilSeedEntities =
        new ArrayList<OWLEntity>(utilOntology.getClassesInSignature()).subList(0, 20);

    List<BenchmarkDef> benchmarks = new ArrayList<>();

    // 1. Manager & Configuration
    benchmarks.add(
        new BenchmarkDef(
            "manager.createOWLOntologyManager",
            () -> {
              long sum = 0;
              for (int i = 0; i < 100; i++) {
                OWLOntologyManager m = OWLManager.createOWLOntologyManager();
                if (m.getOWLDataFactory() != null) sum++;
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "config.OWLOntologyLoaderConfiguration",
            () -> {
              long sum = 0;
              for (int i = 0; i < 500; i++) {
                OWLOntologyLoaderConfiguration cfg =
                    new OWLOntologyLoaderConfiguration()
                        .setStrict(true)
                        .setLoadAnnotationAxioms(false)
                        .setConnectionTimeout(15000 + (i % 10))
                        .setRetriesToAttempt(3)
                        .setFollowRedirects(false)
                        .setEntityExpansionLimit("50000")
                        .setAuthorizationValue("Bearer token")
                        .setAcceptingHTTPCompression(false);
                if (cfg.isStrict()
                    && !cfg.isLoadAnnotationAxioms()
                    && cfg.getConnectionTimeout() > 0
                    && cfg.getRetriesToAttempt() == 3
                    && !cfg.isFollowRedirects()
                    && cfg.getEntityExpansionLimit().length() == 5
                    && cfg.getAuthorizationValue().length() == 12
                    && !cfg.isAcceptingHTTPCompression()) {
                  sum++;
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "config.OWLOntologyWriterConfiguration",
            () -> {
              long sum = 0;
              for (int i = 0; i < 500; i++) {
                OWLOntologyWriterConfiguration cfg =
                    new OWLOntologyWriterConfiguration()
                        .withIndenting(false)
                        .withIndentSize(2 + (i % 4))
                        .withBannersEnabled(false)
                        .withLabelsAsBanner(true)
                        .withSaveIdsForAllAnonymousIndividuals(true);
                sum +=
                    (cfg.isIndenting() ? 1 : 0)
                        + cfg.getIndentSize()
                        + (cfg.shouldUseBanners() ? 1 : 0)
                        + (cfg.isLabelsAsBanner() ? 1 : 0)
                        + (cfg.shouldSaveIdsForAllAnonymousIndividuals() ? 1 : 0);
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "formats.RDFXMLDocumentFormat.prefixes",
            () -> {
              long sum = 0;
              RDFXMLDocumentFormat src = new RDFXMLDocumentFormat();
              src.setPrefix("src:", "http://example.org/src#");
              for (int i = 0; i < 200; i++) {
                RDFXMLDocumentFormat fmt = new RDFXMLDocumentFormat();
                fmt.setPrefix("ex:", "http://example.org/ex" + i + "#");
                fmt.setDefaultPrefix("http://example.org/def#");
                fmt.copyPrefixesFrom(src);
                if (fmt.containsPrefixMapping("ex:")
                    && fmt.getPrefix("src:") != null
                    && fmt.getDefaultPrefix() != null) {
                  sum += fmt.getPrefixNames().size() + fmt.getPrefixName2PrefixMap().size();
                }
                fmt.unregisterNamespace("http://example.org/def#");
                fmt.clear();
              }
              return sum;
            }));

    // 2. DataFactory & Structural Model
    benchmarks.add(
        new BenchmarkDef(
            "model.IRI.create",
            () -> {
              long sum = 0;
              for (int i = 0; i < 2000; i++) {
                IRI iri = IRI.create("http://example.org/bench/iri#" + i);
                sum += iri.toString().length();
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "factory.entities",
            () -> {
              OWLDataFactory df = OWLManager.createOWLOntologyManager().getOWLDataFactory();
              long sum = 0;
              for (int i = 0; i < 500; i++) {
                IRI iri = IRI.create("http://example.org/factory#E" + i);
                OWLClass c = df.getOWLClass(iri);
                OWLObjectProperty op = df.getOWLObjectProperty(iri);
                OWLDataProperty dp = df.getOWLDataProperty(iri);
                OWLAnnotationProperty ap = df.getOWLAnnotationProperty(iri);
                OWLDatatype dt = df.getOWLDatatype(iri);
                OWLNamedIndividual ni = df.getOWLNamedIndividual(iri);
                OWLAnonymousIndividual ai = df.getOWLAnonymousIndividual("node_" + i);
                OWLAnnotationProperty label = df.getRDFSLabel();
                OWLOntologyID id = new OWLOntologyID(Optional.of(iri), Optional.empty());
                OWLImportsDeclaration imp = df.getOWLImportsDeclaration(iri);
                if (c != null && op != null && dp != null && ap != null && dt != null && ni != null
                    && ai != null && label != null && id != null && imp != null) {
                  sum += 10;
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "factory.literals",
            () -> {
              OWLDataFactory df = OWLManager.createOWLOntologyManager().getOWLDataFactory();
              OWLDatatype xsdInt = df.getOWLDatatype(OWL2Datatype.XSD_INTEGER.getIRI());
              OWLDatatype xsdDec = df.getOWLDatatype(OWL2Datatype.XSD_DECIMAL.getIRI());
              OWLDatatype xsdFloat = df.getOWLDatatype(OWL2Datatype.XSD_FLOAT.getIRI());
              OWLDatatype xsdBool = df.getOWLDatatype(OWL2Datatype.XSD_BOOLEAN.getIRI());
              long sum = 0;
              for (int i = 0; i < 500; i++) {
                OWLLiteral l1 = df.getOWLLiteral("plain_" + i);
                OWLLiteral l2 = df.getOWLLiteral("lang_" + i, " en-GB ");
                OWLLiteral l3 = df.getOWLLiteral(String.valueOf(i), xsdInt);
                OWLLiteral l4 = df.getOWLLiteral(i + ".50", xsdDec);
                OWLLiteral l5 = df.getOWLLiteral(i + ".25", xsdFloat);
                OWLLiteral l6 = df.getOWLLiteral((i % 2 == 0) ? "true" : "false", xsdBool);
                sum +=
                    l1.getLiteral().length()
                        + l2.getLang().length()
                        + l3.getLiteral().length()
                        + l4.getLiteral().length()
                        + l5.getLiteral().length()
                        + l6.getLiteral().length();
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "factory.classExpressions",
            () -> {
              OWLDataFactory df = rich.df;
              OWLDatatype xsdString = df.getOWLDatatype(OWL2Datatype.XSD_STRING.getIRI());
              OWLLiteral lit = df.getOWLLiteral("v");
              long sum = 0;
              for (int i = 0; i < 200; i++) {
                OWLClass c = rich.classes.get(i % RICH_COUNT);
                OWLClass d = rich.superClasses.get(i % RICH_COUNT);
                OWLObjectProperty op = rich.objectProps.get(i % RICH_COUNT);
                OWLDataProperty dp = rich.dataProps.get(i % RICH_COUNT);
                OWLNamedIndividual ind = rich.individuals.get(i % RICH_COUNT);
                OWLObjectInverseOf inv = df.getOWLObjectInverseOf(op);
                OWLClassExpression e1 = df.getOWLObjectIntersectionOf(c, d);
                OWLClassExpression e2 = df.getOWLObjectUnionOf(c, d);
                OWLClassExpression e3 = df.getOWLObjectComplementOf(c);
                OWLClassExpression e4 = df.getOWLObjectOneOf(ind);
                OWLClassExpression e5 = df.getOWLObjectSomeValuesFrom(op, c);
                OWLClassExpression e6 = df.getOWLObjectAllValuesFrom(inv, d);
                OWLClassExpression e7 = df.getOWLObjectHasValue(op, ind);
                OWLClassExpression e8 = df.getOWLObjectHasSelf(op);
                OWLClassExpression e9 = df.getOWLObjectMinCardinality(1, op, c);
                OWLClassExpression e10 = df.getOWLObjectMaxCardinality(2, op, c);
                OWLClassExpression e11 = df.getOWLObjectExactCardinality(1, op, c);
                OWLClassExpression e12 = df.getOWLDataSomeValuesFrom(dp, xsdString);
                OWLClassExpression e13 = df.getOWLDataAllValuesFrom(dp, xsdString);
                OWLClassExpression e14 = df.getOWLDataHasValue(dp, lit);
                OWLClassExpression e15 = df.getOWLDataMinCardinality(1, dp, xsdString);
                OWLClassExpression e16 = df.getOWLDataMaxCardinality(2, dp, xsdString);
                OWLClassExpression e17 = df.getOWLDataExactCardinality(1, dp, xsdString);
                if (e1 != null && e2 != null && e3 != null && e4 != null && e5 != null
                    && e6 != null && e7 != null && e8 != null && e9 != null && e10 != null
                    && e11 != null && e12 != null && e13 != null && e14 != null && e15 != null
                    && e16 != null && e17 != null) {
                  sum += 18;
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "factory.dataRanges",
            () -> {
              OWLDataFactory df = rich.df;
              OWLDatatype xsdInt = df.getOWLDatatype(OWL2Datatype.XSD_INTEGER.getIRI());
              OWLDatatype xsdDec = df.getOWLDatatype(OWL2Datatype.XSD_DECIMAL.getIRI());
              long sum = 0;
              for (int i = 0; i < 200; i++) {
                OWLLiteral lit = df.getOWLLiteral(String.valueOf(i), xsdInt);
                OWLFacetRestriction facet = df.getOWLFacetRestriction(OWLFacet.MIN_INCLUSIVE, lit);
                OWLDataRange dr1 = df.getOWLDatatypeRestriction(xsdInt, facet);
                OWLDataRange dr2 = df.getOWLDataIntersectionOf(xsdInt, xsdDec);
                OWLDataRange dr3 = df.getOWLDataUnionOf(xsdInt, xsdDec);
                OWLDataRange dr4 = df.getOWLDataComplementOf(xsdInt);
                OWLDataRange dr5 = df.getOWLDataOneOf(lit);
                if (facet != null && dr1 != null && dr2 != null && dr3 != null && dr4 != null && dr5 != null) {
                  sum += 6;
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "factory.axioms",
            () -> {
              OWLDataFactory df = OWLManager.createOWLOntologyManager().getOWLDataFactory();
              List<OWLAxiom> built = buildAxiomBatch(df, "urn:bench:factory#", 35, false, null);
              return built.size();
            }));

    benchmarks.add(
        new BenchmarkDef(
            "model.structuralEqualityAndSet",
            () -> {
              Set<OWLAxiom> set = new HashSet<>();
              long sum = 0;
              int n = Math.min(1000, rich.allMainAxioms.size());
              for (int i = 0; i < n; i++) {
                OWLAxiom ax = rich.allMainAxioms.get(i);
                OWLAxiom next = rich.allMainAxioms.get((i + 1) % n);
                set.add(ax);
                if (set.contains(ax)) sum++;
                if (ax.equals(ax)) sum++;
                if (!ax.equals(next)) sum++;
                if (ax.equalsIgnoreAnnotations(ax)) sum++;
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "model.axiomAnnotationsTransform",
            () -> {
              OWLAnnotation extra =
                  rich.df.getOWLAnnotation(rich.df.getRDFSLabel(), rich.df.getOWLLiteral("extra"));
              Set<OWLAnnotation> anns = Collections.singleton(extra);
              long sum = 0;
              int n = Math.min(500, rich.allMainAxioms.size());
              for (int i = 0; i < n; i++) {
                OWLAxiom ax = rich.allMainAxioms.get(i);
                OWLAxiom annotated = ax.getAnnotatedAxiom(anns);
                OWLAxiom stripped = annotated.getAxiomWithoutAnnotations();
                if (stripped.equalsIgnoreAnnotations(ax)) sum++;
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "model.dispatch",
            () -> {
              OWLObjectVisitorEx<Integer> objVisitor =
                  new OWLObjectVisitorEx<>() {
                    @Override
                    public Integer doDefault(Object o) {
                      return 1;
                    }
                  };
              OWLAxiomVisitorEx<Integer> axVisitor =
                  new OWLAxiomVisitorEx<>() {
                    @Override
                    public Integer doDefault(Object o) {
                      return 1;
                    }
                  };
              OWLClassExpressionVisitorEx<Integer> ceVisitor =
                  new OWLClassExpressionVisitorEx<>() {
                    @Override
                    public Integer doDefault(Object o) {
                      return 1;
                    }
                  };
              long sum = 0;
              int n = Math.min(500, rich.allMainAxioms.size());
              for (int i = 0; i < n; i++) {
                OWLAxiom ax = rich.allMainAxioms.get(i);
                sum += ax.accept(objVisitor);
                sum += ax.accept(axVisitor);
              }
              for (OWLClassExpression ce : rich.complexExpressions) {
                sum += ce.accept(ceVisitor);
              }
              return sum;
            }));

    // 3. Parsing & Loading
    Object[][] syntaxFormats = {
      {"functional", new FunctionalSyntaxDocumentFormat()},
      {"manchester", new ManchesterSyntaxDocumentFormat()},
      {"owlxml", new OWLXMLDocumentFormat()},
      {"rdfxml", new RDFXMLDocumentFormat()},
      {"turtle", new TurtleDocumentFormat()},
      {"ntriples", new NTriplesDocumentFormat()},
      {"nquads", new NQuadsDocumentFormat()},
      {"trig", new TrigDocumentFormat()},
      {"jsonld", new RDFJsonLDDocumentFormat()},
      {"dl", new DLSyntaxDocumentFormat()},
      {"krss2", new KRSS2DocumentFormat()},
      {"krss1", new KRSSDocumentFormat()}
    };
    for (Object[] entry : syntaxFormats) {
      String name = (String) entry[0];
      OWLDocumentFormat fmt = (OWLDocumentFormat) entry[1];
      String text = syntaxTexts.get(name);
      benchmarks.add(
          new BenchmarkDef(
              "load." + name,
              () -> {
                try {
                  OWLOntologyManager m = OWLManager.createOWLOntologyManager();
                  if ("krss1".equals(name)) {
                    m.getOntologyParsers().add(new KRSSOWLParserFactory());
                  }
                  OWLOntology o =
                      m.loadOntologyFromOntologyDocument(
                          new StringDocumentSource(
                              text, IRI.create("urn:bench:load:" + name), fmt, null));
                  return o.getAxiomCount();
                } catch (Exception e) {
                  throw new RuntimeException(e);
                }
              }));
    }

    benchmarks.add(
        new BenchmarkDef(
            "load.importsClosure",
            () -> {
              try {
                OWLOntologyManager m = OWLManager.createOWLOntologyManager();
                for (var entry : importFiles.entrySet()) {
                  if (!entry.getKey().equals(importRootIri)) {
                    m.getIRIMappers()
                        .add(
                            new SimpleIRIMapper(
                                IRI.create(entry.getKey()),
                                IRI.create(entry.getValue().toURI())));
                  }
                }
                OWLOntology root =
                    m.loadOntologyFromOntologyDocument(
                        new StringDocumentSource(
                            importRootText,
                            IRI.create(importRootIri),
                            new FunctionalSyntaxDocumentFormat(),
                            null));
                return m.getImportsClosure(root).size();
              } catch (Exception e) {
                throw new RuntimeException(e);
              }
            }));

    benchmarks.add(
        new BenchmarkDef(
            "load.rdfParserMetaData",
            () -> {
              long sum = 0;
              for (int i = 0; i < 500; i++) {
                RDFParserMetaData meta =
                    (RDFParserMetaData)
                        rdfMetaManager
                            .getOntologyFormat(rdfMetaOntology)
                            .getOntologyLoaderMetaData()
                            .orElseThrow();
                sum +=
                    meta.getTripleCount()
                        + (meta.getHeaderState() != null ? 1 : 0)
                        + meta.getUnparsedTriples().count()
                        + meta.getGuessedDeclarations().size();
              }
              return sum;
            }));

    // 4. Ontology Lifecycle & Mutations
    benchmarks.add(
        new BenchmarkDef(
            "manager.createAndGetOntology",
            () -> {
              try {
                OWLOntologyManager m = OWLManager.createOWLOntologyManager();
                long sum = 0;
                for (int i = 0; i < 100; i++) {
                  IRI iri = IRI.create("urn:bench:lifecycle#" + i);
                  OWLOntology o = m.createOntology(iri);
                  if (m.getOntology(iri) == o) sum++;
                }
                return sum;
              } catch (Exception e) {
                throw new RuntimeException(e);
              }
            }));

    List<OWLAxiom> bulk500 = rich.allMainAxioms.subList(0, 500);
    List<OWLAxiom> single200 = rich.allMainAxioms.subList(0, 200);

    benchmarks.add(
        new BenchmarkDef(
            "manager.addAxioms.bulk",
            () -> {
              try {
                OWLOntologyManager m = OWLManager.createOWLOntologyManager();
                OWLOntology o = m.createOntology(IRI.create("urn:bench:addbulk"));
                m.addAxioms(o, bulk500);
                return o.getAxiomCount();
              } catch (Exception e) {
                throw new RuntimeException(e);
              }
            }));

    benchmarks.add(
        new BenchmarkDef(
            "manager.addAxiom.singleLoop",
            () -> {
              try {
                OWLOntologyManager m = OWLManager.createOWLOntologyManager();
                OWLOntology o = m.createOntology(IRI.create("urn:bench:addsingle"));
                for (OWLAxiom ax : single200) {
                  m.addAxiom(o, ax);
                }
                return o.getAxiomCount();
              } catch (Exception e) {
                throw new RuntimeException(e);
              }
            }));

    benchmarks.add(
        new BenchmarkDef(
            "manager.removeAxioms.bulk",
            () -> {
              try {
                OWLOntologyManager m = OWLManager.createOWLOntologyManager();
                OWLOntology o = m.createOntology(IRI.create("urn:bench:rembulk"));
                m.addAxioms(o, bulk500);
                m.removeAxioms(o, bulk500);
                return o.getAxiomCount();
              } catch (Exception e) {
                throw new RuntimeException(e);
              }
            }));

    benchmarks.add(
        new BenchmarkDef(
            "manager.removeAxiom.singleLoop",
            () -> {
              try {
                OWLOntologyManager m = OWLManager.createOWLOntologyManager();
                OWLOntology o = m.createOntology(IRI.create("urn:bench:remsingle"));
                m.addAxioms(o, single200);
                for (OWLAxiom ax : single200) {
                  m.removeAxiom(o, ax);
                }
                return o.getAxiomCount();
              } catch (Exception e) {
                throw new RuntimeException(e);
              }
            }));

    benchmarks.add(
        new BenchmarkDef(
            "manager.applyChanges.mixed",
            () -> {
              try {
                OWLOntologyManager m = OWLManager.createOWLOntologyManager();
                OWLDataFactory df = m.getOWLDataFactory();
                OWLOntology o = m.createOntology(IRI.create("urn:bench:mixed"));
                List<OWLOntologyChange> changes = new ArrayList<>();
                for (int i = 0; i < 80; i++) {
                  changes.add(new AddAxiom(o, single200.get(i)));
                }
                for (int i = 0; i < 40; i++) {
                  changes.add(new RemoveAxiom(o, single200.get(i)));
                }
                OWLAnnotation ann = df.getOWLAnnotation(df.getRDFSLabel(), df.getOWLLiteral("v"));
                changes.add(new AddOntologyAnnotation(o, ann));
                changes.add(new RemoveOntologyAnnotation(o, ann));
                OWLImportsDeclaration imp =
                    df.getOWLImportsDeclaration(IRI.create("urn:bench:imp"));
                changes.add(new AddImport(o, imp));
                changes.add(new RemoveImport(o, imp));
                changes.add(
                    new SetOntologyID(
                        o,
                        new OWLOntologyID(
                            Optional.of(IRI.create("urn:bench:mixed2")), Optional.empty())));
                m.applyChanges(changes);
                return o.getAxiomCount();
              } catch (Exception e) {
                throw new RuntimeException(e);
              }
            }));

    benchmarks.add(
        new BenchmarkDef(
            "manager.getImportsClosure",
            () -> {
              long sum = 0;
              for (int i = 0; i < 1000; i++) {
                sum += closureManager.getImportsClosure(loadedClosureRoot).size();
              }
              return sum;
            }));

    // 5. Ontology Queries - General & Signature
    benchmarks.add(
        new BenchmarkDef(
            "ontology.getAxioms.excluded",
            () -> {
              long sum = 0;
              for (int i = 0; i < 200; i++) {
                sum +=
                    rich.mainOntology.getAxioms(Imports.EXCLUDED).size()
                        + rich.mainOntology.getAxiomCount(Imports.EXCLUDED)
                        + rich.mainOntology.getAnnotations().size()
                        + rich.mainOntology.getImportsDeclarations().size()
                        + (rich.mainOntology.getOntologyID() != null ? 1 : 0);
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "ontology.getAxioms.included",
            () -> {
              long sum = 0;
              for (int i = 0; i < 200; i++) {
                sum +=
                    rich.mainOntology.getAxioms(Imports.INCLUDED).size()
                        + rich.mainOntology.getAxiomCount(Imports.INCLUDED);
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "ontology.getLogicalAxioms",
            () -> {
              long sum = 0;
              for (int i = 0; i < 100; i++) {
                sum +=
                    rich.mainOntology.getLogicalAxioms(Imports.EXCLUDED).size()
                        + rich.mainOntology.getLogicalAxioms(Imports.INCLUDED).size()
                        + rich.mainOntology.getLogicalAxiomCount(Imports.EXCLUDED)
                        + rich.mainOntology.getLogicalAxiomCount(Imports.INCLUDED);
              }
              return sum;
            }));

    List<AxiomType<?>> allAxiomTypes = new ArrayList<>(AxiomType.AXIOM_TYPES);
    benchmarks.add(
        new BenchmarkDef(
            "ontology.getAxiomsByType",
            () -> {
              long sum = 0;
              for (int pass = 0; pass < 20; pass++) {
                for (AxiomType<?> type : allAxiomTypes) {
                  sum +=
                      rich.mainOntology.getAxioms(type, Imports.EXCLUDED).size()
                          + rich.mainOntology.getAxioms(type, Imports.INCLUDED).size()
                          + rich.mainOntology.getAxiomCount(type, Imports.EXCLUDED)
                          + rich.mainOntology.getAxiomCount(type, Imports.INCLUDED);
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "ontology.containsAxiom",
            () -> {
              long sum = 0;
              for (int i = 0; i < 200; i++) {
                OWLAxiom ax = rich.allMainAxioms.get(i);
                if (rich.mainOntology.containsAxiom(
                    ax, Imports.EXCLUDED, AxiomAnnotations.CONSIDER_AXIOM_ANNOTATIONS)) sum++;
                if (rich.mainOntology.containsAxiom(
                    ax, Imports.INCLUDED, AxiomAnnotations.CONSIDER_AXIOM_ANNOTATIONS)) sum++;
                if (rich.mainOntology.containsAxiom(
                    ax, Imports.EXCLUDED, AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS)) sum++;
                if (rich.mainOntology.containsAxiom(
                    ax, Imports.INCLUDED, AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS)) sum++;
                sum += rich.mainOntology.getAxiomsIgnoreAnnotations(ax, Imports.EXCLUDED).size();
                sum += rich.mainOntology.getAxiomsIgnoreAnnotations(ax, Imports.INCLUDED).size();
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "ontology.getSignature",
            () -> {
              long sum = 0;
              for (int i = 0; i < 100; i++) {
                for (Imports imp : List.of(Imports.EXCLUDED, Imports.INCLUDED)) {
                  sum +=
                      rich.mainOntology.getSignature(imp).size()
                          + rich.mainOntology.getClassesInSignature(imp).size()
                          + rich.mainOntology.getObjectPropertiesInSignature(imp).size()
                          + rich.mainOntology.getDataPropertiesInSignature(imp).size()
                          + rich.mainOntology.getAnnotationPropertiesInSignature(imp).size()
                          + rich.mainOntology.getIndividualsInSignature(imp).size()
                          + rich.mainOntology.getDatatypesInSignature(imp).size();
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "ontology.entitySignatureLookups",
            () -> {
              long sum = 0;
              for (int pass = 0; pass < 5; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  OWLClass c = rich.classes.get(i);
                  IRI iri = c.getIRI();
                  sum += rich.mainOntology.getEntitiesInSignature(iri, Imports.EXCLUDED).size();
                  sum += rich.mainOntology.getEntitiesInSignature(iri, Imports.INCLUDED).size();
                  if (rich.mainOntology.containsEntityInSignature(c, Imports.EXCLUDED)) sum++;
                  if (rich.mainOntology.containsEntityInSignature(iri, Imports.INCLUDED)) sum++;
                }
                sum += rich.mainOntology.getPunnedIRIs(Imports.EXCLUDED).size();
                sum += rich.mainOntology.getPunnedIRIs(Imports.INCLUDED).size();
                sum += rich.mainOntology.getReferencedAnonymousIndividuals(Imports.EXCLUDED).size();
                sum += rich.mainOntology.getReferencedAnonymousIndividuals(Imports.INCLUDED).size();
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "ontology.getReferencingAxioms",
            () -> {
              long sum = 0;
              for (int i = 0; i < 50; i++) {
                OWLClass c = rich.classes.get(i);
                sum += rich.mainOntology.getReferencingAxioms(c, Imports.EXCLUDED).size();
                sum += rich.mainOntology.getReferencingAxioms(c, Imports.INCLUDED).size();
              }
              return sum;
            }));

    // 6. Ontology Queries - 33 Specific Axiom Indexes
    benchmarks.add(
        new BenchmarkDef(
            "ontology.classAxiomIndexes",
            () -> {
              long sum = 0;
              for (int pass = 0; pass < 10; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  OWLClass c = rich.classes.get(i);
                  OWLClass d = rich.superClasses.get(i);
                  sum += rich.mainOntology.getSubClassAxiomsForSubClass(c).size();
                  sum += rich.mainOntology.getSubClassAxiomsForSuperClass(d).size();
                  sum += rich.mainOntology.getEquivalentClassesAxioms(c).size();
                  sum += rich.mainOntology.getDisjointClassesAxioms(c).size();
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "ontology.objectPropertyAxiomIndexes",
            () -> {
              long sum = 0;
              for (int pass = 0; pass < 10; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  OWLObjectProperty op = rich.objectProps.get(i);
                  OWLObjectProperty q = rich.superObjectProps.get(i);
                  sum += rich.mainOntology.getObjectSubPropertyAxiomsForSubProperty(op).size();
                  sum += rich.mainOntology.getObjectSubPropertyAxiomsForSuperProperty(q).size();
                  sum += rich.mainOntology.getObjectPropertyDomainAxioms(op).size();
                  sum += rich.mainOntology.getObjectPropertyRangeAxioms(op).size();
                  sum += rich.mainOntology.getInverseObjectPropertyAxioms(op).size();
                  sum += rich.mainOntology.getFunctionalObjectPropertyAxioms(op).size();
                  sum += rich.mainOntology.getInverseFunctionalObjectPropertyAxioms(op).size();
                  sum += rich.mainOntology.getSymmetricObjectPropertyAxioms(op).size();
                  sum += rich.mainOntology.getAsymmetricObjectPropertyAxioms(q).size();
                  sum += rich.mainOntology.getReflexiveObjectPropertyAxioms(op).size();
                  sum += rich.mainOntology.getIrreflexiveObjectPropertyAxioms(q).size();
                  sum += rich.mainOntology.getTransitiveObjectPropertyAxioms(q).size();
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "ontology.dataPropertyAxiomIndexes",
            () -> {
              long sum = 0;
              for (int pass = 0; pass < 10; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  OWLDataProperty dp = rich.dataProps.get(i);
                  OWLDataProperty dp2 = rich.superDataProps.get(i);
                  sum += rich.mainOntology.getDataSubPropertyAxiomsForSubProperty(dp).size();
                  sum += rich.mainOntology.getDataSubPropertyAxiomsForSuperProperty(dp2).size();
                  sum += rich.mainOntology.getDataPropertyDomainAxioms(dp).size();
                  sum += rich.mainOntology.getDataPropertyRangeAxioms(dp).size();
                  sum += rich.mainOntology.getFunctionalDataPropertyAxioms(dp).size();
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "ontology.annotationAndDeclarationIndexes",
            () -> {
              long sum = 0;
              for (int pass = 0; pass < 10; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  OWLClass c = rich.classes.get(i);
                  OWLAnnotationProperty ap = rich.annProps.get(i);
                  sum += rich.mainOntology.getDeclarationAxioms(c).size();
                  sum +=
                      rich.mainOntology
                          .getAnnotationAssertionAxioms(c.getIRI(), Imports.EXCLUDED)
                          .size();
                  sum +=
                      rich.mainOntology
                          .getAnnotationAssertionAxioms(c.getIRI(), Imports.INCLUDED)
                          .size();
                  sum += rich.mainOntology.getSubAnnotationPropertyOfAxioms(ap).size();
                  sum += rich.mainOntology.getAnnotationPropertyDomainAxioms(ap).size();
                  sum += rich.mainOntology.getAnnotationPropertyRangeAxioms(ap).size();
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "ontology.individualAssertionIndexes",
            () -> {
              long sum = 0;
              for (int pass = 0; pass < 10; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  OWLClass c = rich.classes.get(i);
                  OWLNamedIndividual ind = rich.individuals.get(i);
                  sum += rich.mainOntology.getClassAssertionAxioms(ind).size();
                  sum += rich.mainOntology.getClassAssertionAxioms(c).size();
                  sum += rich.mainOntology.getObjectPropertyAssertionAxioms(ind).size();
                  sum += rich.mainOntology.getDataPropertyAssertionAxioms(ind).size();
                  sum += rich.mainOntology.getNegativeObjectPropertyAssertionAxioms(ind).size();
                  sum += rich.mainOntology.getNegativeDataPropertyAssertionAxioms(ind).size();
                  sum += rich.mainOntology.getSameIndividualAxioms(ind).size();
                  sum += rich.mainOntology.getDifferentIndividualAxioms(ind).size();
                }
              }
              return sum;
            }));

    // 7. Storage / Serialization
    Object[][] saveFormats = {
      {"functional", new FunctionalSyntaxDocumentFormat()},
      {"owlxml", new OWLXMLDocumentFormat()},
      {"rdfxml", new RDFXMLDocumentFormat()},
      {"turtle", new TurtleDocumentFormat()}
    };
    for (Object[] entry : saveFormats) {
      String name = (String) entry[0];
      OWLDocumentFormat fmt = (OWLDocumentFormat) entry[1];
      benchmarks.add(
          new BenchmarkDef(
              "save." + name,
              () -> {
                try {
                  StringDocumentTarget target = new StringDocumentTarget();
                  saveManager.saveOntology(saveOntology, fmt, target);
                  return target.toString().length() > 0 ? saveOntology.getAxiomCount() : 0;
                } catch (Exception e) {
                  throw new RuntimeException(e);
                }
              }));
    }

    // 8. EntitySearcher
    List<OWLOntology> searchOntologies = List.of(rich.mainOntology, rich.importedOntology);
    benchmarks.add(
        new BenchmarkDef(
            "search.classHierarchyAndRelations",
            () -> {
              long sum = 0;
              for (int pass = 0; pass < 5; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  OWLClass c = rich.classes.get(i);
                  OWLClass d = rich.superClasses.get(i);
                  sum += EntitySearcher.getSuperClasses(c, searchOntologies.stream()).count();
                  sum += EntitySearcher.getSubClasses(d, searchOntologies.stream()).count();
                  sum += EntitySearcher.getEquivalentClasses(c, searchOntologies.stream()).count();
                  sum += EntitySearcher.getDisjointClasses(c, searchOntologies.stream()).count();
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "search.propertyHierarchyAndDomainsRanges",
            () -> {
              long sum = 0;
              for (int pass = 0; pass < 5; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  OWLObjectProperty op = rich.objectProps.get(i);
                  OWLObjectProperty q = rich.superObjectProps.get(i);
                  OWLDataProperty dp = rich.dataProps.get(i);
                  sum += EntitySearcher.getSuperProperties(op, searchOntologies.stream()).count();
                  sum += EntitySearcher.getSubProperties(q, searchOntologies.stream()).count();
                  sum += EntitySearcher.getDomains(op, searchOntologies.stream()).count();
                  sum += EntitySearcher.getRanges(op, searchOntologies.stream()).count();
                  sum += EntitySearcher.getInverses(op, searchOntologies.stream()).count();
                  sum += EntitySearcher.getDomains(dp, searchOntologies.stream()).count();
                  sum += EntitySearcher.getRanges(dp, searchOntologies.stream()).count();
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "search.annotations",
            () -> {
              OWLAnnotationProperty rdfsLabel = rich.df.getRDFSLabel();
              long sum = 0;
              for (int pass = 0; pass < 5; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  OWLClass c = rich.classes.get(i);
                  sum +=
                      EntitySearcher.getAnnotationAssertionAxioms(c, rich.mainOntology).count();
                  sum += EntitySearcher.getAnnotations(c, rich.mainOntology).count();
                  sum +=
                      EntitySearcher.getAnnotations(c, searchOntologies.stream(), rdfsLabel)
                          .count();
                  sum += EntitySearcher.getAnnotationObjects(c, rich.mainOntology).count();
                  sum +=
                      EntitySearcher.getAnnotationObjects(c, searchOntologies.stream(), rdfsLabel)
                          .count();
                }
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "search.propertyCharacteristics",
            () -> {
              long sum = 0;
              for (int pass = 0; pass < 10; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  OWLObjectProperty op = rich.objectProps.get(i);
                  OWLObjectProperty q = rich.superObjectProps.get(i);
                  OWLDataProperty dp = rich.dataProps.get(i);
                  if (EntitySearcher.isFunctional(op, searchOntologies.stream())) sum++;
                  if (EntitySearcher.isFunctional(dp, searchOntologies.stream())) sum++;
                  if (EntitySearcher.isInverseFunctional(op, searchOntologies.stream())) sum++;
                  if (EntitySearcher.isTransitive(q, searchOntologies.stream())) sum++;
                  if (EntitySearcher.isSymmetric(op, searchOntologies.stream())) sum++;
                  if (EntitySearcher.isAsymmetric(q, searchOntologies.stream())) sum++;
                  if (EntitySearcher.isReflexive(op, searchOntologies.stream())) sum++;
                  if (EntitySearcher.isIrreflexive(q, searchOntologies.stream())) sum++;
                }
              }
              return sum;
            }));

    // 9. Utilities
    benchmarks.add(
        new BenchmarkDef(
            "util.SimpleShortFormProvider",
            () -> {
              SimpleShortFormProvider sfp = new SimpleShortFormProvider();
              long sum = 0;
              for (int pass = 0; pass < 20; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  sum += sfp.getShortForm(rich.classes.get(i)).length();
                  sum += sfp.getShortForm(rich.objectProps.get(i)).length();
                  sum += sfp.getShortForm(rich.individuals.get(i)).length();
                }
              }
              sfp.dispose();
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "util.AnnotationValueShortFormProvider",
            () -> {
              OWLAnnotationProperty rdfsLabel = rich.df.getRDFSLabel();
              Map<OWLAnnotationProperty, List<String>> langMap = new LinkedHashMap<>();
              langMap.put(rdfsLabel, List.of("en", "fr"));
              OWLOntologySetProvider setProvider =
                  new OWLOntologyImportsClosureSetProvider(rich.manager, rich.mainOntology);
              AnnotationValueShortFormProvider avsfp =
                  new AnnotationValueShortFormProvider(
                      List.of(rdfsLabel), langMap, setProvider, new SimpleShortFormProvider());
              long sum = 0;
              for (int pass = 0; pass < 5; pass++) {
                for (int i = 0; i < RICH_COUNT; i++) {
                  sum += avsfp.getShortForm(rich.classes.get(i)).length();
                }
              }
              avsfp.dispose();
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "util.OWLOntologyImportsClosureSetProvider",
            () -> {
              OWLOntologyImportsClosureSetProvider provider =
                  new OWLOntologyImportsClosureSetProvider(closureManager, loadedClosureRoot);
              long sum = 0;
              for (int i = 0; i < 1000; i++) {
                sum += provider.ontologies().count();
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "util.OWLOntologyMerger",
            () -> {
              try {
                OWLOntologyImportsClosureSetProvider provider =
                    new OWLOntologyImportsClosureSetProvider(closureManager, loadedClosureRoot);
                OWLOntologyManager dest = OWLManager.createOWLOntologyManager();
                OWLOntologyMerger mergerAll = new OWLOntologyMerger(provider, false);
                OWLOntology merged1 =
                    mergerAll.createMergedOntology(dest, IRI.create("urn:bench:merged:all"));
                OWLOntologyMerger mergerLogical = new OWLOntologyMerger(provider, true);
                OWLOntology merged2 =
                    mergerLogical.createMergedOntology(
                        dest, IRI.create("urn:bench:merged:logical"));
                return merged1.getAxiomCount() + merged2.getAxiomCount();
              } catch (Exception e) {
                throw new RuntimeException(e);
              }
            }));

    benchmarks.add(
        new BenchmarkDef(
            "util.OWLObjectDuplicator",
            () -> {
              Map<OWLEntity, IRI> entityMap = new HashMap<>();
              entityMap.put(rich.classes.get(0), IRI.create("urn:bench:dup#C0"));
              OWLObjectDuplicator dup = new OWLObjectDuplicator(entityMap, rich.manager);
              long sum = 0;
              int n = Math.min(500, rich.allMainAxioms.size());
              for (int i = 0; i < n; i++) {
                OWLAxiom copy = dup.duplicateObject(rich.allMainAxioms.get(i));
                if (copy != null) sum++;
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "util.OWLEntityRenamer",
            () -> {
              OWLEntityRenamer renamer =
                  new OWLEntityRenamer(utilManager, Collections.singleton(utilOntology));
              long sum = 0;
              for (int i = 0; i < 10; i++) {
                OWLClass target =
                    utilDf.getOWLClass(IRI.create("urn:bench:util#C" + i));
                IRI replacement = IRI.create("urn:bench:util#RenamedC" + i);
                sum += renamer.changeIRI(target, replacement).size();
                sum += renamer.changeIRI(target.getIRI(), replacement).size();
              }
              return sum;
            }));

    benchmarks.add(
        new BenchmarkDef(
            "util.OWLEntityRemover",
            () -> {
              OWLEntityRemover remover =
                  new OWLEntityRemover(Collections.singleton(utilOntology));
              for (int i = 0; i < 20; i++) {
                utilDf
                    .getOWLClass(IRI.create("urn:bench:util#C" + i))
                    .accept(remover);
                utilDf
                    .getOWLObjectProperty(IRI.create("urn:bench:util#op" + i))
                    .accept(remover);
              }
              long count = remover.getChanges().size();
              remover.reset();
              return count;
            }));

    // 10. Manchester Object Renderer
    benchmarks.add(
        new BenchmarkDef(
            "renderer.ManchesterOWLSyntaxOWLObjectRendererImpl",
            () -> {
              ManchesterOWLSyntaxOWLObjectRendererImpl renderer =
                  new ManchesterOWLSyntaxOWLObjectRendererImpl();
              renderer.setShortFormProvider(new SimpleShortFormProvider());
              long sum = 0;
              int n = Math.min(300, rich.allMainAxioms.size());
              for (int i = 0; i < n; i++) {
                sum += renderer.render(rich.allMainAxioms.get(i)).length();
              }
              for (OWLClassExpression ce : rich.complexExpressions) {
                sum += renderer.render(ce).length();
              }
              return sum;
            }));

    // 11. Modularity / Locality
    for (LocalityClass mode :
        List.of(LocalityClass.BOTTOM, LocalityClass.TOP, LocalityClass.STAR)) {
      benchmarks.add(
          new BenchmarkDef(
              "locality.extract." + mode.name(),
              () -> {
                SyntacticLocalityModuleExtractor extractor =
                    new SyntacticLocalityModuleExtractor(mode, utilAxioms.stream());
                List<OWLAxiom> extracted =
                    extractor.extract(utilSeedEntities.stream()).collect(Collectors.toList());
                long baseCount = extractor.axiomBase().count();
                boolean hasFirst = extractor.containsAxiom(utilAxioms.get(0));
                return extracted.size() + baseCount + (hasFirst ? 1 : 0);
              }));
    }

    // 12. OWL 2 Language Profiles
    Object[][] profiles = {
      {"OWL2DLProfile", new OWL2DLProfile()},
      {"OWL2ELProfile", new OWL2ELProfile()},
      {"OWL2QLProfile", new OWL2QLProfile()},
      {"OWL2RLProfile", new OWL2RLProfile()}
    };
    for (Object[] entry : profiles) {
      String name = (String) entry[0];
      OWLProfile profile = (OWLProfile) entry[1];
      benchmarks.add(
          new BenchmarkDef(
              "profiles." + name + ".checkOntology",
              () -> {
                OWLProfileReport report = profile.checkOntology(profileOntology);
                return (report.isInProfile() ? 1000 : 0)
                    + report.getViolations().size()
                    + report.getProfile().getName().length();
              }));
    }

    List<Map<String, Object>> results = new ArrayList<>();
    for (BenchmarkDef bench : benchmarks) {
      if (!filterIds.isEmpty() && !filterIds.contains(bench.id)) {
        continue;
      }
      System.gc();
      long coldStartNs = System.nanoTime();
      long verificationCount = bench.operation.getAsLong();
      double firstUseWallMs = roundMs(System.nanoTime() - coldStartNs);

      for (int w = 0; w < warmupCount; w++) {
        bench.operation.getAsLong();
      }

      List<Map<String, Object>> measurements = new ArrayList<>();
      List<Double> wallSamples = new ArrayList<>();
      List<Long> heapSamples = new ArrayList<>();

      for (int r = 0; r < runCount; r++) {
        System.gc();
        long beforeHeap = usedHeap();
        long startNs = System.nanoTime();
        long count = bench.operation.getAsLong();
        long elapsedNs = System.nanoTime() - startNs;
        long afterHeap = Math.max(beforeHeap, usedHeap());
        if (count != verificationCount) {
          throw new IllegalStateException(
              "Non-deterministic verification count for "
                  + bench.id
                  + ": "
                  + count
                  + " != "
                  + verificationCount);
        }
        double wallMs = roundMs(elapsedNs);
        long heapDelta = afterHeap - beforeHeap;
        wallSamples.add(wallMs);
        heapSamples.add(heapDelta);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("wallMs", wallMs);
        m.put("retainedHeapDeltaBytes", heapDelta);
        measurements.add(m);
      }

      Map<String, Object> medianMap = new LinkedHashMap<>();
      medianMap.put("wallMs", median(wallSamples));
      medianMap.put("retainedHeapDeltaBytes", medianLong(heapSamples));

      Map<String, Object> row = new LinkedHashMap<>();
      row.put("id", bench.id);
      row.put("verificationCount", verificationCount);
      row.put("firstUseWallMs", firstUseWallMs);
      row.put("measurements", measurements);
      row.put("median", medianMap);
      results.add(row);
    }

    Map<String, Object> output = new LinkedHashMap<>();
    output.put("javaVersion", System.getProperty("java.version"));
    output.put("javaVmName", System.getProperty("java.vm.name"));
    output.put("owlapiVersion", VersionInfo.getVersionInfo().getVersion());
    output.put("results", results);
    System.out.println(JSON.writeValueAsString(output));
  }
}
