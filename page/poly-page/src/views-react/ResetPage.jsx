import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { userApi } from '@/lib/api.js';
import { Button, Card, CardContent, Field, Input } from '@/components/ui.jsx';
import { PageHeader } from './common.jsx';

export function ResetPage() {
  const [oldToken, setOldToken] = useState('');
  const [token, setToken] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!oldToken) return toast.warning('请输入当前后台密码');
    if (!token) return toast.warning('请输入新后台密码');
    if (token !== confirm) return toast.warning('两次输入的新密码不一致');
    if (!window.confirm('重置后旧后台密码会立刻失效，确认继续？')) return;
    setSaving(true);
    try {
      const res = await userApi.reset({ oldToken, token });
      localStorage.setItem('token', res?.data?.token || token);
      setOldToken('');
      setToken('');
      setConfirm('');
      toast.success('后台密码已更新');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="安全设置"
        title="后台密码"
        description="修改管理员访问密码。修改成功后，当前浏览器会自动保存新密码。"
      />
      <Card className="max-w-2xl">
        <CardContent className="space-y-4 pt-5">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            建议使用不容易猜到的密码，并在修改后同步给需要管理后台的成员。
          </div>
          <Field label="当前后台密码"><Input type="password" value={oldToken} onChange={(e) => setOldToken(e.target.value)} autoComplete="current-password" /></Field>
          <Field label="新后台密码"><Input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="确认新密码"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
          <Button onClick={submit} disabled={saving}><KeyRound data-icon="inline-start" />{saving ? '保存中...' : '更新后台密码'}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
