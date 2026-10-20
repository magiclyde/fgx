// 并行启动 server(:3100) 与 web(:5173)
const procs = [
  Bun.spawn(['bun', 'run', '--cwd', 'server', 'dev'], { stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' }),
  Bun.spawn(['bun', 'run', '--cwd', 'web', 'dev'], { stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' }),
]

const shutdown = () => {
  for (const p of procs) p.kill()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await Promise.race(procs.map((p) => p.exited))
shutdown()
