/**
 * dsh-session-purger — host side.
 *
 * Adds HTTP routes that physically remove a stored Session:
 *   1. detach a live Session from the Session store (so the sidebar row goes away)
 *   2. delete the Session log directory (<root>/<projectDir>/<sessionId>/)
 *   3. delete the projection cache record (storages/session_projcache/sessions/<id>.json)
 *   4. drop the id from Workspace bookkeeping (sessionIds / archived / pinned)
 */

import { rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-session-purger'

export const inject = ['webServer']

const ROUTE_DELETE = '/dsh-session-purger/delete'
const ROUTE_LIST = '/dsh-session-purger/list'
const ROUTE_STATUS = '/dsh-session-purger/client-status'

function dshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.length > 0) return resolve(configured)
  return join(homedir(), '.dsh')
}

function sendJson(res, status, body) {
  if (res.headersSent) {
    res.end()
    return
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.trim().length === 0) return {}
  return JSON.parse(raw)
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function collectSnapshots(ctx) {
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) return []
  const list = await persistence.list()
  return Array.isArray(list) ? list : []
}

function projectionCachePath(id) {
  return join(dshHome(), 'storages', 'session_projcache', 'sessions', `${id}.json`)
}

function liveSession(ctx, id) {
  const store = ctx.get('sessions')
  if (store === undefined) return undefined
  return store.get(id)
}

function detachLive(ctx, id, session) {
  const store = ctx.get('sessions')
  const entry = store.liveEntryFor?.(session)
  if (entry === undefined) return false
  store.detachEntered(entry)
  return true
}

async function forgetInWorkspaces(ctx, id) {
  const notes = []
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return notes
  try {
    registry.unarchiveSession?.(id)
  } catch (error) {
    notes.push(`unarchive: ${error?.message ?? error}`)
  }
  try {
    registry.unpinSession?.(id)
  } catch (error) {
    notes.push(`unpin: ${error?.message ?? error}`)
  }
  try {
    for (const workspace of registry.list()) {
      if (Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(id)) {
        await workspace.detachSession(id)
        notes.push(`detached from workspace ${workspace.path}`)
      }
    }
  } catch (error) {
    notes.push(`detach: ${error?.message ?? error}`)
  }
  return notes
}

async function removeSession(ctx, id, force) {
  const snapshots = await collectSnapshots(ctx)
  const snapshot = snapshots.find((item) => item?.header?.id === id)
  if (snapshot === undefined) {
    return { status: 404, body: { ok: false, reason: 'not-found', message: '没有找到这个会话的记录' } }
  }

  const session = liveSession(ctx, id)
  if (session !== undefined && !force) {
    return {
      status: 409,
      body: { ok: false, reason: 'in-use', message: '这个会话正在使用中，请先切换到其他会话，或选择强制删除' },
    }
  }

  let detached = false
  if (session !== undefined) {
    try {
      detached = detachLive(ctx, id, session)
    } catch (error) {
      if (!force) {
        return {
          status: 409,
          body: { ok: false, reason: 'in-use', message: `会话无法关闭：${error?.message ?? error}` },
        }
      }
    }
  }

  // Detach from Workspace bookkeeping while the Session is still known to the
  // registry: `workspace.sessionIds` is filtered through `candidateMatches`,
  // which stops matching once the log directory is gone.
  const notes = await forgetInWorkspaces(ctx, id)

  const removed = []
  const logPath = snapshot?.location?.path
  if (typeof logPath === 'string' && logPath.length > 0) {
    const sessionDir = dirname(logPath)
    await rm(sessionDir, { recursive: true, force: true })
    removed.push(sessionDir)
  }

  const cachePath = projectionCachePath(id)
  if (await exists(cachePath)) {
    await rm(cachePath, { force: true })
    removed.push(cachePath)
  }

  return {
    status: 200,
    body: { ok: true, id, detached, removed, notes },
  }
}

function guard(label, handler) {
  return (req, res) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((error) => {
        sendJson(res, 503, { ok: false, reason: 'route-error', message: `${label}: ${error?.message ?? error}` })
      })
  }
}

export function apply(ctx) {
  const server = ctx.get('webServer')
  if (server === undefined) return

  const routes = () => {
    const disposers = []

    // Routes are a composition-level contract: a duplicate (kind, path) throws.
    // A reload of this plugin can meet a route left behind by an instance whose
    // disposer never ran; that route already serves the same capability, so it is
    // reused instead of failing the whole entry.
    const mount = (route, handler) => {
      const table = typeof server.exact?.has === 'function' ? server.exact : undefined
      if (table?.has(route) === true) return
      const dispose = server.register({
        kind: 'exact',
        path: route,
        handler: guard(route, handler),
      })
      if (typeof dispose === 'function') disposers.push(dispose)
    }

    mount(ROUTE_DELETE, async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: 'method not allowed' })
        return
      }
      const payload = await readJson(req)
      const id = typeof payload?.id === 'string' ? payload.id : ''
      if (id.length === 0) {
        sendJson(res, 400, { ok: false, message: 'missing session id' })
        return
      }
      const result = await removeSession(ctx, id, payload?.force === true)
      sendJson(res, result.status, result.body)
    })

    mount(ROUTE_LIST, async (req, res) => {
      const snapshots = await collectSnapshots(ctx)
      const rows = snapshots.map((item) => ({
        id: item?.header?.id,
        cwd: item?.header?.cwd,
        createdAt: item?.header?.createdAt,
        sizeBytes: item?.sizeBytes,
        path: item?.location?.path,
        live: liveSession(ctx, item?.header?.id) !== undefined,
      }))
      sendJson(res, 200, { ok: true, rows })
    })

    mount(ROUTE_STATUS, async (req, res) => {
      const modules = ctx.get('clientModules')
      const graph = typeof modules?.graph === 'function' ? modules.graph() : undefined
      const entries = Array.isArray(graph?.entries) ? graph.entries : []
      const entry = entries.find((item) => item?.id === 'dsh-session-purger')
      const clientPath = typeof modules?.clientPath === 'function' ? modules.clientPath('dsh-session-purger') : undefined
      sendJson(res, 200, {
        ok: true,
        registered: entry !== undefined,
        clientPath: clientPath ?? null,
        entry: entry ?? null,
        entryIds: entries.map((item) => item?.id),
      })
    })

    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {}
      }
    }
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(routes, 'dsh-session-purger: routes')
    return
  }
  routes()
}
