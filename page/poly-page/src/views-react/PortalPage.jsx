import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui.jsx';
import { portalApi } from '@/lib/api.js';
import { CopyButton, formatDate, getData, StatusBadge } from './common.jsx';
import logo from '@/assets/logo.png';

const targets = [
  { label: '通用订阅', target: '', description: 'YAML 配置' },
  { label: 'Clash / Mihomo', target: 'clash', description: 'YAML 配置' },
];

export function PortalPage() {
  const [activeTab, setActiveTab] = useState('redeem');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [routingProfiles, setRoutingProfiles] = useState([]);
  const [routingProfileLoading, setRoutingProfileLoading] = useState(false);
  const [redeemForm, setRedeemForm] = useState({ code: '', remark: '' });
  const [lookupToken, setLookupToken] = useState(localStorage.getItem('portalToken') || '');
  const [renewForm, setRenewForm] = useState({ token: localStorage.getItem('portalToken') || '', code: '' });

  const subscription = getData(result);
  const baseUrl = subscription.subscriptionUrl || subscription.subscribeUrl || subscription.url || '';
  const expiresAt = subscription.expiresAt || subscription.expires_at || subscription.expireAt || subscription.expire_at || subscription.expiredAt || subscription.expired_at;
  const remainingDays = subscription.remainingDays ?? subscription.remaining_days ?? null;
  const links = useMemo(() => targets.map((item) => ({
    ...item,
    url: item.target && baseUrl ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}target=${item.target}` : baseUrl,
  })), [baseUrl]);

  useEffect(() => {
    portalApi.routingProfiles()
      .then((response) => setRoutingProfiles(Array.isArray(response?.data) ? response.data : []))
      .catch(() => setRoutingProfiles([]));
  }, []);

  async function run(action, success) {
    setLoading(true);
    try {
      const response = await action();
      const data = getData(response);
      setResult(data);
      if (data.token) {
        localStorage.setItem('portalToken', data.token);
        setLookupToken(data.token);
        setRenewForm((prev) => ({ ...prev, token: data.token }));
      }
      toast.success(success);
    } finally {
      setLoading(false);
    }
  }

  async function changeRoutingProfile(routingProfileId) {
    const token = subscription.token || lookupToken || renewForm.token;
    if (!token) return;
    setRoutingProfileLoading(true);
    try {
      const response = await portalApi.updateRoutingProfile({ token, routingProfileId });
      setResult(getData(response));
      toast.success('分流方案已切换');
    } finally {
      setRoutingProfileLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-soft md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img className="size-12 rounded-lg" src={logo} alt="CloudSub" />
            <div>
              <h1 className="text-2xl font-bold">订阅自助中心</h1>
              <p className="mt-1 text-sm text-muted-foreground">兑换、查询和续期订阅，复制 Clash / Mihomo 可用的 YAML 订阅链接。</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <Card>
            <CardHeader>
              <CardTitle>订阅办理</CardTitle>
              <CardDescription>输入兑换码即可开通或续期。查询时可以使用订阅链接或 Token。</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="redeem">兑换订阅</TabsTrigger>
                  <TabsTrigger value="lookup">查询订阅</TabsTrigger>
                  <TabsTrigger value="renew">续期订阅</TabsTrigger>
                </TabsList>
                <TabsContent value="redeem">
                  <div className="grid gap-4">
                    <Field label="兑换码">
                      <Input value={redeemForm.code} onChange={(event) => setRedeemForm({ ...redeemForm, code: event.target.value })} placeholder="请输入兑换码" />
                    </Field>
                    <Field label="备注">
                      <Input value={redeemForm.remark} onChange={(event) => setRedeemForm({ ...redeemForm, remark: event.target.value })} placeholder="可选，例如设备或用户备注" />
                    </Field>
                    <Button disabled={loading || !redeemForm.code} onClick={() => run(() => portalApi.redeem(redeemForm), '兑换成功')}>立即兑换</Button>
                  </div>
                </TabsContent>
                <TabsContent value="lookup">
                  <div className="grid gap-4">
                    <Field label="订阅链接或 Token">
                      <Input value={lookupToken} onChange={(event) => setLookupToken(event.target.value)} placeholder="粘贴订阅链接或 Token" />
                    </Field>
                    <Button disabled={loading || !lookupToken} onClick={() => run(() => portalApi.lookup({ token: lookupToken }), '查询成功')}>查询状态</Button>
                  </div>
                </TabsContent>
                <TabsContent value="renew">
                  <div className="grid gap-4">
                    <Field label="当前订阅 Token">
                      <Input value={renewForm.token} onChange={(event) => setRenewForm({ ...renewForm, token: event.target.value })} />
                    </Field>
                    <Field label="续期兑换码">
                      <Input value={renewForm.code} onChange={(event) => setRenewForm({ ...renewForm, code: event.target.value })} />
                    </Field>
                    <Button disabled={loading || !renewForm.token || !renewForm.code} onClick={() => run(() => portalApi.renew(renewForm), '续期成功')}>使用兑换码续期</Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>当前订阅</CardTitle>
              <CardDescription>兑换或查询成功后显示套餐、到期时间、分流方案和 YAML 订阅链接。</CardDescription>
            </CardHeader>
            <CardContent>
              {!subscription?.token && !baseUrl ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">还没有订阅信息</div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-muted-foreground">套餐</div>
                      <div className="mt-1 text-2xl font-bold">{subscription.plan_name || subscription.planName || '默认套餐'}</div>
                    </div>
                    <StatusBadge value={subscription.status || '正常'} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Info label="剩余天数" value={remainingDays === null ? '-' : `${remainingDays} 天`} />
                    <Info label="到期时间" value={formatDate(expiresAt)} />
                    <Info label="最近访问" value={formatDate(subscription.last_access_at || subscription.lastAccessAt)} />
                  </div>
                  <div className="rounded-lg border p-3">
                    <Field label="分流方案">
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={subscription.routingProfileId || subscription.routing_profile_id || ''}
                        disabled={routingProfileLoading || !routingProfiles.length}
                        onChange={(event) => changeRoutingProfile(event.target.value)}
                      >
                        <option value="">系统默认方案</option>
                        {routingProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>{profile.name}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="mt-2 text-xs text-muted-foreground">
                      当前：{subscription.routingProfileName || subscription.routing_profile_name || '系统默认方案'}
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    {links.map((item) => (
                      <div className="rounded-lg border p-3" key={item.label}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="font-semibold">{item.label}</div>
                            <div className="text-xs text-muted-foreground">{item.description}</div>
                          </div>
                          <CopyButton value={item.url} label="复制订阅链接" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    当前平台统一生成 YAML 订阅配置，建议使用 Clash / Mihomo 客户端导入。
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value || '-'}</div>
    </div>
  );
}
