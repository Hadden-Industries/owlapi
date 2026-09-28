/** Pinned Java acceptance entry point for one parsed ontology in its original import context. */
public final class RunOntologyParsingContract {
    private RunOntologyParsingContract() {}

    public static void main(String[] arguments) throws Exception {
        OntologyReferenceContract.run(arguments,
            OntologyReferenceContract.ComparisonKind.ONTOLOGY_PARSING);
    }
}
