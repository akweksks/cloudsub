import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { clashTemplateApi, planApi, routingProfileApi, subUserApi } from '@/lib/api.js';
import { Badge, Button, Card, CardContent, Dialog, Field, Input, Select, Table } from '@/components/ui.jsx';
import { CopyButton, formatDate, PageHeader, RefreshButton, StatGrid } from './common.jsx';

const formDefaults = { remark: '', status: 'active', planId: '', planName: '', templateId: '', routingProfileId: '', expiresAt: '' };

function rowsOf(res) {
  return res?.data?.results || res?.data || [];
}

function subscriptionUrl(token) {
  return `${window.location.origin}/subscribe?token=${token}`;
}

function rowSubscriptionUrl(row) {
  return row.subscriptionUrl || row.subscription_url || subscriptionUrl(row.token);
}

function remainingDays(row) {
  const diff = new Date(row.expires_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function effectiveStatus(row) {
  if (row.status === 'disabled') return 'disabled';
  if (new Date(row.expires_at).getTime() <= Date.now()) return 'expired';
  return 'active';
}

function statusText(row) {
  return ({ active: '正常', disabled: '已禁用', expired: '已到期' })[effectiveStatus(row)];
}

function statusVariant(row) {
  return ({ active: 'success', disabled: 'destructive', expired: 'warning' })[effectiveStatus(row)];
}

export function SubUserPage() {
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [routingProfiles, setRoutingProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ keyword: '', status: '', planId: '' });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(formDefaults);

  const filtered = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    return users.filter((row) => {
      const text = `${row.remark || ''} ${row.plan_name || row.linked_plan_name || ''} ${row.token || ''}`.toLowerCase();
      return (!keyword || text.includes(keyword))
        && (!filters.status || effectiveStatus(row) === filters.status)
        && (!filters.planId || String(row.plan_id || '') === String(filters.planId));
    });
  }, [filters, users]);

  const stats = useMemo(() => {
    const active = users.filter((row) => effectiveStatus(row) === 'active').length;
    return [
      { label: '订阅用户', value: users.length },
      { label: '有效订阅', value: active, tone: 'success' },
      { label: '即将到期', value: users.filter((row) => effectiveStatus(row) === 'active' && remainingDays(row) <= 7).length, tone: 'warning' },
      { label: '异常订阅', value: users.length - active, tone: 'danger' },
    ];
  }, [users]);

  async function load() {
    setLoading(true);
    try {
      const [userRes, planRes, templateRes, routingProfileRes] = await Promise.all([
        subUserApi.list(),
        planApi.listActive(),
        clashTemplateApi.listActive(),
        routingProfileApi.listSelectable(),
      ]);
      setUsers(rowsOf(userRes));
      setPlans(rowsOf(planRes));
      setTemplates(rowsOf(templateRes));
      setRoutingProfiles(rowsOf(routingProfileRes));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function edit(row) {
    setEditing(row);
    setForm({
      remark: row.remark || '',
      status: row.status || 'active',
      planId: row.plan_id || '',
      planName: row.plan_name || row.linked_plan_name || '',
      templateId: row.template_id || '',
      routingProfileId: row.routing_profile_id || '',
      expiresAt: row.expires_at ? row.expires_at.slice(0, 16) : '',
    });
  }

  function syncPlan(planId) {
    const plan = plans.find((item) => String(item.id) === String(planId));
    setForm((prev) => ({
      ...prev,
      planId,
      planName: plan?.name || prev.planName,
      templateId: plan?.template_id || prev.templateId || '',
      routingProfileId: plan?.routing_profile_id || prev.routingProfileId || '',
    }));
  }

  async function save() {
    await subUserApi.update(editing.id, {
      remark: form.remark,
      status: form.status,
      planId: form.planId || null,
      planName: form.planName,
      templateId: form.templateId || null,
      routingProfileId: form.routingProfileId || null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : editing.expires_at,
    });
    toast.success('订阅用户已更新');
    setEditing(null);
    await load();
  }

  async function toggle(row) {
    await subUserApi.update(row.id, { status: row.status === 'disabled' ? 'active' : 'disabled' });
    toast.success(row.status === 'disabled' ? '已恢复订阅' : '已禁用订阅');
    await load();
  }

  async function renew(row, days) {
    await subUserApi.batchRenew([row.id], days);
    toast.success(`已续期 ${days} 天`);
    await load();
  }

  async function resetToken(row) {
    if (!window.confirm('重置后旧订阅链接会失效，确认继续？')) return;
    const res = await subUserApi.resetToken(row.id);
    const url = res?.data?.subscriptionUrl || subscriptionUrl(res?.data?.token);
    if (url) await navigator.clipboard.writeText(url);
    toast.success('Token 已重置，新链接已复制');
    await load();
  }

  const columns = [
    {
      key: 'remark',
      label: '用户备注',
      className: 'min-w-36',
      cellClassName: 'max-w-44 whitespace-nowrap',
      render: (row) => <div className="truncate font-semibold" title={row.remark || `用户 #${row.id}`}>{row.remark || `用户 #${row.id}`}</div>,
    },
    { key: 'plan_name', label: '套餐', className: 'min-w-24', cellClassName: 'whitespace-nowrap', render: (row) => row.plan_name || row.linked_plan_name || '-' },
    {
      key: 'routing_profile_name',
      label: '分流规则',
      className: 'min-w-32',
      cellClassName: 'max-w-40 whitespace-nowrap',
      render: (row) => <span className="block truncate" title={row.routing_profile_name || '系统默认'}>{row.routing_profile_name || '系统默认'}</span>,
    },
    { key: 'status', label: '状态', className: 'min-w-24', cellClassName: 'whitespace-nowrap', render: (row) => <Badge variant={statusVariant(row)}>{statusText(row)}</Badge> },
    { key: 'remaining', label: '剩余', className: 'min-w-20', cellClassName: 'whitespace-nowrap', render: (row) => `${remainingDays(row)} 天` },
    { key: 'access_count', label: '访问', className: 'min-w-20', cellClassName: 'whitespace-nowrap', render: (row) => row.access_count || 0 },
    { key: 'expires_at', label: '到期时间', className: 'min-w-36', cellClassName: 'whitespace-nowrap', render: (row) => formatDate(row.expires_at) },
    { key: 'last_access_at', label: '最近访问', className: 'min-w-36', cellClassName: 'whitespace-nowrap', render: (row) => formatDate(row.last_access_at) },
    {
      key: 'actions',
      label: '操作',
      className: 'min-w-80',
      cellClassName: 'whitespace-nowrap',
      render: (row) => (
        <div className="flex max-w-80 flex-wrap gap-2">
          <CopyButton text={rowSubscriptionUrl(row)} label="复制链接" />
          <Button size="sm" variant="outline" onClick={() => edit(row)}>编辑</Button>
          <Button size="sm" variant="outline" onClick={() => renew(row, 30)}><RefreshCw data-icon="inline-start" />续 30 天</Button>
          <Button size="sm" variant="outline" onClick={() => toggle(row)}>{row.status === 'disabled' ? '恢复' : '禁用'}</Button>
          <Button size="sm" variant="outline" onClick={() => resetToken(row)}>重置 Token</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="用户运营"
        title="订阅用户"
        description="查看兑换后生成的订阅用户，处理到期、续期、禁用和订阅链接复制。"
        actions={<RefreshButton onClick={load} loading={loading} />}
      />
      <StatGrid items={stats} />
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-3 md:grid-cols-[1fr_160px_180px_auto]">
            <Input value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} placeholder="搜索备注、套餐或 Token" />
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">全部状态</option>
              <option value="active">正常</option>
              <option value="expired">已到期</option>
              <option value="disabled">已禁用</option>
            </Select>
            <Select value={filters.planId} onChange={(e) => setFilters({ ...filters, planId: e.target.value })}>
              <option value="">全部套餐</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </Select>
            <Button variant="outline" onClick={() => setFilters({ keyword: '', status: '', planId: '' })}>重置</Button>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <span>当前筛选 {filtered.length} 个用户</span>
          </div>
          <Table columns={columns} rows={filtered} empty="暂无订阅用户" tableClassName="min-w-[1180px]" />
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title="编辑订阅用户"
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>取消</Button><Button onClick={save}>保存</Button></>}
      >
        <div className="grid gap-4">
          <Field label="用户备注"><Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="状态">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">正常</option>
                <option value="disabled">禁用</option>
              </Select>
            </Field>
            <Field label="到期时间"><Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="套餐">
              <Select value={form.planId} onChange={(e) => syncPlan(e.target.value)}>
                <option value="">不绑定套餐</option>
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </Select>
            </Field>
            <Field label="Clash 模板">
              <Select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
                <option value="">默认模板</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </Select>
            </Field>
            <Field label="分流方案">
              <Select value={form.routingProfileId} onChange={(e) => setForm({ ...form, routingProfileId: e.target.value })}>
                <option value="">系统默认方案</option>
                {routingProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
