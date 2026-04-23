import { spawn } from 'node:child_process';

// echo 在 windows 可能不支持，可以设置 shell: 'powershell.exe'
// const command = 'ls -la';
const command = 'echo -e "n\nn" | pnpm create vite react-todo-app --template react-ts';
const cwd = process.cwd();
// 解析命令和参数
const [cmd, ...args] = command.split(' ');
console.log('🚀 ~ :9 ~ cmd:', cmd)
console.log('🚀 ~ :9 ~ args:', args)

const child = spawn(cmd, args, {
  cwd,
  stdio: 'inherit', // 实时输出到控制台
  shell: true,
});

let errorMsg = '';

child.on('error', (error) => {
  errorMsg = error.message;
});

child.on('close', (code) => {
  if (code === 0) {
    process.exit(0);
  } else {
    if (errorMsg) {
      console.error(`错误: ${errorMsg}`);
    }
    process.exit(code || 1);
  }
});

