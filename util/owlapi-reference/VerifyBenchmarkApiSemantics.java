import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.jsonldjava.core.DocumentLoader;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Stream;
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
 * Untimed structural semantic witness for the full 70-group public API
 * benchmark suite, paired 1-to-1 with util/verify-benchmark-api-semantics.mjs.
 */
public final class VerifyBenchmarkApiSemantics {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final String RICH_NS = "urn:bench:rich#";
  private static final String IMPORT_NS = "urn:bench:rich:import#";
  private static final int RICH_COUNT = 60;
  private static final int IMPORT_COUNT = 20;

  private static final Comparator<String> UTF16_COMPARATOR =
      (a, b) -> {
        int len = Math.min(a.length(), b.length());
        for (int i = 0; i < len; i++) {
          char ca = a.charAt(i);
          char cb = b.charAt(i);
          if (ca != cb) {
            return ca - cb;
          }
        }
        return Integer.compare(a.length(), b.length());
      };

  private VerifyBenchmarkApiSemantics() {}

  private static Object toCanonicalValue(Object value) {
    if (value == null
        || value instanceof String
        || value instanceof Boolean
        || value instanceof Number) {
      return value;
    }
    if (value instanceof Map<?, ?> map) {
      Map<String, Object> sorted = new TreeMap<>(UTF16_COMPARATOR);
      for (Map.Entry<?, ?> entry : map.entrySet()) {
        sorted.put(String.valueOf(entry.getKey()), toCanonicalValue(entry.getValue()));
      }
      return sorted;
    }
    if (value instanceof Collection<?> col) {
      List<Object> list = new ArrayList<>(col.size());
      for (Object item : col) {
        list.add(toCanonicalValue(item));
      }
      return list;
    }
    throw new IllegalArgumentException("Unsupported canonical value: " + value.getClass());
  }

  private static String canonicalJson(Object value) throws Exception {
    return JSON.writeValueAsString(toCanonicalValue(value));
  }

  private static Map<String, Object> orderedMap() {
    return new TreeMap<>(UTF16_COMPARATOR);
  }

  private static List<Object> sortCanonicalObjects(
      Stream<?> stream, Function<Object, Object> mapper) throws Exception {
    record Entry(String key, Object ast) {}
    List<Entry> entries = new ArrayList<>();
    for (Object item : stream.toList()) {
      Object ast = mapper.apply(item);
      entries.add(new Entry(canonicalJson(ast), ast));
    }
    entries.sort((a, b) -> UTF16_COMPARATOR.compare(a.key(), b.key()));
    List<Object> result = new ArrayList<>(entries.size());
    for (Entry entry : entries) {
      result.add(entry.ast());
    }
    return result;
  }

  private static Map<String, Object> canonicalIri(IRI iri) {
    Map<String, Object> m = orderedMap();
    m.put("kind", "IRI");
    m.put("value", iri.toString());
    return m;
  }

  private static Map<String, Object> canonicalOntologyId(OWLOntologyID id) {
    Map<String, Object> m = orderedMap();
    m.put("kind", "OWLOntologyID");
    m.put("ontologyIRI", id.getOntologyIRI().map(VerifyBenchmarkApiSemantics::canonicalIri).orElse(null));
    m.put("versionIRI", id.getVersionIRI().map(VerifyBenchmarkApiSemantics::canonicalIri).orElse(null));
    return m;
  }

  private static Map<String, Object> canonicalImportsDecl(OWLImportsDeclaration decl) {
    Map<String, Object> m = orderedMap();
    m.put("kind", "OWLImportsDeclaration");
    m.put("iri", canonicalIri(decl.getIRI()));
    return m;
  }

