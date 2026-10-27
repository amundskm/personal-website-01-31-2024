# A page built from sections. The page with slug "home" is the site's front page.
class Page < ApplicationRecord
  include Document
  include Sections

  document_fields "title" => :title, "slug" => :slug, "sections" => :sections, "seo" => :seo
end
