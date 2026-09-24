import java.util.ArrayList;
import java.util.List;

/**
 * Finds student IDs that were submitted more than once.
 *
 * Demo scene 2: select findDuplicates and ask "Why is this so slow with a big list?"
 * (list.contains is a linear scan inside a loop, so this is O(n^2); a HashSet fixes it.)
 */
public class DuplicateFinder {

    public static List<Integer> findDuplicates(List<Integer> studentIds) {
        List<Integer> seen = new ArrayList<>();
        List<Integer> duplicates = new ArrayList<>();
        for (Integer id : studentIds) {
            if (seen.contains(id)) {
                if (!duplicates.contains(id)) {
                    duplicates.add(id);
                }
            } else {
                seen.add(id);
            }
        }
        return duplicates;
    }

    public static void main(String[] args) {
        List<Integer> ids = new ArrayList<>();
        for (int i = 0; i < 100_000; i++) {
            ids.add(i % 90_000);
        }
        long start = System.currentTimeMillis();
        List<Integer> duplicates = findDuplicates(ids);
        long elapsed = System.currentTimeMillis() - start;
        System.out.println(duplicates.size() + " duplicates found in " + elapsed + " ms");
    }
}
