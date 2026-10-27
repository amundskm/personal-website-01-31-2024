class Post < ApplicationRecord
  include Document

  document_fields "title" => :title, "slug" => :slug, "excerpt" => :excerpt, "publishedAt" => :published_at,
                  "tags" => :tags, "coverImage" => :cover_image, "body" => :body, "seo" => :seo

  scope :newest_first, -> { order(arel_table[:published_at].desc.nulls_last) }
end
