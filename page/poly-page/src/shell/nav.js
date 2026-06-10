import {
  Boxes,
  CircleUserRound,
  Cog,
  Gift,
  Home,
  ListFilter,
  LogOut,
  Package,
  Server,
  UsersRound,
} from 'lucide-react';

export const navSections = [
  {
    title: '运营',
    items: [
      { to: '/admin', label: '工作台', description: '整体运营状态', icon: Home },
      { to: '/admin/node-pool', label: '节点池', description: '可分发与过滤节点', icon: Boxes },
    ],
  },
  {
    title: '节点与分发',
    items: [
      { to: '/admin/airport', label: '节点来源', description: '上游机场和节点入口', icon: Server },
      { to: '/admin/routing-profiles', label: '分流规则', description: '策略组、规则和 DNS', icon: ListFilter },
      { to: '/admin/config', label: '分发设置', description: '域名、过滤和命名', icon: Cog },
    ],
  },
  {
    title: '用户运营',
    items: [
      { to: '/admin/plans', label: '套餐', description: '默认有效期和规则', icon: Package },
      { to: '/admin/redeem-codes', label: '兑换码', description: '生成和发放订阅', icon: Gift },
      { to: '/admin/sub-users', label: '订阅用户', description: '到期、续期和状态', icon: UsersRound },
    ],
  },
];

export const flatNavItems = navSections.flatMap((section) => section.items);

export const fallbackPage = {
  label: '管理后台',
  description: '轻量订阅分发平台',
  icon: Home,
};

export const footerActions = [
  { to: '/portal', label: '用户中心', icon: CircleUserRound },
  { action: 'logout', label: '退出后台', icon: LogOut },
];
