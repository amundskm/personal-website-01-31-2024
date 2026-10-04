import {defineField, defineType} from 'sanity'

/** An image with hotspot, required alt text and an optional caption. */
export const accessibleImage = defineType({
  name: 'accessibleImage',
  title: 'Image',
  type: 'image',
  options: {hotspot: true},
  fields: [
    defineField({
      name: 'alt',
      title: 'Alternative text',
      type: 'string',
      description: 'Describe the image for screen readers. Leave empty only for decorative images.',
    }),
    defineField({name: 'caption', type: 'string'}),
  ],
})
