const STORAGE_KEY = 'study-tasks';

const form = document.getElementById('new-task');
const titleInput = document.getElementById('task-title');
const list = document.getElementById('task-list');
const remaining = document.getElementById('remaining');
const clearDone = document.getElementById('clear-done');

let tasks = load();

function load() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : [];
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function updateCounter() {
  remaining.textContent = tasks.filter((task) => !task.done).length;
}

function render() {
  list.innerHTML = '';
  tasks.forEach((task, index) => {
    const item = document.createElement('li');
    item.className = task.done ? 'task done' : 'task';

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = task.title;

    const remove = document.createElement('button');
    remove.className = 'delete-button';
    remove.textContent = '×';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteTask(index);
    });

    item.addEventListener('click', () => toggleTask(index));
    item.append(title, remove);
    list.append(item);
  });
}

function addTask(title) {
  tasks.push({ title, done: false });
  save();
  render();
  updateCounter();
}

function toggleTask(index) {
  tasks[index].done = !tasks[index].done;
  save();
  render();
  updateCounter();
}

function deleteTask(index) {
  tasks.splice(index, 1);
  save();
  render();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  addTask(title);
  titleInput.value = '';
});

clearDone.addEventListener('click', () => {
  tasks = tasks.filter((task) => !task.done);
  save();
  render();
  updateCounter();
});

render();
updateCounter();
