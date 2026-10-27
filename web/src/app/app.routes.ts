import { Routes } from '@angular/router';
import { requireRole } from './core/auth/role.guard';
import { CmsPage } from './pages/cms-page/cms-page';

export const routes: Routes = [
  { path: '', component: CmsPage, data: { slug: 'home' } },
  {
    path: 'blog',
    loadComponent: () => import('./pages/blog/post-list-page').then((m) => m.PostListPage),
  },
  {
    path: 'blog/:slug',
    loadComponent: () => import('./pages/blog/post-page').then((m) => m.PostPage),
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./pages/projects/project-list-page').then((m) => m.ProjectListPage),
  },
  {
    path: 'projects/:slug',
    loadComponent: () => import('./pages/projects/project-page').then((m) => m.ProjectPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login-page').then((m) => m.LoginPage),
  },
  // Members area: any signed-in user. Gate individual features with
  // requireRole('wife'), requireRole('neia-boiz'), … (admins always pass).
  {
    path: 'members',
    canActivate: [requireRole()],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/members/members-home-page').then((m) => m.MembersHomePage),
      },
      {
        path: ':slug',
        loadComponent: () => import('./pages/members/member-page').then((m) => m.MemberPage),
      },
    ],
  },
  // Family area. Finances data comes only from the members API, never the bundle.
  {
    path: 'family/finances',
    canActivate: [requireRole('wife')],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/finances/finances-dashboard-page').then((m) => m.FinancesDashboardPage),
      },
      {
        path: 'upload',
        canActivate: [requireRole('admin')],
        loadComponent: () =>
          import('./pages/finances/upload/statement-upload-page').then(
            (m) => m.StatementUploadPage,
          ),
      },
    ],
  },
  // NEIA Boiz group events. Event data comes only from the members API.
  {
    path: 'events',
    canActivate: [requireRole('neia-boiz')],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/events/events-page').then((m) => m.EventsPage),
      },
      {
        path: 'new',
        loadComponent: () => import('./pages/events/event-form-page').then((m) => m.EventFormPage),
      },
      {
        path: ':id',
        loadComponent: () => import('./pages/events/event-page').then((m) => m.EventPage),
      },
      {
        path: ':id/edit',
        loadComponent: () => import('./pages/events/event-form-page').then((m) => m.EventFormPage),
      },
    ],
  },
  {
    path: 'profile',
    canActivate: [requireRole('neia-boiz')],
    loadComponent: () => import('./pages/events/profile-page').then((m) => m.ProfilePage),
  },
  // Editing the site's content. The content API also requires the admin group.
  {
    path: 'admin',
    canActivate: [requireRole('admin')],
    loadChildren: () => import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  // The signed "Unsubscribe" link in event emails; no login needed
  {
    path: 'unsubscribe',
    loadComponent: () => import('./pages/events/unsubscribe-page').then((m) => m.UnsubscribePage),
  },
  // Any other single-segment path is looked up as a CMS page (and 404s if missing)
  { path: ':slug', component: CmsPage },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
