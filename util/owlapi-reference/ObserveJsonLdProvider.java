import java.util.*;
import org.eclipse.rdf4j.rio.*;
import org.eclipse.rdf4j.rio.helpers.JSONLDSettings;

/** The selected provider's native constants, separate from host permissions. */
public final class ObserveJsonLdProvider {
    public static void main(String[] arguments) {
        var configuration = Rio.createParser(RDFFormat.JSONLD).getParserConfig();
        var contexts = new ArrayList<>(configuration.get(JSONLDSettings.WHITELIST));
        Collections.sort(contexts);
        for (var context : contexts) System.out.println("allowed-context\t" + context);
    }
}
