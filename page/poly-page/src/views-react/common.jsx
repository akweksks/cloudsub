import { Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui.jsx';
import { cn } from '@/lib/cn.js';

export function getList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

export function getData(payload) {
  return payload?.data ?? payload ?? {};
}

export function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function formatShortDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-soft sm:p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-2 text-xs font-semibold text-muted-foreground">{eyebrow}</div> : null}
        <h2 className="text-lg font-bold tracking-normal sm:text-xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions || children ? <div className="flex flex-wrap gap-2 sm:justify-end">{actions || children}</div> : null}
    </div>
  );
}

export function StatGrid({ stats, items }) {
  const rows = Array.isArray(stats) ? stats : (Array.isArray(items) ? items : []);
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
      {rows.map((stat) => (
        <Card key={stat.label} className={cn('overflow-hidden', stat.tone === 'success' && 'border-emerald-200 bg-emerald-50', stat.tone === 'warning' && 'border-amber-200 bg-amber-50', stat.tone === 'danger' && 'border-red-200 bg-red-50')}>
          <CardHeader className="p-4 pb-2">
            <CardDescription>{stat.label}</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="truncate text-2xl font-bold sm:text-3xl">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function Section({ title, description, actions, children }) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription className="mt-2">{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">{children}</CardContent>
    </Card>
  );
}

export function RefreshButton({ loading, onClick, children = '刷新' }) {
  return (
    <Button variant="outline" disabled={loading} onClick={onClick}>
      <RefreshCw data-icon="inline-start" className={cn(loading && 'animate-spin')} />
      {children}
    </Button>
  );
}

export function CopyButton({ value, text, label = '复制' }) {
  const copyValue = value ?? text ?? '';
  async function copy() {
    await navigator.clipboard.writeText(copyValue);
    toast.success('已复制');
  }
  return (
    <Button variant="outline" size="sm" onClick={copy} disabled={!copyValue}>
      <Copy data-icon="inline-start" />
      {label}
    </Button>
  );
}

export function StatusBadge({ value }) {
  const text = String(value || '');
  const normal = ['active', 'enabled', 'normal', 'success', '正常', '启用'].includes(text);
  const disabled = ['disabled', 'inactive', 'expired', '停用', '禁用'].includes(text);
  return (
    <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-semibold', normal && 'border-emerald-200 bg-emerald-50 text-emerald-700', disabled && 'border-slate-200 bg-slate-100 text-slate-600', !normal && !disabled && 'border-amber-200 bg-amber-50 text-amber-700')}>
      {text || '-'}
    </span>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="text-sm text-muted-foreground">{message || '加载失败'}</div>
        {onRetry ? <Button variant="outline" onClick={onRetry}>重试</Button> : null}
      </CardContent>
    </Card>
  );
}
