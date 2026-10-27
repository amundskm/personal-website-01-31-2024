import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DocumentStatus } from '../admin-api';

const LABELS: Record<DocumentStatus, string> = {
  published: 'Published',
  changed: 'Unpublished changes',
  new: 'Not published yet',
  deleted: 'Deleted on publish',
};

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="adm-badge" [class]="'adm-badge adm-badge--' + status()">{{ label() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<DocumentStatus>();
  protected readonly label = computed(() => LABELS[this.status()]);
}
