import {defineArrayMember, defineField, defineType} from 'sanity'
import {CreditCardIcon} from '@sanity/icons/CreditCard'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
].map((title, i) => ({title, value: i + 1}))

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
            defineField({
              name: 'activeMonths',
              title: 'Active months',
              type: 'array',
              of: [{type: 'number'}],
              options: {list: MONTHS, layout: 'grid'},
              description:
                'For seasonal spending: the monthly budget only applies in these months ($0 in the others). Leave empty for every month.',
            }),
            defineField({
              name: 'plannedPurchases',
              title: 'Planned one-time purchases',
              type: 'array',
              description: "Added to that month's budget every year, e.g. a season pass in March.",
              of: [
                defineArrayMember({
                  name: 'plannedPurchase',
                  type: 'object',
                  fields: [
                    defineField({name: 'label', type: 'string', validation: (rule) => rule.required()}),
                    defineField({
                      name: 'month',
                      type: 'number',
                      options: {list: MONTHS},
                      validation: (rule) => rule.required(),
                    }),
                    defineField({
                      name: 'amount',
                      title: 'Amount ($)',
                      type: 'number',
                      validation: (rule) => rule.required().min(0),
                    }),
                  ],
                  preview: {
                    select: {title: 'label', month: 'month', amount: 'amount'},
                    prepare: ({title, month, amount}) => ({
                      title,
                      subtitle: `${MONTHS[(month ?? 1) - 1]?.title ?? '?'} · $${amount ?? 0}`,
                    }),
                  },
                }),
              ],
            }),
          ],
          preview: {
            select: {
              title: 'name',
              budget: 'monthlyBudget',
              patterns: 'merchantPatterns',
              active: 'activeMonths',
            },
            prepare: ({title, budget, patterns, active}) => ({
              title,
              subtitle:
                `$${budget ?? 0}/mo` +
                (active?.length ? ` (${active.length} months)` : '') +
                ` · ${patterns?.length ?? 0} merchant patterns`,
            }),
          },
        }),
      ],
    }),
    defineField({
      name: 'stages',
      title: 'Rollout stages',
      type: 'array',
      description: "A statement month's target comes from the latest stage started by the end of that month.",
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
