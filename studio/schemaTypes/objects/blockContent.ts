import {defineArrayMember, defineField, defineType} from 'sanity'

/** Rich text used by posts, projects and text-based blocks. */
export const blockContent = defineType({
  name: 'blockContent',
  title: 'Rich text',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        {title: 'Normal', value: 'normal'},
        {title: 'Heading 2', value: 'h2'},
        {title: 'Heading 3', value: 'h3'},
        {title: 'Heading 4', value: 'h4'},
        {title: 'Quote', value: 'blockquote'},
      ],
      lists: [
        {title: 'Bullet', value: 'bullet'},
        {title: 'Numbered', value: 'number'},
      ],
      marks: {
        decorators: [
          {title: 'Bold', value: 'strong'},
          {title: 'Italic', value: 'em'},
          {title: 'Code', value: 'code'},
          {title: 'Strike', value: 'strike-through'},
        ],
        annotations: [
          defineArrayMember({
            name: 'link',
            title: 'Link',
            type: 'object',
            fields: [
              defineField({
                name: 'href',
                title: 'URL',
                type: 'url',
                validation: (rule) =>
                  rule.uri({scheme: ['http', 'https', 'mailto', 'tel'], allowRelative: true}),
              }),
              defineField({name: 'openInNewTab', type: 'boolean', initialValue: false}),
            ],
          }),
        ],
      },
    }),
    defineArrayMember({type: 'accessibleImage'}),
    defineArrayMember({
      type: 'code',
      options: {
        withFilename: true,
        languageAlternatives: [
          {title: 'TypeScript', value: 'typescript'},
          {title: 'JavaScript', value: 'javascript'},
          {title: 'HTML', value: 'html'},
          {title: 'CSS', value: 'css'},
          {title: 'SCSS', value: 'scss'},
          {title: 'JSON', value: 'json'},
          {title: 'Bash', value: 'sh'},
          {title: 'Python', value: 'python'},
          {title: 'C#', value: 'csharp'},
          {title: 'Java', value: 'java'},
          {title: 'SQL', value: 'sql'},
          {title: 'YAML', value: 'yaml'},
          {title: 'Markdown', value: 'markdown'},
        ],
      },
    }),
  ],
})
