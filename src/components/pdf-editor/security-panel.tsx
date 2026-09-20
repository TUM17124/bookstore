'use client'

import type { SecurityPermissions } from '@/lib/pdf-editor-types'

export function SecurityPanel({
  enabled,
  onEnabledChange,
  openPassword,
  onOpenPasswordChange,
  openPasswordConfirm,
  onOpenPasswordConfirmChange,
  ownerPassword,
  onOwnerPasswordChange,
  ownerPasswordConfirm,
  onOwnerPasswordConfirmChange,
  permissions,
  onPermissionsChange,
}: {
  enabled: boolean
  onEnabledChange: (v: boolean) => void
  openPassword: string
  onOpenPasswordChange: (v: string) => void
  openPasswordConfirm: string
  onOpenPasswordConfirmChange: (v: string) => void
  ownerPassword: string
  onOwnerPasswordChange: (v: string) => void
  ownerPasswordConfirm: string
  onOwnerPasswordConfirmChange: (v: string) => void
  permissions: SecurityPermissions
  onPermissionsChange: (patch: Partial<SecurityPermissions>) => void
}) {
  const openMismatch = openPassword !== '' && openPasswordConfirm !== '' && openPassword !== openPasswordConfirm
  const ownerMismatch =
    ownerPassword !== '' && ownerPasswordConfirm !== '' && ownerPassword !== ownerPasswordConfirm

  return (
    <div className="rounded-2xl border border-foreground/10 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Security</h2>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabledChange(e.target.checked)} />
        Restrict this PDF
      </label>

      {enabled && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-xs font-medium text-foreground/70">Open password</p>
            <p className="text-[11px] text-foreground/45">Required to view the PDF at all. Leave blank to let anyone open it.</p>
            <input
              type="password"
              value={openPassword}
              onChange={(e) => onOpenPasswordChange(e.target.value)}
              placeholder="Open password (optional)"
              className="mt-1.5 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
            />
            <input
              type="password"
              value={openPasswordConfirm}
              onChange={(e) => onOpenPasswordConfirmChange(e.target.value)}
              placeholder="Confirm open password"
              className="mt-1.5 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
            />
            {openMismatch && <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>}
          </div>

          <div>
            <p className="text-xs font-medium text-foreground/70">Owner password</p>
            <p className="text-[11px] text-foreground/45">Required to change permissions, edit, or print/copy if restricted below.</p>
            <input
              type="password"
              value={ownerPassword}
              onChange={(e) => onOwnerPasswordChange(e.target.value)}
              placeholder="Owner password (optional)"
              className="mt-1.5 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
            />
            <input
              type="password"
              value={ownerPasswordConfirm}
              onChange={(e) => onOwnerPasswordConfirmChange(e.target.value)}
              placeholder="Confirm owner password"
              className="mt-1.5 w-full rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-sm text-foreground"
            />
            {ownerMismatch && <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>}
          </div>

          <div>
            <p className="text-xs font-medium text-foreground/70">Permissions</p>
            <div className="mt-1.5 space-y-1.5">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={permissions.printing}
                  onChange={(e) => onPermissionsChange({ printing: e.target.checked })}
                />
                Allow printing
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={permissions.copying}
                  onChange={(e) => onPermissionsChange({ copying: e.target.checked })}
                />
                Allow copying text
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={permissions.modifying}
                  onChange={(e) => onPermissionsChange({ modifying: e.target.checked })}
                />
                Allow editing
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={permissions.annotating}
                  onChange={(e) => onPermissionsChange({ annotating: e.target.checked })}
                />
                Allow annotations
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


