import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Menu, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui.jsx';
import { cn } from '@/lib/cn.js';
import logo from '@/assets/logo.png';
import { fallbackPage, flatNavItems, footerActions, navSections } from './nav.js';

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const page = useMemo(() => {
    return flatNavItems.find((item) => item.to === location.pathname) || fallbackPage;
  }, [location.pathname]);

  function logout() {
    localStorage.removeItem('token');
    navigate('/admin');
  }

  return (
    <div className="min-h-screen bg-background">
      {open ? <button className="fixed inset-0 z-30 bg-slate-950/40 md:hidden" aria-label="关闭导航" onClick={() => setOpen(false)} /> : null}
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-[min(86vw,292px)] -translate-x-full flex-col border-r bg-card transition-transform duration-200 md:w-[292px] md:translate-x-0', open && 'translate-x-0')}>
        <div className="flex h-20 items-center gap-3 border-b px-5">
          <img className="size-11 rounded-lg" src={logo} alt="CloudSub" />
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">CloudSub</div>
            <div className="text-xs text-muted-foreground">订阅分发平台</div>
          </div>
          <Button className="ml-auto md:hidden" size="icon" variant="ghost" onClick={() => setOpen(false)}>
            <X data-icon="inline-start" />
          </Button>
        </div>

        <nav className="scrollbar-soft flex-1 overflow-y-auto px-3 py-4">
          <div className="flex flex-col gap-5">
            {navSections.map((section) => (
              <div className="flex flex-col gap-2" key={section.title}>
                <div className="px-3 text-xs font-bold text-muted-foreground">{section.title}</div>
                <div className="flex flex-col gap-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        end={item.to === '/admin'}
                        className={({ isActive }) => cn(
                          'group flex min-h-12 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                          isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                        key={item.to}
                        to={item.to}
                        onClick={() => setOpen(false)}
                      >
                        <Icon className="size-5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-semibold leading-5">{item.label}</span>
                          <span className="block truncate text-xs opacity-75">{item.description}</span>
                        </span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="border-t p-3">
          {footerActions.map((item) => {
            const Icon = item.icon;
            if (item.action === 'logout') {
              return (
                <button key={item.label} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold text-destructive hover:bg-destructive/10" onClick={logout}>
                  <Icon className="size-5" />
                  {item.label}
                </button>
              );
            }
            return (
              <Link key={item.to} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" to={item.to}>
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </aside>

      <div className="md:pl-[292px]">
        <header className="sticky top-0 z-20 border-b bg-background/92 backdrop-blur">
          <div className="flex min-h-16 items-center gap-3 px-4 md:min-h-20 md:px-8">
            <Button className="md:hidden" size="icon" variant="outline" onClick={() => setOpen(true)}>
              <Menu data-icon="inline-start" />
            </Button>
            <div className="min-w-0">
              <div className="text-xs font-bold text-muted-foreground">管理后台</div>
              <h1 className="truncate text-xl font-bold tracking-normal md:text-2xl">{page.label}</h1>
            </div>
            <div className="ml-auto flex gap-2">
              <Button asChild variant="outline">
                <Link to="/portal">用户中心</Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 p-3 sm:p-4 md:gap-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
