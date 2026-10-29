import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Public JDK semantic observations only: no timers or benchmark warmups. */
public final class FloatingPointRenderingProbe {
    public static void main(String[] args) throws Exception {
        var input = new BufferedReader(new InputStreamReader(System.in));
        for (String line; (line = input.readLine()) != null;) {
            var fields = line.split("\\t");
            var bits = Long.parseUnsignedLong(fields[1], 16);
            String lexical;
            String decimal;
            if (fields[0].equals("24")) {
                float value = Float.intBitsToFloat((int) bits);
                lexical = Float.toHexString(value);
                decimal = Float.toString(value);
            } else {
                double value = Double.longBitsToDouble(bits);
                lexical = Double.toHexString(value);
                decimal = Double.toString(value);
            }
            System.out.println(line + "\t" + lexical + "\t" + decimal);
        }
    }
}
