import { useState, useEffect, useRef } from 'react'
import './App.css'

interface Todo {
  id: number
  text: string
  completed: boolean
  createdAt: number
}

type FilterType = 'all' | 'active' | 'completed'

function App() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    const saved = localStorage.getItem('todos')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return []
      }
    }
    return []
  })
  const [inputValue, setInputValue] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // 持久化到 localStorage
  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos))
  }, [todos])

  // 编辑时自动聚焦
  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  // 添加待办事项
  const addTodo = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    setIsAdding(true)
    setTimeout(() => {
      const newTodo: Todo = {
        id: Date.now(),
        text: trimmed,
        completed: false,
        createdAt: Date.now(),
      }
      setTodos(prev => [newTodo, ...prev])
      setInputValue('')
      setIsAdding(false)
    }, 100)
  }

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addTodo()
    }
  }

  // 删除待办事项
  const deleteTodo = (id: number) => {
    setTodos(prev => prev.filter(todo => todo.id !== id))
  }

  // 切换完成状态
  const toggleTodo = (id: number) => {
    setTodos(prev =>
      prev.map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    )
  }

  // 开始编辑
  const startEdit = (todo: Todo) => {
    setEditingId(todo.id)
    setEditText(todo.text)
  }

  // 保存编辑
  const saveEdit = (id: number) => {
    const trimmed = editText.trim()
    if (!trimmed) {
      deleteTodo(id)
      return
    }
    setTodos(prev =>
      prev.map(todo =>
        todo.id === id ? { ...todo, text: trimmed } : todo
      )
    )
    setEditingId(null)
    setEditText('')
  }

  // 取消编辑
  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
  }

  // 编辑键盘事件
  const handleEditKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter') {
      saveEdit(id)
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  // 筛选
  const filteredTodos = todos.filter(todo => {
    if (filter === 'active') return !todo.completed
    if (filter === 'completed') return todo.completed
    return true
  })

  // 统计信息
  const totalCount = todos.length
  const activeCount = todos.filter(t => !t.completed).length
  const completedCount = todos.filter(t => t.completed).length

  // 清除所有已完成
  const clearCompleted = () => {
    setTodos(prev => prev.filter(todo => !todo.completed))
  }

  return (
    <div className="app-container">
      <div className="todo-app">
        <header className="app-header">
          <h1>
            <span className="header-icon">✓</span>
            Todo List
          </h1>
          <p className="header-subtitle">组织你的每一天</p>
        </header>

        {/* 输入区域 */}
        <div className="input-section">
          <div className="input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="todo-input"
              placeholder="添加一个新的待办事项..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={200}
            />
            <button
              className={`add-btn ${isAdding ? 'adding' : ''}`}
              onClick={addTodo}
              disabled={!inputValue.trim()}
            >
              <span className="btn-icon">+</span>
              添加
            </button>
          </div>
        </div>

        {/* 筛选和统计 */}
        <div className="toolbar">
          <div className="filter-group">
            {(['all', 'active', 'completed'] as FilterType[]).map(f => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? '全部' : f === 'active' ? '进行中' : '已完成'}
              </button>
            ))}
          </div>
          <div className="stats">
            <span className="stat-item">
              <span className="stat-num active-num">{activeCount}</span>
              待完成
            </span>
            <span className="stat-divider">|</span>
            <span className="stat-item">
              <span className="stat-num completed-num">{completedCount}</span>
              已完成
            </span>
          </div>
        </div>

        {/* 待办列表 */}
        <div className="todo-list">
          {filteredTodos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <p className="empty-text">
                {filter === 'all'
                  ? '还没有待办事项，添加一个吧！'
                  : filter === 'active'
                  ? '没有进行中的待办事项'
                  : '没有已完成的待办事项'}
              </p>
            </div>
          ) : (
            filteredTodos.map(todo => (
              <div
                key={todo.id}
                className={`todo-item ${todo.completed ? 'completed' : ''}`}
              >
                <label className="checkbox-wrapper">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo.id)}
                    className="todo-checkbox"
                  />
                  <span className="checkmark"></span>
                </label>

                {editingId === todo.id ? (
                  <div className="edit-wrapper">
                    <input
                      ref={editInputRef}
                      type="text"
                      className="edit-input"
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => handleEditKeyDown(e, todo.id)}
                      onBlur={() => saveEdit(todo.id)}
                      maxLength={200}
                    />
                  </div>
                ) : (
                  <span
                    className="todo-text"
                    onDoubleClick={() => startEdit(todo)}
                  >
                    {todo.text}
                  </span>
                )}

                <div className="todo-actions">
                  {editingId !== todo.id && (
                    <>
                      <button
                        className="action-btn edit-btn"
                        onClick={() => startEdit(todo)}
                        title="编辑"
                      >
                        ✏️
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={() => deleteTodo(todo.id)}
                        title="删除"
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部操作栏 */}
        {todos.length > 0 && (
          <div className="footer-bar">
            <span className="total-info">
              共 {totalCount} 项
              {activeCount > 0 && `，${activeCount} 项待完成`}
            </span>
            {completedCount > 0 && (
              <button className="clear-btn" onClick={clearCompleted}>
                清除已完成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
