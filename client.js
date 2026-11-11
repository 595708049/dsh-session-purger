/**
 * dsh-session-purger — browser side.
 *
 * Adds a "删除会话" item to the Session context menu (sidebar right-click) that
 * physically removes the stored Session via the host route.
 */

window.__ModuleLoader__.load({
  id: 'dsh-session-purger',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    let primitives = {}
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    } catch {
      primitives = {}
    }

    const ICON_KEY = 'dsh-session-purger.delete'
    const DeleteIcon =
      primitives.IconTrashOutlineRegular ?? primitives.IconArchiveOutlineRegular ?? null

    const ROUTE_DELETE = '/dsh-session-purger/delete'

    const detectZh = () => {
      const tag = typeof document !== 'undefined' ? document?.documentElement?.lang : ''
      if (typeof tag === 'string' && /^zh(-|$)/i.test(tag)) return true
      if (typeof tag === 'string' && tag !== '' && !/^en(-|$)/i.test(tag)) return false
      const first = typeof navigator !== 'undefined' ? (navigator.languages || navigator.language || '')[0] : ''
      return typeof first === 'string' && /^zh(-|$)/i.test(first)
    }

    const zh = detectZh()

    const COPY = zh
      ? {
          label: '删除会话',
          confirm: '确认删除（不可恢复）',
          force: '强制删除（含正在使用的会话）',
          done: '会话已删除',
          failed: '删除失败',
          inUse: '会话正在使用中，先切换到别的会话',
          notFound: '没有找到这个会话的记录',
        }
      : {
          label: 'Delete session',
          confirm: 'Delete permanently',
          force: 'Force delete (even while in use)',
          done: 'Session deleted',
          failed: 'Could not delete the session',
          inUse: 'This session is in use; switch to another one first',
          notFound: 'No stored record for this session',
        }

    async function deleteSession(sessionId, force) {
      const response = await fetch(ROUTE_DELETE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: sessionId, force }),
      })
      let body = {}
      try {
        body = await response.json()
      } catch {
        body = {}
      }
      return { status: response.status, body }
    }

    const exports = {
      inject: ['contextMenus', 'sessions', 'slots'],
      apply(ctx) {
        const contextMenus = ctx.get('contextMenus')
        if (contextMenus === undefined) return

        // Register the icon used by the "删除会话" menu entry. The context menu
        // only renders icons whose key is present in the `contextMenu.icon` slot.
        const slots = ctx.get('slots')
        if (slots !== undefined && DeleteIcon !== null) {
          try {
            ctx.effect(
              () => slots.inject('contextMenu.icon', () => slots.register({ name: 'contextMenu.icon', key: ICON_KEY }, DeleteIcon)),
              'dsh-session-purger: menu icon',
            )
          } catch {
            // icon is cosmetic; never break the menu because of it
          }
        }

        const notifyFailure = (notify, reason, message) => {
          if (reason === 'in-use') notify(COPY.inUse, false)
          else if (reason === 'not-found') notify(COPY.notFound, false)
          else notify(message ?? COPY.failed, false)
        }

        const run = (notify, sessionId, force) => async () => {
          const { status, body } = await deleteSession(sessionId, force)
          if (status === 200 && body?.ok) {
            notify(COPY.done, true)
            try {
              ctx.get('sessions')?.refresh?.()
            } catch {
              // refresh is best effort; the list also reloads on next navigation
            }
            return
          }
          notifyFailure(notify, body?.reason, body?.message)
        }

        ctx.effect(
          () =>
            contextMenus.register({
              id: 'session.purge',
              target: 'session',
              order: 700,
              resolve(target) {
                const sessionId = target?.sessionId
                if (typeof sessionId !== 'string' || sessionId.length === 0) return []
                const notify = (text, success) => contextMenus.notify(text, success)
                return [
                  {
                    id: 'purge',
                    label: COPY.label,
                    icon: { key: ICON_KEY },
                    danger: true,
                    separatorBefore: true,
                    afterContent: true,
                    children: [
                      {
                        id: 'confirm',
                        label: COPY.confirm,
                        danger: true,
                        run: run(notify, sessionId, false),
                        failureLabel: COPY.failed,
                      },
                      {
                        id: 'force',
                        label: COPY.force,
                        danger: true,
                        run: run(notify, sessionId, true),
                        failureLabel: COPY.failed,
                      },
                    ],
                  },
                ]
              },
            }),
          'dsh-session-purger: session menu',
        )
      },
    }

    return exports
  },
})
