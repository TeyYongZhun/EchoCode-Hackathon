import java.util.NoSuchElementException;

/**
 * A growable stack backed by an array, used to check that brackets are balanced.
 *
 * Demo scene 1: select the class and ask
 * "Walk me through this. Why are we using a generic Stack here?"
 */
public class GenericStack<T> {
    private T[] items;
    private int size;

    @SuppressWarnings("unchecked")
    public GenericStack() {
        // Java can't create a generic array directly, so we create an Object[] and cast it.
        items = (T[]) new Object[4];
    }

    public void push(T item) {
        if (size == items.length) {
            resize(items.length * 2);
        }
        items[size++] = item;
    }

    public T pop() {
        if (isEmpty()) {
            throw new NoSuchElementException("Stack is empty");
        }
        T item = items[--size];
        items[size] = null; // let the garbage collector reclaim it
        return item;
    }

    public T peek() {
        if (isEmpty()) {
            throw new NoSuchElementException("Stack is empty");
        }
        return items[size - 1];
    }

    public boolean isEmpty() {
        return size == 0;
    }

    @SuppressWarnings("unchecked")
    private void resize(int capacity) {
        T[] bigger = (T[]) new Object[capacity];
        System.arraycopy(items, 0, bigger, 0, size);
        items = bigger;
    }

    /** Returns true when every (, [ and { is closed in the right order. */
    public static boolean isBalanced(String code) {
        GenericStack<Character> open = new GenericStack<>();
        for (char c : code.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') {
                open.push(c);
            } else if (c == ')' || c == ']' || c == '}') {
                if (open.isEmpty()) {
                    return false;
                }
                char last = open.pop();
                if ((c == ')' && last != '(') || (c == ']' && last != '[') || (c == '}' && last != '{')) {
                    return false;
                }
            }
        }
        return open.isEmpty();
    }

    public static void main(String[] args) {
        System.out.println(isBalanced("int[] a = { f(x[0]) };")); // true
        System.out.println(isBalanced("if (a[0) { }"));           // false
    }
}
