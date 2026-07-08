import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertCircle,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Search,
  Users as UsersIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '../../lib/api'
import { getUser } from '../../lib/auth'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

type Role = 'admin' | 'manager' | 'staff' | 'driver'

interface User {
  id: string
  phone: string
  username: string | null
  fullName: string | null
  role: Role
  isActive: boolean
  createdAt: string
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
  driver: 'Driver',
}

const ROLE_OPTIONS: Role[] = ['driver', 'staff', 'manager', 'admin']
const FILTERS: Array<Role | 'all'> = ['all', 'admin', 'manager', 'staff', 'driver']

const ROLE_BADGE_CLASS: Record<Role, string> = {
  admin: 'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-400/20 dark:bg-primary-500/15 dark:text-primary-100',
  manager: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/15 dark:text-sky-100',
  staff: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/15 dark:text-emerald-100',
  driver: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200',
}

export default function Users() {
  const currentUser = getUser()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterRole, setFilterRole] = useState<Role | 'all'>('all')
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [pendingStatusUser, setPendingStatusUser] = useState<User | null>(null)

  useEffect(() => {
    void loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<User[]>('/users')
      setUsers(data)
    } catch (err) {
      const message = getErrorMessage(err, 'Unable to load user list')
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (user: User) => {
    if (user.id === currentUser?.id && user.isActive) {
      toast.error('You cannot deactivate your own account')
      return
    }

    const action = user.isActive ? 'deactivate' : 'activate'

    try {
      if (user.isActive) {
        await api.delete(`/users/${user.id}`)
      } else {
        await api.patch(`/users/${user.id}`, { isActive: true })
      }
      toast.success(`Account ${user.phone} has been ${action}d`)
      await loadUsers()
    } catch (err) {
      toast.error(getErrorMessage(err, `Unable to ${action} account`))
    }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setDialogOpen(true)
  }

  const handleCreate = () => {
    setEditingUser(null)
    setDialogOpen(true)
  }

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) setEditingUser(null)
  }

  const handleDialogSaved = async () => {
    await loadUsers()
    handleDialogOpenChange(false)
  }

  const handleStatusConfirm = () => {
    if (!pendingStatusUser) return
    const user = pendingStatusUser
    setPendingStatusUser(null)
    void handleToggleActive(user)
  }

  const roleCounts = useMemo(() => {
    return users.reduce<Record<Role | 'all', number>>(
      (counts, user) => {
        counts.all += 1
        counts[user.role] += 1
        return counts
      },
      { all: 0, admin: 0, manager: 0, staff: 0, driver: 0 },
    )
  }, [users])

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const matchingUsers = users.filter((user) => {
      const roleMatches = filterRole === 'all' || user.role === filterRole
      const queryMatches =
        !normalizedQuery ||
        user.phone.toLowerCase().includes(normalizedQuery) ||
        (user.username ?? '').toLowerCase().includes(normalizedQuery) ||
        (user.fullName ?? '').toLowerCase().includes(normalizedQuery)
      return roleMatches && queryMatches
    })

    return matchingUsers.sort((left, right) => {
      const leftIsCurrent = left.id === currentUser?.id
      const rightIsCurrent = right.id === currentUser?.id
      if (leftIsCurrent === rightIsCurrent) return 0
      return leftIsCurrent ? -1 : 1
    })
  }, [currentUser?.id, filterRole, query, users])

  const pendingAction = pendingStatusUser?.isActive ? 'deactivate' : 'activate'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Manage Users
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Create accounts, assign roles, and control access for administrators, managers, staff, and drivers.
          </p>
        </div>
        <Button type="button" onClick={handleCreate} className="h-10 shrink-0">
          <Plus className="size-4" strokeWidth={1.8} />
          Create account
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-4 sm:pt-5 lg:grid-cols-[260px_1fr] lg:items-end">
          <div className="space-y-2">
            <Label
              htmlFor="role-filter"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Role filter
            </Label>
            <Select
              value={filterRole}
              onValueChange={(value) => setFilterRole(value as Role | 'all')}
            >
              <SelectTrigger id="role-filter" className="h-10 w-full">
                <span className="flex min-w-0 items-center gap-2">
                  <ListFilter className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
                  <SelectValue placeholder="All roles" />
                </span>
              </SelectTrigger>
              <SelectContent align="start">
                {FILTERS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role === 'all' ? 'All roles' : ROLE_LABELS[role]} ({roleCounts[role]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="user-search"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Search
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.8}
              />
              <Input
                id="user-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, username, or phone"
                className="h-10 pl-9"
                aria-label="Search users"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" strokeWidth={1.8} />
          <AlertTitle>Could not load users</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? <UsersTableSkeleton /> : null}

      {!loading && !error ? (
        <Card>
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="px-5 py-3">Account</TableHead>
                <TableHead className="px-5 py-3">Role</TableHead>
                <TableHead className="px-5 py-3">Status</TableHead>
                <TableHead className="px-5 py-3">Created</TableHead>
                <TableHead className="px-5 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow
                  key={user.id}
                  className={cn(
                    user.id === currentUser?.id && 'bg-primary/5',
                    !user.isActive && 'bg-muted/40 opacity-75',
                  )}
                >
                  <TableCell className="px-5 py-4 whitespace-normal">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">
                        {user.fullName || 'Unnamed account'}
                      </p>
                      {user.id === currentUser?.id ? (
                        <Badge variant="outline" className="border-border bg-background/70 text-foreground">
                          You
                        </Badge>
                      ) : null}
                    </div>
                    {user.id === currentUser?.id ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Current account
                      </p>
                    ) : null}
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {user.phone}
                    </p>
                    {user.username ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        @{user.username}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-5 py-4">
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell className="px-5 py-4">
                    <StatusBadge active={user.isActive} />
                  </TableCell>
                  <TableCell className="px-5 py-4 text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell className="px-5 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Open actions for ${user.phone}`}
                        >
                          <MoreHorizontal className="size-4" strokeWidth={1.8} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel>Account actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => handleEdit(user)}>
                          <Pencil className="size-4" strokeWidth={1.8} />
                          Edit account
                        </DropdownMenuItem>
                        {user.id === currentUser?.id && user.isActive ? (
                          <DropdownMenuItem disabled>
                            <Power className="size-4" strokeWidth={1.8} />
                            You cannot deactivate your own account
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            variant={user.isActive ? 'destructive' : 'default'}
                            onSelect={() => setPendingStatusUser(user)}
                          >
                            {user.isActive ? (
                              <Power className="size-4" strokeWidth={1.8} />
                            ) : (
                              <RotateCcw className="size-4" strokeWidth={1.8} />
                            )}
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredUsers.length === 0 ? (
            <div className="border-t p-5">
              <EmptyUsersState
                title="No accounts match this view"
                description="Adjust the role filter or search term to find the account you need."
              />
            </div>
          ) : null}
        </Card>
      ) : null}

      <UserDialog
        open={dialogOpen}
        user={editingUser}
        currentUserId={currentUser?.id ?? null}
        onOpenChange={handleDialogOpenChange}
        onSave={handleDialogSaved}
      />

      <AlertDialog
        open={pendingStatusUser !== null}
        onOpenChange={(open) => {
          if (!open) setPendingStatusUser(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatusUser?.isActive ? 'Deactivate account?' : 'Activate account?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will {pendingAction} account {pendingStatusUser?.phone}. You can change this again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={pendingStatusUser?.isActive ? 'destructive' : 'default'}
              onClick={handleStatusConfirm}
            >
              {pendingStatusUser?.isActive ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function UserDialog({
  open,
  user,
  currentUserId,
  onOpenChange,
  onSave,
}: {
  open: boolean
  user: User | null
  currentUserId: string | null
  onOpenChange: (open: boolean) => void
  onSave: () => Promise<void>
}) {
  const isEdit = user !== null
  const isCurrentUser = user?.id === currentUserId
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('driver')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPhone(user?.phone ?? '')
    setUsername(user?.username ?? '')
    setFullName(user?.fullName ?? '')
    setRole(user?.role ?? 'driver')
    setPassword('')
    setError(null)
  }, [open, user])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const normalizedUsername = username.trim()
      const normalizedFullName = fullName.trim()

      if (isEdit) {
        await api.patch(`/users/${user.id}`, {
          username: normalizedUsername || null,
          fullName: normalizedFullName || null,
          ...(isCurrentUser ? {} : { role }),
        })
        toast.success('Account updated')
      } else {
        if (!password || password.length < 6) {
          setError('Password must be at least 6 characters')
          setSaving(false)
          return
        }
        await api.post('/users', {
          phone,
          username: normalizedUsername || undefined,
          password,
          fullName: normalizedFullName || undefined,
          role,
        })
        toast.success('Account created')
      }
      await onSave()
    } catch (err) {
      setError(getErrorMessage(err, 'Error saving data'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-lg">
        <DialogHeader className="px-5 pt-5 pr-12">
          <DialogTitle>{isEdit ? 'Edit account' : 'Create account'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update name and role for this PBMS account.' : 'Add a new PBMS account with an initial password.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 pb-5">
          <div className="space-y-2">
            <Label htmlFor="user-phone">
              Phone
              <RequiredMark />
            </Label>
            <Input
              id="user-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={isEdit || saving}
              required
              autoComplete="tel"
              placeholder="0901234567"
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-full-name">Full name</Label>
            <Input
              id="user-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={saving}
              autoComplete="name"
              placeholder="Full name"
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-username">Username</Label>
            <Input
              id="user-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={saving}
              autoComplete="username"
              placeholder="admin, manager, staff..."
              className="h-10"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Optional quick login name for staff accounts.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role">
              Role
              <RequiredMark />
            </Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as Role)}
              disabled={saving || isCurrentUser}
            >
              <SelectTrigger id="user-role" className="h-10 w-full">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isCurrentUser ? (
              <p className="text-xs leading-5 text-muted-foreground">
                You cannot change your own admin role from this screen.
              </p>
            ) : null}
          </div>

          {!isEdit ? (
            <div className="space-y-2">
              <Label htmlFor="user-password">
                Password
                <RequiredMark />
              </Label>
              <Input
                id="user-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={saving}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                className="h-10"
              />
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" strokeWidth={1.8} />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="-mx-5 -mb-5 mt-2 px-5">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={saving}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RequiredMark() {
  return (
    <>
      <span className="text-destructive" aria-hidden="true">
        *
      </span>
      <span className="sr-only"> required</span>
    </>
  )
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge variant="outline" className={ROLE_BADGE_CLASS[role]}>
      {ROLE_LABELS[role]}
    </Badge>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/15 dark:text-emerald-100'
          : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/15 dark:text-rose-100'
      }
    >
      {active ? 'Active' : 'Inactive'}
    </Badge>
  )
}

function UsersTableSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 pt-4 sm:pt-5">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </CardContent>
    </Card>
  )
}

function EmptyUsersState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border">
        <UsersIcon className="size-5" strokeWidth={1.8} />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

function getErrorMessage(err: unknown, fallback: string) {
  if (!isAxiosError(err)) return fallback
  const message = err.response?.data?.message
  if (typeof message === 'string') return message
  if (Array.isArray(message)) return message.join(', ')
  return fallback
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