  private static final OWLObjectVisitorEx<Map<String, Object>> AST_VISITOR =
      new OWLObjectVisitorEx<>() {
        private List<Object> sortedList(Stream<? extends OWLObject> stream) {
          try {
            return sortCanonicalObjects(stream, item -> ((OWLObject) item).accept(this));
          } catch (Exception e) {
            throw new RuntimeException(e);
          }
        }

        private List<Object> annotationsOf(OWLAxiom axiom) {
          return sortedList(axiom.annotations());
        }

        private Map<String, Object> node(String kind) {
          Map<String, Object> m = orderedMap();
          m.put("kind", kind);
          return m;
        }

        @Override
        public Map<String, Object> doDefault(Object object) {
          throw new UnsupportedOperationException("Unsupported OWLObject: " + object.getClass());
        }

        @Override
        public Map<String, Object> visit(IRI iri) {
          return canonicalIri(iri);
        }

        @Override
        public Map<String, Object> visit(OWLLiteral lit) {
          Map<String, Object> m = node("OWLLiteral");
          m.put("lexicalForm", lit.getLiteral());
          m.put("datatype", lit.getDatatype().accept(this));
          m.put("language", lit.getLang());
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLAnonymousIndividual individual) {
          String raw = individual.getID().getID();
          String nodeId = raw.startsWith("_:") ? raw.substring(2) : raw;
          Map<String, Object> m = node("OWLAnonymousIndividual");
          m.put("nodeID", nodeId);
          m.put("documentScope", "");
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLAnnotation annotation) {
          Map<String, Object> m = node("OWLAnnotation");
          m.put("property", annotation.getProperty().accept(this));
          m.put("value", annotation.getValue().accept(this));
          m.put("annotations", sortedList(annotation.annotations()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLClass ce) {
          Map<String, Object> m = node("OWLClass");
          m.put("iri", canonicalIri(ce.getIRI()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDatatype node) {
          Map<String, Object> m = node("OWLDatatype");
          m.put("iri", canonicalIri(node.getIRI()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectProperty prop) {
          Map<String, Object> m = node("OWLObjectProperty");
          m.put("iri", canonicalIri(prop.getIRI()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataProperty prop) {
          Map<String, Object> m = node("OWLDataProperty");
          m.put("iri", canonicalIri(prop.getIRI()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLAnnotationProperty prop) {
          Map<String, Object> m = node("OWLAnnotationProperty");
          m.put("iri", canonicalIri(prop.getIRI()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLNamedIndividual ind) {
          Map<String, Object> m = node("OWLNamedIndividual");
          m.put("iri", canonicalIri(ind.getIRI()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectInverseOf prop) {
          Map<String, Object> m = node("OWLObjectInverseOf");
          m.put("inverse", prop.getInverse().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectIntersectionOf ce) {
          Map<String, Object> m = node("OWLObjectIntersectionOf");
          m.put("operands", sortedList(ce.operands()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectUnionOf ce) {
          Map<String, Object> m = node("OWLObjectUnionOf");
          m.put("operands", sortedList(ce.operands()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectComplementOf ce) {
          Map<String, Object> m = node("OWLObjectComplementOf");
          m.put("operand", ce.getOperand().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectOneOf ce) {
          Map<String, Object> m = node("OWLObjectOneOf");
          m.put("individuals", sortedList(ce.individuals()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectSomeValuesFrom ce) {
          Map<String, Object> m = node("OWLObjectSomeValuesFrom");
          m.put("property", ce.getProperty().accept(this));
          m.put("filler", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectAllValuesFrom ce) {
          Map<String, Object> m = node("OWLObjectAllValuesFrom");
          m.put("property", ce.getProperty().accept(this));
          m.put("filler", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectHasValue ce) {
          Map<String, Object> m = node("OWLObjectHasValue");
          m.put("property", ce.getProperty().accept(this));
          m.put("individual", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectHasSelf ce) {
          Map<String, Object> m = node("OWLObjectHasSelf");
          m.put("property", ce.getProperty().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectMinCardinality ce) {
          Map<String, Object> m = node("OWLObjectMinCardinality");
          m.put("cardinality", ce.getCardinality());
          m.put("property", ce.getProperty().accept(this));
          m.put("filler", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectMaxCardinality ce) {
          Map<String, Object> m = node("OWLObjectMaxCardinality");
          m.put("cardinality", ce.getCardinality());
          m.put("property", ce.getProperty().accept(this));
          m.put("filler", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectExactCardinality ce) {
          Map<String, Object> m = node("OWLObjectExactCardinality");
          m.put("cardinality", ce.getCardinality());
          m.put("property", ce.getProperty().accept(this));
          m.put("filler", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataSomeValuesFrom ce) {
          Map<String, Object> m = node("OWLDataSomeValuesFrom");
          m.put("properties", List.of(ce.getProperty().accept(this)));
          m.put("filler", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataAllValuesFrom ce) {
          Map<String, Object> m = node("OWLDataAllValuesFrom");
          m.put("properties", List.of(ce.getProperty().accept(this)));
          m.put("filler", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataHasValue ce) {
          Map<String, Object> m = node("OWLDataHasValue");
          m.put("property", ce.getProperty().accept(this));
          m.put("value", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataMinCardinality ce) {
          Map<String, Object> m = node("OWLDataMinCardinality");
          m.put("cardinality", ce.getCardinality());
          m.put("property", ce.getProperty().accept(this));
          m.put("filler", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataMaxCardinality ce) {
          Map<String, Object> m = node("OWLDataMaxCardinality");
          m.put("cardinality", ce.getCardinality());
          m.put("property", ce.getProperty().accept(this));
          m.put("filler", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataExactCardinality ce) {
          Map<String, Object> m = node("OWLDataExactCardinality");
          m.put("cardinality", ce.getCardinality());
          m.put("property", ce.getProperty().accept(this));
          m.put("filler", ce.getFiller().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataIntersectionOf dr) {
          Map<String, Object> m = node("OWLDataIntersectionOf");
          m.put("operands", sortedList(dr.operands()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataUnionOf dr) {
          Map<String, Object> m = node("OWLDataUnionOf");
          m.put("operands", sortedList(dr.operands()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataComplementOf dr) {
          Map<String, Object> m = node("OWLDataComplementOf");
          m.put("operand", dr.getDataRange().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataOneOf dr) {
          Map<String, Object> m = node("OWLDataOneOf");
          m.put("values", sortedList(dr.values()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDatatypeRestriction dr) {
          Map<String, Object> m = node("OWLDatatypeRestriction");
          m.put("datatype", dr.getDatatype().accept(this));
          m.put("facetRestrictions", sortedList(dr.facetRestrictions()));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLFacetRestriction fr) {
          Map<String, Object> m = node("OWLFacetRestriction");
          m.put("facet", canonicalIri(fr.getFacet().getIRI()));
          m.put("value", fr.getFacetValue().accept(this));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDeclarationAxiom ax) {
          Map<String, Object> m = node("OWLDeclarationAxiom");
          m.put("entity", ax.getEntity().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLSubClassOfAxiom ax) {
          Map<String, Object> m = node("OWLSubClassOfAxiom");
          m.put("subClass", ax.getSubClass().accept(this));
          m.put("superClass", ax.getSuperClass().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLEquivalentClassesAxiom ax) {
          Map<String, Object> m = node("OWLEquivalentClassesAxiom");
          m.put("classExpressions", sortedList(ax.classExpressions()));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDisjointClassesAxiom ax) {
          Map<String, Object> m = node("OWLDisjointClassesAxiom");
          m.put("classExpressions", sortedList(ax.classExpressions()));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDisjointUnionAxiom ax) {
          Map<String, Object> m = node("OWLDisjointUnionAxiom");
          m.put("owlClass", ax.getOWLClass().accept(this));
          m.put("classExpressions", sortedList(ax.classExpressions()));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLSubObjectPropertyOfAxiom ax) {
          Map<String, Object> m = node("OWLSubObjectPropertyOfAxiom");
          m.put("subProperty", ax.getSubProperty().accept(this));
          m.put("superProperty", ax.getSuperProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLSubPropertyChainOfAxiom ax) {
          Map<String, Object> m = node("OWLSubPropertyChainOfAxiom");
          m.put("chain", ax.getPropertyChain().stream().map(p -> p.accept(this)).toList());
          m.put("superProperty", ax.getSuperProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLEquivalentObjectPropertiesAxiom ax) {
          Map<String, Object> m = node("OWLEquivalentObjectPropertiesAxiom");
          m.put("properties", sortedList(ax.properties()));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDisjointObjectPropertiesAxiom ax) {
          Map<String, Object> m = node("OWLDisjointObjectPropertiesAxiom");
          m.put("properties", sortedList(ax.properties()));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectPropertyDomainAxiom ax) {
          Map<String, Object> m = node("OWLObjectPropertyDomainAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("domain", ax.getDomain().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectPropertyRangeAxiom ax) {
          Map<String, Object> m = node("OWLObjectPropertyRangeAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("range", ax.getRange().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLInverseObjectPropertiesAxiom ax) {
          Map<String, Object> m = node("OWLInverseObjectPropertiesAxiom");
          m.put("properties", sortedList(Stream.of(ax.getFirstProperty(), ax.getSecondProperty())));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLFunctionalObjectPropertyAxiom ax) {
          Map<String, Object> m = node("OWLFunctionalObjectPropertyAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLInverseFunctionalObjectPropertyAxiom ax) {
          Map<String, Object> m = node("OWLInverseFunctionalObjectPropertyAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLReflexiveObjectPropertyAxiom ax) {
          Map<String, Object> m = node("OWLReflexiveObjectPropertyAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLIrreflexiveObjectPropertyAxiom ax) {
          Map<String, Object> m = node("OWLIrreflexiveObjectPropertyAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLSymmetricObjectPropertyAxiom ax) {
          Map<String, Object> m = node("OWLSymmetricObjectPropertyAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLAsymmetricObjectPropertyAxiom ax) {
          Map<String, Object> m = node("OWLAsymmetricObjectPropertyAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLTransitiveObjectPropertyAxiom ax) {
          Map<String, Object> m = node("OWLTransitiveObjectPropertyAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLSubDataPropertyOfAxiom ax) {
          Map<String, Object> m = node("OWLSubDataPropertyOfAxiom");
          m.put("subProperty", ax.getSubProperty().accept(this));
          m.put("superProperty", ax.getSuperProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLEquivalentDataPropertiesAxiom ax) {
          Map<String, Object> m = node("OWLEquivalentDataPropertiesAxiom");
          m.put("properties", sortedList(ax.properties()));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDisjointDataPropertiesAxiom ax) {
          Map<String, Object> m = node("OWLDisjointDataPropertiesAxiom");
          m.put("properties", sortedList(ax.properties()));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataPropertyDomainAxiom ax) {
          Map<String, Object> m = node("OWLDataPropertyDomainAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("domain", ax.getDomain().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataPropertyRangeAxiom ax) {
          Map<String, Object> m = node("OWLDataPropertyRangeAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("range", ax.getRange().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLFunctionalDataPropertyAxiom ax) {
          Map<String, Object> m = node("OWLFunctionalDataPropertyAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDatatypeDefinitionAxiom ax) {
          Map<String, Object> m = node("OWLDatatypeDefinitionAxiom");
          m.put("datatype", ax.getDatatype().accept(this));
          m.put("dataRange", ax.getDataRange().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLHasKeyAxiom ax) {
          Map<String, Object> m = node("OWLHasKeyAxiom");
          m.put("classExpression", ax.getClassExpression().accept(this));
          m.put("objectProperties", sortedList(ax.objectPropertyExpressions()));
          m.put("dataProperties", sortedList(ax.dataPropertyExpressions()));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLSameIndividualAxiom ax) {
          Map<String, Object> m = node("OWLSameIndividualAxiom");
          m.put("individuals", sortedList(ax.individuals()));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDifferentIndividualsAxiom ax) {
          Map<String, Object> m = node("OWLDifferentIndividualsAxiom");
          m.put("individuals", sortedList(ax.individuals()));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLClassAssertionAxiom ax) {
          Map<String, Object> m = node("OWLClassAssertionAxiom");
          m.put("classExpression", ax.getClassExpression().accept(this));
          m.put("individual", ax.getIndividual().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLObjectPropertyAssertionAxiom ax) {
          Map<String, Object> m = node("OWLObjectPropertyAssertionAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("subject", ax.getSubject().accept(this));
          m.put("value", ax.getObject().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLNegativeObjectPropertyAssertionAxiom ax) {
          Map<String, Object> m = node("OWLNegativeObjectPropertyAssertionAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("subject", ax.getSubject().accept(this));
          m.put("value", ax.getObject().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLDataPropertyAssertionAxiom ax) {
          Map<String, Object> m = node("OWLDataPropertyAssertionAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("subject", ax.getSubject().accept(this));
          m.put("value", ax.getObject().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLNegativeDataPropertyAssertionAxiom ax) {
          Map<String, Object> m = node("OWLNegativeDataPropertyAssertionAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("subject", ax.getSubject().accept(this));
          m.put("value", ax.getObject().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLAnnotationAssertionAxiom ax) {
          Map<String, Object> m = node("OWLAnnotationAssertionAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("subject", ax.getSubject().accept(this));
          m.put("value", ax.getValue().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLSubAnnotationPropertyOfAxiom ax) {
          Map<String, Object> m = node("OWLSubAnnotationPropertyOfAxiom");
          m.put("subProperty", ax.getSubProperty().accept(this));
          m.put("superProperty", ax.getSuperProperty().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLAnnotationPropertyDomainAxiom ax) {
          Map<String, Object> m = node("OWLAnnotationPropertyDomainAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("domain", ax.getDomain().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }

        @Override
        public Map<String, Object> visit(OWLAnnotationPropertyRangeAxiom ax) {
          Map<String, Object> m = node("OWLAnnotationPropertyRangeAxiom");
          m.put("property", ax.getProperty().accept(this));
          m.put("range", ax.getRange().accept(this));
          m.put("annotations", annotationsOf(ax));
          return m;
        }
      };

  private static final OWLObjectVisitorEx<String> KIND_VISITOR =
      new OWLObjectVisitorEx<>() {
        @Override public String doDefault(Object o) { throw new UnsupportedOperationException(o.getClass().getName()); }
        @Override public String visit(IRI iri) { return "IRI"; }
        @Override public String visit(OWLLiteral lit) { return "OWLLiteral"; }
        @Override public String visit(OWLAnonymousIndividual ind) { return "OWLAnonymousIndividual"; }
        @Override public String visit(OWLAnnotation ann) { return "OWLAnnotation"; }
        @Override public String visit(OWLClass c) { return "OWLClass"; }
        @Override public String visit(OWLDatatype dt) { return "OWLDatatype"; }
        @Override public String visit(OWLObjectProperty p) { return "OWLObjectProperty"; }
        @Override public String visit(OWLDataProperty p) { return "OWLDataProperty"; }
        @Override public String visit(OWLAnnotationProperty p) { return "OWLAnnotationProperty"; }
        @Override public String visit(OWLNamedIndividual i) { return "OWLNamedIndividual"; }
        @Override public String visit(OWLObjectInverseOf p) { return "OWLObjectInverseOf"; }
        @Override public String visit(OWLObjectIntersectionOf ce) { return "OWLObjectIntersectionOf"; }
        @Override public String visit(OWLObjectUnionOf ce) { return "OWLObjectUnionOf"; }
        @Override public String visit(OWLObjectComplementOf ce) { return "OWLObjectComplementOf"; }
        @Override public String visit(OWLObjectOneOf ce) { return "OWLObjectOneOf"; }
        @Override public String visit(OWLObjectSomeValuesFrom ce) { return "OWLObjectSomeValuesFrom"; }
        @Override public String visit(OWLObjectAllValuesFrom ce) { return "OWLObjectAllValuesFrom"; }
        @Override public String visit(OWLObjectHasValue ce) { return "OWLObjectHasValue"; }
        @Override public String visit(OWLObjectHasSelf ce) { return "OWLObjectHasSelf"; }
        @Override public String visit(OWLObjectMinCardinality ce) { return "OWLObjectMinCardinality"; }
        @Override public String visit(OWLObjectMaxCardinality ce) { return "OWLObjectMaxCardinality"; }
        @Override public String visit(OWLObjectExactCardinality ce) { return "OWLObjectExactCardinality"; }
        @Override public String visit(OWLDataSomeValuesFrom ce) { return "OWLDataSomeValuesFrom"; }
        @Override public String visit(OWLDataAllValuesFrom ce) { return "OWLDataAllValuesFrom"; }
        @Override public String visit(OWLDataHasValue ce) { return "OWLDataHasValue"; }
        @Override public String visit(OWLDataMinCardinality ce) { return "OWLDataMinCardinality"; }
        @Override public String visit(OWLDataMaxCardinality ce) { return "OWLDataMaxCardinality"; }
        @Override public String visit(OWLDataExactCardinality ce) { return "OWLDataExactCardinality"; }
        @Override public String visit(OWLDataIntersectionOf dr) { return "OWLDataIntersectionOf"; }
        @Override public String visit(OWLDataUnionOf dr) { return "OWLDataUnionOf"; }
        @Override public String visit(OWLDataComplementOf dr) { return "OWLDataComplementOf"; }
        @Override public String visit(OWLDataOneOf dr) { return "OWLDataOneOf"; }
        @Override public String visit(OWLDatatypeRestriction dr) { return "OWLDatatypeRestriction"; }
        @Override public String visit(OWLFacetRestriction fr) { return "OWLFacetRestriction"; }
        @Override public String visit(OWLDeclarationAxiom ax) { return "OWLDeclarationAxiom"; }
        @Override public String visit(OWLSubClassOfAxiom ax) { return "OWLSubClassOfAxiom"; }
        @Override public String visit(OWLEquivalentClassesAxiom ax) { return "OWLEquivalentClassesAxiom"; }
        @Override public String visit(OWLDisjointClassesAxiom ax) { return "OWLDisjointClassesAxiom"; }
        @Override public String visit(OWLDisjointUnionAxiom ax) { return "OWLDisjointUnionAxiom"; }
        @Override public String visit(OWLSubObjectPropertyOfAxiom ax) { return "OWLSubObjectPropertyOfAxiom"; }
        @Override public String visit(OWLSubPropertyChainOfAxiom ax) { return "OWLSubPropertyChainOfAxiom"; }
        @Override public String visit(OWLEquivalentObjectPropertiesAxiom ax) { return "OWLEquivalentObjectPropertiesAxiom"; }
        @Override public String visit(OWLDisjointObjectPropertiesAxiom ax) { return "OWLDisjointObjectPropertiesAxiom"; }
        @Override public String visit(OWLObjectPropertyDomainAxiom ax) { return "OWLObjectPropertyDomainAxiom"; }
        @Override public String visit(OWLObjectPropertyRangeAxiom ax) { return "OWLObjectPropertyRangeAxiom"; }
        @Override public String visit(OWLInverseObjectPropertiesAxiom ax) { return "OWLInverseObjectPropertiesAxiom"; }
        @Override public String visit(OWLFunctionalObjectPropertyAxiom ax) { return "OWLFunctionalObjectPropertyAxiom"; }
        @Override public String visit(OWLInverseFunctionalObjectPropertyAxiom ax) { return "OWLInverseFunctionalObjectPropertyAxiom"; }
        @Override public String visit(OWLReflexiveObjectPropertyAxiom ax) { return "OWLReflexiveObjectPropertyAxiom"; }
        @Override public String visit(OWLIrreflexiveObjectPropertyAxiom ax) { return "OWLIrreflexiveObjectPropertyAxiom"; }
        @Override public String visit(OWLSymmetricObjectPropertyAxiom ax) { return "OWLSymmetricObjectPropertyAxiom"; }
        @Override public String visit(OWLAsymmetricObjectPropertyAxiom ax) { return "OWLAsymmetricObjectPropertyAxiom"; }
        @Override public String visit(OWLTransitiveObjectPropertyAxiom ax) { return "OWLTransitiveObjectPropertyAxiom"; }
        @Override public String visit(OWLSubDataPropertyOfAxiom ax) { return "OWLSubDataPropertyOfAxiom"; }
        @Override public String visit(OWLEquivalentDataPropertiesAxiom ax) { return "OWLEquivalentDataPropertiesAxiom"; }
        @Override public String visit(OWLDisjointDataPropertiesAxiom ax) { return "OWLDisjointDataPropertiesAxiom"; }
        @Override public String visit(OWLDataPropertyDomainAxiom ax) { return "OWLDataPropertyDomainAxiom"; }
        @Override public String visit(OWLDataPropertyRangeAxiom ax) { return "OWLDataPropertyRangeAxiom"; }
        @Override public String visit(OWLFunctionalDataPropertyAxiom ax) { return "OWLFunctionalDataPropertyAxiom"; }
        @Override public String visit(OWLDatatypeDefinitionAxiom ax) { return "OWLDatatypeDefinitionAxiom"; }
        @Override public String visit(OWLHasKeyAxiom ax) { return "OWLHasKeyAxiom"; }
        @Override public String visit(OWLSameIndividualAxiom ax) { return "OWLSameIndividualAxiom"; }
        @Override public String visit(OWLDifferentIndividualsAxiom ax) { return "OWLDifferentIndividualsAxiom"; }
        @Override public String visit(OWLClassAssertionAxiom ax) { return "OWLClassAssertionAxiom"; }
        @Override public String visit(OWLObjectPropertyAssertionAxiom ax) { return "OWLObjectPropertyAssertionAxiom"; }
        @Override public String visit(OWLNegativeObjectPropertyAssertionAxiom ax) { return "OWLNegativeObjectPropertyAssertionAxiom"; }
        @Override public String visit(OWLDataPropertyAssertionAxiom ax) { return "OWLDataPropertyAssertionAxiom"; }
        @Override public String visit(OWLNegativeDataPropertyAssertionAxiom ax) { return "OWLNegativeDataPropertyAssertionAxiom"; }
        @Override public String visit(OWLAnnotationAssertionAxiom ax) { return "OWLAnnotationAssertionAxiom"; }
        @Override public String visit(OWLSubAnnotationPropertyOfAxiom ax) { return "OWLSubAnnotationPropertyOfAxiom"; }
        @Override public String visit(OWLAnnotationPropertyDomainAxiom ax) { return "OWLAnnotationPropertyDomainAxiom"; }
        @Override public String visit(OWLAnnotationPropertyRangeAxiom ax) { return "OWLAnnotationPropertyRangeAxiom"; }
      };

  private static Map<String, Object> canonicalOwlObject(OWLObject obj) {
    return obj.accept(AST_VISITOR);
  }

  private static List<Object> sortOwlObjects(Stream<? extends OWLObject> stream) throws Exception {
    return sortCanonicalObjects(stream, item -> canonicalOwlObject((OWLObject) item));
  }

  private static Map<String, Object> canonicalOntology(OWLOntology ont) throws Exception {
    Map<String, Object> m = orderedMap();
    m.put("ontologyID", canonicalOntologyId(ont.getOntologyID()));
    m.put("imports", sortCanonicalObjects(ont.importsDeclarations(), item -> canonicalImportsDecl((OWLImportsDeclaration) item)));
    m.put("annotations", sortOwlObjects(ont.annotations()));
    m.put("axioms", sortOwlObjects(ont.axioms()));
    return m;
  }

  private static Map<String, Object> canonicalChange(OWLOntologyChange change) {
    Map<String, Object> m = orderedMap();
    String changeKind;
    if (change instanceof AddAxiom) {
      changeKind = "AddAxiom";
    } else if (change instanceof RemoveAxiom) {
      changeKind = "RemoveAxiom";
    } else if (change instanceof AddOntologyAnnotation) {
      changeKind = "AddOntologyAnnotation";
    } else if (change instanceof RemoveOntologyAnnotation) {
      changeKind = "RemoveOntologyAnnotation";
    } else {
      changeKind = change.getClass().getSimpleName();
    }
    m.put("changeKind", changeKind);
    m.put("ontologyIRI", change.getOntology().getOntologyID().getOntologyIRI().map(IRI::toString).orElse(null));
    if (change.isAxiomChange()) {
      m.put("axiom", canonicalOwlObject(change.getAxiom()));
    } else if (change instanceof AddOntologyAnnotation addAnn) {
      m.put("annotation", canonicalOwlObject(addAnn.getAnnotation()));
    } else if (change instanceof RemoveOntologyAnnotation remAnn) {
      m.put("annotation", canonicalOwlObject(remAnn.getAnnotation()));
    }
    return m;
  }

  private static Map<String, Object> canonicalProfileReport(OWLProfileReport report) throws Exception {
    List<Object> sortedViolations = sortCanonicalObjects(
        report.getViolations().stream(),
        item -> {
          OWLProfileViolation v = (OWLProfileViolation) item;
          Map<String, Object> entry = orderedMap();
          entry.put("axiomKind", v.getAxiom() != null ? v.getAxiom().accept(KIND_VISITOR) : null);
          String simple = v.getClass().getSimpleName();
          String category =
              "UseOfNonSuperClassExpression".equals(simple) ? "NonSuperClassExpression" : simple;
          entry.put("violationCategory", category);
          Object expr = v.getExpression();
          entry.put(
              "expressionKind",
              expr instanceof OWLObject owlObj ? owlObj.accept(KIND_VISITOR) : null);
          return entry;
        });
    Map<String, Object> m = orderedMap();
    m.put("profileName", report.getProfile().getName());
    m.put("inProfile", report.isInProfile());
    m.put("violationCount", report.getViolations().size());
    m.put("violations", sortedViolations);
    return m;
  }

  private static Map<String, Object> rdfResourceSnapshot(RDFResource res) {
    Map<String, Object> m = orderedMap();
    if (res.isAnonymous()) {
      String raw = res.getNodeIDValue();
      m.put("termType", "BlankNode");
      m.put("value", raw.startsWith("_:") ? raw.substring(2) : raw);
    } else {
      m.put("termType", "NamedNode");
      m.put("value", res.getIRI().toString());
    }
    return m;
  }

  private static Map<String, Object> rdfTripleSnapshot(RDFTriple triple) {
    Map<String, Object> m = orderedMap();
    m.put("subject", rdfResourceSnapshot(triple.getSubject()));
    m.put("predicate", rdfResourceSnapshot(triple.getPredicate()));
    RDFNode obj = triple.getObject();
    if (obj.isLiteral()) {
      RDFLiteral lit = (RDFLiteral) obj;
      Map<String, Object> o = orderedMap();
      o.put("termType", "Literal");
      o.put("value", lit.getLexicalValue());
      Map<String, Object> dt = orderedMap();
      dt.put("termType", "NamedNode");
      dt.put("value", lit.getDatatype().toString());
      o.put("datatype", dt);
      o.put("language", lit.getLang() == null ? "" : lit.getLang());
      m.put("object", o);
    } else {
      m.put("object", rdfResourceSnapshot((RDFResource) obj));
    }
    return m;
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

  private static OWLDocumentFormat formatForName(String name) {
    return switch (name) {
      case "functional" -> new FunctionalSyntaxDocumentFormat();
      case "manchester" -> new ManchesterSyntaxDocumentFormat();
      case "owlxml" -> new OWLXMLDocumentFormat();
      case "rdfxml" -> new RDFXMLDocumentFormat();
      case "turtle" -> new TurtleDocumentFormat();
      case "ntriples" -> new NTriplesDocumentFormat();
      case "nquads" -> new NQuadsDocumentFormat();
      case "trig" -> new TrigDocumentFormat();
      case "jsonld" -> new RDFJsonLDDocumentFormat();
      case "dl" -> new DLSyntaxDocumentFormat();
      case "krss2" -> new KRSS2DocumentFormat();
      case "krss1" -> new KRSSDocumentFormat();
      default -> throw new IllegalArgumentException("Unknown format: " + name);
    };
  }

  private static Map<String, Object> literalSnapshot(OWLLiteral lit) {
    Map<String, Object> m = orderedMap();
    m.put("lexicalForm", lit.getLiteral());
    m.put("datatypeIRI", lit.getDatatype().getIRI().toString());
    m.put("language", lit.getLang());
    return m;
  }

  private static Map<String, Object> writerConfigSnapshot(OWLOntologyWriterConfiguration cfg) {
    Map<String, Object> m = orderedMap();
    m.put("indenting", cfg.isIndenting());
    m.put("indentSize", cfg.getIndentSize());
    m.put("useBanners", cfg.shouldUseBanners());
    m.put("labelsAsBanner", cfg.isLabelsAsBanner());
    m.put("saveIdsForAllAnonymousIndividuals", cfg.shouldSaveIdsForAllAnonymousIndividuals());
    return m;
  }

  private static Map<String, Object> loaderConfigSnapshot(OWLOntologyLoaderConfiguration cfg) {
    Map<String, Object> m = orderedMap();
    m.put("strict", cfg.isStrict());
    m.put("loadAnnotationAxioms", cfg.isLoadAnnotationAxioms());
    m.put("connectionTimeout", cfg.getConnectionTimeout());
    m.put("retriesToAttempt", cfg.getRetriesToAttempt());
    m.put("followRedirects", cfg.isFollowRedirects());
    m.put("entityExpansionLimit", cfg.getEntityExpansionLimit());
    m.put("authorizationValue", cfg.getAuthorizationValue());
    m.put("acceptingHTTPCompression", cfg.isAcceptingHTTPCompression());
    return m;
  }

  private static void runObserveMode(JsonNode specNode) throws Exception {
    Path fixturesDir = Path.of(specNode.get("fixturesDirectory").asText());
    Path saveDir = Path.of(specNode.get("saveDirectory").asText());
    Path outputPath = Path.of(specNode.get("outputPath").asText());
    Files.createDirectories(saveDir);

    Map<String, String> syntaxTexts = new LinkedHashMap<>();
    for (String syntax : List.of(
        "functional", "manchester", "owlxml", "rdfxml", "turtle",
        "ntriples", "nquads", "trig", "jsonld", "dl", "krss2", "krss1", "rdf-metadata")) {
      String text = Files.readString(fixturesDir.resolve(syntax + ".txt"), StandardCharsets.UTF_8);
      if ("dl".equals(syntax)) {
        text = text.trim();
      }
      syntaxTexts.put(syntax, text);
    }

    JsonNode importManifest = specNode.get("importClosure");
    String importRootIri = importManifest.get("rootIRI").asText();
    Map<String, File> importFiles = new LinkedHashMap<>();
    importManifest.get("files").fields().forEachRemaining(
        e -> importFiles.put(e.getKey(), new File(e.getValue().asText())));
    String importRootText = Files.readString(importFiles.get(importRootIri).toPath(), StandardCharsets.UTF_8);

    RichOntologyFixture rich = new RichOntologyFixture();
    OWLOntology profileOntology = buildProfileOntology(OWLManager.createOWLOntologyManager());

    OWLOntologyManager closureManager = OWLManager.createOWLOntologyManager();
    for (var entry : importFiles.entrySet()) {
      if (!entry.getKey().equals(importRootIri)) {
        closureManager.getIRIMappers().add(
            new SimpleIRIMapper(IRI.create(entry.getKey()), IRI.create(entry.getValue().toURI())));
      }
    }
    OWLOntology loadedClosureRoot = closureManager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(
            importRootText, IRI.create(importRootIri), new FunctionalSyntaxDocumentFormat(), null));

    OWLOntologyManager rdfMetaManager = OWLManager.createOWLOntologyManager();
    OWLOntology rdfMetaOntology = rdfMetaManager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(
            syntaxTexts.get("rdf-metadata"), IRI.create("urn:bench:rdf-metadata"), new TurtleDocumentFormat(), null));

    OWLOntologyManager saveManager = OWLManager.createOWLOntologyManager();
    OWLOntology saveOntology = saveManager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(
            syntaxTexts.get("functional"), IRI.create("urn:bench:save"), new FunctionalSyntaxDocumentFormat(), null));

    OWLOntologyManager utilManager = OWLManager.createOWLOntologyManager();
    OWLDataFactory utilDf = utilManager.getOWLDataFactory();
    OWLOntology utilOntology = utilManager.createOntology(IRI.create("urn:bench:util"));
    List<OWLAxiom> utilAxioms = buildAxiomBatch(utilDf, "urn:bench:util#", 20, false, null);
    utilManager.addAxioms(utilOntology, utilAxioms);
    List<OWLEntity> utilSeedEntities =
        new ArrayList<OWLEntity>(utilOntology.getClassesInSignature()).subList(0, 20);

    Map<String, Object> workloads = orderedMap();

    // 1. Manager & Configuration
    {
      List<Object> managers = new ArrayList<>(100);
      for (int i = 0; i < 100; i++) {
        OWLOntologyManager m = OWLManager.createOWLOntologyManager();
        OWLDataFactory df = m.getOWLDataFactory();
        Map<String, Object> entry = orderedMap();
        entry.put("hasFactory", df != null);
        entry.put("owlThingIRI", df.getOWLClass(IRI.create("http://www.w3.org/2002/07/owl#Thing")).getIRI().toString());
        entry.put("rdfsLabelIRI", df.getRDFSLabel().getIRI().toString());
        managers.add(entry);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("count", managers.size());
      obs.put("entries", managers);
      workloads.put("manager.createOWLOntologyManager", obs);
    }

    {
      OWLOntologyLoaderConfiguration base = new OWLOntologyLoaderConfiguration();
      Map<String, Object> beforeBase = loaderConfigSnapshot(base);
      List<Object> steps = new ArrayList<>(500);
      for (int i = 0; i < 500; i++) {
        OWLOntologyLoaderConfiguration cfg =
            base.setStrict(true)
                .setLoadAnnotationAxioms(false)
                .setConnectionTimeout(15000 + (i % 10))
                .setRetriesToAttempt(3)
                .setFollowRedirects(false)
                .setEntityExpansionLimit("50000")
                .setAuthorizationValue("Bearer token")
                .setAcceptingHTTPCompression(false);
        steps.add(loaderConfigSnapshot(cfg));
      }
      Map<String, Object> obs = orderedMap();
      obs.put("baseUnchanged", canonicalJson(beforeBase).equals(canonicalJson(loaderConfigSnapshot(base))));
      obs.put("steps", steps);
      workloads.put("config.OWLOntologyLoaderConfiguration", obs);
    }

    {
      OWLOntologyWriterConfiguration base = new OWLOntologyWriterConfiguration();
      Map<String, Object> defaults = writerConfigSnapshot(base);
      List<Object> steps = new ArrayList<>(500);
      for (int i = 0; i < 500; i++) {
        OWLOntologyWriterConfiguration cfg =
            base.withIndenting(false)
                .withIndentSize(2 + (i % 4))
                .withBannersEnabled(false)
                .withLabelsAsBanner(true)
                .withSaveIdsForAllAnonymousIndividuals(true);
        steps.add(writerConfigSnapshot(cfg));
      }
      Map<String, Object> obs = orderedMap();
      obs.put("defaults", defaults);
      obs.put("steps", steps);
      workloads.put("config.OWLOntologyWriterConfiguration", obs);
    }

    {
      RDFXMLDocumentFormat src = new RDFXMLDocumentFormat();
      src.setPrefix("src:", "http://example.org/src#");
      List<Object> steps = new ArrayList<>(200);
      for (int i = 0; i < 200; i++) {
        RDFXMLDocumentFormat fmt = new RDFXMLDocumentFormat();
        fmt.setPrefix("ex:", "http://example.org/ex" + i + "#");
        fmt.setDefaultPrefix("http://example.org/def#");
        fmt.copyPrefixesFrom(src);
        Map<String, String> sortedPrefixes = new TreeMap<>(UTF16_COMPARATOR);
        sortedPrefixes.putAll(fmt.getPrefixName2PrefixMap());
        boolean hasEx = fmt.containsPrefixMapping("ex:");
        String srcPrefix = fmt.getPrefix("src:");
        String defaultPrefix = fmt.getDefaultPrefix();
        int prefixNamesSize = fmt.getPrefixNames().size();
        fmt.unregisterNamespace("http://example.org/def#");
        String afterUnregisterDefault = fmt.getDefaultPrefix();
        fmt.clear();
        int afterClearCount = fmt.getPrefixName2PrefixMap().size();
        Map<String, Object> step = orderedMap();
        step.put("prefixMap", sortedPrefixes);
        step.put("prefixNamesSize", prefixNamesSize);
        step.put("hasEx", hasEx);
        step.put("srcPrefix", srcPrefix);
        step.put("defaultPrefix", defaultPrefix);
        step.put("afterUnregisterDefault", afterUnregisterDefault);
        step.put("afterClearCount", afterClearCount);
        steps.add(step);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("steps", steps);
      workloads.put("formats.RDFXMLDocumentFormat.prefixes", obs);
    }

    // 2. DataFactory & Structural Model
    {
      List<String> iris = new ArrayList<>(2000);
      for (int i = 0; i < 2000; i++) {
        iris.add(IRI.create("http://example.org/bench/iri#" + i).toString());
      }
      Map<String, Object> obs = orderedMap();
      obs.put("iris", iris);
      workloads.put("model.IRI.create", obs);
    }

    {
      OWLDataFactory df = OWLManager.createOWLOntologyManager().getOWLDataFactory();
      List<Object> sets = new ArrayList<>(500);
      for (int i = 0; i < 500; i++) {
        IRI iri = IRI.create("http://example.org/factory#E" + i);
        Map<String, Object> row = orderedMap();
        row.put("class", canonicalOwlObject(df.getOWLClass(iri)));
        row.put("objectProperty", canonicalOwlObject(df.getOWLObjectProperty(iri)));
        row.put("dataProperty", canonicalOwlObject(df.getOWLDataProperty(iri)));
        row.put("annotationProperty", canonicalOwlObject(df.getOWLAnnotationProperty(iri)));
        row.put("datatype", canonicalOwlObject(df.getOWLDatatype(iri)));
        row.put("namedIndividual", canonicalOwlObject(df.getOWLNamedIndividual(iri)));
        row.put("anonymousIndividual", canonicalOwlObject(df.getOWLAnonymousIndividual("node_" + i)));
        row.put("rdfsLabel", canonicalOwlObject(df.getRDFSLabel()));
        row.put("ontologyID", canonicalOntologyId(new OWLOntologyID(Optional.of(iri), Optional.empty())));
        row.put("importsDeclaration", canonicalImportsDecl(df.getOWLImportsDeclaration(iri)));
        sets.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("sets", sets);
      workloads.put("factory.entities", obs);
    }

    {
      OWLDataFactory df = OWLManager.createOWLOntologyManager().getOWLDataFactory();
      OWLDatatype xsdInt = df.getOWLDatatype(OWL2Datatype.XSD_INTEGER.getIRI());
      OWLDatatype xsdDec = df.getOWLDatatype(OWL2Datatype.XSD_DECIMAL.getIRI());
      OWLDatatype xsdFloat = df.getOWLDatatype(OWL2Datatype.XSD_FLOAT.getIRI());
      OWLDatatype xsdBool = df.getOWLDatatype(OWL2Datatype.XSD_BOOLEAN.getIRI());
      List<Object> sets = new ArrayList<>(500);
      for (int i = 0; i < 500; i++) {
        Map<String, Object> row = orderedMap();
        row.put("l1", literalSnapshot(df.getOWLLiteral("plain_" + i)));
        row.put("l2", literalSnapshot(df.getOWLLiteral("lang_" + i, " en-GB ")));
        row.put("l3", literalSnapshot(df.getOWLLiteral(String.valueOf(i), xsdInt)));
        row.put("l4", literalSnapshot(df.getOWLLiteral(i + ".50", xsdDec)));
        row.put("l5", literalSnapshot(df.getOWLLiteral(i + ".25", xsdFloat)));
        row.put("l6", literalSnapshot(df.getOWLLiteral((i % 2 == 0) ? "true" : "false", xsdBool)));
        sets.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("sets", sets);
      workloads.put("factory.literals", obs);
    }

    {
      OWLDataFactory df = rich.df;
      OWLDatatype xsdString = df.getOWLDatatype(OWL2Datatype.XSD_STRING.getIRI());
      OWLLiteral lit = df.getOWLLiteral("v");
      List<Object> sets = new ArrayList<>(200);
      for (int i = 0; i < 200; i++) {
        OWLClass c = rich.classes.get(i % RICH_COUNT);
        OWLClass d = rich.superClasses.get(i % RICH_COUNT);
        OWLObjectProperty op = rich.objectProps.get(i % RICH_COUNT);
        OWLDataProperty dp = rich.dataProps.get(i % RICH_COUNT);
        OWLNamedIndividual ind = rich.individuals.get(i % RICH_COUNT);
        OWLObjectInverseOf inv = df.getOWLObjectInverseOf(op);
        Map<String, Object> row = orderedMap();
        row.put("inv", canonicalOwlObject(inv));
        row.put("e1", canonicalOwlObject(df.getOWLObjectIntersectionOf(c, d)));
        row.put("e2", canonicalOwlObject(df.getOWLObjectUnionOf(c, d)));
        row.put("e3", canonicalOwlObject(df.getOWLObjectComplementOf(c)));
        row.put("e4", canonicalOwlObject(df.getOWLObjectOneOf(ind)));
        row.put("e5", canonicalOwlObject(df.getOWLObjectSomeValuesFrom(op, c)));
        row.put("e6", canonicalOwlObject(df.getOWLObjectAllValuesFrom(inv, d)));
        row.put("e7", canonicalOwlObject(df.getOWLObjectHasValue(op, ind)));
        row.put("e8", canonicalOwlObject(df.getOWLObjectHasSelf(op)));
        row.put("e9", canonicalOwlObject(df.getOWLObjectMinCardinality(1, op, c)));
        row.put("e10", canonicalOwlObject(df.getOWLObjectMaxCardinality(2, op, c)));
        row.put("e11", canonicalOwlObject(df.getOWLObjectExactCardinality(1, op, c)));
        row.put("e12", canonicalOwlObject(df.getOWLDataSomeValuesFrom(dp, xsdString)));
        row.put("e13", canonicalOwlObject(df.getOWLDataAllValuesFrom(dp, xsdString)));
        row.put("e14", canonicalOwlObject(df.getOWLDataHasValue(dp, lit)));
        row.put("e15", canonicalOwlObject(df.getOWLDataMinCardinality(1, dp, xsdString)));
        row.put("e16", canonicalOwlObject(df.getOWLDataMaxCardinality(2, dp, xsdString)));
        row.put("e17", canonicalOwlObject(df.getOWLDataExactCardinality(1, dp, xsdString)));
        sets.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("sets", sets);
      workloads.put("factory.classExpressions", obs);
    }

    {
      OWLDataFactory df = rich.df;
      OWLDatatype xsdInt = df.getOWLDatatype(OWL2Datatype.XSD_INTEGER.getIRI());
      OWLDatatype xsdDec = df.getOWLDatatype(OWL2Datatype.XSD_DECIMAL.getIRI());
      List<Object> sets = new ArrayList<>(200);
      for (int i = 0; i < 200; i++) {
        OWLLiteral lit = df.getOWLLiteral(String.valueOf(i), xsdInt);
        OWLFacetRestriction facet = df.getOWLFacetRestriction(OWLFacet.MIN_INCLUSIVE, lit);
        Map<String, Object> row = orderedMap();
        row.put("facet", canonicalOwlObject(facet));
        row.put("dr1", canonicalOwlObject(df.getOWLDatatypeRestriction(xsdInt, facet)));
        row.put("dr2", canonicalOwlObject(df.getOWLDataIntersectionOf(xsdInt, xsdDec)));
        row.put("dr3", canonicalOwlObject(df.getOWLDataUnionOf(xsdInt, xsdDec)));
        row.put("dr4", canonicalOwlObject(df.getOWLDataComplementOf(xsdInt)));
        row.put("dr5", canonicalOwlObject(df.getOWLDataOneOf(lit)));
        sets.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("sets", sets);
      workloads.put("factory.dataRanges", obs);
    }

    {
      OWLDataFactory df = OWLManager.createOWLOntologyManager().getOWLDataFactory();
      List<OWLAxiom> built = buildAxiomBatch(df, "urn:bench:factory#", 35, false, null);
      Map<String, Object> obs = orderedMap();
      obs.put("ordered", built.stream().map(VerifyBenchmarkApiSemantics::canonicalOwlObject).toList());
      obs.put("uniqueSorted", sortOwlObjects(new HashSet<>(built).stream()));
      workloads.put("factory.axioms", obs);
    }

    {
      Set<OWLAxiom> set = new HashSet<>();
      List<Object> perIndexChecks = new ArrayList<>();
      int n = Math.min(1000, rich.allMainAxioms.size());
      for (int i = 0; i < n; i++) {
        OWLAxiom ax = rich.allMainAxioms.get(i);
        OWLAxiom next = rich.allMainAxioms.get((i + 1) % n);
        set.add(ax);
        Map<String, Object> check = orderedMap();
        check.put("hasAx", set.contains(ax));
        check.put("eqSelf", ax.equals(ax));
        check.put("neqNext", !ax.equals(next));
        check.put("eqIgnoreAnnSelf", ax.equalsIgnoreAnnotations(ax));
        perIndexChecks.add(check);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("setSize", set.size());
      obs.put("sortedMembers", sortOwlObjects(set.stream()));
      obs.put("perIndexChecks", perIndexChecks);
      workloads.put("model.structuralEqualityAndSet", obs);
    }

    {
      OWLAnnotation extra =
          rich.df.getOWLAnnotation(rich.df.getRDFSLabel(), rich.df.getOWLLiteral("extra"));
      Set<OWLAnnotation> anns = Collections.singleton(extra);
      List<Object> transforms = new ArrayList<>();
      int n = Math.min(500, rich.allMainAxioms.size());
      for (int i = 0; i < n; i++) {
        OWLAxiom ax = rich.allMainAxioms.get(i);
        OWLAxiom annotated = ax.getAnnotatedAxiom(anns);
        OWLAxiom stripped = annotated.getAxiomWithoutAnnotations();
        Map<String, Object> item = orderedMap();
        item.put("annotated", canonicalOwlObject(annotated));
        item.put("stripped", canonicalOwlObject(stripped));
        item.put("equalsIgnoreAnnotations", stripped.equalsIgnoreAnnotations(ax));
        transforms.add(item);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("transforms", transforms);
      workloads.put("model.axiomAnnotationsTransform", obs);
    }

    {
      List<String> objKinds = new ArrayList<>();
      List<String> axKinds = new ArrayList<>();
      List<String> ceKinds = new ArrayList<>();
      int n = Math.min(500, rich.allMainAxioms.size());
      for (int i = 0; i < n; i++) {
        OWLAxiom ax = rich.allMainAxioms.get(i);
        objKinds.add(ax.accept((OWLObjectVisitorEx<String>) KIND_VISITOR));
        axKinds.add(ax.accept((OWLAxiomVisitorEx<String>) KIND_VISITOR));
      }
      for (OWLClassExpression ce : rich.complexExpressions) {
        ceKinds.add(ce.accept((OWLClassExpressionVisitorEx<String>) KIND_VISITOR));
      }
      Map<String, Object> obs = orderedMap();
      obs.put("objectVisitorKinds", objKinds);
      obs.put("axiomVisitorKinds", axKinds);
      obs.put("classExpressionVisitorKinds", ceKinds);
      workloads.put("model.dispatch", obs);
    }

    // 3. Parsing & Loading
    for (String name : List.of(
        "functional", "manchester", "owlxml", "rdfxml", "turtle",
        "ntriples", "nquads", "trig", "jsonld", "dl", "krss2", "krss1")) {
      OWLDocumentFormat fmt = formatForName(name);
      String text = syntaxTexts.get(name);
      OWLOntologyManager m = OWLManager.createOWLOntologyManager();
      if ("krss1".equals(name)) {
        m.getOntologyParsers().add(new KRSSOWLParserFactory());
      }
      OWLOntology o = m.loadOntologyFromOntologyDocument(
          new StringDocumentSource(text, IRI.create("urn:bench:load:" + name), fmt, null));
      workloads.put("load." + name, canonicalOntology(o));
    }

    {
      OWLOntologyManager m = OWLManager.createOWLOntologyManager();
      for (var entry : importFiles.entrySet()) {
        if (!entry.getKey().equals(importRootIri)) {
          m.getIRIMappers().add(
              new SimpleIRIMapper(IRI.create(entry.getKey()), IRI.create(entry.getValue().toURI())));
        }
      }
      OWLOntology root = m.loadOntologyFromOntologyDocument(
          new StringDocumentSource(
              importRootText, IRI.create(importRootIri), new FunctionalSyntaxDocumentFormat(), null));
      Map<String, Object> membersByIri = orderedMap();
      for (OWLOntology ont : m.getImportsClosure(root)) {
        String key = ont.getOntologyID().getOntologyIRI().map(IRI::toString).orElse("anonymous");
        membersByIri.put(key, canonicalOntology(ont));
      }
      Map<String, Object> obs = orderedMap();
      obs.put("closureSize", membersByIri.size());
      obs.put("membersByIRI", membersByIri);
      workloads.put("load.importsClosure", obs);
    }

    {
      RDFParserMetaData meta = (RDFParserMetaData) rdfMetaManager
          .getOntologyFormat(rdfMetaOntology)
          .getOntologyLoaderMetaData()
          .orElseThrow();
      List<Object> guessed = new ArrayList<>();
      for (var entry : meta.getGuessedDeclarations().entries()) {
        guessed.add(List.of(entry.getKey().toString(), entry.getValue().getSimpleName()));
      }
      guessed = sortCanonicalObjects(guessed.stream(), item -> item);
      Map<String, Object> obs = orderedMap();
      obs.put("tripleCount", meta.getTripleCount());
      obs.put("headerState", meta.getHeaderState().name());
      obs.put("unparsedTriples", sortCanonicalObjects(meta.getUnparsedTriples(), item -> rdfTripleSnapshot((RDFTriple) item)));
      obs.put("guessedDeclarations", guessed);
      workloads.put("load.rdfParserMetaData", obs);
    }

    // 4. Ontology Lifecycle & Mutations
    {
      OWLOntologyManager m = OWLManager.createOWLOntologyManager();
      List<String> createdIRIs = new ArrayList<>();
      boolean allLookupsIdentical = true;
      for (int i = 0; i < 100; i++) {
        IRI iri = IRI.create("urn:bench:lifecycle#" + i);
        OWLOntology o = m.createOntology(iri);
        if (m.getOntology(iri) != o) {
          allLookupsIdentical = false;
        }
        createdIRIs.add(iri.toString());
      }
      Collections.sort(createdIRIs, UTF16_COMPARATOR);
      Map<String, Object> obs = orderedMap();
      obs.put("createdCount", createdIRIs.size());
      obs.put("allLookupsIdentical", allLookupsIdentical);
      obs.put("ontologyIRIs", createdIRIs);
      workloads.put("manager.createAndGetOntology", obs);
    }

    List<OWLAxiom> bulk500 = rich.allMainAxioms.subList(0, Math.min(500, rich.allMainAxioms.size()));
    List<OWLAxiom> single200 = rich.allMainAxioms.subList(0, Math.min(200, rich.allMainAxioms.size()));

    {
      OWLOntologyManager m = OWLManager.createOWLOntologyManager();
      OWLOntology o = m.createOntology(IRI.create("urn:bench:addbulk"));
      m.addAxioms(o, bulk500);
      workloads.put("manager.addAxioms.bulk", canonicalOntology(o));
    }

    {
      OWLOntologyManager m = OWLManager.createOWLOntologyManager();
      OWLOntology o = m.createOntology(IRI.create("urn:bench:addsingle"));
      for (OWLAxiom ax : single200) {
        m.addAxiom(o, ax);
      }
      workloads.put("manager.addAxiom.singleLoop", canonicalOntology(o));
    }

    {
      OWLOntologyManager m = OWLManager.createOWLOntologyManager();
      OWLOntology o = m.createOntology(IRI.create("urn:bench:rembulk"));
      m.addAxioms(o, bulk500);
      Map<String, Object> afterAdd = canonicalOntology(o);
      m.removeAxioms(o, bulk500);
      Map<String, Object> afterRemove = canonicalOntology(o);
      Map<String, Object> obs = orderedMap();
      obs.put("afterAdd", afterAdd);
      obs.put("afterRemove", afterRemove);
      workloads.put("manager.removeAxioms.bulk", obs);
    }

    {
      OWLOntologyManager m = OWLManager.createOWLOntologyManager();
      OWLOntology o = m.createOntology(IRI.create("urn:bench:remsingle"));
      m.addAxioms(o, single200);
      Map<String, Object> afterAdd = canonicalOntology(o);
      for (OWLAxiom ax : single200) {
        m.removeAxiom(o, ax);
      }
      Map<String, Object> afterRemove = canonicalOntology(o);
      Map<String, Object> obs = orderedMap();
      obs.put("afterAdd", afterAdd);
      obs.put("afterRemove", afterRemove);
      workloads.put("manager.removeAxiom.singleLoop", obs);
    }

    {
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
      OWLImportsDeclaration imp = df.getOWLImportsDeclaration(IRI.create("urn:bench:imp"));
      changes.add(new AddImport(o, imp));
      changes.add(new RemoveImport(o, imp));
      changes.add(
          new SetOntologyID(
              o, new OWLOntologyID(Optional.of(IRI.create("urn:bench:mixed2")), Optional.empty())));
      m.applyChanges(changes);
      workloads.put("manager.applyChanges.mixed", canonicalOntology(o));
    }

    {
      List<Object> closureIds = sortCanonicalObjects(
          closureManager.getImportsClosure(loadedClosureRoot).stream(),
          ont -> canonicalOntologyId(((OWLOntology) ont).getOntologyID()));
      Map<String, Object> obs = orderedMap();
      obs.put("closureIDs", closureIds);
      workloads.put("manager.getImportsClosure", obs);
    }

    // 5. Ontology Queries - General & Signature
    {
      Map<String, Object> obs = orderedMap();
      obs.put("axioms", sortOwlObjects(rich.mainOntology.axioms(Imports.EXCLUDED)));
      obs.put("axiomCount", rich.mainOntology.getAxiomCount(Imports.EXCLUDED));
      obs.put("annotations", sortOwlObjects(rich.mainOntology.annotations()));
      obs.put("imports", sortCanonicalObjects(rich.mainOntology.importsDeclarations(), item -> canonicalImportsDecl((OWLImportsDeclaration) item)));
      obs.put("ontologyID", canonicalOntologyId(rich.mainOntology.getOntologyID()));
      workloads.put("ontology.getAxioms.excluded", obs);
    }

    {
      Map<String, Object> obs = orderedMap();
      obs.put("axioms", sortOwlObjects(rich.mainOntology.axioms(Imports.INCLUDED)));
      obs.put("axiomCount", rich.mainOntology.getAxiomCount(Imports.INCLUDED));
      workloads.put("ontology.getAxioms.included", obs);
    }

    {
      Map<String, Object> obs = orderedMap();
      obs.put("excluded", sortOwlObjects(rich.mainOntology.logicalAxioms(Imports.EXCLUDED)));
      obs.put("included", sortOwlObjects(rich.mainOntology.logicalAxioms(Imports.INCLUDED)));
      obs.put("excludedCount", rich.mainOntology.getLogicalAxiomCount(Imports.EXCLUDED));
      obs.put("includedCount", rich.mainOntology.getLogicalAxiomCount(Imports.INCLUDED));
      workloads.put("ontology.getLogicalAxioms", obs);
    }

    {
      Map<String, Object> byType = orderedMap();
      for (AxiomType<?> type : AxiomType.AXIOM_TYPES) {
        if (AxiomType.SWRL_RULE.equals(type)) {
          if (rich.mainOntology.getAxiomCount(type, Imports.INCLUDED) != 0) {
            throw new IllegalStateException("Unexpected SWRL rule in rich fixture");
          }
          continue;
        }
        String key = type.getActualClass().getSimpleName();
        Map<String, Object> entry = orderedMap();
        entry.put("excluded", sortOwlObjects(rich.mainOntology.axioms(type, Imports.EXCLUDED)));
        entry.put("included", sortOwlObjects(rich.mainOntology.axioms(type, Imports.INCLUDED)));
        entry.put("excludedCount", rich.mainOntology.getAxiomCount(type, Imports.EXCLUDED));
        entry.put("includedCount", rich.mainOntology.getAxiomCount(type, Imports.INCLUDED));
        byType.put(key, entry);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("byType", byType);
      workloads.put("ontology.getAxiomsByType", obs);
    }

    {
      List<Object> perAxiom = new ArrayList<>(200);
      for (int i = 0; i < Math.min(200, rich.allMainAxioms.size()); i++) {
        OWLAxiom ax = rich.allMainAxioms.get(i);
        Map<String, Object> row = orderedMap();
        row.put("exactExcl", rich.mainOntology.containsAxiom(ax, Imports.EXCLUDED, AxiomAnnotations.CONSIDER_AXIOM_ANNOTATIONS));
        row.put("exactIncl", rich.mainOntology.containsAxiom(ax, Imports.INCLUDED, AxiomAnnotations.CONSIDER_AXIOM_ANNOTATIONS));
        row.put("ignoreExcl", rich.mainOntology.containsAxiom(ax, Imports.EXCLUDED, AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS));
        row.put("ignoreIncl", rich.mainOntology.containsAxiom(ax, Imports.INCLUDED, AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS));
        row.put("matchingExcl", sortOwlObjects(rich.mainOntology.axiomsIgnoreAnnotations(ax, Imports.EXCLUDED)));
        row.put("matchingIncl", sortOwlObjects(rich.mainOntology.axiomsIgnoreAnnotations(ax, Imports.INCLUDED)));
        perAxiom.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perAxiom", perAxiom);
      workloads.put("ontology.containsAxiom", obs);
    }

    {
      Map<String, Object> obs = orderedMap();
      for (Imports imp : List.of(Imports.EXCLUDED, Imports.INCLUDED)) {
        Map<String, Object> scopeMap = orderedMap();
        scopeMap.put("all", sortOwlObjects(rich.mainOntology.getSignature(imp).stream()));
        scopeMap.put("classes", sortOwlObjects(rich.mainOntology.getClassesInSignature(imp).stream()));
        scopeMap.put("objectProperties", sortOwlObjects(rich.mainOntology.getObjectPropertiesInSignature(imp).stream()));
        scopeMap.put("dataProperties", sortOwlObjects(rich.mainOntology.getDataPropertiesInSignature(imp).stream()));
        scopeMap.put("annotationProperties", sortOwlObjects(rich.mainOntology.getAnnotationPropertiesInSignature(imp).stream()));
        scopeMap.put("individuals", sortOwlObjects(rich.mainOntology.getIndividualsInSignature(imp).stream()));
        scopeMap.put("datatypes", sortOwlObjects(rich.mainOntology.getDatatypesInSignature(imp).stream()));
        obs.put(imp.name(), scopeMap);
      }
      workloads.put("ontology.getSignature", obs);
    }

    {
      List<Object> perClass = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        OWLClass c = rich.classes.get(i);
        IRI iri = c.getIRI();
        Map<String, Object> row = orderedMap();
        row.put("entitiesExcl", sortOwlObjects(rich.mainOntology.entitiesInSignature(iri, Imports.EXCLUDED)));
        row.put("entitiesIncl", sortOwlObjects(rich.mainOntology.entitiesInSignature(iri, Imports.INCLUDED)));
        row.put("containsClassExcl", rich.mainOntology.containsEntityInSignature(c, Imports.EXCLUDED));
        row.put("containsIriIncl", rich.mainOntology.containsEntityInSignature(iri, Imports.INCLUDED));
        perClass.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perClass", perClass);
      obs.put("punnedExcl", sortOwlObjects(rich.mainOntology.getPunnedIRIs(Imports.EXCLUDED).stream()));
      obs.put("punnedIncl", sortOwlObjects(rich.mainOntology.getPunnedIRIs(Imports.INCLUDED).stream()));
      obs.put("anonExcl", sortOwlObjects(rich.mainOntology.referencedAnonymousIndividuals(Imports.EXCLUDED)));
      obs.put("anonIncl", sortOwlObjects(rich.mainOntology.referencedAnonymousIndividuals(Imports.INCLUDED)));
      workloads.put("ontology.entitySignatureLookups", obs);
    }

    {
      List<Object> perClass = new ArrayList<>(50);
      for (int i = 0; i < 50; i++) {
        OWLClass c = rich.classes.get(i);
        Map<String, Object> row = orderedMap();
        row.put("excluded", sortOwlObjects(rich.mainOntology.referencingAxioms(c, Imports.EXCLUDED)));
        row.put("included", sortOwlObjects(rich.mainOntology.referencingAxioms(c, Imports.INCLUDED)));
        perClass.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perClass", perClass);
      workloads.put("ontology.getReferencingAxioms", obs);
    }

    // 6. Ontology Queries - Specific Axiom Indexes
    {
      List<Object> perIndex = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        OWLClass c = rich.classes.get(i);
        OWLClass d = rich.superClasses.get(i);
        Map<String, Object> row = orderedMap();
        row.put("subForSub", sortOwlObjects(rich.mainOntology.subClassAxiomsForSubClass(c)));
        row.put("subForSuper", sortOwlObjects(rich.mainOntology.subClassAxiomsForSuperClass(d)));
        row.put("equivalent", sortOwlObjects(rich.mainOntology.equivalentClassesAxioms(c)));
        row.put("disjoint", sortOwlObjects(rich.mainOntology.disjointClassesAxioms(c)));
        perIndex.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perIndex", perIndex);
      workloads.put("ontology.classAxiomIndexes", obs);
    }

    {
      List<Object> perIndex = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        OWLObjectProperty op = rich.objectProps.get(i);
        OWLObjectProperty q = rich.superObjectProps.get(i);
        Map<String, Object> row = orderedMap();
        row.put("subForSub", sortOwlObjects(rich.mainOntology.objectSubPropertyAxiomsForSubProperty(op)));
        row.put("subForSuper", sortOwlObjects(rich.mainOntology.objectSubPropertyAxiomsForSuperProperty(q)));
        row.put("domain", sortOwlObjects(rich.mainOntology.objectPropertyDomainAxioms(op)));
        row.put("range", sortOwlObjects(rich.mainOntology.objectPropertyRangeAxioms(op)));
        row.put("inverse", sortOwlObjects(rich.mainOntology.inverseObjectPropertyAxioms(op)));
        row.put("functional", sortOwlObjects(rich.mainOntology.functionalObjectPropertyAxioms(op)));
        row.put("inverseFunctional", sortOwlObjects(rich.mainOntology.inverseFunctionalObjectPropertyAxioms(op)));
        row.put("symmetric", sortOwlObjects(rich.mainOntology.symmetricObjectPropertyAxioms(op)));
        row.put("asymmetric", sortOwlObjects(rich.mainOntology.asymmetricObjectPropertyAxioms(q)));
        row.put("reflexive", sortOwlObjects(rich.mainOntology.reflexiveObjectPropertyAxioms(op)));
        row.put("irreflexive", sortOwlObjects(rich.mainOntology.irreflexiveObjectPropertyAxioms(q)));
        row.put("transitive", sortOwlObjects(rich.mainOntology.transitiveObjectPropertyAxioms(q)));
        perIndex.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perIndex", perIndex);
      workloads.put("ontology.objectPropertyAxiomIndexes", obs);
    }

    {
      List<Object> perIndex = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        OWLDataProperty dp = rich.dataProps.get(i);
        OWLDataProperty dp2 = rich.superDataProps.get(i);
        Map<String, Object> row = orderedMap();
        row.put("subForSub", sortOwlObjects(rich.mainOntology.dataSubPropertyAxiomsForSubProperty(dp)));
        row.put("subForSuper", sortOwlObjects(rich.mainOntology.dataSubPropertyAxiomsForSuperProperty(dp2)));
        row.put("domain", sortOwlObjects(rich.mainOntology.dataPropertyDomainAxioms(dp)));
        row.put("range", sortOwlObjects(rich.mainOntology.dataPropertyRangeAxioms(dp)));
        row.put("functional", sortOwlObjects(rich.mainOntology.functionalDataPropertyAxioms(dp)));
        perIndex.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perIndex", perIndex);
      workloads.put("ontology.dataPropertyAxiomIndexes", obs);
    }

    {
      List<Object> perIndex = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        OWLClass c = rich.classes.get(i);
        OWLAnnotationProperty ap = rich.annProps.get(i);
        Map<String, Object> row = orderedMap();
        row.put("declaration", sortOwlObjects(rich.mainOntology.declarationAxioms(c)));
        row.put("annAssertionExcl", sortOwlObjects(rich.mainOntology.annotationAssertionAxioms(c.getIRI(), Imports.EXCLUDED)));
        row.put("annAssertionIncl", sortOwlObjects(rich.mainOntology.annotationAssertionAxioms(c.getIRI(), Imports.INCLUDED)));
        row.put("subAnn", sortOwlObjects(rich.mainOntology.subAnnotationPropertyOfAxioms(ap)));
        row.put("annDomain", sortOwlObjects(rich.mainOntology.annotationPropertyDomainAxioms(ap)));
        row.put("annRange", sortOwlObjects(rich.mainOntology.annotationPropertyRangeAxioms(ap)));
        perIndex.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perIndex", perIndex);
      workloads.put("ontology.annotationAndDeclarationIndexes", obs);
    }

    {
      List<Object> perIndex = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        OWLClass c = rich.classes.get(i);
        OWLNamedIndividual ind = rich.individuals.get(i);
        Map<String, Object> row = orderedMap();
        row.put("classByInd", sortOwlObjects(rich.mainOntology.classAssertionAxioms(ind)));
        row.put("classByClass", sortOwlObjects(rich.mainOntology.classAssertionAxioms(c)));
        row.put("objProp", sortOwlObjects(rich.mainOntology.objectPropertyAssertionAxioms(ind)));
        row.put("dataProp", sortOwlObjects(rich.mainOntology.dataPropertyAssertionAxioms(ind)));
        row.put("negObjProp", sortOwlObjects(rich.mainOntology.negativeObjectPropertyAssertionAxioms(ind)));
        row.put("negDataProp", sortOwlObjects(rich.mainOntology.negativeDataPropertyAssertionAxioms(ind)));
        row.put("sameInd", sortOwlObjects(rich.mainOntology.sameIndividualAxioms(ind)));
        row.put("diffInd", sortOwlObjects(rich.mainOntology.differentIndividualAxioms(ind)));
        perIndex.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perIndex", perIndex);
      workloads.put("ontology.individualAssertionIndexes", obs);
    }

    // 7. Storage / Serialization
    for (String name : List.of("functional", "owlxml", "rdfxml", "turtle")) {
      OWLDocumentFormat fmt = formatForName(name);
      Map<String, Object> before = canonicalOntology(saveOntology);
      StringDocumentTarget target = new StringDocumentTarget();
      saveManager.saveOntology(saveOntology, fmt, target);
      String text = target.toString();
      Files.writeString(saveDir.resolve("java-" + name + ".txt"), text, StandardCharsets.UTF_8);
      OWLOntologyManager reloadMgr = OWLManager.createOWLOntologyManager();
      OWLOntology reloaded = reloadMgr.loadOntologyFromOntologyDocument(
          new StringDocumentSource(text, IRI.create("urn:bench:save:reload:" + name), formatForName(name), null));
      Map<String, Object> obs = orderedMap();
      obs.put("sourceBefore", before);
      obs.put("sourceAfter", canonicalOntology(saveOntology));
      obs.put("ownReload", canonicalOntology(reloaded));
      workloads.put("save." + name, obs);
    }

    // 8. EntitySearcher
    List<OWLOntology> searchOntologies = List.of(rich.mainOntology, rich.importedOntology);
    {
      List<Object> perIndex = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        OWLClass c = rich.classes.get(i);
        OWLClass d = rich.superClasses.get(i);
        Map<String, Object> row = orderedMap();
        row.put("superClasses", sortOwlObjects(EntitySearcher.getSuperClasses(c, searchOntologies.stream())));
        row.put("subClasses", sortOwlObjects(EntitySearcher.getSubClasses(d, searchOntologies.stream())));
        row.put("equivalentClasses", sortOwlObjects(EntitySearcher.getEquivalentClasses(c, searchOntologies.stream())));
        row.put("disjointClasses", sortOwlObjects(EntitySearcher.getDisjointClasses(c, searchOntologies.stream())));
        perIndex.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perIndex", perIndex);
      workloads.put("search.classHierarchyAndRelations", obs);
    }

    {
      List<Object> perIndex = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        OWLObjectProperty op = rich.objectProps.get(i);
        OWLObjectProperty q = rich.superObjectProps.get(i);
        OWLDataProperty dp = rich.dataProps.get(i);
        Map<String, Object> row = orderedMap();
        row.put("superObjProps", sortOwlObjects(EntitySearcher.getSuperProperties(op, searchOntologies.stream())));
        row.put("subObjProps", sortOwlObjects(EntitySearcher.getSubProperties(q, searchOntologies.stream())));
        row.put("objDomains", sortOwlObjects(EntitySearcher.getDomains(op, searchOntologies.stream())));
        row.put("objRanges", sortOwlObjects(EntitySearcher.getRanges(op, searchOntologies.stream())));
        row.put("inverses", sortOwlObjects(EntitySearcher.getInverses(op, searchOntologies.stream())));
        row.put("dataDomains", sortOwlObjects(EntitySearcher.getDomains(dp, searchOntologies.stream())));
        row.put("dataRanges", sortOwlObjects(EntitySearcher.getRanges(dp, searchOntologies.stream())));
        perIndex.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perIndex", perIndex);
      workloads.put("search.propertyHierarchyAndDomainsRanges", obs);
    }

    {
      OWLAnnotationProperty rdfsLabel = rich.df.getRDFSLabel();
      List<Object> perIndex = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        OWLClass c = rich.classes.get(i);
        Map<String, Object> row = orderedMap();
        row.put("annotationAssertionAxioms", sortOwlObjects(EntitySearcher.getAnnotationAssertionAxioms(c, rich.mainOntology)));
        row.put("annotationsMain", sortOwlObjects(EntitySearcher.getAnnotations(c, rich.mainOntology)));
        row.put("annotationsLabelStream", sortOwlObjects(EntitySearcher.getAnnotations(c, searchOntologies.stream(), rdfsLabel)));
        row.put("annotationObjectsMain", sortOwlObjects(EntitySearcher.getAnnotationObjects(c, rich.mainOntology)));
        row.put("annotationObjectsLabelStream", sortOwlObjects(EntitySearcher.getAnnotationObjects(c, searchOntologies.stream(), rdfsLabel)));
        perIndex.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perIndex", perIndex);
      workloads.put("search.annotations", obs);
    }

    {
      List<Object> perIndex = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        OWLObjectProperty op = rich.objectProps.get(i);
        OWLObjectProperty q = rich.superObjectProps.get(i);
        OWLDataProperty dp = rich.dataProps.get(i);
        Map<String, Object> row = orderedMap();
        row.put("isFunctionalObject", EntitySearcher.isFunctional(op, searchOntologies.stream()));
        row.put("isFunctionalData", EntitySearcher.isFunctional(dp, searchOntologies.stream()));
        row.put("isInverseFunctional", EntitySearcher.isInverseFunctional(op, searchOntologies.stream()));
        row.put("isTransitive", EntitySearcher.isTransitive(q, searchOntologies.stream()));
        row.put("isSymmetric", EntitySearcher.isSymmetric(op, searchOntologies.stream()));
        row.put("isAsymmetric", EntitySearcher.isAsymmetric(q, searchOntologies.stream()));
        row.put("isReflexive", EntitySearcher.isReflexive(op, searchOntologies.stream()));
        row.put("isIrreflexive", EntitySearcher.isIrreflexive(q, searchOntologies.stream()));
        perIndex.add(row);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perIndex", perIndex);
      workloads.put("search.propertyCharacteristics", obs);
    }

    // 9. Utilities
    {
      SimpleShortFormProvider sfp = new SimpleShortFormProvider();
      List<Object> perIndex = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        perIndex.add(List.of(
            sfp.getShortForm(rich.classes.get(i)),
            sfp.getShortForm(rich.objectProps.get(i)),
            sfp.getShortForm(rich.individuals.get(i))));
      }
      sfp.dispose();
      Map<String, Object> obs = orderedMap();
      obs.put("perIndex", perIndex);
      workloads.put("util.SimpleShortFormProvider", obs);
    }

    {
      OWLAnnotationProperty rdfsLabel = rich.df.getRDFSLabel();
      Map<OWLAnnotationProperty, List<String>> langMap = new LinkedHashMap<>();
      langMap.put(rdfsLabel, List.of("en", "fr"));
      OWLOntologySetProvider setProvider =
          new OWLOntologyImportsClosureSetProvider(rich.manager, rich.mainOntology);
      AnnotationValueShortFormProvider avsfp =
          new AnnotationValueShortFormProvider(
              List.of(rdfsLabel), langMap, setProvider, new SimpleShortFormProvider());
      List<String> perIndex = new ArrayList<>(RICH_COUNT);
      for (int i = 0; i < RICH_COUNT; i++) {
        perIndex.add(avsfp.getShortForm(rich.classes.get(i)));
      }
      avsfp.dispose();
      Map<String, Object> obs = orderedMap();
      obs.put("perIndex", perIndex);
      workloads.put("util.AnnotationValueShortFormProvider", obs);
    }

    {
      OWLOntologyImportsClosureSetProvider provider =
          new OWLOntologyImportsClosureSetProvider(closureManager, loadedClosureRoot);
      List<Object> closureIds = sortCanonicalObjects(
          provider.ontologies(),
          ont -> canonicalOntologyId(((OWLOntology) ont).getOntologyID()));
      Map<String, Object> obs = orderedMap();
      obs.put("closureIDs", closureIds);
      workloads.put("util.OWLOntologyImportsClosureSetProvider", obs);
    }

    {
      OWLOntologyImportsClosureSetProvider provider =
          new OWLOntologyImportsClosureSetProvider(closureManager, loadedClosureRoot);
      OWLOntologyManager dest = OWLManager.createOWLOntologyManager();
      OWLOntologyMerger mergerAll = new OWLOntologyMerger(provider, false);
      OWLOntology merged1 = mergerAll.createMergedOntology(dest, IRI.create("urn:bench:merged:all"));
      OWLOntologyMerger mergerLogical = new OWLOntologyMerger(provider, true);
      OWLOntology merged2 = mergerLogical.createMergedOntology(dest, IRI.create("urn:bench:merged:logical"));
      Map<String, Object> obs = orderedMap();
      obs.put("mergedAll", canonicalOntology(merged1));
      obs.put("mergedLogical", canonicalOntology(merged2));
      workloads.put("util.OWLOntologyMerger", obs);
    }

    {
      Map<OWLEntity, IRI> entityMap = new HashMap<>();
      entityMap.put(rich.classes.get(0), IRI.create("urn:bench:dup#C0"));
      OWLObjectDuplicator dup = new OWLObjectDuplicator(entityMap, rich.manager);
      List<Object> copies = new ArrayList<>();
      int n = Math.min(500, rich.allMainAxioms.size());
      for (int i = 0; i < n; i++) {
        copies.add(canonicalOwlObject(dup.duplicateObject(rich.allMainAxioms.get(i))));
      }
      Map<String, Object> obs = orderedMap();
      obs.put("copies", copies);
      workloads.put("util.OWLObjectDuplicator", obs);
    }

    {
      OWLEntityRenamer renamer = new OWLEntityRenamer(utilManager, Collections.singleton(utilOntology));
      List<Object> perTarget = new ArrayList<>(10);
      for (int i = 0; i < 10; i++) {
        OWLClass target = utilDf.getOWLClass(IRI.create("urn:bench:util#C" + i));
        IRI replacement = IRI.create("urn:bench:util#RenamedC" + i);
        Map<String, Object> entry = orderedMap();
        entry.put("targetIRI", target.getIRI().toString());
        entry.put("byEntity", sortCanonicalObjects(renamer.changeIRI(target, replacement).stream(), c -> canonicalChange((OWLOntologyChange) c)));
        entry.put("byIri", sortCanonicalObjects(renamer.changeIRI(target.getIRI(), replacement).stream(), c -> canonicalChange((OWLOntologyChange) c)));
        perTarget.add(entry);
      }
      Map<String, Object> obs = orderedMap();
      obs.put("perTarget", perTarget);
      workloads.put("util.OWLEntityRenamer", obs);
    }

    {
      OWLEntityRemover remover = new OWLEntityRemover(Collections.singleton(utilOntology));
      for (int i = 0; i < 20; i++) {
        utilDf.getOWLClass(IRI.create("urn:bench:util#C" + i)).accept(remover);
        utilDf.getOWLObjectProperty(IRI.create("urn:bench:util#op" + i)).accept(remover);
      }
      List<Object> changes = sortCanonicalObjects(
          remover.getChanges().stream(), c -> canonicalChange((OWLOntologyChange) c));
      remover.reset();
      Map<String, Object> obs = orderedMap();
      obs.put("changes", changes);
      obs.put("afterResetCount", remover.getChanges().size());
      workloads.put("util.OWLEntityRemover", obs);
    }

    // 10. Manchester Object Renderer
    {
      ManchesterOWLSyntaxOWLObjectRendererImpl renderer = new ManchesterOWLSyntaxOWLObjectRendererImpl();
      renderer.setShortFormProvider(new SimpleShortFormProvider());
      int n = Math.min(300, rich.allMainAxioms.size());
      List<String> axioms = new ArrayList<>(n);
      for (int i = 0; i < n; i++) {
        axioms.add(renderer.render(rich.allMainAxioms.get(i)));
      }
      List<String> complexExpressions = new ArrayList<>(rich.complexExpressions.size());
      for (OWLClassExpression ce : rich.complexExpressions) {
        complexExpressions.add(renderer.render(ce));
      }
      Map<String, Object> obs = orderedMap();
      obs.put("axioms", axioms);
      obs.put("complexExpressions", complexExpressions);
      workloads.put("renderer.ManchesterOWLSyntaxOWLObjectRendererImpl", obs);
    }

    // 11. Modularity / Locality
    for (LocalityClass mode : List.of(LocalityClass.BOTTOM, LocalityClass.TOP, LocalityClass.STAR)) {
      SyntacticLocalityModuleExtractor extractor =
          new SyntacticLocalityModuleExtractor(mode, utilAxioms.stream());
      List<OWLAxiom> extracted = extractor.extract(utilSeedEntities.stream()).toList();
      Map<String, Object> obs = orderedMap();
      obs.put("seedEntities", sortOwlObjects(utilSeedEntities.stream()));
      obs.put("extracted", sortOwlObjects(extracted.stream()));
      obs.put("axiomBase", sortOwlObjects(extractor.axiomBase()));
      obs.put("containsFirst", extractor.containsAxiom(utilAxioms.get(0)));
      workloads.put("locality.extract." + mode.name(), obs);
    }

    // 12. OWL 2 Language Profiles
    Map<String, Object> profileInputOnt = canonicalOntology(profileOntology);
    Object[][] profiles = {
      {"OWL2DLProfile", new OWL2DLProfile()},
      {"OWL2ELProfile", new OWL2ELProfile()},
      {"OWL2QLProfile", new OWL2QLProfile()},
      {"OWL2RLProfile", new OWL2RLProfile()}
    };
    for (Object[] entry : profiles) {
      String name = (String) entry[0];
      OWLProfile profile = (OWLProfile) entry[1];
      OWLProfileReport report = profile.checkOntology(profileOntology);
      Map<String, Object> obs = orderedMap();
      obs.put("inputOntology", profileInputOnt);
      obs.put("report", canonicalProfileReport(report));
      workloads.put("profiles." + name + ".checkOntology", obs);
    }

    Map<String, Object> output = orderedMap();
    output.put("javaVersion", System.getProperty("java.version"));
    output.put("owlapiVersion", VersionInfo.getVersionInfo().getVersion());
    output.put("workloads", workloads);
    Files.writeString(outputPath, canonicalJson(output) + "\n", StandardCharsets.UTF_8);
  }

  private static void runReloadMode(JsonNode specNode) throws Exception {
    Path outputPath = Path.of(specNode.get("outputPath").asText());
    Map<String, Object> reloads = orderedMap();
    for (JsonNode doc : specNode.get("documents")) {
      String id = doc.get("id").asText();
      String formatName = doc.get("format").asText();
      String text = Files.readString(Path.of(doc.get("path").asText()), StandardCharsets.UTF_8);
      OWLOntologyManager m = OWLManager.createOWLOntologyManager();
      try {
        OWLOntology loaded = m.loadOntologyFromOntologyDocument(
            new StringDocumentSource(
                text, IRI.create(doc.get("documentIRI").asText()), formatForName(formatName), null));
        reloads.put(id, canonicalOntology(loaded));
      } catch (Exception error) {
        Map<String, Object> reloadError = orderedMap();
        reloadError.put("name", error.getClass().getSimpleName());
        reloadError.put("message", String.valueOf(error.getMessage()));
        Map<String, Object> wrapped = orderedMap();
        wrapped.put("reloadError", reloadError);
        reloads.put(id, wrapped);
      }
    }
    Map<String, Object> output = orderedMap();
    output.put("reloads", reloads);
    Files.writeString(outputPath, canonicalJson(output) + "\n", StandardCharsets.UTF_8);
  }

  public static void main(String[] args) throws Exception {
    System.setProperty(JSONLDSettings.SECURE_MODE.getKey(), "true");
    System.setProperty(JSONLDSettings.WHITELIST.getKey(), "[]");
    System.setProperty(DocumentLoader.DISALLOW_REMOTE_CONTEXT_LOADING, "true");

    JsonNode specNode = JSON.readTree(Files.readString(Path.of(args[0]), StandardCharsets.UTF_8));
    String mode = specNode.get("mode").asText();
    if ("observe".equals(mode)) {
      runObserveMode(specNode);
    } else if ("reload".equals(mode)) {
      runReloadMode(specNode);
    } else {
      throw new IllegalArgumentException("Unknown mode: " + mode);
    }
  }
}
