import { ChangeDetectionStrategy, Component, inject, OnInit, ViewEncapsulation } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SeoService } from '../../core/seo.service';

/** Layout for /admin: section navigation beside the current admin page. */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The admin's styles apply to every admin component, scoped under .admin
  encapsulation: ViewEncapsulation.None,
  styleUrl: '../admin.scss',
  template: `
    <div class="admin container">
      <nav class="admin__nav" aria-label="Admin">
        <a routerLink="/admin" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }">Publish</a>
        <a routerLink="/admin/pages" routerLinkActive="is-active">Pages</a>
        <a routerLink="/admin/posts" routerLinkActive="is-active">Blog posts</a>
        <a routerLink="/admin/projects" routerLinkActive="is-active">Projects</a>
        <a routerLink="/admin/member-pages" routerLinkActive="is-active">Members pages</a>
        <a routerLink="/admin/settings" routerLinkActive="is-active">Site settings</a>
        <a routerLink="/admin/spending-plan" routerLinkActive="is-active">Spending plan</a>
      </nav>
      <div class="admin__main">
        <router-outlet />
      </div>
    </div>
  `,
})
export class AdminShell implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.setPage({ title: 'Admin', seo: { title: null, description: null, image: null, noIndex: true } });
  }
}
