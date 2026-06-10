import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { planApi, redeemCodeApi } from '@/lib/api.js';
import { Button, Dialog, Field, Input, Select, Table, Textarea } from '@/components/ui.jsx';
import { CopyButton, formatDate, getList, PageHeader, RefreshButton, Section, StatGrid, StatusBadge } from './common.jsx';

const emptyForm = { planId: '', durationDays: 30, count: 10, expiresAt: '', subscriptionExpiresAt: '', remark: '' };

export function RedeemCodePage() {
  const [codes, setCodes] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [mode, setMode] = useState('single');
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState({ keyword: '', status: '', planId: '' });

  async function load() {
    setLoading(true);
    try {
      const [codeRes, planRes] = await Promise.all([redeemCodeApi.list(), planApi.listActive()]);
      const planRows = getList(planRes);
      setCodes(getList(codeRes));
      setPlans(planRows);
      if (!form.planId && planRows[0]) {
        setForm((prev) => ({ ...prev, planId: planRows[0].id, durationDays: planRows[0].duration_days }));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => codes.filter((row) => {
    const keyword = filters.keyword.toLowerCase();
    const status = effectiveStatus(row);
    return (!keyword || [row.code, row.remark, row.used_by_user_id].some((item) => String(item || '').toLowerCase().includes(keyword)))
      && (!filters.status || status === filters.status)
      && (!filters.planId || Number(row.plan_id) === Number(filters.planId));
  }), [codes, filters]);

  const metrics = useMemo(() => codes.reduce((acc, row) => {
    acc.total += 1;
    acc[effectiveStatus(row)] += 1;
    return acc;
  }, { total: 0, unused: 0, used: 0, disabled: 0, expired: 0 }), [codes]);

  function open(modeName) {
    const plan = plans.find((item) => Number(item.id) === Number(form.planId)) || plans[0];
    setMode(modeName);
    setForm({
      ...emptyForm,
      planId: plan?.id || '',
      durationDays: plan?.duration_days || emptyForm.durationDays,
    });
    setDialog(true);
  }

  function syncPlan(planId) {
    const plan = plans.find((item) => Number(item.id) === Number(planId));
    setForm((prev) => ({ ...prev, planId, durationDays: plan?.duration_days || prev.durationDays }));
  }

  async function submit() {
    if (!form.planId) return toast.warning('请选择套餐');
    if (!Number.isFinite(Number(form.durationDays)) || Number(form.durationDays) <= 0) return toast.warning('请输入有效的订阅天数');
    if (mode === 'batch') await redeemCodeApi.batch(form);
    else await redeemCodeApi.create(form);
    toast.success('保存成功');
    setDialog(false);
    await load();
  }

  async function setStatus(row, status) {
    await redeemCodeApi.updateStatus(row.id, status);
    await load();
  }

  async function remove(row) {
    if (!window.confirm('确认删除兑换码？')) return;
    await redeemCodeApi.delete(row.id);
    await load();
  }

  return (
    <>
      <PageHeader title="兑换码" description="生成兑换码后发给用户，用户在前台兑换即可自动生成订阅链接。">
        <RefreshButton loading={loading} onClick={load} />
        <Button variant="outline" onClick={() => open('batch')}>批量生成</Button>
        <Button onClick={() => open('single')}>创建兑换码</Button>
      </PageHeader>
      <StatGrid stats={[
        { label: '总数', value: metrics.total },
        { label: '可用', value: metrics.unused, tone: 'success' },
        { label: '已兑换', value: metrics.used },
        { label: '异常', value: metrics.disabled + metrics.expired, tone: 'warning' },
      ]} />
      <Section title="兑换码列表" actions={<Filters filters={filters} setFilters={setFilters} plans={plans} />}>
        <Table rows={filtered} columns={[
          { key: 'code', label: '兑换码' },
          { key: 'plan', label: '套餐', render: (row) => row.linked_plan_name || row.plan_name || '-' },
          { key: 'duration', label: '订阅天数', render: (row) => row.duration_days || row.linked_duration_days || '-' },
          { key: 'subscription_expires_at', label: '订阅到期', render: (row) => formatDate(row.subscription_expires_at) },
          { key: 'expires_at', label: '码过期', render: (row) => formatDate(row.expires_at) },
          { key: 'status', label: '状态', render: (row) => <StatusBadge value={statusText(row)} /> },
          { key: 'used_by_user_id', label: '兑换用户', render: (row) => row.used_by_user_id || '-' },
          { key: 'remark', label: '备注' },
          { key: 'actions', label: '操作', render: (row) => <div className="flex flex-wrap gap-2"><CopyButton value={row.code} /><Button size="sm" variant="outline" disabled={row.status === 'used'} onClick={() => setStatus(row, row.status === 'disabled' ? 'unused' : 'disabled')}>{row.status === 'disabled' ? '启用' : '作废'}</Button><Button size="sm" variant="destructive" onClick={() => remove(row)}>删除</Button></div> },
        ]} />
      </Section>
      <Dialog open={dialog} onOpenChange={setDialog} title={mode === 'batch' ? '批量生成兑换码' : '创建兑换码'} footer={<><Button variant="outline" onClick={() => setDialog(false)}>取消</Button><Button onClick={submit}>保存</Button></>}>
        <div className="grid gap-4">
          <Field label="套餐"><Select value={form.planId} onChange={(e) => syncPlan(e.target.value)}><option value="">请选择</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} / 默认 {plan.duration_days} 天</option>)}</Select></Field>
          <Field label="订阅有效天数" hint="默认跟随套餐，也可以在这里单独修改本次生成的订阅时长。"><Input type="number" min="1" max="3650" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} /></Field>
          {mode === 'batch' ? <Field label="生成数量"><Input type="number" value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} /></Field> : null}
          <Field label="兑换码过期时间" hint="这是兑换码本身的失效时间，不影响订阅到期时间。"><Input type="datetime-local" value={form.expiresAt?.slice(0, 16) || ''} onChange={(e) => setForm({ ...form, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></Field>
          <Field label="订阅固定到期时间" hint="填写后，用户兑换生成的订阅将按这个绝对时间到期。"><Input type="datetime-local" value={form.subscriptionExpiresAt?.slice(0, 16) || ''} onChange={(e) => setForm({ ...form, subscriptionExpiresAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></Field>
          <Field label="备注"><Textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></Field>
        </div>
      </Dialog>
    </>
  );
}

function Filters({ filters, setFilters, plans }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Input className="w-48" placeholder="搜索兑换码" value={filters.keyword} onChange={(e) => setFilters({ ...filters, keyword: e.target.value })} />
      <Select className="w-36" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">全部状态</option><option value="unused">可用</option><option value="used">已兑换</option><option value="disabled">已作废</option><option value="expired">已过期</option></Select>
      <Select className="w-40" value={filters.planId} onChange={(e) => setFilters({ ...filters, planId: e.target.value })}><option value="">全部套餐</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</Select>
    </div>
  );
}

function effectiveStatus(row) {
  if (row.status === 'unused' && row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return 'expired';
  return row.status || 'unused';
}

function statusText(row) {
  return ({ unused: '可用', used: '已兑换', disabled: '已作废', expired: '已过期' })[effectiveStatus(row)] || row.status;
}
