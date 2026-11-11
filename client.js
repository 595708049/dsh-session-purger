/**
 * dsh-session-purger — browser side.
 *
 * Adds a "删除会话" item to the Session context menu (sidebar right-click) that
 * physically removes the stored Session via the host route.
 *
 * Every destructive action goes through an in-page confirmation dialog, so a
 * single mis-click on the context menu can never delete a session.
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
          confirm: '删除会话（不可恢复）',
          force: '强制删除（含进行中会话）',
          done: '会话已删除',
          failed: '删除失败',
          inUse: '这个会话正在运行中，请等这一轮结束后再删，或选择强制删除',
          notFound: '没有找到这个会话的记录',
          dialogTitle: '确定要删除这个会话吗？',
          dialogTitleForce: '强制删除这个会话？',
          dialogBody:
            '会话日志、投影缓存与工作区登记都会被永久删除，没有回收站，也无法撤销。',
          dialogBodyForce:
            '这个会话可能正在使用中。强制删除后当前页面会失去该会话，正在进行的对话将无法继续。删除不可撤销。',
          dialogSession: '会话',
          dialogCancel: '取消',
          dialogConfirm: '删除',
          dialogConfirmForce: '强制删除',
        }
      : {
          label: 'Delete session',
          confirm: 'Delete session (permanent)',
          force: 'Force delete (including in-progress)',
          done: 'Session deleted',
          failed: 'Could not delete the session',
          inUse: 'This session is running; wait for the current turn to finish, or force delete',
          notFound: 'No stored record for this session',
          dialogTitle: 'Delete this session?',
          dialogTitleForce: 'Force delete this session?',
          dialogBody:
            'The session log, projection cache and workspace registration are removed permanently. There is no trash and no undo.',
          dialogBodyForce:
            'This session may be in use. Force deleting it takes it away from the current page, and the conversation cannot continue. This cannot be undone.',
          dialogSession: 'Session',
          dialogCancel: 'Cancel',
          dialogConfirm: 'Delete',
          dialogConfirmForce: 'Force delete',
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

    /**
     * Minimal in-page confirmation dialog. Plain DOM (no react-dom dependency),
     * dark theme to match the app, Escape / backdrop click cancel.
     * Resolves true only when the user presses the destructive button.
     */
    function confirmDialog(options) {
      const {
        title,
        body,
        sessionTitle,
        sessionLabel,
        cancelLabel,
        confirmLabel,
        danger,
      } = options

      return new Promise((resolve) => {
        if (typeof document === 'undefined' || !document.body) {
          resolve(false)
          return
        }

        const FONT =
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'

        const overlay = document.createElement('div')
        overlay.setAttribute('data-dsh-session-purger', 'dialog')
        overlay.style.cssText = [
          'position:fixed',
          'inset:0',
          'z-index:2147483000',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'padding:24px',
          'background:rgba(4,10,14,0.55)',
          'backdrop-filter:blur(3px)',
          `font-family:${FONT}`,
        ].join(';')

        const card = document.createElement('div')
        card.setAttribute('role', 'dialog')
        card.setAttribute('aria-modal', 'true')
        card.style.cssText = [
          'width:min(420px,100%)',
          'box-sizing:border-box',
          'padding:22px 22px 18px',
          'border-radius:16px',
          'background:#12202a',
          'border:1px solid rgba(120,170,190,0.22)',
          'box-shadow:0 24px 64px rgba(0,0,0,0.5)',
          'color:#e6eef2',
        ].join(';')

        const heading = document.createElement('div')
        heading.textContent = title
        heading.style.cssText = 'font-size:16px;font-weight:600;line-height:1.4;margin-bottom:10px'
        card.appendChild(heading)

        if (typeof sessionTitle === 'string' && sessionTitle.length > 0) {
          const row = document.createElement('div')
          row.style.cssText =
            'font-size:12px;color:#8fa6b2;margin-bottom:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
          row.textContent = `${sessionLabel}：${sessionTitle}`
          card.appendChild(row)
        }

        const message = document.createElement('div')
        message.textContent = body
        message.style.cssText = 'font-size:13px;line-height:1.65;color:#b7c8d1;margin-bottom:20px'
        card.appendChild(message)

        const row = document.createElement('div')
        row.style.cssText = 'display:flex;justify-content:flex-end;gap:10px'

        const makeButton = (label, primary) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = label
          button.style.cssText = [
            'appearance:none',
            'cursor:pointer',
            'font:inherit',
            'font-size:13px',
            'padding:8px 16px',
            'border-radius:9px',
            'border:1px solid ' + (primary ? 'rgba(232,96,96,0.55)' : 'rgba(120,170,190,0.28)'),
            'background:' + (primary ? '#c04242' : 'transparent'),
            'color:' + (primary ? '#ffffff' : '#cfdde4'),
            `transition:opacity .12s ease`,
          ].join(';')
          button.addEventListener('mouseenter', () => {
            button.style.opacity = '0.85'
          })
          button.addEventListener('mouseleave', () => {
            button.style.opacity = '1'
          })
          return button
        }

        const cancelButton = makeButton(cancelLabel, false)
        const confirmButton = makeButton(confirmLabel, Boolean(danger))
        row.appendChild(cancelButton)
        row.appendChild(confirmButton)
        card.appendChild(row)
        overlay.appendChild(card)

        let settled = false
        const previousActive = document.activeElement

        const cleanup = () => {
          document.removeEventListener('keydown', onKeyDown, true)
          overlay.removeEventListener('mousedown', onBackdropDown)
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
          if (previousActive && typeof previousActive.focus === 'function') {
            try {
              previousActive.focus()
            } catch {
              // focus restore is cosmetic
            }
          }
        }

        const finish = (value) => {
          if (settled) return
          settled = true
          cleanup()
          resolve(value)
        }

        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            finish(false)
          }
        }

        const onBackdropDown = (event) => {
          if (event.target === overlay) finish(false)
        }

        cancelButton.addEventListener('click', () => finish(false))
        confirmButton.addEventListener('click', () => finish(true))

        document.addEventListener('keydown', onKeyDown, true)
        overlay.addEventListener('mousedown', onBackdropDown)
        document.body.appendChild(overlay)
        cancelButton.focus()
      })
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

        const run = (notify, target, force) => async () => {
          const sessionId = target?.sessionId
          if (typeof sessionId !== 'string' || sessionId.length === 0) return

          const confirmed = await confirmDialog({
            title: force ? COPY.dialogTitleForce : COPY.dialogTitle,
            body: force ? COPY.dialogBodyForce : COPY.dialogBody,
            sessionTitle: target?.displayTitle,
            sessionLabel: COPY.dialogSession,
            cancelLabel: COPY.dialogCancel,
            confirmLabel: force ? COPY.dialogConfirmForce : COPY.dialogConfirm,
            danger: true,
          })
          if (!confirmed) return

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
                        run: run(notify, target, false),
                        failureLabel: COPY.failed,
                      },
                      {
                        id: 'force',
                        label: COPY.force,
                        danger: true,
                        run: run(notify, target, true),
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
