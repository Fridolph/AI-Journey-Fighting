import { useState, useEffect, useRef } from 'react';
import './App.css';

type Todo = {
  id: number;
  text: string;
  completed: boolean;
  createdAt: Date;
};

type FilterType = 'all' | 'active' | 'completed';

function App() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    const savedTodos = localStorage.getItem('todos');
    return savedTodos ? JSON.parse(savedTodos) : [];
  });
  const [inputValue, setInputValue] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // 保存到 localStorage
  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos));
  }, [todos]);

  // 编辑时聚焦输入框
  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  const addTodo = () => {
    if (inputValue.trim() === '') return;
    
    const newTodo: Todo = {
      id: Date.now(),
      text: inputValue.trim(),
      completed: false,
      createdAt: new Date()
    };
    
    setTodos([...todos, newTodo]);
    setInputValue('');
  };

  const deleteTodo = (id: number) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const toggleTodo = (id: number) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditingText(todo.text);
  };

  const saveEdit = () => {
    if (editingId !== null && editingText.trim() !== '') {
      setTodos(todos.map(todo =>
        todo.id === editingId ? { ...todo, text: editingText.trim() } : todo
      ));
      setEditingId(null);
      setEditingText('');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const clearCompleted = () => {
    setTodos(todos.filter(todo => !todo.completed));
  };

  const filteredTodos = todos.filter(todo => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  const activeCount = todos.filter(todo => !todo.completed).length;
  const completedCount = todos.filter(todo => todo.completed).length;

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addTodo();
    }
  };

  const handleEditKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>✨ Todo List</h1>
        <p className="subtitle">Stay organized and productive</p>
      </header>

      <main className="app-main">
        <div className="todo-input-container">
          <div className="input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="What needs to be done?"
              className="todo-input"
            />
            <button onClick={addTodo} className="add-button">
              <span className="plus-icon">+</span> Add
            </button>
          </div>
        </div>

        <div className="stats-container">
          <div className="stats-card">
            <div className="stat">
              <span className="stat-label">Total</span>
              <span className="stat-value">{todos.length}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Active</span>
              <span className="stat-value active">{activeCount}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Completed</span>
              <span className="stat-value completed">{completedCount}</span>
            </div>
          </div>
        </div>

        <div className="filter-container">
          <button
            className={`filter-button ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`filter-button ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Active
          </button>
          <button
            className={`filter-button ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            Completed
          </button>
        </div>

        {filteredTodos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <p className="empty-text">
              {filter === 'all' 
                ? 'No todos yet. Add your first task!' 
                : filter === 'active' 
                ? 'No active todos. Great job!' 
                : 'No completed todos yet.'}
            </p>
          </div>
        ) : (
          <div className="todo-list">
            {filteredTodos.map(todo => (
              <div 
                key={todo.id} 
                className={`todo-item ${todo.completed ? 'completed' : ''} ${editingId === todo.id ? 'editing' : ''}`}
              >
                <div className="todo-content">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo.id)}
                    className="todo-checkbox"
                  />
                  
                  {editingId === todo.id ? (
                    <div className="edit-container">
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={handleEditKeyPress}
                        className="edit-input"
                      />
                      <div className="edit-actions">
                        <button onClick={saveEdit} className="save-button">
                          Save
                        </button>
                        <button onClick={cancelEdit} className="cancel-button">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="todo-text-container">
                      <span 
                        className={`todo-text ${todo.completed ? 'completed-text' : ''}`}
                        onClick={() => toggleTodo(todo.id)}
                      >
                        {todo.text}
                      </span>
                      <span className="todo-date">
                        {new Date(todo.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  
                  <div className="todo-actions">
                    {editingId !== todo.id && (
                      <>
                        <button 
                          onClick={() => startEdit(todo)} 
                          className="action-button edit-button"
                        >
                          ✏️
                        </button>
                        <button 
                          onClick={() => deleteTodo(todo.id)} 
                          className="action-button delete-button"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {todos.length > 0 && (
          <div className="actions-container">
            <button 
              onClick={clearCompleted} 
              className="clear-button"
              disabled={completedCount === 0}
            >
              Clear Completed ({completedCount})
            </button>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Made with ❤️ using React + TypeScript</p>
        <p className="footer-hint">
          💡 Tip: Press Enter to add todos, Esc to cancel editing
        </p>
      </footer>
    </div>
  );
}

export default App;