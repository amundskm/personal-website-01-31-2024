import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SanityImageComponent } from '../sanity-image/sanity-image';
import { CodeBlockComponent } from './code-block';
import { toPtNodes, type PtNode } from './portable-text-model';

/** Renders Sanity Portable Text (rich text) as semantic HTML. */
@Component({
  selector: 'app-portable-text',
  imports: [NgTemplateOutlet, RouterLink, SanityImageComponent, CodeBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'prose' },
  template: `
    @for (node of nodes(); track node.key) {
      <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: node }" />
    }

    <ng-template #nodeTpl let-node>
      @switch (node.kind) {
        @case ('block') {
          @switch (node.style) {
            @case ('h2') {
              <h2>
                <ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: node.children }" />
              </h2>
            }
            @case ('h3') {
              <h3>
                <ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: node.children }" />
              </h3>
            }
            @case ('h4') {
              <h4>
                <ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: node.children }" />
              </h4>
            }
            @case ('blockquote') {
              <blockquote>
                <ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: node.children }" />
              </blockquote>
            }
            @default {
              <p>
                <ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: node.children }" />
              </p>
            }
          }
        }
        @case ('list') {
          <ng-container *ngTemplateOutlet="listTpl; context: { $implicit: node }" />
        }
        @case ('image') {
          <figure>
            <app-sanity-image
              [image]="node.image"
              [width]="800"
              sizes="(min-width: 50rem) 800px, 100vw"
            />
            @if (node.image.caption) {
              <figcaption>{{ node.image.caption }}</figcaption>
            }
          </figure>
        }
        @case ('code') {
          <app-code-block [value]="node.value" />
        }
      }
    </ng-template>

    <ng-template #listTpl let-list>
      @if (list.ordered) {
        <ol>
          @for (item of list.items; track item.key) {
            <ng-container *ngTemplateOutlet="itemTpl; context: { $implicit: item }" />
          }
        </ol>
      } @else {
        <ul>
          @for (item of list.items; track item.key) {
            <ng-container *ngTemplateOutlet="itemTpl; context: { $implicit: item }" />
          }
        </ul>
      }
    </ng-template>

    <ng-template #itemTpl let-item>
      <li>
        <ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: item.children }" />
        @for (sublist of item.sublists; track sublist.key) {
          <ng-container *ngTemplateOutlet="listTpl; context: { $implicit: sublist }" />
        }
      </li>
    </ng-template>

    <ng-template #spansTpl let-spans>
      @for (span of spans; track $index) {
        @if (span.kind === 'text') {
          <!-- Wrapped so template whitespace isn't added around the text -->
          <ng-container>{{ span.text }}</ng-container>
        } @else {
          @switch (span.mark) {
            @case ('strong') {
              <strong
                ><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: span.children }"
              /></strong>
            }
            @case ('em') {
              <em
                ><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: span.children }"
              /></em>
            }
            @case ('code') {
              <code
                ><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: span.children }"
              /></code>
            }
            @case ('strike-through') {
              <s
                ><ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: span.children }"
              /></s>
            }
            @case ('link') {
              @if (span.link?.internal) {
                <a [routerLink]="span.link.href"
                  ><ng-container
                    *ngTemplateOutlet="spansTpl; context: { $implicit: span.children }"
                /></a>
              } @else if (span.link) {
                <a
                  [href]="span.link.href"
                  [attr.target]="span.link.newTab ? '_blank' : null"
                  [attr.rel]="span.link.newTab ? 'noopener noreferrer' : null"
                  ><ng-container
                    *ngTemplateOutlet="spansTpl; context: { $implicit: span.children }"
                /></a>
              } @else {
                <ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: span.children }" />
              }
            }
            @default {
              <ng-container *ngTemplateOutlet="spansTpl; context: { $implicit: span.children }" />
            }
          }
        }
      }
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class PortableTextComponent {
  // Accepts any Portable Text array from the generated query types.
  readonly value = input.required<readonly { _type: string; _key?: string }[] | null | undefined>();

  protected readonly nodes = computed<PtNode[]>(() =>
    toPtNodes(this.value() as Parameters<typeof toPtNodes>[0]),
  );
}
