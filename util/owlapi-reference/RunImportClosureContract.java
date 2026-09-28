/** Pinned Java acceptance entry point for an import-closure output. */
public final class RunImportClosureContract {
    private RunImportClosureContract() {}

    public static void main(String[] arguments) throws Exception {
        OntologyReferenceContract.run(arguments,
            OntologyReferenceContract.ComparisonKind.IMPORT_CLOSURE);
    }
}
