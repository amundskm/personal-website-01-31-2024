import {defineArrayMember, defineField, defineType} from 'sanity'
import {CreditCardIcon} from '@sanity/icons/CreditCard'

/**
 * The family spending plan behind /family/finances. A singleton in the private
 * dataset: never put these numbers in code (the repository is public).
 *
 * Merchant patterns are also added from the statement upload page when a
 * merchant is assigned a category and "Remember" is ticked.
 */
export const spendingPlan = defineType({
  name: 'spendingPlan',
  title: 'Spending plan',
  type: 'document',
  icon: CreditCardIcon,
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      initialValue: 'Spending plan',
      readOnly: true,
    }),
    defineField({
      name: 'categories',
      type: 'array',
      description:
        'Budget lines. Removing one moves its past spending to "Uncategorized" on the dashboard.',
      of: [
        defineArrayMember({
          name: 'budgetCategory',
          title: 'Category',
          type: 'object',
          fields: [
            defineField({name: 'name', type: 'string', validation: (rule) => rule.required()}),
            defineField({
              name: 'monthlyBudget',
              title: 'Monthly budget ($)',
              type: 'number',
              validation: (rule) => rule.required().min(0),
            }),
            defineField({
              name: 'merchantPatterns',
              title: 'Merchant patterns',
              type: 'array',
              of: [{type: 'string'}],
              options: {layout: 'tags'},
              description:
                'Statement descriptions containing any of these (ignoring case) go in this category. The longest match wins.',
            }),
          ],
          preview: {
            select: {title: 'name', budget: 'monthlyBudget', patterns: 'merchantPatterns'},
            prepare: ({title, budget, patterns}) => ({
              title,
              subtitle: `$${budget ?? 0}/mo · ${patterns?.length ?? 0} merchant patterns`,
            }),
          },
        }),
      ],
    }),
    defineField({
      name: 'stages',
      title: 'Rollout stages',
      type: 'array',
      description: 'The monthly target for a statement comes from the latest stage started by its closing date.',
      of: [
        defineArrayMember({
          name: 'planStage',
          title: 'Stage',
          type: 'object',
          fields: [
            defineField({name: 'label', type: 'string', validation: (rule) => rule.required()}),
            defineField({name: 'startDate', type: 'date', validation: (rule) => rule.required()}),
            defineField({
              name: 'monthlyTarget',
              title: 'Monthly target ($)',
              type: 'number',
              validation: (rule) => rule.required().min(0),
            }),
          ],
          preview: {
            select: {title: 'label', start: 'startDate', target: 'monthlyTarget'},
            prepare: ({title, start, target}) => ({
              title,
              subtitle: `From ${start ?? '?'} · $${target ?? 0}/mo`,
            }),
          },
        }),
      ],
    }),
  ],
  preview: {prepare: () => ({title: 'Spending plan'})},
})
