# A page built from sections. The page with slug "home" is the site's front page.
class Page < ApplicationRecord
  include Document
  include Sections

  # Slugs that would be shadowed by the site's built-in routes (web/src/app/app.routes.ts)
  RESERVED_SLUGS = %w[blog projects login members family events profile unsubscribe admin].freeze

  document_fields "title" => :title, "slug" => :slug, "sections" => :sections, "seo" => :seo

  validates :slug, exclusion: { in: RESERVED_SLUGS, message: "\"%{value}\" is reserved for a built-in route" }
end
