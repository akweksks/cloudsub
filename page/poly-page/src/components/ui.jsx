import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { Slot } from '@radix-ui/react-slot';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Button({ className, variant = 'default', size = 'default', asChild = false, ...props }) {
  const variants = {
    default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'border border-input bg-card hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  };
  const sizes = {
    default: 'h-10 px-4 py-2',
    sm: 'h-8 px-3 text-xs',
    lg: 'h-11 px-5',
    icon: 'size-10',
  };
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }) {
  return <section className={cn('rounded-lg border bg-card text-card-foreground shadow-soft', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn('text-lg font-bold leading-none tracking-normal', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm leading-6 text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function Badge({ className, variant = 'secondary', ...props }) {
  const variants = {
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    destructive: 'bg-destructive text-destructive-foreground',
    outline: 'border border-input bg-card',
  };
  return (
    <span
      className={cn('inline-flex items-center rounded-md border border-transparent px-2 py-1 text-xs font-semibold', variants[variant], className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn('flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn('flex min-h-28 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn('flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring', className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }) {
  return <label className={cn('text-sm font-semibold text-foreground', className)} {...props} />;
}

export function Field({ label, children, hint }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Table({ columns, rows, empty = '暂无数据', rowKey = 'id', className, tableClassName, mobileCard = true }) {
  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      <div className={cn('table-scroll scrollbar-soft', mobileCard && 'hidden md:block')}>
        <table className={cn('w-full border-collapse text-sm', tableClassName)}>
          <thead>
            <tr className="bg-muted/70 text-left text-muted-foreground">
              {columns.map((column) => (
                <th key={column.key} className={cn('border-b px-4 py-3 font-semibold', column.className)}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-muted-foreground" colSpan={columns.length}>
                  {empty}
                </td>
              </tr>
            ) : rows.map((row, index) => (
              <tr key={row[rowKey] ?? index} className="border-b last:border-b-0 hover:bg-muted/40">
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-4 py-3 align-middle', column.cellClassName)}>
                    {column.render ? column.render(row, index) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mobileCard ? (
        <div className="divide-y md:hidden">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</div>
          ) : rows.map((row, index) => (
            <div key={row[rowKey] ?? index} className="space-y-3 p-4">
              {columns.map((column) => (
                <div key={column.key} className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 text-sm">
                  <div className="text-xs font-semibold leading-6 text-muted-foreground">{column.label}</div>
                  <div className={cn('min-w-0 leading-6 text-foreground', column.mobileCellClassName)}>
                    {column.render ? column.render(row, index) : row[column.key]}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Dialog({ open, onOpenChange, title, children, footer, className }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" />
        <DialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(92vw,760px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card shadow-soft outline-none', className)}>
          <div className="flex items-center justify-between border-b p-5">
            <DialogPrimitive.Title className="text-lg font-bold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="关闭">
                <X data-icon="inline-start" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="p-5">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t p-5">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title = '确认操作', description, onConfirm }) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-5 shadow-soft outline-none">
          <AlertDialogPrimitive.Title className="text-lg font-bold">{title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="outline">取消</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button variant="destructive" onClick={onConfirm}>确认</Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn('inline-flex rounded-md bg-muted p-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn('rounded-sm px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm', className)}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content className={cn('mt-4 outline-none', className)} {...props} />;
}
