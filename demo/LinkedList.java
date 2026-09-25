/**
 * A minimal singly linked list, the kind written in a data structures course.
 */
public class LinkedList<T> {

    private static class Node<T> {
        T value;
        Node<T> next;

        Node(T value) {
            this.value = value;
        }
    }

    private Node<T> head;
    private int size;

    public void addLast(T value) {
        Node<T> node = new Node<>(value);
        if (head == null) {
            head = node;
        } else {
            Node<T> current = head;
            while (current.next != null) {
                current = current.next;
            }
            current.next = node;
        }
        size++;
    }

    public T removeLast() {
        Node<T> current = head;
        while (current.next.next != null) {
            current = current.next;
        }
        T value = current.next.value;
        current.next = null;
        size--;
        return value;
    }

    public int size() {
        return size;
    }

    public static void main(String[] args) {
        LinkedList<String> tasks = new LinkedList<>();
        tasks.addLast("write tests");
        tasks.addLast("fix bug");
        System.out.println("Removed: " + tasks.removeLast());
        System.out.println("Removed: " + tasks.removeLast()); // crashes here
    }
}
