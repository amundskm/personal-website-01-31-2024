class Project < ApplicationRecord
  include Document

  document_fields "title" => :title, "slug" => :slug, "summary" => :summary, "techStack" => :tech_stack,
                  "year" => :year, "featured" => :featured, "order" => :position, "repoUrl" => :repo_url,
                  "liveUrl" => :live_url, "coverImage" => :cover_image, "body" => :body, "gallery" => :gallery,
                  "seo" => :seo

  # Manual order first (unset last), then newest
  scope :in_display_order, -> { order(arel_table[:position].asc.nulls_last, created_at: :desc) }
  scope :featured, -> { where(featured: true) }
end
