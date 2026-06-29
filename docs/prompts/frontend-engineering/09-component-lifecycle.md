# 组件生命周期图

> **类型**: 前端工程 &nbsp;|&nbsp; **标签**: `生命周期` `组件分析` `异步时序` `SVG`

## 提示词

```md
针对项目中的核心组件【组件名】，绘制其从挂载到卸载的完整生命周期及异步执行时序图。

## 关键节点
- 必须包含 Props 更新、useEffect/watch 执行顺序、Suspense 挂起状态、ErrorBoundary 错误捕获以及组件 lazy load 异步加载的时机

## 执行流
- 清晰标出各个阶段的触发条件，以及副作用（Side Effects）的执行先后顺序

## 输出
- 保存为 ./docs/lifecycle-【组件名】.svg
```

## 适用场景

- **异步 Bug 排查**：`useEffect` 执行顺序不对导致的竞态条件——生命周期图能还原执行时间线
- **性能优化**：不必要的重复渲染、副作用链过长，在图里一目了然
- **Suspense 调试**：Suspense 挂起时发生了什么、fallback 何时展示、何时消失
- **ErrorBoundary 设计**：错误会在哪一层被捕获，有没有未被覆盖的错误场景

## 最佳实践

1. **标注执行顺序**：`useEffect` 的依赖数组和执行时机（mount / update / unmount）逐个标清
2. **区分 mount 和 update**：首次挂载执行的副作用和更新时触发的不一样，用不同颜色区分
3. **标注清理函数**：`useEffect` 的 return 清理函数在图上画出来——很多人只写了 mount 忘了 unmount
4. **展开 Suspense 边界**：Suspense 的 fallback 状态和子组件完成渲染的时序关系要清晰
5. **标注异步请求的时机和取消**：请求在哪个生命周期发起、组件卸载时是否取消请求
