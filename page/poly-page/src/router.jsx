import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { AdminLayout } from '@/shell/AdminLayout.jsx';
import { Card, CardContent } from '@/components/ui.jsx';

const DashboardPage = lazy(() => import('@/views-react/DashboardPage.jsx').then((module) => ({ default: module.DashboardPage })));
const AirportPage = lazy(() => import('@/views-react/AirportPage.jsx').then((module) => ({ default: module.AirportPage })));
const SelfNodePage = lazy(() => import('@/views-react/SelfNodePage.jsx').then((module) => ({ default: module.SelfNodePage })));
const NodePoolPage = lazy(() => import('@/views-react/NodePoolPage.jsx').then((module) => ({ default: module.NodePoolPage })));
const UpstreamSyncPage = lazy(() => import('@/views-react/UpstreamSyncPage.jsx').then((module) => ({ default: module.UpstreamSyncPage })));
const RulePage = lazy(() => import('@/views-react/RulePage.jsx').then((module) => ({ default: module.RulePage })));
const GroupPage = lazy(() => import('@/views-react/GroupPage.jsx').then((module) => ({ default: module.GroupPage })));
const RoutingProfilePage = lazy(() => import('@/views-react/RoutingProfilePage.jsx').then((module) => ({ default: module.RoutingProfilePage })));
const ConfigPage = lazy(() => import('@/views-react/ConfigPage.jsx').then((module) => ({ default: module.ConfigPage })));
const PlanPage = lazy(() => import('@/views-react/PlanPage.jsx').then((module) => ({ default: module.PlanPage })));
const ClashTemplatePage = lazy(() => import('@/views-react/ClashTemplatePage.jsx').then((module) => ({ default: module.ClashTemplatePage })));
const RedeemCodePage = lazy(() => import('@/views-react/RedeemCodePage.jsx').then((module) => ({ default: module.RedeemCodePage })));
const SubUserPage = lazy(() => import('@/views-react/SubUserPage.jsx').then((module) => ({ default: module.SubUserPage })));
const SubscriptionLogPage = lazy(() => import('@/views-react/SubscriptionLogPage.jsx').then((module) => ({ default: module.SubscriptionLogPage })));
const OperationLogPage = lazy(() => import('@/views-react/OperationLogPage.jsx').then((module) => ({ default: module.OperationLogPage })));
const ResetPage = lazy(() => import('@/views-react/ResetPage.jsx').then((module) => ({ default: module.ResetPage })));
const PortalPage = lazy(() => import('@/views-react/PortalPage.jsx').then((module) => ({ default: module.PortalPage })));

function RoutePage({ children }) {
  return (
    <Suspense fallback={<Card><CardContent className="py-10 text-center text-sm text-muted-foreground">页面加载中...</CardContent></Card>}>
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/portal" replace /> },
  { path: '/portal', element: <RoutePage><PortalPage /></RoutePage> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <RoutePage><DashboardPage /></RoutePage> },
      { path: 'airport', element: <RoutePage><AirportPage /></RoutePage> },
      { path: 'selfNode', element: <RoutePage><SelfNodePage /></RoutePage> },
      { path: 'node-pool', element: <RoutePage><NodePoolPage /></RoutePage> },
      { path: 'upstream-sync', element: <RoutePage><UpstreamSyncPage /></RoutePage> },
      { path: 'rule', element: <RoutePage><RulePage /></RoutePage> },
      { path: 'group', element: <RoutePage><GroupPage /></RoutePage> },
      { path: 'routing-profiles', element: <RoutePage><RoutingProfilePage /></RoutePage> },
      { path: 'config', element: <RoutePage><ConfigPage /></RoutePage> },
      { path: 'plans', element: <RoutePage><PlanPage /></RoutePage> },
      { path: 'clash-templates', element: <RoutePage><ClashTemplatePage /></RoutePage> },
      { path: 'redeem-codes', element: <RoutePage><RedeemCodePage /></RoutePage> },
      { path: 'sub-users', element: <RoutePage><SubUserPage /></RoutePage> },
      { path: 'subscription-logs', element: <RoutePage><SubscriptionLogPage /></RoutePage> },
      { path: 'operation-logs', element: <RoutePage><OperationLogPage /></RoutePage> },
      { path: 'reset', element: <RoutePage><ResetPage /></RoutePage> },
    ],
  },
]);
