import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { actions, buildArgs } from './policy.mjs'

export class Jobs {
  constructor(directory, execute, changed = () => {}) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    chmodSync(directory, 0o700)
    this.file = join(directory, 'jobs.json')
    this.execute = execute
    this.changed = changed
    this.items = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : []
    for (const job of this.items) {
      if (job.state === 'running') {
        job.state = 'interrupted'
        job.finishedAt = new Date().toISOString()
        job.logs.push('面板后台重启，任务状态未知；请检查服务和日志后再决定是否重试。')
      }
    }
    this.save()
  }
  save() {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.items), { mode: 0o600 })
    renameSync(`${this.file}.tmp`, this.file)
  }
  start(action, params) {
    const args = buildArgs(action, params)
    if (this.items.some(j => j.state === 'running')) throw Object.assign(new Error('已有任务正在执行，请等待完成。'), { status: 409 })
    const job = { id: randomUUID(), action, label: actions[action], state: 'running', startedAt: new Date().toISOString(), logs: [] }
    this.items = [job, ...this.items].slice(0, 30)
    this.save()
    const append = line => {
      // shortcut: retain 500 lines per task; add log rotation if full installer archives are needed.
      job.logs.push(line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').slice(0, 4000))
      job.logs = job.logs.slice(-500)
      this.save()
      this.changed()
    }
    this.changed()
    Promise.resolve().then(() => this.execute(args, append)).then(code => {
      job.exitCode = code
      job.state = code === 0 ? 'succeeded' : 'failed'
      append(code === 0 ? '任务完成。' : `任务失败，退出码 ${code}。请查看上方日志，修正后重试。`)
    }).catch(error => { job.state = 'failed'; append(error.message) }).finally(() => {
      job.finishedAt = new Date().toISOString()
      this.save()
      this.changed()
    })
    return job
  }
}
